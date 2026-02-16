package client

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
)

// ListMonitors lists all monitors
func (c *Client) ListMonitors(ctx context.Context, page, limit int, groupID *int) (*ListMonitorsResponse, error) {
	query := url.Values{}
	query.Set("page", strconv.Itoa(page))
	query.Set("limit", strconv.Itoa(limit))
	if groupID != nil {
		query.Set("group", strconv.Itoa(*groupID))
	}

	path := "/api/v1/monitors?" + query.Encode()
	resp, err := c.doRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	var result ListMonitorsResponse
	if err := parseResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetMonitor gets a single monitor by ID
func (c *Client) GetMonitor(ctx context.Context, monitorID int) (*Monitor, error) {
	path := fmt.Sprintf("/api/v1/monitors/%d", monitorID)
	resp, err := c.doRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	var result GetMonitorResponse
	if err := parseResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result.Monitor, nil
}

// CreateMonitor creates a new monitor
func (c *Client) CreateMonitor(ctx context.Context, monitor *Monitor) (int, error) {
	resp, err := c.doRequest(ctx, "POST", "/api/v1/monitors", monitor)
	if err != nil {
		return 0, err
	}

	var result CreateMonitorResponse
	if err := parseResponse(resp, &result); err != nil {
		return 0, err
	}

	return result.MonitorID, nil
}

// UpdateMonitor updates an existing monitor
func (c *Client) UpdateMonitor(ctx context.Context, monitorID int, monitor *Monitor) error {
	path := fmt.Sprintf("/api/v1/monitors/%d", monitorID)
	resp, err := c.doRequest(ctx, "PUT", path, monitor)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}

// DeleteMonitor deletes a monitor
func (c *Client) DeleteMonitor(ctx context.Context, monitorID int, deleteChildren bool) error {
	query := url.Values{}
	query.Set("deleteChildren", strconv.FormatBool(deleteChildren))

	path := fmt.Sprintf("/api/v1/monitors/%d?%s", monitorID, query.Encode())
	resp, err := c.doRequest(ctx, "DELETE", path, nil)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}

// PauseMonitor pauses a monitor
func (c *Client) PauseMonitor(ctx context.Context, monitorID int) error {
	path := fmt.Sprintf("/api/v1/monitors/%d/pause", monitorID)
	resp, err := c.doRequest(ctx, "POST", path, nil)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}

// ResumeMonitor resumes a paused monitor
func (c *Client) ResumeMonitor(ctx context.Context, monitorID int) error {
	path := fmt.Sprintf("/api/v1/monitors/%d/resume", monitorID)
	resp, err := c.doRequest(ctx, "POST", path, nil)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}

// GetMonitorStatus gets the status and statistics of a monitor
func (c *Client) GetMonitorStatus(ctx context.Context, monitorID int) (*MonitorStatus, error) {
	path := fmt.Sprintf("/api/v1/monitors/%d/status", monitorID)
	resp, err := c.doRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	var result GetStatusResponse
	if err := parseResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result.Status, nil
}

// AddTagToMonitor adds a tag to a monitor
func (c *Client) AddTagToMonitor(ctx context.Context, monitorID, tagID int, value string) error {
	path := fmt.Sprintf("/api/v1/monitors/%d/tags", monitorID)
	body := map[string]interface{}{
		"tagId": tagID,
		"value": value,
	}

	resp, err := c.doRequest(ctx, "POST", path, body)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}

// UpdateMonitorTag updates a tag value on a monitor
func (c *Client) UpdateMonitorTag(ctx context.Context, monitorID, tagID int, value string) error {
	path := fmt.Sprintf("/api/v1/monitors/%d/tags/%d", monitorID, tagID)
	body := map[string]interface{}{
		"value": value,
	}

	resp, err := c.doRequest(ctx, "PUT", path, body)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}

// RemoveTagFromMonitor removes a tag from a monitor
func (c *Client) RemoveTagFromMonitor(ctx context.Context, monitorID, tagID int) error {
	path := fmt.Sprintf("/api/v1/monitors/%d/tags/%d", monitorID, tagID)
	resp, err := c.doRequest(ctx, "DELETE", path, nil)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}
