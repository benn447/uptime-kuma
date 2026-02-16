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

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// EDIT THIS FILE!  THIS IS SCAFFOLDING FOR YOU TO OWN!
// NOTE: json tags are required.  Any new fields you add must have json tags for the fields to be serialized.

// UptimeKumaMonitorSpec defines the desired state of UptimeKumaMonitor
type UptimeKumaMonitorSpec struct {
	// MonitorType specifies the type of monitor (http, tcp, ping, dns, etc.)
	// +kubebuilder:validation:Enum=http;https;tcp;ping;dns;docker;push;steam;gamedig;mqtt;sqlserver;postgres;mysql;mongodb;radius;redis;group;grpc-keyword;json-query;real-browser;kafka-producer;tailscale-ping
	// +kubebuilder:validation:Required
	MonitorType string `json:"monitorType"`

	// Name of the monitor (defaults to CR name if not specified)
	// +optional
	Name string `json:"name,omitempty"`

	// URL to monitor (for http/https monitors)
	// +optional
	URL string `json:"url,omitempty"`

	// Hostname or IP address (for tcp/ping monitors)
	// +optional
	Hostname string `json:"hostname,omitempty"`

	// Port number (for tcp monitors)
	// +optional
	Port int `json:"port,omitempty"`

	// Interval in seconds between checks
	// +kubebuilder:default=60
	// +kubebuilder:validation:Minimum=20
	// +optional
	Interval int `json:"interval,omitempty"`

	// RetryInterval in seconds for retrying failed checks
	// +kubebuilder:default=60
	// +optional
	RetryInterval int `json:"retryInterval,omitempty"`

	// MaxRetries before marking monitor as down
	// +kubebuilder:default=3
	// +optional
	MaxRetries int `json:"maxRetries,omitempty"`

	// Description of the monitor
	// +optional
	Description string `json:"description,omitempty"`

	// Group name to organize monitors (maps to parent group in Uptime Kuma)
	// +optional
	Group string `json:"group,omitempty"`

	// Tags to apply to the monitor
	// +optional
	Tags []MonitorTag `json:"tags,omitempty"`

	// Active determines if the monitor should be running
	// +kubebuilder:default=true
	// +optional
	Active bool `json:"active,omitempty"`

	// UptimeKumaConfigRef references the UptimeKumaConfig to use for this monitor
	// If not specified, uses the default config in the same namespace
	// +optional
	UptimeKumaConfigRef string `json:"uptimeKumaConfigRef,omitempty"`

	// AutoDiscovery configuration for creating monitors from Kubernetes Services
	// +optional
	AutoDiscovery *AutoDiscoverySpec `json:"autoDiscovery,omitempty"`

	// Advanced HTTP options
	// +optional
	HTTP *HTTPMonitorOptions `json:"http,omitempty"`
}

// MonitorTag represents a key-value tag for a monitor
type MonitorTag struct {
	// Name of the tag (the key)
	// +kubebuilder:validation:Required
	Name string `json:"name"`

	// Value of the tag
	// +optional
	Value string `json:"value,omitempty"`

	// Color for the tag (hex color code)
	// +optional
	Color string `json:"color,omitempty"`
}

// AutoDiscoverySpec defines auto-discovery configuration
type AutoDiscoverySpec struct {
	// Enabled determines if auto-discovery is enabled
	// +kubebuilder:default=true
	Enabled bool `json:"enabled"`

	// Selector to match Kubernetes Services
	// +optional
	Selector *metav1.LabelSelector `json:"selector,omitempty"`

	// PortName specifies which service port to monitor (e.g., "http", "https")
	// +optional
	PortName string `json:"portName,omitempty"`

	// PortNumber specifies a specific port number to monitor
	// +optional
	PortNumber int `json:"portNumber,omitempty"`

	// Path to append to the URL (for HTTP monitors)
	// +kubebuilder:default=/
	// +optional
	Path string `json:"path,omitempty"`
}

// HTTPMonitorOptions defines HTTP-specific monitor options
type HTTPMonitorOptions struct {
	// Method is the HTTP method to use
	// +kubebuilder:default=GET
	// +kubebuilder:validation:Enum=GET;POST;PUT;PATCH;DELETE;HEAD;OPTIONS
	// +optional
	Method string `json:"method,omitempty"`

	// Headers to send with the request
	// +optional
	Headers map[string]string `json:"headers,omitempty"`

	// Body to send with POST/PUT requests
	// +optional
	Body string `json:"body,omitempty"`

	// AcceptedStatusCodes defines which HTTP status codes are considered successful
	// +optional
	AcceptedStatusCodes []string `json:"acceptedStatusCodes,omitempty"`

	// FollowRedirects determines if redirects should be followed
	// +kubebuilder:default=true
	// +optional
	FollowRedirects bool `json:"followRedirects,omitempty"`

	// Timeout in seconds
	// +kubebuilder:default=30
	// +optional
	Timeout int `json:"timeout,omitempty"`
}

// UptimeKumaMonitorStatus defines the observed state of UptimeKumaMonitor
type UptimeKumaMonitorStatus struct {
	// MonitorID is the ID of the monitor in Uptime Kuma
	// +optional
	MonitorID int `json:"monitorId,omitempty"`

	// Status represents the current status of the monitor (up, down, pending, etc.)
	// +optional
	Status string `json:"status,omitempty"`

	// LastSyncTime is the last time the monitor was synced with Uptime Kuma
	// +optional
	LastSyncTime *metav1.Time `json:"lastSyncTime,omitempty"`

	// Conditions represent the latest available observations of the monitor's state
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// UptimeStats contains uptime statistics
	// +optional
	UptimeStats *UptimeStats `json:"uptimeStats,omitempty"`

	// ObservedGeneration reflects the generation of the most recently observed spec
	// +optional
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`
}

// UptimeStats represents uptime statistics
// +kubebuilder:validation:Type=object
type UptimeStats struct {
	// Uptime24h is the uptime percentage over the last 24 hours
	// +optional
	// +kubebuilder:validation:Type=number
	Uptime24h float64 `json:"uptime24h,omitempty"`

	// Uptime30d is the uptime percentage over the last 30 days
	// +optional
	// +kubebuilder:validation:Type=number
	Uptime30d float64 `json:"uptime30d,omitempty"`

	// AvgPing is the average response time in milliseconds
	// +optional
	// +kubebuilder:validation:Type=number
	AvgPing float64 `json:"avgPing,omitempty"`
}

//+kubebuilder:object:root=true
//+kubebuilder:subresource:status
//+kubebuilder:printcolumn:name="Type",type=string,JSONPath=`.spec.monitorType`
//+kubebuilder:printcolumn:name="Status",type=string,JSONPath=`.status.status`
//+kubebuilder:printcolumn:name="Monitor ID",type=integer,JSONPath=`.status.monitorId`
//+kubebuilder:printcolumn:name="Uptime 24h",type=string,JSONPath=`.status.uptimeStats.uptime24h`
//+kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// UptimeKumaMonitor is the Schema for the uptimekumamonitors API
type UptimeKumaMonitor struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   UptimeKumaMonitorSpec   `json:"spec,omitempty"`
	Status UptimeKumaMonitorStatus `json:"status,omitempty"`
}

//+kubebuilder:object:root=true

// UptimeKumaMonitorList contains a list of UptimeKumaMonitor
type UptimeKumaMonitorList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []UptimeKumaMonitor `json:"items"`
}

func init() {
	SchemeBuilder.Register(&UptimeKumaMonitor{}, &UptimeKumaMonitorList{})
}
