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
	groupFinalizerName = "monitoring.uptimekuma.io/group-finalizer"

	// ReasonGroupSynced indicates successful group sync
	ReasonGroupSynced = "GroupSynced"

	// ReasonGroupSyncFailed indicates group sync failure
	ReasonGroupSyncFailed = "GroupSyncFailed"

	// ReasonGroupDeleted indicates successful group deletion
	ReasonGroupDeleted = "GroupDeleted"
)

// UptimeKumaGroupReconciler reconciles a UptimeKumaGroup object
type UptimeKumaGroupReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumagroups,verbs=get;list;watch;create;update;patch;delete
//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumagroups/status,verbs=get;update;patch
//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumagroups/finalizers,verbs=update
//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumaconfigs,verbs=get;list;watch

// Reconcile syncs UptimeKumaGroup with Uptime Kuma
func (r *UptimeKumaGroupReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)
	logger.Info("Reconciling UptimeKumaGroup")

	// Fetch the UptimeKumaGroup instance
	group := &monitoringv1alpha1.UptimeKumaGroup{}
	if err := r.Get(ctx, req.NamespacedName, group); err != nil {
		if apierrors.IsNotFound(err) {
			logger.Info("UptimeKumaGroup resource not found, ignoring")
			return ctrl.Result{}, nil
		}
		logger.Error(err, "Failed to get UptimeKumaGroup")
		return ctrl.Result{}, err
	}

	// Handle deletion with finalizer
	if !group.ObjectMeta.DeletionTimestamp.IsZero() {
		return r.handleDeletion(ctx, group)
	}

	// Add finalizer if not present
	if !controllerutil.ContainsFinalizer(group, groupFinalizerName) {
		controllerutil.AddFinalizer(group, groupFinalizerName)
		if err := r.Update(ctx, group); err != nil {
			logger.Error(err, "Failed to add finalizer")
			return ctrl.Result{}, err
		}
	}

	// Get Uptime Kuma client
	kumaClient, err := r.getUptimeKumaClient(ctx, group)
	if err != nil {
		logger.Error(err, "Failed to get Uptime Kuma client")
		r.updateStatusError(ctx, group, err)
		return ctrl.Result{RequeueAfter: 1 * time.Minute}, nil
	}

	// Sync group to Uptime Kuma
	if err := r.syncGroup(ctx, group, kumaClient); err != nil {
		logger.Error(err, "Failed to sync group")
		r.updateStatusError(ctx, group, err)
		return ctrl.Result{RequeueAfter: 1 * time.Minute}, nil
	}

	logger.Info("Successfully synced group", "groupId", group.Status.GroupID)

	// Requeue after interval for drift detection
	return ctrl.Result{RequeueAfter: RequeueInterval}, nil
}

// handleDeletion handles group deletion with finalizer
func (r *UptimeKumaGroupReconciler) handleDeletion(ctx context.Context, group *monitoringv1alpha1.UptimeKumaGroup) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	if !controllerutil.ContainsFinalizer(group, groupFinalizerName) {
		// Finalizer already removed, nothing to do
		return ctrl.Result{}, nil
	}

	// Only delete from Uptime Kuma if we have a GroupID
	if group.Status.GroupID != 0 {
		logger.Info("Deleting group from Uptime Kuma", "groupId", group.Status.GroupID)

		kumaClient, err := r.getUptimeKumaClient(ctx, group)
		if err != nil {
			logger.Error(err, "Failed to get Uptime Kuma client for deletion")
			// Continue with finalizer removal even if client creation fails
		} else {
			// Delete group from Uptime Kuma
			// deleteChildren=false to preserve monitors in other groups
			if err := kumaClient.DeleteGroup(ctx, group.Status.GroupID, false); err != nil {
				logger.Error(err, "Failed to delete group from Uptime Kuma")
				// Don't block deletion on API errors
			} else {
				logger.Info("Successfully deleted group from Uptime Kuma")
			}
		}
	}

	// Remove finalizer
	controllerutil.RemoveFinalizer(group, groupFinalizerName)
	if err := r.Update(ctx, group); err != nil {
		logger.Error(err, "Failed to remove finalizer")
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}

// syncGroup creates or updates the group in Uptime Kuma
func (r *UptimeKumaGroupReconciler) syncGroup(ctx context.Context, group *monitoringv1alpha1.UptimeKumaGroup, kumaClient *uptimeclient.Client) error {
	logger := log.FromContext(ctx)

	// Build group object
	groupName := group.Spec.GroupName
	if groupName == "" {
		groupName = group.Name
	}

	kumaGroup := &uptimeclient.Group{
		Name:        groupName,
		Description: group.Spec.Description,
		Weight:      group.Spec.Weight,
	}

	// Handle parent group reference
	if group.Spec.ParentGroup != "" {
		parentGroupID, err := r.resolveParentGroup(ctx, group)
		if err != nil {
			return fmt.Errorf("failed to resolve parent group: %w", err)
		}
		kumaGroup.Parent = &parentGroupID
	}

	// Create or update group
	if group.Status.GroupID == 0 {
		// Create new group
		logger.Info("Creating new group in Uptime Kuma")
		groupID, err := kumaClient.CreateGroup(ctx, kumaGroup)
		if err != nil {
			return fmt.Errorf("failed to create group: %w", err)
		}

		// Update status with GroupID
		group.Status.GroupID = groupID
		logger.Info("Created group", "groupId", groupID)
	} else {
		// Update existing group
		logger.Info("Updating existing group in Uptime Kuma", "groupId", group.Status.GroupID)
		if err := kumaClient.UpdateGroup(ctx, group.Status.GroupID, kumaGroup); err != nil {
			return fmt.Errorf("failed to update group: %w", err)
		}
	}

	// Update status
	return r.updateStatusSynced(ctx, group)
}

// resolveParentGroup resolves the parent group name to GroupID
func (r *UptimeKumaGroupReconciler) resolveParentGroup(ctx context.Context, group *monitoringv1alpha1.UptimeKumaGroup) (int, error) {
	// Fetch parent group CR
	parentGroup := &monitoringv1alpha1.UptimeKumaGroup{}
	if err := r.Get(ctx, client.ObjectKey{
		Name:      group.Spec.ParentGroup,
		Namespace: group.Namespace,
	}, parentGroup); err != nil {
		if apierrors.IsNotFound(err) {
			return 0, fmt.Errorf("parent group '%s' not found", group.Spec.ParentGroup)
		}
		return 0, fmt.Errorf("failed to get parent group: %w", err)
	}

	// Check if parent has a GroupID
	if parentGroup.Status.GroupID == 0 {
		return 0, fmt.Errorf("parent group '%s' has not been synced yet (no GroupID)", group.Spec.ParentGroup)
	}

	// Check for circular reference
	if parentGroup.Spec.ParentGroup == group.Name {
		return 0, fmt.Errorf("circular parent reference detected: %s <-> %s", group.Name, parentGroup.Name)
	}

	return parentGroup.Status.GroupID, nil
}

// getUptimeKumaClient creates an Uptime Kuma client from config
func (r *UptimeKumaGroupReconciler) getUptimeKumaClient(ctx context.Context, group *monitoringv1alpha1.UptimeKumaGroup) (*uptimeclient.Client, error) {
	// Determine which config to use
	configName := group.Spec.UptimeKumaConfigRef
	if configName == "" {
		configName = "uptime-kuma" // Default config name
	}

	// Fetch the UptimeKumaConfig
	config := &monitoringv1alpha1.UptimeKumaConfig{}
	if err := r.Get(ctx, client.ObjectKey{
		Name:      configName,
		Namespace: group.Namespace,
	}, config); err != nil {
		if apierrors.IsNotFound(err) {
			return nil, fmt.Errorf("UptimeKumaConfig '%s' not found in namespace '%s'", configName, group.Namespace)
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

// updateStatusSynced updates the status when sync is successful
func (r *UptimeKumaGroupReconciler) updateStatusSynced(ctx context.Context, group *monitoringv1alpha1.UptimeKumaGroup) error {
	now := metav1.Now()

	group.Status.LastSyncTime = &now
	group.Status.ObservedGeneration = group.Generation

	// Update condition to Synced
	meta.SetStatusCondition(&group.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeReady,
		Status:             metav1.ConditionTrue,
		ObservedGeneration: group.Generation,
		LastTransitionTime: now,
		Reason:             ReasonGroupSynced,
		Message:            fmt.Sprintf("Group synced successfully (GroupID: %d)", group.Status.GroupID),
	})

	return r.Status().Update(ctx, group)
}

// updateStatusError updates the status when there's an error
func (r *UptimeKumaGroupReconciler) updateStatusError(ctx context.Context, group *monitoringv1alpha1.UptimeKumaGroup, err error) {
	now := metav1.Now()

	meta.SetStatusCondition(&group.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeReady,
		Status:             metav1.ConditionFalse,
		ObservedGeneration: group.Generation,
		LastTransitionTime: now,
		Reason:             ReasonGroupSyncFailed,
		Message:            err.Error(),
	})

	// Best effort status update, ignore errors
	_ = r.Status().Update(ctx, group)
}

// SetupWithManager sets up the controller with the Manager.
func (r *UptimeKumaGroupReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&monitoringv1alpha1.UptimeKumaGroup{}).
		Complete(r)
}
