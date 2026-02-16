/*
Copyright 2026 Ben.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package controller

import (
	"context"
	"fmt"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"

	monitoringv1alpha1 "github.com/benn447/uptime-kuma/operator/api/v1alpha1"
	uptimeclient "github.com/benn447/uptime-kuma/operator/pkg/client"
)

const (
	monitorFinalizerName = "monitoring.uptimekuma.io/monitor-finalizer"

	// ReasonMonitorSynced indicates successful monitor sync
	ReasonMonitorSynced = "MonitorSynced"

	// ReasonMonitorSyncFailed indicates monitor sync failure
	ReasonMonitorSyncFailed = "MonitorSyncFailed"

	// DefaultMonitorInterval is the default check interval in seconds
	DefaultMonitorInterval = 60
)

// UptimeKumaMonitorReconciler reconciles a UptimeKumaMonitor object
type UptimeKumaMonitorReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumamonitors,verbs=get;list;watch;create;update;patch;delete
//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumamonitors/status,verbs=get;update;patch
//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumamonitors/finalizers,verbs=update
//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumaconfigs,verbs=get;list;watch
//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumagroups,verbs=get;list;watch

// Reconcile syncs UptimeKumaMonitor with Uptime Kuma
func (r *UptimeKumaMonitorReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)
	logger.Info("Reconciling UptimeKumaMonitor")

	// Fetch the UptimeKumaMonitor instance
	monitor := &monitoringv1alpha1.UptimeKumaMonitor{}
	if err := r.Get(ctx, req.NamespacedName, monitor); err != nil {
		if apierrors.IsNotFound(err) {
			logger.Info("UptimeKumaMonitor resource not found, ignoring")
			return ctrl.Result{}, nil
		}
		logger.Error(err, "Failed to get UptimeKumaMonitor")
		return ctrl.Result{}, err
	}

	// Handle deletion with finalizer
	if !monitor.ObjectMeta.DeletionTimestamp.IsZero() {
		return r.handleDeletion(ctx, monitor)
	}

	// Add finalizer if not present
	if !controllerutil.ContainsFinalizer(monitor, monitorFinalizerName) {
		controllerutil.AddFinalizer(monitor, monitorFinalizerName)
		if err := r.Update(ctx, monitor); err != nil {
			logger.Error(err, "Failed to add finalizer")
			return ctrl.Result{}, err
		}
	}

	// Get Uptime Kuma client
	kumaClient, err := r.getUptimeKumaClient(ctx, monitor)
	if err != nil {
		logger.Error(err, "Failed to get Uptime Kuma client")
		r.updateStatusError(ctx, monitor, err)
		return ctrl.Result{RequeueAfter: 1 * time.Minute}, nil
	}

	// Sync monitor to Uptime Kuma
	if err := r.syncMonitor(ctx, monitor, kumaClient); err != nil {
		logger.Error(err, "Failed to sync monitor")
		r.updateStatusError(ctx, monitor, err)
		return ctrl.Result{RequeueAfter: 1 * time.Minute}, nil
	}

	// Handle active/pause state
	if err := r.syncActiveState(ctx, monitor, kumaClient); err != nil {
		logger.Error(err, "Failed to sync active state")
		// Don't fail reconciliation on pause/resume errors
	}

	logger.Info("Successfully synced monitor", "monitorId", monitor.Status.MonitorID)

	// Requeue after interval for drift detection and status updates
	return ctrl.Result{RequeueAfter: RequeueInterval}, nil
}

// handleDeletion handles monitor deletion with finalizer
func (r *UptimeKumaMonitorReconciler) handleDeletion(ctx context.Context, monitor *monitoringv1alpha1.UptimeKumaMonitor) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	if !controllerutil.ContainsFinalizer(monitor, monitorFinalizerName) {
		// Finalizer already removed, nothing to do
		return ctrl.Result{}, nil
	}

	// Only delete from Uptime Kuma if we have a MonitorID
	if monitor.Status.MonitorID != 0 {
		logger.Info("Deleting monitor from Uptime Kuma", "monitorId", monitor.Status.MonitorID)

		kumaClient, err := r.getUptimeKumaClient(ctx, monitor)
		if err != nil {
			logger.Error(err, "Failed to get Uptime Kuma client for deletion")
			// Continue with finalizer removal even if client creation fails
		} else {
			// Delete monitor from Uptime Kuma
			// deleteChildren=false to preserve child monitors
			if err := kumaClient.DeleteMonitor(ctx, monitor.Status.MonitorID, false); err != nil {
				logger.Error(err, "Failed to delete monitor from Uptime Kuma")
				// Don't block deletion on API errors
			} else {
				logger.Info("Successfully deleted monitor from Uptime Kuma")
			}
		}
	}

	// Remove finalizer
	controllerutil.RemoveFinalizer(monitor, monitorFinalizerName)
	if err := r.Update(ctx, monitor); err != nil {
		logger.Error(err, "Failed to remove finalizer")
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}

// syncMonitor creates or updates the monitor in Uptime Kuma
func (r *UptimeKumaMonitorReconciler) syncMonitor(ctx context.Context, monitor *monitoringv1alpha1.UptimeKumaMonitor, kumaClient *uptimeclient.Client) error {
	logger := log.FromContext(ctx)

	// Build monitor configuration
	kumaMonitor, err := r.buildMonitorConfig(ctx, monitor)
	if err != nil {
		return fmt.Errorf("failed to build monitor config: %w", err)
	}

	// Create or update monitor
	if monitor.Status.MonitorID == 0 {
		// Create new monitor
		logger.Info("Creating new monitor in Uptime Kuma")
		monitorID, err := kumaClient.CreateMonitor(ctx, kumaMonitor)
		if err != nil {
			return fmt.Errorf("failed to create monitor: %w", err)
		}

		// Update status with MonitorID
		monitor.Status.MonitorID = monitorID
		logger.Info("Created monitor", "monitorId", monitorID)

		// Sync tags after creation
		if err := r.syncTags(ctx, monitor, kumaClient); err != nil {
			logger.Error(err, "Failed to sync tags after creation")
			// Don't fail on tag sync errors
		}
	} else {
		// Update existing monitor
		logger.Info("Updating existing monitor in Uptime Kuma", "monitorId", monitor.Status.MonitorID)
		kumaMonitor.ID = monitor.Status.MonitorID
		if err := kumaClient.UpdateMonitor(ctx, monitor.Status.MonitorID, kumaMonitor); err != nil {
			return fmt.Errorf("failed to update monitor: %w", err)
		}

		// Sync tags after update
		if err := r.syncTags(ctx, monitor, kumaClient); err != nil {
			logger.Error(err, "Failed to sync tags after update")
			// Don't fail on tag sync errors
		}
	}

	// Fetch and update status
	return r.updateMonitorStatus(ctx, monitor, kumaClient)
}

// buildMonitorConfig builds the monitor configuration from the CR spec
func (r *UptimeKumaMonitorReconciler) buildMonitorConfig(ctx context.Context, monitor *monitoringv1alpha1.UptimeKumaMonitor) (*uptimeclient.Monitor, error) {
	monitorName := monitor.Spec.Name
	if monitorName == "" {
		monitorName = monitor.Name
	}

	interval := monitor.Spec.Interval
	if interval == 0 {
		interval = DefaultMonitorInterval
	}

	kumaMonitor := &uptimeclient.Monitor{
		Name:          monitorName,
		Type:          monitor.Spec.MonitorType,
		URL:           monitor.Spec.URL,
		Hostname:      monitor.Spec.Hostname,
		Port:          monitor.Spec.Port,
		Interval:      interval,
		RetryInterval: monitor.Spec.RetryInterval,
		MaxRetries:    monitor.Spec.MaxRetries,
		Description:   monitor.Spec.Description,
		Active:        monitor.Spec.Active,
	}

	// Handle HTTP options
	if monitor.Spec.HTTP != nil {
		kumaMonitor.HTTPMethod = monitor.Spec.HTTP.Method
		kumaMonitor.HTTPBody = monitor.Spec.HTTP.Body
		kumaMonitor.HTTPHeaders = make(map[string]interface{})
		for k, v := range monitor.Spec.HTTP.Headers {
			kumaMonitor.HTTPHeaders[k] = v
		}
		kumaMonitor.AcceptedStatuses = monitor.Spec.HTTP.AcceptedStatusCodes
	}

	// Resolve group reference
	if monitor.Spec.Group != "" {
		parentID, err := r.resolveGroup(ctx, monitor)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve group: %w", err)
		}
		kumaMonitor.Parent = &parentID
	}

	return kumaMonitor, nil
}

// resolveGroup resolves the group name to parent ID
func (r *UptimeKumaMonitorReconciler) resolveGroup(ctx context.Context, monitor *monitoringv1alpha1.UptimeKumaMonitor) (int, error) {
	// Fetch group CR
	group := &monitoringv1alpha1.UptimeKumaGroup{}
	if err := r.Get(ctx, client.ObjectKey{
		Name:      monitor.Spec.Group,
		Namespace: monitor.Namespace,
	}, group); err != nil {
		if apierrors.IsNotFound(err) {
			return 0, fmt.Errorf("group '%s' not found", monitor.Spec.Group)
		}
		return 0, fmt.Errorf("failed to get group: %w", err)
	}

	// Check if group has a GroupID
	if group.Status.GroupID == 0 {
		return 0, fmt.Errorf("group '%s' has not been synced yet (no GroupID)", monitor.Spec.Group)
	}

	return group.Status.GroupID, nil
}

// syncTags synchronizes tags for the monitor
func (r *UptimeKumaMonitorReconciler) syncTags(ctx context.Context, monitor *monitoringv1alpha1.UptimeKumaMonitor, kumaClient *uptimeclient.Client) error {
	logger := log.FromContext(ctx)

	if len(monitor.Spec.Tags) == 0 {
		return nil
	}

	for _, tag := range monitor.Spec.Tags {
		// Find or create tag
		kumaTag, err := kumaClient.FindOrCreateTag(ctx, tag.Name, tag.Color)
		if err != nil {
			logger.Error(err, "Failed to find or create tag", "tagName", tag.Name)
			continue
		}

		// Add tag to monitor
		if err := kumaClient.AddTagToMonitor(ctx, monitor.Status.MonitorID, kumaTag.ID, tag.Value); err != nil {
			logger.Error(err, "Failed to add tag to monitor", "tagName", tag.Name)
			// Continue with other tags
		}
	}

	return nil
}

// syncActiveState syncs the active/paused state
func (r *UptimeKumaMonitorReconciler) syncActiveState(ctx context.Context, monitor *monitoringv1alpha1.UptimeKumaMonitor, kumaClient *uptimeclient.Client) error {
	if monitor.Status.MonitorID == 0 {
		return nil
	}

	// Get current monitor status
	status, err := kumaClient.GetMonitorStatus(ctx, monitor.Status.MonitorID)
	if err != nil {
		return fmt.Errorf("failed to get monitor status: %w", err)
	}

	// Check if state needs to change
	isActive := status.Status != "paused"
	if monitor.Spec.Active && !isActive {
		// Resume monitor
		return kumaClient.ResumeMonitor(ctx, monitor.Status.MonitorID)
	} else if !monitor.Spec.Active && isActive {
		// Pause monitor
		return kumaClient.PauseMonitor(ctx, monitor.Status.MonitorID)
	}

	return nil
}

// updateMonitorStatus fetches status from Uptime Kuma and updates CR status
func (r *UptimeKumaMonitorReconciler) updateMonitorStatus(ctx context.Context, monitor *monitoringv1alpha1.UptimeKumaMonitor, kumaClient *uptimeclient.Client) error {
	now := metav1.Now()

	// Fetch monitor status
	status, err := kumaClient.GetMonitorStatus(ctx, monitor.Status.MonitorID)
	if err != nil {
		// Don't fail sync on status fetch errors
		monitor.Status.Status = "unknown"
	} else {
		monitor.Status.Status = status.Status

		// Update uptime stats if available
		if status.Uptime24h != nil || status.Uptime30d != nil || status.AvgPing24h != nil {
			if monitor.Status.UptimeStats == nil {
				monitor.Status.UptimeStats = &monitoringv1alpha1.UptimeStats{}
			}
			if status.Uptime24h != nil {
				monitor.Status.UptimeStats.Uptime24h = *status.Uptime24h
			}
			if status.Uptime30d != nil {
				monitor.Status.UptimeStats.Uptime30d = *status.Uptime30d
			}
			if status.AvgPing24h != nil {
				monitor.Status.UptimeStats.AvgPing = *status.AvgPing24h
			}
		}
	}

	monitor.Status.LastSyncTime = &now
	monitor.Status.ObservedGeneration = monitor.Generation

	// Update condition to Synced
	meta.SetStatusCondition(&monitor.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeReady,
		Status:             metav1.ConditionTrue,
		ObservedGeneration: monitor.Generation,
		LastTransitionTime: now,
		Reason:             ReasonMonitorSynced,
		Message:            fmt.Sprintf("Monitor synced successfully (MonitorID: %d, Status: %s)", monitor.Status.MonitorID, monitor.Status.Status),
	})

	return r.Status().Update(ctx, monitor)
}

// updateStatusError updates the status when there's an error
func (r *UptimeKumaMonitorReconciler) updateStatusError(ctx context.Context, monitor *monitoringv1alpha1.UptimeKumaMonitor, err error) {
	now := metav1.Now()

	meta.SetStatusCondition(&monitor.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeReady,
		Status:             metav1.ConditionFalse,
		ObservedGeneration: monitor.Generation,
		LastTransitionTime: now,
		Reason:             ReasonMonitorSyncFailed,
		Message:            err.Error(),
	})

	// Best effort status update, ignore errors
	_ = r.Status().Update(ctx, monitor)
}

// getUptimeKumaClient creates an Uptime Kuma client from config
func (r *UptimeKumaMonitorReconciler) getUptimeKumaClient(ctx context.Context, monitor *monitoringv1alpha1.UptimeKumaMonitor) (*uptimeclient.Client, error) {
	// Determine which config to use
	configName := monitor.Spec.UptimeKumaConfigRef
	if configName == "" {
		configName = "uptime-kuma" // Default config name
	}

	// Fetch the UptimeKumaConfig
	config := &monitoringv1alpha1.UptimeKumaConfig{}
	if err := r.Get(ctx, client.ObjectKey{
		Name:      configName,
		Namespace: monitor.Namespace,
	}, config); err != nil {
		if apierrors.IsNotFound(err) {
			return nil, fmt.Errorf("UptimeKumaConfig '%s' not found in namespace '%s'", configName, monitor.Namespace)
		}
		return nil, fmt.Errorf("failed to get UptimeKumaConfig: %w", err)
	}

	// Check if config is connected
	if !config.Status.Connected {
		return nil, fmt.Errorf("UptimeKumaConfig '%s' is not connected", configName)
	}

	// Get API key from secret
	configReconciler := &UptimeKumaConfigReconciler{Client: r.Client, Scheme: r.Scheme}
	apiKey, err := configReconciler.getAPIKey(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to get API key: %w", err)
	}

	// Create client
	timeout := time.Duration(config.Spec.Timeout) * time.Second
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	return uptimeclient.NewClient(uptimeclient.Config{
		BaseURL:            config.Spec.APIURL,
		APIKey:             apiKey,
		InsecureSkipVerify: config.Spec.InsecureSkipVerify,
		Timeout:            timeout,
	}), nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *UptimeKumaMonitorReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&monitoringv1alpha1.UptimeKumaMonitor{}).
		Complete(r)
}
