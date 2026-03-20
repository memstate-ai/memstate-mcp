// Package main implements an exhaustive test suite for the Memstate AI REST and MCP APIs.
// It runs all available endpoints and tools, records results, and outputs a comparison matrix.
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
	apiKey      = "mst_A94jiQCkQqFRuRtV1qRPL9Jo4vIkOi1r"
	restBaseURL = "https://api.memstate.ai/api/v1"
	projectID   = "api-tester-go"
	mcpNodeDir  = "/tmp"
)

// TestResult holds the outcome of a single API test.
type TestResult struct {
	Name        string        `json:"name"`
	Type        string        `json:"type"` // "REST" or "MCP"
	Category    string        `json:"category"`
	Status      string        `json:"status"` // "PASS" or "FAIL"
	StatusCode  int           `json:"status_code,omitempty"`
	Error       string        `json:"error,omitempty"`
	Duration    time.Duration `json:"duration_ms"`
	RequestBody string        `json:"request_body,omitempty"`
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
		return nil, resp.StatusCode, fmt.Errorf("API error (%d): %s", resp.StatusCode, string(respBody))
	}

	return respBody, resp.StatusCode, nil
}

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

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("node execution failed: %v, stderr: %s", err, stderr.String())
	}

	output := out.String()
	if strings.Contains(output, "MCP_ERROR:") {
		errMsg := strings.TrimPrefix(strings.TrimSpace(output), "MCP_ERROR:")
		return "", fmt.Errorf("MCP tool error: %s", errMsg)
	}

	// Extract everything after the RESULT: marker (may span multiple lines)
	if idx := strings.Index(output, "RESULT:"); idx >= 0 {
		return strings.TrimSpace(output[idx+len("RESULT:"):]), nil
	}

	return output, nil
}

// --- REST API Tests ---

func testRestStatus() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", "/status", nil)
	recordResult("GET /status", "REST", "System", err, start, code, string(resp))
}

func testRestListProjects() ([]interface{}, error) {
	start := time.Now()
	resp, code, err := doRestRequest("GET", "/projects", nil)
	recordResult("GET /projects", "REST", "Projects", err, start, code, string(resp))
	if err != nil {
		return nil, err
	}
	var data map[string]interface{}
	json.Unmarshal(resp, &data)
	if projects, ok := data["projects"].([]interface{}); ok {
		return projects, nil
	}
	return nil, nil
}

func testRestCreateProject() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/projects", map[string]interface{}{
		"project_id":  projectID,
		"name":        "API Tester Go",
		"description": "Automated test project for Go api-tester exhaustive suite",
		"git_remote":  "https://github.com/memstate-ai/memstate-mcp",
	})
	recordResult("POST /projects (create/update)", "REST", "Projects", err, start, code, string(resp))
}

func testRestGetProject() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", "/projects/"+projectID, nil)
	recordResult("GET /projects/{id}", "REST", "Projects", err, start, code, string(resp))
}

func testRestRemember() string {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/remember", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.rest.memory",
		"content":    "This is a test memory from the REST API. It validates that the /memories/remember endpoint works correctly.",
		"category":   "test",
	})
	recordResult("POST /memories/remember", "REST", "Memories", err, start, code, string(resp))

	var memResp map[string]interface{}
	if err == nil {
		json.Unmarshal(resp, &memResp)
		if id, ok := memResp["memory_id"].(string); ok {
			return id
		}
	}
	return ""
}

func testRestGetMemoryByKeypath() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", fmt.Sprintf("/memories/keypath/test.rest.memory?project_id=%s", projectID), nil)
	recordResult("GET /memories/keypath/{keypath}", "REST", "Memories", err, start, code, string(resp))
}

func testRestGetMemoryByID(memoryID string) {
	if memoryID == "" {
		results = append(results, TestResult{
			Name:     "GET /memories/{id}",
			Type:     "REST",
			Category: "Memories",
			Status:   "SKIP",
			Error:    "no memory_id from remember step",
		})
		fmt.Printf("⚠️  [REST] GET /memories/{id}: SKIPPED (no memory_id)\n")
		return
	}
	start := time.Now()
	resp, code, err := doRestRequest("GET", "/memories/"+memoryID, nil)
	recordResult("GET /memories/{id}", "REST", "Memories", err, start, code, string(resp))
}

func testRestSupersede(memoryID string) {
	if memoryID == "" {
		results = append(results, TestResult{
			Name:     "POST /memories/supersede",
			Type:     "REST",
			Category: "Memories",
			Status:   "SKIP",
			Error:    "no memory_id from remember step",
		})
		fmt.Printf("⚠️  [REST] POST /memories/supersede: SKIPPED (no memory_id)\n")
		return
	}
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/supersede", map[string]interface{}{
		"memory_id": memoryID,
		"content":   "This is an UPDATED test memory from the REST API (superseded version).",
	})
	recordResult("POST /memories/supersede", "REST", "Memories", err, start, code, string(resp))
}

func testRestBrowse() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/browse", map[string]interface{}{
		"project_id":     projectID,
		"keypath_prefix": "test",
	})
	recordResult("POST /memories/browse", "REST", "Memories", err, start, code, string(resp))
}

func testRestHistory() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/history", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.rest.memory",
	})
	recordResult("POST /memories/history", "REST", "Memories", err, start, code, string(resp))
}

func testRestSearch() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/search", map[string]interface{}{
		"project_id": projectID,
		"query":      "test memory REST API validation",
		"limit":      5,
	})
	recordResult("POST /memories/search", "REST", "Search", err, start, code, string(resp))
}

func testRestKeypaths() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", fmt.Sprintf("/keypaths?project_id=%s", projectID), nil)
	recordResult("GET /keypaths", "REST", "Search", err, start, code, string(resp))
}

func testRestKeypathsPost() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/keypaths", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test",
		"recursive":  true,
	})
	recordResult("POST /keypaths (recursive)", "REST", "Search", err, start, code, string(resp))
}

func testRestKeypathsTimeTravelPost() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/keypaths", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test",
		"recursive":  true,
		"at_revision": 1,
	})
	recordResult("POST /keypaths (time-travel at_revision)", "REST", "Search", err, start, code, string(resp))
}

func testRestTree() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", fmt.Sprintf("/tree?project_id=%s", projectID), nil)
	recordResult("GET /tree", "REST", "Projects", err, start, code, string(resp))
}

func testRestIngest() string {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/ingest", map[string]interface{}{
		"project_id": projectID,
		"content":    "# Test Ingestion via REST\n\n## Architecture\nThe test uses Go to call the REST API directly.\n\n## Configuration\n- base_url: https://api.memstate.ai/api/v1\n- auth: X-API-Key header\n- timeout: 30s\n\n## Test Coverage\nThis ingestion tests the AI-powered keypath extraction feature.",
		"source":     "docs",
		"context":    "Automated test from Go api-tester",
	})
	recordResult("POST /ingest", "REST", "Ingestion", err, start, code, string(resp))

	var ingResp map[string]interface{}
	if err == nil {
		json.Unmarshal(resp, &ingResp)
		// Response uses job_id (async) or ingestion_id (sync)
		for _, key := range []string{"job_id", "ingestion_id"} {
			if id, ok := ingResp[key].(string); ok && id != "" {
				return id
			}
		}
	}
	return ""
}

func testRestJobStatus(jobID string) {
	if jobID == "" {
		results = append(results, TestResult{
			Name:     "GET /jobs/{job_id}",
			Type:     "REST",
			Category: "Ingestion",
			Status:   "SKIP",
			Error:    "no job_id from ingest step",
		})
		fmt.Printf("⚠️  [REST] GET /jobs/{job_id}: SKIPPED (no job_id)\n")
		return
	}
	start := time.Now()
	resp, code, err := doRestRequest("GET", "/jobs/"+jobID, nil)
	recordResult("GET /jobs/{job_id}", "REST", "Ingestion", err, start, code, string(resp))
}

func testRestReviewQueue() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", fmt.Sprintf("/review?project_id=%s", projectID), nil)
	recordResult("GET /review", "REST", "Projects", err, start, code, string(resp))
}

func testRestRevisions() {
	start := time.Now()
	resp, code, err := doRestRequest("GET", fmt.Sprintf("/projects/%s/revisions?limit=5", projectID), nil)
	recordResult("GET /projects/{id}/revisions", "REST", "Projects", err, start, code, string(resp))
}

func testRestDeleteMemory() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/memories/delete", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.rest.memory",
		"recursive":  false,
	})
	recordResult("POST /memories/delete", "REST", "Cleanup", err, start, code, string(resp))
}

func testRestDeleteProject() {
	start := time.Now()
	resp, code, err := doRestRequest("POST", "/projects/delete", map[string]interface{}{
		"project_id": projectID,
	})
	recordResult("POST /projects/delete", "REST", "Cleanup", err, start, code, string(resp))
}

// --- MCP Tests ---

func testMCPListProjects() {
	start := time.Now()
	resp, err := doMCPCall("memstate_get", map[string]interface{}{})
	recordResult("memstate_get (list all projects)", "MCP", "Projects", err, start, 0, resp)
}

func testMCPSet() {
	start := time.Now()
	resp, err := doMCPCall("memstate_set", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.mcp.config",
		"value":      "mcp-test-value-12345",
		"category":   "test",
	})
	recordResult("memstate_set", "MCP", "Memories", err, start, 0, resp)
}

func testMCPRemember() {
	start := time.Now()
	resp, err := doMCPCall("memstate_remember", map[string]interface{}{
		"project_id": projectID,
		"content":    "## MCP Task Summary\n- Tested memstate_remember tool\n- Source: agent\n- The server should extract keypaths automatically\n- This validates AI-powered ingestion via MCP",
		"source":     "agent",
		"context":    "Automated test from Go api-tester",
	})
	recordResult("memstate_remember", "MCP", "Memories", err, start, 0, resp)
}

func testMCPGetProject() {
	start := time.Now()
	resp, err := doMCPCall("memstate_get", map[string]interface{}{
		"project_id": projectID,
	})
	recordResult("memstate_get (project tree)", "MCP", "Projects", err, start, 0, resp)
}

func testMCPGetSubtree() {
	start := time.Now()
	resp, err := doMCPCall("memstate_get", map[string]interface{}{
		"project_id":      projectID,
		"keypath":         "test",
		"include_content": true,
	})
	recordResult("memstate_get (subtree + content)", "MCP", "Memories", err, start, 0, resp)
}

func testMCPGetByMemoryID() {
	// Get a memory_id via the REST API (more reliable than parsing MCP response)
	resp, _, err := doRestRequest("GET", fmt.Sprintf("/memories/keypath/test.mcp.config?project_id=%s", projectID), nil)
	if err != nil {
		results = append(results, TestResult{
			Name:     "memstate_get (by memory_id)",
			Type:     "MCP",
			Category: "Memories",
			Status:   "SKIP",
			Error:    "could not get memory_id via REST: " + err.Error(),
		})
		fmt.Printf("⚠️  [MCP] memstate_get (by memory_id): SKIPPED (REST lookup failed)\n")
		return
	}

	var memResp map[string]interface{}
	var memoryID string
	if err := json.Unmarshal(resp, &memResp); err == nil {
		if id, ok := memResp["id"].(string); ok {
			memoryID = id
		}
	}

	if memoryID == "" {
		results = append(results, TestResult{
			Name:     "memstate_get (by memory_id)",
			Type:     "MCP",
			Category: "Memories",
			Status:   "SKIP",
			Error:    "no memory_id found at test.mcp.config keypath",
		})
		fmt.Printf("⚠️  [MCP] memstate_get (by memory_id): SKIPPED (no memory_id)\n")
		return
	}

	start := time.Now()
	result, err := doMCPCall("memstate_get", map[string]interface{}{
		"memory_id": memoryID,
	})
	recordResult("memstate_get (by memory_id)", "MCP", "Memories", err, start, 0, result)
}

func testMCPSearch() {
	start := time.Now()
	resp, err := doMCPCall("memstate_search", map[string]interface{}{
		"project_id": projectID,
		"query":      "MCP test memory configuration",
		"limit":      5,
	})
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
	recordResult("memstate_search (with keypath_prefix filter)", "MCP", "Search", err, start, 0, resp)
}

func testMCPHistory() {
	start := time.Now()
	resp, err := doMCPCall("memstate_history", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.mcp.config",
	})
	recordResult("memstate_history (by keypath)", "MCP", "Memories", err, start, 0, resp)
}

func testMCPGetTimeTravelRevision() {
	start := time.Now()
	resp, err := doMCPCall("memstate_get", map[string]interface{}{
		"project_id":  projectID,
		"keypath":     "test",
		"at_revision": 1,
	})
	recordResult("memstate_get (time-travel at_revision)", "MCP", "Memories", err, start, 0, resp)
}

func testMCPDeleteKeypath() {
	start := time.Now()
	resp, err := doMCPCall("memstate_delete", map[string]interface{}{
		"project_id": projectID,
		"keypath":    "test.mcp.config",
	})
	recordResult("memstate_delete (keypath)", "MCP", "Cleanup", err, start, 0, resp)
}

func testMCPDeleteProject() {
	start := time.Now()
	resp, err := doMCPCall("memstate_delete_project", map[string]interface{}{
		"project_id": projectID,
	})
	recordResult("memstate_delete_project", "MCP", "Cleanup", err, start, 0, resp)
}

// --- Report Generation ---

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
	sb.WriteString(fmt.Sprintf("| Total | Pass | Fail | Skip |\n"))
	sb.WriteString(fmt.Sprintf("|-------|------|------|------|\n"))
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
			// Truncate long errors
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
		{"GET", "/review", "Projects"},
		{"POST", "/review/{id}/resolve", "Projects"},
		{"POST", "/memories/remember", "Memories"},
		{"GET", "/memories/{id}", "Memories"},
		{"GET", "/memories/keypath/{keypath}", "Memories"},
		{"POST", "/memories/supersede", "Memories"},
		{"POST", "/memories/browse", "Memories"},
		{"POST", "/memories/history", "Memories"},
		{"POST", "/memories/delete", "Memories"},
		{"POST", "/memories/search", "Search"},
		{"POST", "/ingest", "Ingestion"},
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
		{"Store memory (structured)", "`memstate_set`", "`POST /memories/remember`", "✅ Equivalent"},
		{"Store memory (AI-extracted)", "`memstate_remember`", "`POST /ingest`", "✅ Equivalent"},
		{"Get memory by ID", "`memstate_get(memory_id=...)`", "`GET /memories/{id}`", "✅ Equivalent"},
		{"Get project tree", "`memstate_get(project_id=...)`", "`GET /tree` + `POST /keypaths`", "✅ Equivalent"},
		{"Get subtree", "`memstate_get(keypath=...)`", "`POST /keypaths (recursive)`", "✅ Equivalent"},
		{"Time-travel (at_revision)", "`memstate_get(at_revision=...)`", "`POST /keypaths (at_revision)`", "✅ Equivalent"},
		{"Semantic search", "`memstate_search`", "`POST /memories/search`", "✅ Equivalent"},
		{"Version history", "`memstate_history`", "`POST /memories/history`", "✅ Equivalent"},
		{"Soft-delete keypath", "`memstate_delete`", "`POST /memories/delete`", "✅ Equivalent"},
		{"Soft-delete project", "`memstate_delete_project`", "`POST /projects/delete`", "✅ Equivalent"},
		{"List all projects", "`memstate_get()` (no args)", "`GET /projects`", "✅ Equivalent"},
		{"Create/update project", "❌ Not available", "`POST /projects`", "⚠️ REST-only"},
		{"Get project by ID", "❌ Not available", "`GET /projects/{id}`", "⚠️ REST-only"},
		{"List keypaths flat", "❌ Not available", "`GET /keypaths`", "⚠️ REST-only"},
		{"Browse by prefix", "❌ Not available", "`POST /memories/browse`", "⚠️ REST-only"},
		{"Supersede memory", "❌ Not available", "`POST /memories/supersede`", "⚠️ REST-only"},
		{"Review queue", "❌ Not available", "`GET /review`", "⚠️ REST-only"},
		{"Resolve review item", "❌ Not available", "`POST /review/{id}/resolve`", "⚠️ REST-only"},
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

	return sb.String()
}

func main() {
	fmt.Println("╔══════════════════════════════════════════════════════════╗")
	fmt.Println("║  Memstate AI Exhaustive API Test Suite (Go)              ║")
	fmt.Println("╚══════════════════════════════════════════════════════════╝")
	fmt.Println()

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
	testRestReviewQueue()

	fmt.Println("\n[Memories]")
	memoryID := testRestRemember()
	testRestGetMemoryByKeypath()
	testRestGetMemoryByID(memoryID)
	testRestSupersede(memoryID)
	testRestBrowse()
	testRestHistory()

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
	testMCPGetByMemoryID()
	testMCPGetTimeTravelRevision()

	fmt.Println("\n[Search]")
	testMCPSearch()
	testMCPSearchWithFilters()

	fmt.Println("\n[History]")
	testMCPHistory()

	// --- Cleanup ---
	fmt.Println("\n━━━ Cleanup Tests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	testRestDeleteMemory()
	testMCPDeleteKeypath()
	testMCPDeleteProject()
	testRestDeleteProject()

	// --- Report ---
	fmt.Println("\n━━━ Generating Reports ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

	// JSON report
	jsonData, _ := json.MarshalIndent(results, "", "  ")
	if err := os.WriteFile("test-results.json", jsonData, 0644); err != nil {
		fmt.Printf("Failed to write JSON report: %v\n", err)
	} else {
		fmt.Println("✅ Wrote test-results.json")
	}

	// Markdown report
	mdReport := generateMarkdownReport()
	if err := os.WriteFile("test-results.md", []byte(mdReport), 0644); err != nil {
		fmt.Printf("Failed to write Markdown report: %v\n", err)
	} else {
		fmt.Println("✅ Wrote test-results.md")
	}

	// Print summary
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

	fmt.Printf("\n┌─────────────────────────────────────┐\n")
	fmt.Printf("│  Results: %d total, %d pass, %d fail, %d skip  │\n", len(results), pass, fail, skip)
	fmt.Printf("└─────────────────────────────────────┘\n")
}
