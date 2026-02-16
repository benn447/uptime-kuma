package client

import (
	"context"
)

// GetHealth checks the health of the Uptime Kuma API
func (c *Client) GetHealth(ctx context.Context) (*HealthStatus, error) {
	resp, err := c.doRequest(ctx, "GET", "/api/v1/status/health", nil)
	if err != nil {
		return nil, err
	}

	var result HealthStatus
	if err := parseResponse(resp, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

// Ping tests connectivity to the Uptime Kuma API
// Returns true if the API is reachable and healthy
func (c *Client) Ping(ctx context.Context) (bool, error) {
	health, err := c.GetHealth(ctx)
	if err != nil {
		return false, err
	}

	return health.OK && health.Status == "healthy", nil
}
