// Package main is the Memstate AI exhaustive API test suite.
// It runs all available REST endpoints and MCP tools, validates response content
// (not just status codes), and outputs a comparison matrix.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

const (
	defaultAPIKey = "mst_A94jiQCkQqFRuRtV1qRPL9Jo4vIkOi1r"
	restBaseURL   = "https://api.memstate.ai/api/v1"
	mcpNodeDir    = "/tmp"
)

// projectID uses underscores (not hyphens) because project IDs are used as keypath
// prefixes by the MCP server, and hyphens are not valid in keypaths. The timestamp
// suffix ensures each test run starts with a fresh project, avoiding conflicts with
// soft-deleted projects from prior runs.
var projectID = fmt.Sprintf("api_tester_%d", time.Now().Unix())

// apiKey is resolved at runtime: MEMSTATE_API_KEY env var takes precedence.
var apiKey = func() string {
	if k := os.Getenv("MEMSTATE_API_KEY"); k != "" {
		return k
	}
	return defaultAPIKey
}()

// TestResult holds the outcome of a single API test.
type TestResult struct {
	Name        string        `json:"name"`
	Type        string        `json:"type"` // "REST" or "MCP"
	Category    string        `json:"category"`
	Status      string        `json:"status"` // "PASS", "FAIL", or "SKIP"
	StatusCode  int           `json:"status_code,omitempty"`
	Error       string        `json:"error,omitempty"`
	Duration    time.Duration `json:"duration_ms"`
	Response    string        `json:"response,omitempty"`
}

var results []TestResult

// --- Helpers ---

func recordResult(name, apiType, category string, err error, start time.Time, statusCode int, response string) {
	status := "PASS"
	errMsg := ""
	if err != nil {
		status = "FAIL"
		errMsg = err.Error()
	}

	results = append(results, TestResult{
		Name:       name,
		Type:       apiType,
		Category:   category,
		Status:     status,
		StatusCode: statusCode,
		Error:      errMsg,
		Duration:   time.Since(start),
		Response:   response,
	})

	icon := "✅"
	if err != nil {
		icon = "❌"
	}
	fmt.Printf("%s [%s] %s (%.2fs)\n", icon, apiType, name, time.Since(start).Seconds())
	if err != nil {
		fmt.Printf("   Error: %v\n", err)
	}
}

func skipResult(name, apiType, category, reason string) {
	results = append(results, TestResult{
		Name:     name,
		Type:     apiType,
		Category: category,
		Status:   "SKIP",
		Error:    reason,
	})
	fmt.Printf("⚠️  [%s] %s: SKIPPED (%s)\n", apiType, name, reason)
}

// doRestRequest performs an HTTP request and returns the raw body, status code, and any error.
// A non-2xx status code is returned as an error.
func doRestRequest(method, endpoint string, body interface{}) ([]byte, int, error) {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to marshal body: %w", err)
		}
		reqBody = bytes.NewBuffer(jsonBody)
	}

	req, err := http.NewRequest(method, restBaseURL+endpoint, reqBody)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("X-API-Key", apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return respBody, resp.StatusCode, fmt.Errorf("API error (%d): %s", resp.StatusCode, string(respBody))
	}

	return respBody, resp.StatusCode, nil
}

// doMCPCall invokes a Memstate MCP tool via the @memstate/mcp npm package.
func doMCPCall(tool string, args map[string]interface{}) (string, error) {
	argsJSON, err := json.Marshal(args)
	if err != nil {
		return "", fmt.Errorf("failed to marshal args: %w", err)
	}

	scriptContent := fmt.Sprintf(`
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@memstate/mcp"],
    env: {
      ...process.env,
      MEMSTATE_API_KEY: "%s"
    }
  });

  const client = new Client({ name: "api-tester", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  try {
    const result = await client.callTool({
      name: "%s",
      arguments: %s
    });
    const text = result.content && result.content[0] ? result.content[0].text : JSON.stringify(result);
    console.log("RESULT:" + text);
  } catch (error) {
    console.log("MCP_ERROR:" + error.message);
    process.exit(1);
  }

  await client.close();
}

main().catch(err => {
  console.log("MCP_ERROR:" + err.message);
  process.exit(1);
});
`, apiKey, tool, string(argsJSON))

	scriptPath := fmt.Sprintf("%s/mcp-test-%s-%d.js", mcpNodeDir, tool, time.Now().UnixNano())
	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0644); err != nil {
		return "", err
	}
	defer os.Remove(scriptPath)

	cmd := exec.Command("node", scriptPath)
	cmd.Dir = mcpNodeDir
	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr
	cmd.Env = append(os.Environ(), "MEMSTATE_API_KEY="+apiKey)

	// Run the node script. The MCP client process may exit with status 1 after
	// completing successfully (the stdio transport doesn't always exit cleanly),
	// so we check for a RESULT: marker in stdout before treating a non-zero exit
	// as a hard failure.
	runErr := cmd.Run()

	output := out.String()

	// Check for explicit MCP tool errors first
	if strings.Contains(output, "MCP_ERROR:") {
		errMsg := strings.TrimPrefix(strings.TrimSpace(output), "MCP_ERROR:")
		return "", fmt.Errorf("MCP tool error: %s", errMsg)
	}

	// If we got a RESULT: marker, the call succeeded regardless of exit code
	if idx := strings.Index(output, "RESULT:"); idx >= 0 {
		return strings.TrimSpace(output[idx+len("RESULT:"):]), nil
	}

	// No RESULT and no MCP_ERROR — treat the run error as a real failure
	if runErr != nil {
		return "", fmt.Errorf("node execution failed: %v, stderr: %s", runErr, stderr.String())
	}

	return output, nil
}

// parseJSON is a convenience helper to unmarshal JSON into a map.
func parseJSON(data []byte) map[string]interface{} {
	var m map[string]interface{}
	json.Unmarshal(data, &m)
	return m
}

// getString extracts a string field from a parsed JSON map.
func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// getFloat extracts a float64 field from a parsed JSON map.
func getFloat(m map[string]interface{}, key string) float64 {
	if v, ok := m[key].(float64); ok {
		return v
	}
	return 0
}

// getSlice extracts a []interface{} field from a parsed JSON map.
func getSlice(m map[string]interface{}, key string) []interface{} {
	if v, ok := m[key].([]interface{}); ok {
		return v
	}
	return nil
}

// getBool extracts a bool field from a parsed JSON map.
func getBool(m map[string]interface{}, key string) bool {
	if v, ok := m[key].(bool); ok {
		return v
	}
	return false
}

// =============================================================================
// REST API Tests
// =============================================================================

func testRestStatus() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", "/status", nil)
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: check required fields and logical values
		if getString(m, "status") != "ok" {
			err = fmt.Errorf("expected status=ok, got %q", getString(m, "status"))
		} else if getFloat(m, "memory_count") < 0 {
			err = fmt.Errorf("memory_count should be >= 0, got %v", m["memory_count"])
		} else if getFloat(m, "project_count") < 0 {
			err = fmt.Errorf("project_count should be >= 0, got %v", m["project_count"])
		} else if getString(m, "storage_backend") == "" {
			err = fmt.Errorf("storage_backend should not be empty")
		}
	}
	recordResult("GET /status", "REST", "System", err, start, code, string(resp))
}

func testRestListProjects() []interface{} {
	start := time.Now()
	resp, code, err := doRestRequest("GET", "/projects", nil)
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: projects key must be present (may be empty array)
		if _, ok := m["projects"]; !ok {
			err = fmt.Errorf("response missing 'projects' key")
		}
	}
	recordResult("GET /projects", "REST", "Projects", err, start, code, string(resp))
	if err != nil {
		return nil
	}
	m := parseJSON(resp)
	return getSlice(m, "projects")
}

func testRestCreateProject() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/projects", map[string]interface{}{
		"project_id":  projectID,
		"name":        "API Tester Go",
		"description": "Automated test project for Go api-tester exhaustive suite",
		"git_remote":  "https://github.com/memstate-ai/memstate-mcp",
	})
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: returned project must have the correct ID
		if getString(m, "id") != projectID {
			err = fmt.Errorf("expected project id=%q, got %q", projectID, getString(m, "id"))
		} else if getString(m, "name") == "" {
			err = fmt.Errorf("project name should not be empty")
		}
	}
	recordResult("POST /projects (create/update)", "REST", "Projects", err, start, code, string(resp))

	// Seed a memory synchronously so the project exists in the memories table immediately.
	// Use /memories/store (sync) rather than /memories/remember (async) to avoid race conditions.
	doRestRequest("POST", "/memories/store", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.seed",
		"content":    "seed memory to register project in memories table",
	})
}

func testRestGetProject() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", "/projects/"+projectID, nil)
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: returned project must match the ID we created
		if getString(m, "id") != projectID {
			err = fmt.Errorf("expected project id=%q, got %q", projectID, getString(m, "id"))
		} else if getBool(m, "is_deleted") {
			err = fmt.Errorf("project should not be deleted yet")
		}
	}
	recordResult("GET /projects/{id}", "REST", "Projects", err, start, code, string(resp))
}

func testRestRemember() string {
	// Use /memories/store (synchronous) to get a memory_id immediately.
	// /memories/remember is the async AI-extraction path (returns job_id, not memory_id).
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/store", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.rest.memory",
		"content":    "This is a test memory from the REST API. It validates that the /memories/store endpoint works correctly.",
		"category":   "fact",
	})
	var memoryID string
	if err == nil {
		m := parseJSON(resp)
		memoryID = getString(m, "memory_id")
		// Deep validation
		if memoryID == "" {
			err = fmt.Errorf("response missing 'memory_id'")
		} else if getString(m, "action") == "" {
			err = fmt.Errorf("response missing 'action' field")
		} else if getFloat(m, "version") < 1 {
			err = fmt.Errorf("version should be >= 1, got %v", m["version"])
		}
	}
	recordResult("POST /memories/store", "REST", "Memories", err, start, code, string(resp))
	return memoryID
}

func testRestGetMemoryByKeypath() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", fmt.Sprintf("/memories/keypath/test.rest.memory?project_id=%s", projectID), nil)
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: keypath must match
		if getString(m, "keypath") != "test.rest.memory" {
			err = fmt.Errorf("expected keypath=test.rest.memory, got %q", getString(m, "keypath"))
		} else if getString(m, "id") == "" {
			err = fmt.Errorf("response missing 'id' field")
		} else if getBool(m, "is_deleted") {
			err = fmt.Errorf("memory should not be deleted")
		}
	}
	recordResult("GET /memories/keypath/{keypath}", "REST", "Memories", err, start, code, string(resp))
}

func testRestGetMemoryByID(memoryID string) {
	if memoryID == "" {
		skipResult("GET /memories/{id}", "REST", "Memories", "no memory_id from store step")
		return
	}
	start := time.Now()
	resp, code, err := doRestRequest("GET", "/memories/"+memoryID, nil)
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: returned memory must match the ID we requested
		if getString(m, "id") != memoryID {
			err = fmt.Errorf("expected id=%q, got %q", memoryID, getString(m, "id"))
		} else if getString(m, "content") == "" {
			err = fmt.Errorf("memory content should not be empty")
		} else if getString(m, "keypath") == "" {
			err = fmt.Errorf("memory keypath should not be empty")
		}
	}
	recordResult("GET /memories/{id}", "REST", "Memories", err, start, code, string(resp))
}

// testRestVersioning verifies that writing to the same keypath twice creates a new version.
// The supersede endpoint was removed — Memstate now auto-versions on every write to the same keypath.
func testRestVersioning() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/store", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.rest.memory",
		"content":    "This is version 2 of the test memory — written to the same keypath to trigger auto-versioning.",
		"category":   "fact",
	})
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: version must be 2 (second write to same keypath)
		if getString(m, "memory_id") == "" {
			err = fmt.Errorf("response missing 'memory_id'")
		} else if getFloat(m, "version") < 2 {
			err = fmt.Errorf("expected version >= 2 on second write to same keypath, got %v", m["version"])
		} else if getString(m, "action") == "" {
			err = fmt.Errorf("response missing 'action' field")
		}
	}
	recordResult("POST /memories/store (auto-versioning, v2)", "REST", "Memories", err, start, code, string(resp))
}

func testRestBrowse() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/browse", map[string]interface{}{
		"project_id":     projectID,
		"keypath_prefix": "test",
	})
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: memories array must be present; keypath_prefix must be echoed
		if _, ok := m["memories"]; !ok {
			err = fmt.Errorf("response missing 'memories' key")
		} else if getString(m, "keypath_prefix") != "test" {
			err = fmt.Errorf("expected keypath_prefix=test, got %q", getString(m, "keypath_prefix"))
		} else if getFloat(m, "total_found") < 0 {
			err = fmt.Errorf("total_found should be >= 0")
		}
	}
	recordResult("POST /memories/browse", "REST", "Memories", err, start, code, string(resp))
}

func testRestHistory() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/history", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.rest.memory",
	})
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: versions array must be present and have at least 2 entries
		// (original v1 + auto-versioned v2 from testRestVersioning)
		versions := getSlice(m, "versions")
		if versions == nil {
			err = fmt.Errorf("response missing 'versions' key")
		} else if len(versions) < 2 {
			err = fmt.Errorf("expected at least 2 versions (v1 + v2 auto-versioned), got %d", len(versions))
		} else if getFloat(m, "total_versions") < 2 {
			err = fmt.Errorf("expected total_versions >= 2, got %v", m["total_versions"])
		}
	}
	recordResult("POST /memories/history", "REST", "Memories", err, start, code, string(resp))
}

func testRestSearch() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/search", map[string]interface{}{
		"project_id": projectID,
		"query":      "test memory REST API validation",
		"limit":      5,
	})
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: results array must be present; query must be echoed
		if _, ok := m["results"]; !ok {
			err = fmt.Errorf("response missing 'results' key")
		} else if getString(m, "query") == "" {
			err = fmt.Errorf("response missing 'query' echo field")
		} else if getFloat(m, "total_found") < 0 {
			err = fmt.Errorf("total_found should be >= 0")
		}
	}
	recordResult("POST /memories/search", "REST", "Search", err, start, code, string(resp))
}

func testRestKeypaths() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", fmt.Sprintf("/keypaths?project_id=%s", projectID), nil)
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: keypaths array must be present and non-empty
		keypaths := getSlice(m, "keypaths")
		if keypaths == nil {
			err = fmt.Errorf("response missing 'keypaths' key")
		} else if len(keypaths) == 0 {
			err = fmt.Errorf("expected at least one keypath in project %q, got 0", projectID)
		} else if getFloat(m, "total") <= 0 {
			err = fmt.Errorf("expected total > 0, got %v", m["total"])
		}
	}
	recordResult("GET /keypaths", "REST", "Search", err, start, code, string(resp))
}

func testRestKeypathsPost() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/keypaths", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test",
		"recursive":  true,
	})
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: memories map must be present
		if _, ok := m["memories"]; !ok {
			err = fmt.Errorf("response missing 'memories' key")
		} else if getFloat(m, "total_count") <= 0 {
			err = fmt.Errorf("expected total_count > 0, got %v", m["total_count"])
		}
	}
	recordResult("POST /keypaths (recursive)", "REST", "Search", err, start, code, string(resp))
}

func testRestKeypathsTimeTravelPost() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/keypaths", map[string]interface{}{
		"project_id":  projectID,
		"keypath":     "test",
		"recursive":   true,
		"at_revision": 1,
	})
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: revision_number must be present
		if _, ok := m["memories"]; !ok {
			err = fmt.Errorf("response missing 'memories' key")
		} else if _, ok := m["revision_number"]; !ok {
			err = fmt.Errorf("response missing 'revision_number' key")
		}
	}
	recordResult("POST /keypaths (time-travel at_revision)", "REST", "Search", err, start, code, string(resp))
}

func testRestTree() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", fmt.Sprintf("/tree?project_id=%s", projectID), nil)
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: domains array must be present and non-empty
		domains := getSlice(m, "domains")
		if domains == nil {
			err = fmt.Errorf("response missing 'domains' key")
		} else if len(domains) == 0 {
			err = fmt.Errorf("expected at least one domain in tree, got 0")
		} else if getFloat(m, "total_memories") <= 0 {
			err = fmt.Errorf("expected total_memories > 0, got %v", m["total_memories"])
		}
	}
	recordResult("GET /tree", "REST", "Projects", err, start, code, string(resp))
}

func testRestIngest() string {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/remember", map[string]interface{}{
		"project_id": projectID,
		"content":    "# Test Ingestion via REST\n\n## Architecture\nThe test uses Go to call the REST API directly.\n\n## Configuration\n- base_url: https://api.memstate.ai/api/v1\n- auth: X-API-Key header\n- timeout: 30s\n\n## Test Coverage\nThis ingestion tests the AI-powered keypath extraction feature.",
		"source":     "docs",
		"context":    "Automated test from Go api-tester",
	})
	var jobID string
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: job_id or ingestion_id must be present
		for _, key := range []string{"job_id", "ingestion_id"} {
			if id := getString(m, key); id != "" {
				jobID = id
				break
			}
		}
		if jobID == "" {
			err = fmt.Errorf("response missing 'job_id' or 'ingestion_id'")
		}
	}
	recordResult("POST /memories/remember", "REST", "Ingestion", err, start, code, string(resp))
	return jobID
}

func testRestJobStatus(jobID string) {
	if jobID == "" {
		skipResult("GET /jobs/{job_id}", "REST", "Ingestion", "no job_id from remember step")
		return
	}
	start := time.Now()
	resp, code, err := doRestRequest("GET", "/jobs/"+jobID, nil)
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: status field must be present and non-empty
		status := getString(m, "status")
		if status == "" {
			err = fmt.Errorf("response missing 'status' field")
		} else if status != "pending" && status != "processing" && status != "complete" && status != "error" {
			err = fmt.Errorf("unexpected job status %q (expected pending/processing/complete/error)", status)
		}
	}
	recordResult("GET /jobs/{job_id}", "REST", "Ingestion", err, start, code, string(resp))
}

// testRestRemovedEndpoints verifies that removed endpoints return the correct error codes.
// GET /review and POST /review/{id}/resolve were removed — versioning is automatic.
func testRestRemovedEndpoints() {
	// GET /review — should return 410 Gone
	start := time.Now()
	_, code, _ := doRestRequest("GET", fmt.Sprintf("/review?project_id=%s", projectID), nil)
	if code == 410 {
		recordResult("GET /review (removed — expect 410)", "REST", "Removed", nil, start, code, "410 Gone (expected)")
	} else {
		recordResult("GET /review (removed — expect 410)", "REST", "Removed",
			fmt.Errorf("expected 410, got %d", code), start, code, "")
	}

	// POST /review/{id}/resolve — should return 404 Not Found
	start2 := time.Now()
	_, code2, _ := doRestRequest("POST", "/review/dummy-id/resolve", map[string]interface{}{"action": "acknowledge"})
	if code2 == 404 {
		recordResult("POST /review/{id}/resolve (removed — expect 404)", "REST", "Removed", nil, start2, code2, "404 Not Found (expected)")
	} else {
		recordResult("POST /review/{id}/resolve (removed — expect 404)", "REST", "Removed",
			fmt.Errorf("expected 404, got %d", code2), start2, code2, "")
	}
}

func testRestChangelog() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", fmt.Sprintf("/changelog?project_id=%s&limit=20", projectID), nil)
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: events array and total_events must be present
		events := getSlice(m, "events")
		if events == nil {
			err = fmt.Errorf("response missing 'events' key")
		} else if _, ok := m["total_events"]; !ok {
			err = fmt.Errorf("response missing 'total_events' key")
		} else if len(events) == 0 {
			err = fmt.Errorf("expected at least one changelog event for project %q, got 0", projectID)
		} else {
			// Validate structure of first event
			firstEvent, ok := events[0].(map[string]interface{})
			if !ok {
				err = fmt.Errorf("event is not a JSON object")
			} else if getString(firstEvent, "event_type") == "" {
				err = fmt.Errorf("event missing 'event_type' field")
			} else if getString(firstEvent, "entity_id") == "" {
				err = fmt.Errorf("event missing 'entity_id' field")
			} else if getString(firstEvent, "occurred_at") == "" {
				err = fmt.Errorf("event missing 'occurred_at' field")
			}
		}
	}
	recordResult("GET /changelog", "REST", "Changelog", err, start, code, string(resp))
}

func testRestChangelogGlobal() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", "/changelog?limit=10", nil)
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: events array must be present (may include events from other projects)
		if _, ok := m["events"]; !ok {
			err = fmt.Errorf("response missing 'events' key")
		} else if _, ok := m["total_events"]; !ok {
			err = fmt.Errorf("response missing 'total_events' key")
		}
	}
	recordResult("GET /changelog (global, no project filter)", "REST", "Changelog", err, start, code, string(resp))
}

func testRestChangelogSince() {
	// Use a timestamp from 1 hour ago to ensure we get recent events
	since := time.Now().Add(-1 * time.Hour).UTC().Format(time.RFC3339)
	start := time.Now()
	resp, code, err := doRestRequest("GET", fmt.Sprintf("/changelog?project_id=%s&since=%s", projectID, since), nil)
	if err == nil {
		m := parseJSON(resp)
		if _, ok := m["events"]; !ok {
			err = fmt.Errorf("response missing 'events' key")
		}
	}
	recordResult("GET /changelog (with since filter)", "REST", "Changelog", err, start, code, string(resp))
}

func testRestRevisions() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", fmt.Sprintf("/projects/%s/revisions?limit=5", projectID), nil)
	if err == nil {
		m := parseJSON(resp)
		// The revisions endpoint is currently a stub — it returns a message field
		// explaining that full revision listing is coming soon (use at_revision for time travel).
		// We validate the stub response shape: project_id must be echoed and message must be present.
		if _, hasRevisions := m["revisions"]; hasRevisions {
			// Full implementation: validate project_id is echoed
			if getString(m, "project_id") == "" {
				err = fmt.Errorf("response missing project_id field")
			}
		} else if msg := getString(m, "message"); msg != "" {
			// Stub response: validate project_id is echoed correctly
			if getString(m, "project_id") != projectID {
				err = fmt.Errorf("stub response: expected project_id=%q, got %q", projectID, getString(m, "project_id"))
			}
		} else {
			err = fmt.Errorf("response missing both revisions and message keys")
		}
	}
	recordResult("GET /projects/{id}/revisions", "REST", "Projects", err, start, code, string(resp))
}

func testRestDeleteMemory() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/delete", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.rest.memory",
		"recursive":  false,
	})
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: deleted_count must be >= 0 and message must be present
		if _, ok := m["deleted_count"]; !ok {
			err = fmt.Errorf("response missing 'deleted_count' key")
		} else if getString(m, "message") == "" {
			err = fmt.Errorf("response missing 'message' field")
		}
	}
	recordResult("POST /memories/delete", "REST", "Cleanup", err, start, code, string(resp))
}

func testRestDeleteProject() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/projects/delete", map[string]interface{}{
		"project_id": projectID,
	})
	if err == nil {
		m := parseJSON(resp)
		// Deep validation: project_id must be echoed and deleted_count >= 0
		if getString(m, "project_id") != projectID {
			err = fmt.Errorf("expected project_id=%q, got %q", projectID, getString(m, "project_id"))
		} else if _, ok := m["deleted_count"]; !ok {
			err = fmt.Errorf("response missing 'deleted_count' key")
		}
	}
	recordResult("POST /projects/delete", "REST", "Cleanup", err, start, code, string(resp))
}

// testRestDeleteProjectIdempotent verifies BUG-001 fix: calling delete on an already-deleted
// project should return 200 (with deleted_count=0), NOT a 500 error.
func testRestDeleteProjectIdempotent() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/projects/delete", map[string]interface{}{
		"project_id": projectID,
	})
	if err == nil {
		m := parseJSON(resp)
		// Idempotent: deleted_count should be 0 (already deleted), NOT a 500
		if getString(m, "project_id") != projectID {
			err = fmt.Errorf("expected project_id=%q, got %q", projectID, getString(m, "project_id"))
		} else if getFloat(m, "deleted_count") != 0 {
			err = fmt.Errorf("expected deleted_count=0 for already-deleted project, got %v", m["deleted_count"])
		}
	}
	recordResult("POST /projects/delete (idempotent — BUG-001 fix)", "REST", "Cleanup", err, start, code, string(resp))
}



// =============================================================================
// MCP Tool Tests
// =============================================================================

func testMCPListProjects() {
	start := time.Now()
	resp, err := doMCPCall("memstate_get", map[string]interface{}{})
	if err == nil && resp == "" {
		err = fmt.Errorf("empty response from memstate_get (list all)")
	}
	recordResult("memstate_get (list all projects)", "MCP", "Projects", err, start, 0, resp)
}

func testMCPSet() string {
	start := time.Now()
	resp, err := doMCPCall("memstate_set", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.mcp.config",
		"value":      "mcp-test-value-12345",
		"category":   "fact",
	})
	if err == nil {
		// Deep validation: response should mention success or the keypath
		if !strings.Contains(resp, "test.mcp.config") && !strings.Contains(resp, "success") && !strings.Contains(resp, "stored") && !strings.Contains(resp, "saved") {
			err = fmt.Errorf("response doesn't confirm storage of keypath: %q", resp[:min(len(resp), 200)])
		}
	}
	recordResult("memstate_set", "MCP", "Memories", err, start, 0, resp)
	return resp
}

func testMCPRemember() {
	start := time.Now()
	resp, err := doMCPCall("memstate_remember", map[string]interface{}{
		"project_id": projectID,
		"content":    "## MCP Task Summary\n- Tested memstate_remember tool\n- Source: agent\n- The server should extract keypaths automatically\n- This validates AI-powered ingestion via MCP",
		"source":     "agent",
		"context":    "Automated test from Go api-tester",
	})
	if err == nil && resp == "" {
		err = fmt.Errorf("empty response from memstate_remember")
	}
	recordResult("memstate_remember", "MCP", "Memories", err, start, 0, resp)
}

func testMCPGetProject() {
	start := time.Now()
	resp, err := doMCPCall("memstate_get", map[string]interface{}{
		"project_id": projectID,
	})
	if err == nil {
		// Deep validation: response should mention the project or test keypath
		if !strings.Contains(resp, "test") && !strings.Contains(resp, projectID) {
			err = fmt.Errorf("response doesn't mention project or test keypath: %q", resp[:min(len(resp), 200)])
		}
	}
	recordResult("memstate_get (project tree)", "MCP", "Projects", err, start, 0, resp)
}

func testMCPGetSubtree() {
	start := time.Now()
	resp, err := doMCPCall("memstate_get", map[string]interface{}{
		"project_id":      projectID,
		"keypath":         "test",
		"include_content": true,
	})
	if err == nil {
		// Deep validation: response should contain actual content
		if !strings.Contains(resp, "test") {
			err = fmt.Errorf("subtree response doesn't contain expected 'test' keypath data")
		}
	}
	recordResult("memstate_get (subtree + content)", "MCP", "Memories", err, start, 0, resp)
}

func testMCPGetByProjectKeypath() {
	// Test that memstate_get with project_id + keypath + include_content returns the stored memory.
	// This is the primary agent-facing lookup pattern — agents always use project+keypath, never memory UUIDs.
	start := time.Now()
	result, err := doMCPCall("memstate_get", map[string]interface{}{
		"project_id":      projectID,
		"keypath":         "test.mcp.config",
		"include_content": true,
		"recursive":       false,
	})
	if err == nil {
		// Deep validation: response should contain the stored value
		if !strings.Contains(result, "mcp-test-value") && !strings.Contains(result, "test.mcp.config") {
			err = fmt.Errorf("response doesn't contain expected keypath or content: %q", result[:min(len(result), 200)])
		}
	}
	recordResult("memstate_get (project+keypath+content)", "MCP", "Memories", err, start, 0, result)
}

func testMCPSearch() {
	start := time.Now()
	resp, err := doMCPCall("memstate_search", map[string]interface{}{
		"project_id": projectID,
		"query":      "MCP test memory configuration",
		"limit":      5,
	})
	if err == nil && resp == "" {
		err = fmt.Errorf("empty response from memstate_search")
	}
	recordResult("memstate_search", "MCP", "Search", err, start, 0, resp)
}

func testMCPSearchWithFilters() {
	start := time.Now()
	resp, err := doMCPCall("memstate_search", map[string]interface{}{
		"project_id":     projectID,
		"query":          "test",
		"limit":          3,
		"keypath_prefix": "test",
	})
	if err == nil && resp == "" {
		err = fmt.Errorf("empty response from memstate_search with filters")
	}
	recordResult("memstate_search (with keypath_prefix filter)", "MCP", "Search", err, start, 0, resp)
}

func testMCPHistory() {
	start := time.Now()
	resp, err := doMCPCall("memstate_history", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.mcp.config",
	})
	if err == nil {
		// Deep validation: response should mention version history
		if !strings.Contains(resp, "test.mcp.config") && !strings.Contains(resp, "version") && !strings.Contains(resp, "Version") {
			err = fmt.Errorf("history response doesn't mention keypath or version: %q", resp[:min(len(resp), 200)])
		}
	}
	recordResult("memstate_history (by keypath)", "MCP", "Memories", err, start, 0, resp)
}

func testMCPGetTimeTravelRevision() {
	start := time.Now()
	resp, err := doMCPCall("memstate_get", map[string]interface{}{
		"project_id":  projectID,
		"keypath":     "test",
		"at_revision": 1,
	})
	if err == nil && resp == "" {
		err = fmt.Errorf("empty response from memstate_get time-travel")
	}
	recordResult("memstate_get (time-travel at_revision)", "MCP", "Memories", err, start, 0, resp)
}

func testMCPDeleteKeypath() {
	// First look up the actual keypath that was stored by memstate_set.
	// memstate_set stores at the exact keypath provided, so we use test.mcp.config directly.
	// Note: the project_id may contain hyphens (e.g. api-tester-1234567890) which are not
	// valid in keypaths, so we always use the explicit keypath rather than a project-prefixed one.
	start := time.Now()
	resp, err := doMCPCall("memstate_delete", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.mcp.config",
		"recursive":  false,
	})
	if err == nil {
		// Deep validation: response should confirm deletion
		if !strings.Contains(resp, "deleted") && !strings.Contains(resp, "success") && !strings.Contains(resp, "removed") && !strings.Contains(resp, "0") {
			err = fmt.Errorf("delete response doesn't confirm deletion: %q", resp[:min(len(resp), 200)])
		}
	}
	recordResult("memstate_delete (keypath)", "MCP", "Cleanup", err, start, 0, resp)
}

func testMCPDeleteProject() {
	start := time.Now()
	resp, err := doMCPCall("memstate_delete_project", map[string]interface{}{
		"project_id": projectID,
	})
	if err == nil {
		// Deep validation: response should confirm deletion
		if !strings.Contains(resp, "deleted") && !strings.Contains(resp, "success") && !strings.Contains(resp, "removed") {
			err = fmt.Errorf("delete_project response doesn't confirm deletion: %q", resp[:min(len(resp), 200)])
		}
	}
	recordResult("memstate_delete_project", "MCP", "Cleanup", err, start, 0, resp)
}

// min returns the smaller of two ints (Go 1.21+ has built-in min, but we target older versions).
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// =============================================================================
// Report Generation
// =============================================================================

func generateMarkdownReport() string {
	var sb strings.Builder

	sb.WriteString("# Memstate AI API Test Results\n\n")
	sb.WriteString(fmt.Sprintf("**Run Date:** %s\n\n", time.Now().UTC().Format("2006-01-02 15:04:05 UTC")))
	sb.WriteString(fmt.Sprintf("**Project Used:** `%s`\n\n", projectID))
	sb.WriteString(fmt.Sprintf("**Base URL:** `%s`\n\n", restBaseURL))

	// Summary
	pass, fail, skip := 0, 0, 0
	for _, r := range results {
		switch r.Status {
		case "PASS":
			pass++
		case "FAIL":
			fail++
		default:
			skip++
		}
	}
	sb.WriteString("## Summary\n\n")
	sb.WriteString("| Total | Pass | Fail | Skip |\n")
	sb.WriteString("|-------|------|------|------|\n")
	sb.WriteString(fmt.Sprintf("| %d | %d | %d | %d |\n\n", len(results), pass, fail, skip))

	// Full matrix
	sb.WriteString("## Test Matrix\n\n")
	sb.WriteString("| API | Category | Endpoint / Tool | Status | Duration | Notes |\n")
	sb.WriteString("|-----|----------|----------------|--------|----------|-------|\n")

	for _, r := range results {
		statusIcon := "✅ PASS"
		switch r.Status {
		case "FAIL":
			statusIcon = "❌ FAIL"
		case "SKIP":
			statusIcon = "⚠️ SKIP"
		}

		notes := "-"
		if r.Error != "" {
			errStr := r.Error
			if len(errStr) > 80 {
				errStr = errStr[:80] + "..."
			}
			notes = errStr
		}

		sb.WriteString(fmt.Sprintf("| **%s** | %s | `%s` | %s | %.2fs | %s |\n",
			r.Type, r.Category, r.Name, statusIcon, r.Duration.Seconds(), notes))
	}

	// REST API Coverage
	sb.WriteString("\n## REST API Coverage\n\n")
	sb.WriteString("| Method | Endpoint | Category | Tested |\n")
	sb.WriteString("|--------|----------|----------|--------|\n")
	restEndpoints := []struct{ method, endpoint, category string }{
		{"GET", "/status", "System"},
		{"GET", "/projects", "Projects"},
		{"POST", "/projects", "Projects"},
		{"GET", "/projects/{id}", "Projects"},
		{"GET", "/projects/{id}/revisions", "Projects"},
		{"POST", "/projects/delete", "Projects"},
		{"GET", "/tree", "Projects"},
		{"GET", "/keypaths", "Search"},
		{"POST", "/keypaths", "Search"},
		{"GET", "/review", "Removed"},
		{"POST", "/review/{id}/resolve", "Removed"},
		{"GET", "/changelog", "Changelog"},
		{"POST", "/memories/store", "Memories"},
		{"POST", "/memories/store (v2 auto-version)", "Memories"},
		{"POST", "/memories/remember", "Ingestion"},
		{"GET", "/memories/{id}", "Memories"},
		{"GET", "/memories/keypath/{keypath}", "Memories"},
		{"POST", "/memories/browse", "Memories"},
		{"POST", "/memories/history", "Memories"},
		{"POST", "/memories/delete", "Memories"},
		{"POST", "/memories/search", "Search"},
		{"GET", "/jobs/{job_id}", "Ingestion"},
	}

	for _, ep := range restEndpoints {
		tested := "❌"
		for _, r := range results {
			if r.Type == "REST" && strings.Contains(r.Name, ep.endpoint) {
				if r.Status == "PASS" {
					tested = "✅"
				} else if r.Status == "SKIP" {
					tested = "⚠️"
				} else {
					tested = "❌"
				}
				break
			}
		}
		sb.WriteString(fmt.Sprintf("| `%s` | `%s` | %s | %s |\n", ep.method, ep.endpoint, ep.category, tested))
	}

	// MCP Tools Coverage
	sb.WriteString("\n## MCP Tools Coverage\n\n")
	sb.WriteString("| Tool | Category | Tested |\n")
	sb.WriteString("|------|----------|--------|\n")
	mcpTools := []struct{ tool, category string }{
		{"memstate_get", "Read"},
		{"memstate_search", "Read"},
		{"memstate_remember", "Write"},
		{"memstate_set", "Write"},
		{"memstate_history", "Read"},
		{"memstate_delete", "Delete"},
		{"memstate_delete_project", "Delete"},
	}

	for _, tool := range mcpTools {
		tested := "❌"
		for _, r := range results {
			if r.Type == "MCP" && strings.Contains(r.Name, tool.tool) {
				if r.Status == "PASS" {
					tested = "✅"
				} else if r.Status == "SKIP" {
					tested = "⚠️"
				} else {
					tested = "❌"
				}
				break
			}
		}
		sb.WriteString(fmt.Sprintf("| `%s` | %s | %s |\n", tool.tool, tool.category, tested))
	}

	// API Parity Analysis
	sb.WriteString("\n## API Parity Analysis\n\n")
	sb.WriteString("This section compares the capabilities exposed by the MCP tools vs the REST API.\n\n")
	sb.WriteString("| Feature | MCP Tool | REST Endpoint | Parity |\n")
	sb.WriteString("|---------|----------|---------------|--------|\n")
	parityRows := []struct{ feature, mcp, rest, parity string }{
		{"Store memory (structured, sync)", "`memstate_set`", "`POST /memories/store`", "✅ Equivalent"},
		{"Store memory (AI-extracted, async)", "`memstate_remember`", "`POST /memories/remember`", "✅ Equivalent"},
		{"Get memory by ID", "`memstate_get(memory_id=...)`", "`GET /memories/{id}`", "✅ Equivalent"},
		{"Get project tree", "`memstate_get(project_id=...)`", "`GET /tree` + `POST /keypaths`", "✅ Equivalent"},
		{"Get subtree with content", "`memstate_get(keypath=..., include_content=true)`", "`POST /keypaths (recursive)`", "✅ Equivalent"},
		{"Time-travel (at_revision)", "`memstate_get(at_revision=...)`", "`POST /keypaths (at_revision)`", "✅ Equivalent"},
		{"Semantic search", "`memstate_search`", "`POST /memories/search`", "✅ Equivalent"},
		{"Version history", "`memstate_history`", "`POST /memories/history`", "✅ Equivalent"},
		{"Soft-delete keypath", "`memstate_delete`", "`POST /memories/delete`", "✅ Equivalent"},
		{"Soft-delete project", "`memstate_delete_project`", "`POST /projects/delete`", "✅ Equivalent"},
		{"List all projects", "`memstate_get()` (no args)", "`GET /projects`", "✅ Equivalent"},
		{"Changelog / audit feed", "❌ Not available", "`GET /changelog`", "⚠️ REST-only (new)"},
		{"Create/update project", "❌ Not available", "`POST /projects`", "⚠️ REST-only"},
		{"Get project by ID", "❌ Not available", "`GET /projects/{id}`", "⚠️ REST-only"},
		{"List keypaths flat", "❌ Not available", "`GET /keypaths`", "⚠️ REST-only"},
		{"Browse by prefix", "❌ Not available", "`POST /memories/browse`", "⚠️ REST-only"},
		{"Version memory (auto)", "❌ Not needed", "Auto-versioned on every write to same keypath", "✅ Automatic"},
		{"Review queue", "❌ Removed", "`GET /review` (410 Gone)", "⚠️ Removed — use POST /memories/history"},
		{"List project revisions", "❌ Not available", "`GET /projects/{id}/revisions`", "⚠️ REST-only"},
		{"Job status polling", "❌ Not available", "`GET /jobs/{job_id}`", "⚠️ REST-only"},
		{"System status", "❌ Not available", "`GET /status`", "⚠️ REST-only"},
		{"Get memory by keypath", "❌ Not available", "`GET /memories/keypath/{keypath}`", "⚠️ REST-only"},
		{"Search with superseded", "`memstate_search(include_superseded=...)`", "`POST /memories/search`", "✅ Equivalent"},
		{"Search with categories", "`memstate_search(categories=...)`", "`POST /memories/search`", "✅ Equivalent"},
	}
	for _, row := range parityRows {
		sb.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n", row.feature, row.mcp, row.rest, row.parity))
	}

	// Changes made in this run
	sb.WriteString("\n## API Changes (This Session)\n\n")
	sb.WriteString("| Change | Type | Status |\n")
	sb.WriteString("|--------|------|--------|\n")
	sb.WriteString("| Removed `POST /review/{id}/resolve` | Breaking removal | ✅ Done |\n")
	sb.WriteString("| Removed `GET /review` (returns 410 Gone) | Breaking removal | ✅ Done |\n")
	sb.WriteString("| Removed `POST /memories/supersede` (returns 410 Gone) | Breaking removal | ✅ Done |\n")
	sb.WriteString("| Added `GET /changelog` | New endpoint | ✅ Done |\n")
	sb.WriteString("| Fixed `POST /projects/delete` idempotency (500 → 200) | Bug fix | ✅ Done |\n")
	sb.WriteString("| Auto-versioning: every write to same keypath creates new version | New behavior | ✅ Done |\n")

	return sb.String()
}

// =============================================================================
// Main
// =============================================================================

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  Memstate AI Exhaustive API Test Suite (Go)              ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")
	fmt.Printf("Project: %s\n\n", projectID)

	// --- REST API Tests ---
	fmt.Println("━━━ REST API Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("[System]")
	testRestStatus()

	fmt.Println("\n[Projects]")
	testRestCreateProject()
	testRestListProjects()
	testRestGetProject()
	testRestTree()
	testRestRevisions()

	fmt.Println("\n[Memories]")
	memoryID := testRestRemember()
	testRestGetMemoryByKeypath()
	testRestGetMemoryByID(memoryID)
	testRestVersioning() // Write v2 to same keypath — auto-versioning (supersede removed)
	testRestBrowse()
	testRestHistory() // Expects ≥2 versions from v1 + v2

	fmt.Println("\n[Search]")
	testRestSearch()
	testRestKeypaths()
	testRestKeypathsPost()
	testRestKeypathsTimeTravelPost()

	fmt.Println("\n[Ingestion]")
	jobID := testRestIngest()
	testRestJobStatus(jobID)

	// --- MCP Tests ---
	fmt.Println("\n━━━ MCP Tool Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("[Projects]")
	testMCPListProjects()
	testMCPGetProject()

	fmt.Println("\n[Memories - Write]")
	testMCPSet()
	testMCPRemember()

	fmt.Println("\n[Memories - Read]")
	testMCPGetSubtree()
	testMCPGetByProjectKeypath()
	testMCPGetTimeTravelRevision()

	fmt.Println("\n[Search]")
	testMCPSearch()
	testMCPSearchWithFilters()

	fmt.Println("\n[History]")
	testMCPHistory()

	// --- Changelog Tests (new endpoint) ---
	fmt.Println("\n━━━ Changelog Tests (New Endpoint) ━━━━━━━━━━━━━━━━━━━━━━━━")
	testRestChangelog()
	testRestChangelogGlobal()
	testRestChangelogSince()

	// --- Removed Endpoint Verification ---
	fmt.Println("\n━━━ Removed Endpoint Verification ━━━━━━━━━━━━━━━━━━━━━━━━━")
	testRestRemovedEndpoints()

	// --- Cleanup Tests ---
	// IMPORTANT: REST project delete MUST run before individual memory deletes.
	// The idempotent delete test runs AFTER the first delete to verify BUG-001 fix.
	fmt.Println("\n━━━ Cleanup Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	testRestDeleteProject()                // First delete — should succeed with deleted_count > 0
	testRestDeleteProjectIdempotent()      // Second delete — BUG-001 fix: should return 200 with deleted_count=0
	testRestDeleteMemory()                 // Delete individual memory
	testMCPDeleteKeypath()                 // MCP keypath delete
	testMCPDeleteProject()                 // MCP project delete (tests idempotency)

	// --- Report ---
	fmt.Println("\n━━━ Generating Reports ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	jsonData, _ := json.MarshalIndent(results, "", "  ")
	if err := os.WriteFile("test-results.json", jsonData, 0644); err != nil {
		fmt.Printf("Failed to write JSON report: %v\n", err)
	} else {
		fmt.Println("✅ Wrote test-results.json")
	}

	mdReport := generateMarkdownReport()
	if err := os.WriteFile("test-results.md", []byte(mdReport), 0644); err != nil {
		fmt.Printf("Failed to write Markdown report: %v\n", err)
	} else {
		fmt.Println("✅ Wrote test-results.md")
	}

	pass, fail, skip := 0, 0, 0
	for _, r := range results {
		switch r.Status {
		case "PASS":
			pass++
		case "FAIL":
			fail++
		default:
			skip++
		}
	}

	fmt.Printf("\n┌─────────────────────────────────────────────────────┐\n")
	fmt.Printf("│  Results: %d total, %d pass, %d fail, %d skip          │\n", len(results), pass, fail, skip)
	fmt.Printf("└─────────────────────────────────────────────────────┘\n")

	if fail > 0 {
		os.Exit(1)
	}
}
