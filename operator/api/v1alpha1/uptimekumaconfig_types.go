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

// UptimeKumaConfigSpec defines the desired state of UptimeKumaConfig
type UptimeKumaConfigSpec struct {
	// APIURL is the URL of the Uptime Kuma API
	// Example: http://uptime-kuma:3001 or https://uptime.example.com
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Pattern=`^https?://`
	APIURL string `json:"apiUrl"`

	// APIKeySecret references a Secret containing the API key
	// The secret should have a key named 'api-key'
	// +kubebuilder:validation:Required
	APIKeySecret SecretReference `json:"apiKeySecret"`

	// InsecureSkipVerify skips TLS certificate verification
	// +kubebuilder:default=false
	// +optional
	InsecureSkipVerify bool `json:"insecureSkipVerify,omitempty"`

	// Timeout for API requests in seconds
	// +kubebuilder:default=30
	// +optional
	Timeout int `json:"timeout,omitempty"`
}

// SecretReference references a Kubernetes Secret
type SecretReference struct {
	// Name of the secret
	// +kubebuilder:validation:Required
	Name string `json:"name"`

	// Key within the secret (defaults to "api-key")
	// +kubebuilder:default=api-key
	// +optional
	Key string `json:"key,omitempty"`

	// Namespace of the secret (defaults to the same namespace as the config)
	// +optional
	Namespace string `json:"namespace,omitempty"`
}

// UptimeKumaConfigStatus defines the observed state of UptimeKumaConfig
type UptimeKumaConfigStatus struct {
	// Connected indicates if the operator successfully connected to Uptime Kuma
	// +optional
	Connected bool `json:"connected,omitempty"`

	// LastConnectionTime is the last time a successful connection was made
	// +optional
	LastConnectionTime *metav1.Time `json:"lastConnectionTime,omitempty"`

	// Version of the Uptime Kuma instance
	// +optional
	Version string `json:"version,omitempty"`

	// Conditions represent the latest available observations of the config's state
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

//+kubebuilder:object:root=true
//+kubebuilder:subresource:status
//+kubebuilder:resource:scope=Namespaced,shortName=ukc
//+kubebuilder:printcolumn:name="API URL",type=string,JSONPath=`.spec.apiUrl`
//+kubebuilder:printcolumn:name="Connected",type=boolean,JSONPath=`.status.connected`
//+kubebuilder:printcolumn:name="Version",type=string,JSONPath=`.status.version`
//+kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// UptimeKumaConfig is the Schema for the uptimekumaconfigs API
type UptimeKumaConfig struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   UptimeKumaConfigSpec   `json:"spec,omitempty"`
	Status UptimeKumaConfigStatus `json:"status,omitempty"`
}

//+kubebuilder:object:root=true

// UptimeKumaConfigList contains a list of UptimeKumaConfig
type UptimeKumaConfigList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []UptimeKumaConfig `json:"items"`
}

func init() {
	SchemeBuilder.Register(&UptimeKumaConfig{}, &UptimeKumaConfigList{})
}
