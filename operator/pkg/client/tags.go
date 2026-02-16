package client

import (
	"context"
	"fmt"
)

// ListTags lists all tags
func (c *Client) ListTags(ctx context.Context) ([]Tag, error) {
	resp, err := c.doRequest(ctx, "GET", "/api/v1/tags", nil)
	if err != nil {
		return nil, err
	}

	var result ListTagsResponse
	if err := parseResponse(resp, &result); err != nil {
		return nil, err
	}

	return result.Tags, nil
}

// GetTag gets a single tag by ID
func (c *Client) GetTag(ctx context.Context, tagID int) (*Tag, error) {
	path := fmt.Sprintf("/api/v1/tags/%d", tagID)
	resp, err := c.doRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	var result GetTagResponse
	if err := parseResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result.Tag, nil
}

// CreateTag creates a new tag
func (c *Client) CreateTag(ctx context.Context, tag *Tag) (*Tag, error) {
	resp, err := c.doRequest(ctx, "POST", "/api/v1/tags", tag)
	if err != nil {
		return nil, err
	}

	var result CreateTagResponse
	if err := parseResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result.Tag, nil
}

// UpdateTag updates an existing tag
func (c *Client) UpdateTag(ctx context.Context, tagID int, tag *Tag) (*Tag, error) {
	path := fmt.Sprintf("/api/v1/tags/%d", tagID)
	resp, err := c.doRequest(ctx, "PUT", path, tag)
	if err != nil {
		return nil, err
	}

	var result GetTagResponse
	if err := parseResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result.Tag, nil
}

// DeleteTag deletes a tag
func (c *Client) DeleteTag(ctx context.Context, tagID int) error {
	path := fmt.Sprintf("/api/v1/tags/%d", tagID)
	resp, err := c.doRequest(ctx, "DELETE", path, nil)
	if err != nil {
		return err
	}

	var result APIResponse
	return parseResponse(resp, &result)
}

// FindOrCreateTag finds a tag by name or creates it if it doesn't exist
func (c *Client) FindOrCreateTag(ctx context.Context, name, color string) (*Tag, error) {
	// List all tags and search for the name
	tags, err := c.ListTags(ctx)
	if err != nil {
		return nil, err
	}

	for _, tag := range tags {
		if tag.Name == name {
			return &tag, nil
		}
	}

	// Tag not found, create it
	return c.CreateTag(ctx, &Tag{
		Name:  name,
		Color: color,
	})
}
