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

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/log"

	monitoringv1alpha1 "github.com/benn447/uptime-kuma/operator/api/v1alpha1"
	uptimeclient "github.com/benn447/uptime-kuma/operator/pkg/client"
)

const (
	// RequeueInterval is the time to wait before re-checking connectivity
	RequeueInterval = 5 * time.Minute

	// ConditionTypeReady indicates the config is ready and connected
	ConditionTypeReady = "Ready"

	// ReasonConnectionSuccess indicates successful connection
	ReasonConnectionSuccess = "ConnectionSuccess"

	// ReasonConnectionFailed indicates connection failure
	ReasonConnectionFailed = "ConnectionFailed"

	// ReasonSecretNotFound indicates the API key secret was not found
	ReasonSecretNotFound = "SecretNotFound"

	// ReasonInvalidSecret indicates the secret is missing required data
	ReasonInvalidSecret = "InvalidSecret"
)

// UptimeKumaConfigReconciler reconciles a UptimeKumaConfig object
type UptimeKumaConfigReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumaconfigs,verbs=get;list;watch;create;update;patch;delete
//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumaconfigs/status,verbs=get;update;patch
//+kubebuilder:rbac:groups=monitoring.uptimekuma.io,resources=uptimekumaconfigs/finalizers,verbs=update
//+kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch

// Reconcile validates connectivity to Uptime Kuma and updates status
func (r *UptimeKumaConfigReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)
	logger.Info("Reconciling UptimeKumaConfig")

	// Fetch the UptimeKumaConfig instance
	config := &monitoringv1alpha1.UptimeKumaConfig{}
	if err := r.Get(ctx, req.NamespacedName, config); err != nil {
		if apierrors.IsNotFound(err) {
			logger.Info("UptimeKumaConfig resource not found, ignoring")
			return ctrl.Result{}, nil
		}
		logger.Error(err, "Failed to get UptimeKumaConfig")
		return ctrl.Result{}, err
	}

	// Fetch the API key from the Secret
	apiKey, err := r.getAPIKey(ctx, config)
	if err != nil {
		logger.Error(err, "Failed to get API key from secret")
		r.updateStatusError(ctx, config, err)
		// Requeue to retry
		return ctrl.Result{RequeueAfter: 1 * time.Minute}, nil
	}

	// Create Uptime Kuma client
	timeout := time.Duration(config.Spec.Timeout) * time.Second
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	client := uptimeclient.NewClient(uptimeclient.Config{
		BaseURL:            config.Spec.APIURL,
		APIKey:             apiKey,
		InsecureSkipVerify: config.Spec.InsecureSkipVerify,
		Timeout:            timeout,
	})

	// Test connectivity
	health, err := client.GetHealth(ctx)
	if err != nil {
		logger.Error(err, "Failed to connect to Uptime Kuma API")
		r.updateStatusDisconnected(ctx, config, err)
		// Requeue to retry connection
		return ctrl.Result{RequeueAfter: 1 * time.Minute}, nil
	}

	// Update status with successful connection
	if err := r.updateStatusConnected(ctx, config, health.Version); err != nil {
		logger.Error(err, "Failed to update status")
		return ctrl.Result{}, err
	}

	logger.Info("Successfully validated connection to Uptime Kuma",
		"version", health.Version,
		"status", health.Status)

	// Requeue after interval to verify connectivity
	return ctrl.Result{RequeueAfter: RequeueInterval}, nil
}

// getAPIKey fetches the API key from the referenced Kubernetes Secret
func (r *UptimeKumaConfigReconciler) getAPIKey(ctx context.Context, config *monitoringv1alpha1.UptimeKumaConfig) (string, error) {
	secretRef := config.Spec.APIKeySecret

	// Determine namespace for secret
	secretNamespace := secretRef.Namespace
	if secretNamespace == "" {
		secretNamespace = config.Namespace
	}

	// Determine key name
	keyName := secretRef.Key
	if keyName == "" {
		keyName = "api-key"
	}

	// Fetch the secret
	secret := &corev1.Secret{}
	if err := r.Get(ctx, types.NamespacedName{
		Name:      secretRef.Name,
		Namespace: secretNamespace,
	}, secret); err != nil {
		if apierrors.IsNotFound(err) {
			return "", fmt.Errorf("secret %s/%s not found", secretNamespace, secretRef.Name)
		}
		return "", fmt.Errorf("failed to get secret: %w", err)
	}

	// Extract API key from secret
	apiKeyBytes, ok := secret.Data[keyName]
	if !ok {
		return "", fmt.Errorf("secret %s/%s does not contain key '%s'", secretNamespace, secretRef.Name, keyName)
	}

	if len(apiKeyBytes) == 0 {
		return "", fmt.Errorf("API key in secret %s/%s is empty", secretNamespace, secretRef.Name)
	}

	return string(apiKeyBytes), nil
}

// updateStatusConnected updates the status when connection is successful
func (r *UptimeKumaConfigReconciler) updateStatusConnected(ctx context.Context, config *monitoringv1alpha1.UptimeKumaConfig, version string) error {
	now := metav1.Now()

	config.Status.Connected = true
	config.Status.LastConnectionTime = &now
	config.Status.Version = version

	// Update condition to Ready
	meta.SetStatusCondition(&config.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeReady,
		Status:             metav1.ConditionTrue,
		ObservedGeneration: config.Generation,
		LastTransitionTime: now,
		Reason:             ReasonConnectionSuccess,
		Message:            fmt.Sprintf("Successfully connected to Uptime Kuma (version %s)", version),
	})

	return r.Status().Update(ctx, config)
}

// updateStatusDisconnected updates the status when connection fails
func (r *UptimeKumaConfigReconciler) updateStatusDisconnected(ctx context.Context, config *monitoringv1alpha1.UptimeKumaConfig, err error) {
	now := metav1.Now()

	config.Status.Connected = false
	// Don't update LastConnectionTime on failure

	meta.SetStatusCondition(&config.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeReady,
		Status:             metav1.ConditionFalse,
		ObservedGeneration: config.Generation,
		LastTransitionTime: now,
		Reason:             ReasonConnectionFailed,
		Message:            fmt.Sprintf("Failed to connect to Uptime Kuma: %s", err.Error()),
	})

	// Best effort status update, ignore errors
	_ = r.Status().Update(ctx, config)
}

// updateStatusError updates the status when there's an error fetching prerequisites
func (r *UptimeKumaConfigReconciler) updateStatusError(ctx context.Context, config *monitoringv1alpha1.UptimeKumaConfig, err error) {
	now := metav1.Now()

	config.Status.Connected = false

	reason := ReasonSecretNotFound
	if err.Error() != "" && err.Error() != "secret not found" {
		reason = ReasonInvalidSecret
	}

	meta.SetStatusCondition(&config.Status.Conditions, metav1.Condition{
		Type:               ConditionTypeReady,
		Status:             metav1.ConditionFalse,
		ObservedGeneration: config.Generation,
		LastTransitionTime: now,
		Reason:             reason,
		Message:            err.Error(),
	})

	// Best effort status update, ignore errors
	_ = r.Status().Update(ctx, config)
}

// SetupWithManager sets up the controller with the Manager.
func (r *UptimeKumaConfigReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&monitoringv1alpha1.UptimeKumaConfig{}).
		Complete(r)
}
