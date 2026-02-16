package client

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client is the Uptime Kuma REST API client
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// Config holds the configuration for creating a new Client
type Config struct {
	BaseURL            string
	APIKey             string
	InsecureSkipVerify bool
	Timeout            time.Duration
}

// NewClient creates a new Uptime Kuma API client
func NewClient(config Config) *Client {
	if config.Timeout == 0 {
		config.Timeout = 30 * time.Second
	}

	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: config.InsecureSkipVerify,
		},
	}

	return &Client{
		baseURL: config.BaseURL,
		apiKey:  config.APIKey,
		httpClient: &http.Client{
			Timeout:   config.Timeout,
			Transport: transport,
		},
	}
}

// doRequest performs an HTTP request with authentication
func (c *Client) doRequest(ctx context.Context, method, path string, body interface{}) (*http.Response, error) {
	var reqBody io.Reader
	if body != nil {
		jsonData, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewBuffer(jsonData)
	}

	url := c.baseURL + path
	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}

	return resp, nil
}

// parseResponse parses the HTTP response into the target struct
func parseResponse(resp *http.Response, target interface{}) error {
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Try to parse error response
		var apiError APIError
		if err := json.Unmarshal(body, &apiError); err == nil && apiError.Message != "" {
			return &apiError
		}
		return fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(body))
	}

	if target != nil {
		if err := json.Unmarshal(body, target); err != nil {
			return fmt.Errorf("failed to unmarshal response: %w", err)
		}
	}

	return nil
}

// APIError represents an error response from the API
type APIError struct {
	OK        bool   `json:"ok"`
	Message   string `json:"msg"`
	ErrorCode string `json:"error"`
}

func (e *APIError) Error() string {
	if e.ErrorCode != "" {
		return fmt.Sprintf("API error (%s): %s", e.ErrorCode, e.Message)
	}
	return fmt.Sprintf("API error: %s", e.Message)
}

// APIResponse is the standard API response wrapper
type APIResponse struct {
	OK      bool   `json:"ok"`
	Message string `json:"msg,omitempty"`
}
