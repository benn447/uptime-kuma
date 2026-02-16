package client

// Monitor represents a monitor in Uptime Kuma
type Monitor struct {
	ID               int                    `json:"id,omitempty"`
	Name             string                 `json:"name"`
	Type             string                 `json:"type"`
	URL              string                 `json:"url,omitempty"`
	Hostname         string                 `json:"hostname,omitempty"`
	Port             int                    `json:"port,omitempty"`
	Interval         int                    `json:"interval"`
	RetryInterval    int                    `json:"retryInterval,omitempty"`
	MaxRetries       int                    `json:"maxretries,omitempty"`
	Description      string                 `json:"description,omitempty"`
	Active           bool                   `json:"active"`
	Parent           *int                   `json:"parent,omitempty"`
	Tags             []MonitorTag           `json:"tags,omitempty"`
	NotificationList []int                  `json:"notificationIDList,omitempty"`
	HTTPMethod       string                 `json:"method,omitempty"`
	HTTPBody         string                 `json:"body,omitempty"`
	HTTPHeaders      map[string]interface{} `json:"httpHeaders,omitempty"`
	AcceptedStatuses []string               `json:"accepted_statuscodes,omitempty"`
}

// MonitorTag represents a tag on a monitor
type MonitorTag struct {
	TagID int    `json:"tag_id"`
	Value string `json:"value,omitempty"`
}

// Group represents a monitor group in Uptime Kuma
type Group struct {
	ID          int    `json:"id,omitempty"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Weight      int    `json:"weight,omitempty"`
	Parent      *int   `json:"parent,omitempty"`
}

// Tag represents a tag in Uptime Kuma
type Tag struct {
	ID    int    `json:"id,omitempty"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

// MonitorStatus represents the status and statistics of a monitor
type MonitorStatus struct {
	Status       string        `json:"status"`
	Uptime24h    *float64      `json:"uptime24h,omitempty"`
	Uptime30d    *float64      `json:"uptime30d,omitempty"`
	Uptime1y     *float64      `json:"uptime1y,omitempty"`
	AvgPing24h   *float64      `json:"avgPing24h,omitempty"`
	LatestBeat   *Heartbeat    `json:"latestHeartbeat,omitempty"`
}

// Heartbeat represents a heartbeat/check result
type Heartbeat struct {
	Time   string  `json:"time"`
	Status int     `json:"status"`
	Msg    string  `json:"msg,omitempty"`
	Ping   float64 `json:"ping,omitempty"`
}

// HealthStatus represents the API health status
type HealthStatus struct {
	OK       bool   `json:"ok"`
	Status   string `json:"status"`
	Version  string `json:"version"`
	Database string `json:"database"`
}

// ListMonitorsResponse is the response from listing monitors
type ListMonitorsResponse struct {
	OK       bool      `json:"ok"`
	Monitors []Monitor `json:"monitors"`
	Total    int       `json:"total"`
	Page     int       `json:"page"`
	Limit    int       `json:"limit"`
}

// GetMonitorResponse is the response from getting a single monitor
type GetMonitorResponse struct {
	OK      bool    `json:"ok"`
	Monitor Monitor `json:"monitor"`
}

// CreateMonitorResponse is the response from creating a monitor
type CreateMonitorResponse struct {
	OK        bool   `json:"ok"`
	MonitorID int    `json:"monitorId"`
	Message   string `json:"msg"`
}

// ListGroupsResponse is the response from listing groups
type ListGroupsResponse struct {
	OK     bool    `json:"ok"`
	Groups []Group `json:"groups"`
	Total  int     `json:"total"`
	Page   int     `json:"page"`
	Limit  int     `json:"limit"`
}

// GetGroupResponse is the response from getting a single group
type GetGroupResponse struct {
	OK    bool  `json:"ok"`
	Group Group `json:"group"`
}

// CreateGroupResponse is the response from creating a group
type CreateGroupResponse struct {
	OK      bool   `json:"ok"`
	GroupID int    `json:"groupId"`
	Message string `json:"msg"`
}

// ListTagsResponse is the response from listing tags
type ListTagsResponse struct {
	OK   bool  `json:"ok"`
	Tags []Tag `json:"tags"`
}

// GetTagResponse is the response from getting a single tag
type GetTagResponse struct {
	OK  bool `json:"ok"`
	Tag Tag  `json:"tag"`
}

// CreateTagResponse is the response from creating a tag
type CreateTagResponse struct {
	OK  bool `json:"ok"`
	Tag Tag  `json:"tag"`
}

// GetStatusResponse is the response from getting monitor status
type GetStatusResponse struct {
	OK     bool          `json:"ok"`
	Status MonitorStatus `json:"status"`
}
