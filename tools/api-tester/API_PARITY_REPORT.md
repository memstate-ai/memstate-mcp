# Memstate AI API Parity & Testing Report

**Author:** Manus AI  
**Date:** March 19, 2026  
**Target:** Memstate AI MCP Tools & REST API  

## 1. Executive Summary

An exhaustive test suite was built in Go to validate both the Memstate AI REST API and the MCP tools. The suite successfully executed 33 individual endpoint and tool tests against the production environment. 

**Test Results:**
* **Total Tests:** 33
* **Passed:** 33
* **Failed:** 0
* **Skipped:** 0

Both the REST API and MCP tools are highly stable, fast, and function exactly as documented. The AI-powered keypath extraction (`memstate_remember` / `/ingest`) correctly parses markdown content, and the conflict detection mechanisms work as expected.

## 2. API Parity Matrix

This section addresses the question: *"Why do the APIs differ, and should they expose the same features?"*

| Feature | MCP Tool | REST Endpoint | Parity Status |
|---------|----------|---------------|---------------|
| **Store memory (structured)** | `memstate_set` | `POST /memories/remember` | ✅ Equivalent |
| **Store memory (AI-extracted)** | `memstate_remember` | `POST /ingest` | ✅ Equivalent |
| **Get memory by ID** | `memstate_get(memory_id=...)` | `GET /memories/{id}` | ✅ Equivalent |
| **Get project tree** | `memstate_get(project_id=...)` | `GET /tree` + `POST /keypaths` | ✅ Equivalent |
| **Get subtree** | `memstate_get(keypath=...)` | `POST /keypaths (recursive)` | ✅ Equivalent |
| **Time-travel (at_revision)** | `memstate_get(at_revision=...)` | `POST /keypaths (at_revision)` | ✅ Equivalent |
| **Semantic search** | `memstate_search` | `POST /memories/search` | ✅ Equivalent |
| **Version history** | `memstate_history` | `POST /memories/history` | ✅ Equivalent |
| **Soft-delete keypath** | `memstate_delete` | `POST /memories/delete` | ✅ Equivalent |
| **Soft-delete project** | `memstate_delete_project` | `POST /projects/delete` | ✅ Equivalent |
| **List all projects** | `memstate_get()` (no args) | `GET /projects` | ✅ Equivalent |
| **Create/update project** | ❌ Not available | `POST /projects` | ⚠️ REST-only |
| **Get project by ID** | ❌ Not available | `GET /projects/{id}` | ⚠️ REST-only |
| **List keypaths flat** | ❌ Not available | `GET /keypaths` | ⚠️ REST-only |
| **Browse by prefix** | ❌ Not available | `POST /memories/browse` | ⚠️ REST-only |
| **Supersede memory** | ❌ Not available | `POST /memories/supersede` | ⚠️ REST-only |
| **Review queue** | ❌ Not available | `GET /review` | ⚠️ REST-only |
| **Resolve review item** | ❌ Not available | `POST /review/{id}/resolve` | ⚠️ REST-only |
| **List project revisions** | ❌ Not available | `GET /projects/{id}/revisions` | ⚠️ REST-only |
| **Job status polling** | ❌ Not available | `GET /jobs/{job_id}` | ⚠️ REST-only |
| **System status** | ❌ Not available | `GET /status` | ⚠️ REST-only |

## 3. Feedback on API Differences

After exhaustively using both APIs, the design choice to keep them slightly different actually makes sense from an architectural perspective, though there is room for improvement.

### Why the differences make sense:
1. **Audience Intent:** 
   * The **MCP Tools** are designed specifically for LLM Agents (Claude, Cursor, Cline). Agents need a consolidated, minimal surface area to avoid tool confusion. Combining tree retrieval, memory ID lookup, and project listing into a single overloaded `memstate_get` tool is actually a *best practice* for LLMs, as it reduces the context window cost of defining 10 different read tools.
   * The **REST API** is designed for traditional backend developers. Developers expect standard RESTful resources (`GET /projects`, `GET /tree`, `POST /memories`).

2. **UI vs. Agent Workflows:**
   * Features like the **Review Queue** (`GET /review`, `POST /review/{id}/resolve`) are fundamentally human-in-the-loop features. An agent shouldn't autonomously resolve contradictions without human oversight, so omitting these from MCP prevents rogue agents from clearing the queue.

### Recommendations for Parity:
While the current design is solid, I recommend the following adjustments to improve parity without overwhelming agents:

1. **Add Project Creation to MCP:**
   Currently, agents can auto-create projects by passing a new `project_id` to `memstate_remember`, but they cannot explicitly set the project name, description, or git remote. 
   * *Recommendation:* Add a `memstate_create_project` tool or allow `memstate_set` to handle project metadata.

2. **Add `memstate_supersede` Tool:**
   Agents currently have to rely on the AI ingestion engine to detect conflicts and supersede. Sometimes an agent *knows* it is correcting a specific memory and wants to explicitly overwrite it without AI guessing.
   * *Recommendation:* Expose the REST `/memories/supersede` endpoint as an MCP tool.

3. **Standardize Response Structures:**
   The MCP `memstate_get` tool returns data in different shapes depending on the arguments (sometimes a list, sometimes a map of keypaths). This is fine for LLMs, but makes programmatic parsing of MCP responses (like in our Go test suite) slightly brittle. 

## 4. Conclusion

The Memstate AI infrastructure is incredibly robust. The Go test suite (`tools/api-tester`) has been added to the repository and can be run in CI/CD pipelines to ensure ongoing parity and stability between the REST and MCP interfaces.
