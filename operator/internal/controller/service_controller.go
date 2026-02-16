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
	"strconv"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"

	monitoringv1alpha1 "github.com/benn447/uptime-kuma/operator/api/v1alpha1"
)

const (
	// Annotation keys for service discovery
	AnnotationEnabled  = "monitoring.uptimekuma.io/enabled"
	AnnotationType     = "monitoring.uptimekuma.io/type"
	AnnotationPath     = "monitoring.uptimekuma.io/path"
	AnnotationPort     = "monitoring.uptimekuma.io/port"
	AnnotationInterval = "monitoring.uptimekuma.io/interval"
	AnnotationGroup    = "monitoring.uptimekuma.io/group"
	AnnotationConfig   = "monitoring.uptimekuma.io/config"

	// Default values
	DefaultMonitorType = "http"
	DefaultPath        = "/"
	DefaultPortName    = "http"
)

// ServiceReconciler reconciles a Service object for auto-discovery
type ServiceReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

//+kubebuilder:rbac:groups="",resources=services,verbs=get;list;watch
//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumamonitors,verbs=get;list;watch;create;update;patch;delete

// Reconcile handles Service auto-discovery
func (r *ServiceReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)
	logger.Info("Reconciling Service for auto-discovery")

	// Fetch the Service
	service := &corev1.Service{}
	if err := r.Get(ctx, req.NamespacedName, service); err != nil {
		if apierrors.IsNotFound(err) {
			// Service deleted - cleanup will happen via owner reference
			logger.Info("Service not found, skipping")
			return ctrl.Result{}, nil
		}
		logger.Error(err, "Failed to get Service")
		return ctrl.Result{}, err
	}

	// Check if monitoring is enabled
	if !isMonitoringEnabled(service) {
		// Monitoring not enabled, ensure monitor is deleted if it exists
		return r.ensureMonitorDeleted(ctx, service)
	}

	// Create or update monitor
	return r.ensureMonitor(ctx, service)
}

// isMonitoringEnabled checks if the service has monitoring enabled
func isMonitoringEnabled(service *corev1.Service) bool {
	if service.Annotations == nil {
		return false
	}
	enabled, ok := service.Annotations[AnnotationEnabled]
	if !ok {
		return false
	}
	return enabled == "true"
}

// ensureMonitor creates or updates the UptimeKumaMonitor for this service
func (r *ServiceReconciler) ensureMonitor(ctx context.Context, service *corev1.Service) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	// Build monitor spec from service annotations
	monitorSpec, err := r.buildMonitorSpec(service)
	if err != nil {
		logger.Error(err, "Failed to build monitor spec from service")
		return ctrl.Result{}, err
	}

	// Get or create monitor CR
	monitorName := fmt.Sprintf("%s-monitor", service.Name)
	monitor := &monitoringv1alpha1.UptimeKumaMonitor{}
	err = r.Get(ctx, client.ObjectKey{
		Name:      monitorName,
		Namespace: service.Namespace,
	}, monitor)

	if err != nil && apierrors.IsNotFound(err) {
		// Create new monitor
		monitor = &monitoringv1alpha1.UptimeKumaMonitor{
			ObjectMeta: metav1.ObjectMeta{
				Name:      monitorName,
				Namespace: service.Namespace,
				Labels: map[string]string{
					"app.kubernetes.io/managed-by":    "uptime-kuma-operator",
					"monitoring.uptimekuma.io/source": "service-discovery",
				},
			},
			Spec: *monitorSpec,
		}

		// Set owner reference for automatic cleanup
		if err := controllerutil.SetControllerReference(service, monitor, r.Scheme); err != nil {
			logger.Error(err, "Failed to set owner reference")
			return ctrl.Result{}, err
		}

		logger.Info("Creating monitor for service", "monitor", monitorName)
		if err := r.Create(ctx, monitor); err != nil {
			logger.Error(err, "Failed to create monitor")
			return ctrl.Result{}, err
		}

		logger.Info("Successfully created monitor", "monitor", monitorName)
		return ctrl.Result{}, nil
	} else if err != nil {
		logger.Error(err, "Failed to get monitor")
		return ctrl.Result{}, err
	}

	// Update existing monitor if spec changed
	if !monitorSpecEqual(&monitor.Spec, monitorSpec) {
		logger.Info("Updating monitor for service", "monitor", monitorName)
		monitor.Spec = *monitorSpec
		if err := r.Update(ctx, monitor); err != nil {
			logger.Error(err, "Failed to update monitor")
			return ctrl.Result{}, err
		}
		logger.Info("Successfully updated monitor", "monitor", monitorName)
	}

	return ctrl.Result{}, nil
}

// ensureMonitorDeleted ensures the monitor is deleted if monitoring is disabled
func (r *ServiceReconciler) ensureMonitorDeleted(ctx context.Context, service *corev1.Service) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	monitorName := fmt.Sprintf("%s-monitor", service.Name)
	monitor := &monitoringv1alpha1.UptimeKumaMonitor{}
	err := r.Get(ctx, client.ObjectKey{
		Name:      monitorName,
		Namespace: service.Namespace,
	}, monitor)

	if err != nil && apierrors.IsNotFound(err) {
		// Monitor doesn't exist, nothing to do
		return ctrl.Result{}, nil
	} else if err != nil {
		logger.Error(err, "Failed to get monitor")
		return ctrl.Result{}, err
	}

	// Delete the monitor
	logger.Info("Deleting monitor as monitoring is disabled", "monitor", monitorName)
	if err := r.Delete(ctx, monitor); err != nil {
		logger.Error(err, "Failed to delete monitor")
		return ctrl.Result{}, err
	}

	return ctrl.Result{}, nil
}

// buildMonitorSpec builds a UptimeKumaMonitorSpec from Service annotations
func (r *ServiceReconciler) buildMonitorSpec(service *corev1.Service) (*monitoringv1alpha1.UptimeKumaMonitorSpec, error) {
	annotations := service.Annotations

	// Get monitor type
	monitorType := getAnnotation(annotations, AnnotationType, DefaultMonitorType)

	// Get path
	path := getAnnotation(annotations, AnnotationPath, DefaultPath)

	// Get port
	port, err := r.resolvePort(service, getAnnotation(annotations, AnnotationPort, DefaultPortName))
	if err != nil {
		return nil, fmt.Errorf("failed to resolve port: %w", err)
	}

	// Build URL
	url := fmt.Sprintf("http://%s.%s.svc.cluster.local:%d%s",
		service.Name,
		service.Namespace,
		port,
		path,
	)

	// Get interval
	interval := DefaultMonitorInterval
	if intervalStr := getAnnotation(annotations, AnnotationInterval, ""); intervalStr != "" {
		if val, err := strconv.Atoi(intervalStr); err == nil {
			interval = val
		}
	}

	// Build monitor spec
	spec := &monitoringv1alpha1.UptimeKumaMonitorSpec{
		Name:        fmt.Sprintf("%s (%s/%s)", service.Name, service.Namespace, service.Name),
		MonitorType: monitorType,
		URL:         url,
		Interval:    interval,
		Active:      true,
	}

	// Add group if specified
	if group := getAnnotation(annotations, AnnotationGroup, ""); group != "" {
		spec.Group = group
	}

	// Add config ref if specified
	if config := getAnnotation(annotations, AnnotationConfig, ""); config != "" {
		spec.UptimeKumaConfigRef = config
	}

	// Add tags to identify this as auto-discovered
	spec.Tags = []monitoringv1alpha1.MonitorTag{
		{
			Name:  "source",
			Value: "service-discovery",
			Color: "#4CAF50",
		},
		{
			Name:  "namespace",
			Value: service.Namespace,
			Color: "#2196F3",
		},
	}

	return spec, nil
}

// resolvePort resolves the port from service spec
func (r *ServiceReconciler) resolvePort(service *corev1.Service, portSpec string) (int32, error) {
	// Try to parse as port number first
	if portNum, err := strconv.ParseInt(portSpec, 10, 32); err == nil {
		return int32(portNum), nil
	}

	// Try to find port by name
	for _, port := range service.Spec.Ports {
		if port.Name == portSpec {
			return port.Port, nil
		}
	}

	// If no match found and we have ports, use the first one
	if len(service.Spec.Ports) > 0 {
		return service.Spec.Ports[0].Port, nil
	}

	return 0, fmt.Errorf("no ports found on service")
}

// getAnnotation gets an annotation value with a default
func getAnnotation(annotations map[string]string, key, defaultValue string) string {
	if val, ok := annotations[key]; ok {
		return val
	}
	return defaultValue
}

// monitorSpecEqual compares two monitor specs (ignoring computed fields)
func monitorSpecEqual(a, b *monitoringv1alpha1.UptimeKumaMonitorSpec) bool {
	// Simple comparison of key fields
	return a.MonitorType == b.MonitorType &&
		a.URL == b.URL &&
		a.Interval == b.Interval &&
		a.Group == b.Group &&
		a.Active == b.Active &&
		a.UptimeKumaConfigRef == b.UptimeKumaConfigRef
}

// SetupWithManager sets up the controller with the Manager.
func (r *ServiceReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&corev1.Service{}).
		Owns(&monitoringv1alpha1.UptimeKumaMonitor{}).
		Complete(r)
}
