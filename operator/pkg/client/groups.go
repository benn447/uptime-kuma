package client

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
)

// ListGroups lists all groups
func (c *Client) ListGroups(ctx context.Context, page, limit int) (*ListGroupsResponse, error) {
	query := url.Values{}
	query.Set("page", strconv.Itoa(page))
	query.Set("limit", strconv.Itoa(limit))

	path := "/api/v1/groups?" + query.Encode()
	resp, err := c.doRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	var result ListGroupsResponse
	if err := parseResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// GetGroup gets a single group by ID
func (c *Client) GetGroup(ctx context.Context, groupID int, includeChildren bool) (*Group, error) {
	query := url.Values{}
	query.Set("includeChildren", strconv.FormatBool(includeChildren))

	path := fmt.Sprintf("/api/v1/groups/%d?%s", groupID, query.Encode())
	resp, err := c.doRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	var result GetGroupResponse
	if err := parseResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result.Group, nil
}

// CreateGroup creates a new group
func (c *Client) CreateGroup(ctx context.Context, group *Group) (int, error) {
	resp, err := c.doRequest(ctx, "POST", "/api/v1/groups", group)
	if err != nil {
		return 0, err
	}

	var result CreateGroupResponse
	if err := parseResponse(resp, &result); err != nil {
		return 0, err
	}

	return result.GroupID, nil
}

// UpdateGroup updates an existing group
func (c *Client) UpdateGroup(ctx context.Context, groupID int, group *Group) error {
	path := fmt.Sprintf("/api/v1/groups/%d", groupID)
	resp, err := c.doRequest(ctx, "PUT", path, group)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}

// DeleteGroup deletes a group
func (c *Client) DeleteGroup(ctx context.Context, groupID int, deleteChildren bool) error {
	query := url.Values{}
	query.Set("deleteChildren", strconv.FormatBool(deleteChildren))

	path := fmt.Sprintf("/api/v1/groups/%d?%s", groupID, query.Encode())
	resp, err := c.doRequest(ctx, "DELETE", path, nil)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}

// AddMonitorToGroup adds a monitor to a group
func (c *Client) AddMonitorToGroup(ctx context.Context, groupID, monitorID int) error {
	path := fmt.Sprintf("/api/v1/groups/%d/children/%d", groupID, monitorID)
	resp, err := c.doRequest(ctx, "POST", path, nil)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}

// RemoveMonitorFromGroup removes a monitor from a group
func (c *Client) RemoveMonitorFromGroup(ctx context.Context, groupID, monitorID int) error {
	path := fmt.Sprintf("/api/v1/groups/%d/children/%d", groupID, monitorID)
	resp, err := c.doRequest(ctx, "DELETE", path, nil)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}
