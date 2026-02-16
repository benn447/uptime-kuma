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

// UptimeKumaGroupSpec defines the desired state of UptimeKumaGroup
type UptimeKumaGroupSpec struct {
	// GroupName is the display name for the group in Uptime Kuma
	// Defaults to the CR name if not specified
	// +optional
	GroupName string `json:"groupName,omitempty"`

	// Description of the group
	// +optional
	Description string `json:"description,omitempty"`

	// Weight for ordering groups (lower numbers appear first)
	// +kubebuilder:default=1000
	// +optional
	Weight int `json:"weight,omitempty"`

	// ParentGroup references another UptimeKumaGroup to create nested groups
	// +optional
	ParentGroup string `json:"parentGroup,omitempty"`

	// NamespaceSelector selects namespaces to automatically create groups for
	// When specified, a group will be created for each matching namespace
	// +optional
	NamespaceSelector *metav1.LabelSelector `json:"namespaceSelector,omitempty"`

	// UptimeKumaConfigRef references the UptimeKumaConfig to use
	// +optional
	UptimeKumaConfigRef string `json:"uptimeKumaConfigRef,omitempty"`
}

// UptimeKumaGroupStatus defines the observed state of UptimeKumaGroup
type UptimeKumaGroupStatus struct {
	// GroupID is the ID of the group in Uptime Kuma
	// +optional
	GroupID int `json:"groupId,omitempty"`

	// MonitorCount is the number of monitors in this group
	// +optional
	MonitorCount int `json:"monitorCount,omitempty"`

	// LastSyncTime is the last time the group was synced
	// +optional
	LastSyncTime *metav1.Time `json:"lastSyncTime,omitempty"`

	// Conditions represent the latest available observations of the group's state
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`

	// ObservedGeneration reflects the generation of the most recently observed spec
	// +optional
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`
}

//+kubebuilder:object:root=true
//+kubebuilder:subresource:status
//+kubebuilder:resource:scope=Namespaced,shortName=ukg
//+kubebuilder:printcolumn:name="Group ID",type=integer,JSONPath=`.status.groupId`
//+kubebuilder:printcolumn:name="Monitors",type=integer,JSONPath=`.status.monitorCount`
//+kubebuilder:printcolumn:name="Parent",type=string,JSONPath=`.spec.parentGroup`
//+kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// UptimeKumaGroup is the Schema for the uptimekumagroups API
type UptimeKumaGroup struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   UptimeKumaGroupSpec   `json:"spec,omitempty"`
	Status UptimeKumaGroupStatus `json:"status,omitempty"`
}

//+kubebuilder:object:root=true

// UptimeKumaGroupList contains a list of UptimeKumaGroup
type UptimeKumaGroupList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []UptimeKumaGroup `json:"items"`
}

func init() {
	SchemeBuilder.Register(&UptimeKumaGroup{}, &UptimeKumaGroupList{})
}
