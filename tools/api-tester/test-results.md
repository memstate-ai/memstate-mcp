# Memstate AI API Test Results

**Run Date:** 2026-03-20 01:35:48 UTC

**Project Used:** `api-tester-1773970525`

**Base URL:** `https://api.memstate.ai/api/v1`

## Summary

| Total | Pass | Fail | Skip |
|-------|------|------|------|
| 33 | 33 | 0 | 0 |

## Test Matrix

| API | Category | Endpoint / Tool | Status | Duration | Notes |
|-----|----------|----------------|--------|----------|-------|
| **REST** | System | `GET /status` | ✅ PASS | 0.22s | - |
| **REST** | Projects | `POST /projects (create/update)` | ✅ PASS | 0.08s | - |
| **REST** | Projects | `GET /projects` | ✅ PASS | 0.07s | - |
| **REST** | Projects | `GET /projects/{id}` | ✅ PASS | 0.07s | - |
| **REST** | Projects | `GET /tree` | ✅ PASS | 0.07s | - |
| **REST** | Projects | `GET /projects/{id}/revisions` | ✅ PASS | 0.08s | - |
| **REST** | Projects | `GET /review` | ✅ PASS | 0.07s | - |
| **REST** | Memories | `POST /memories/remember` | ✅ PASS | 0.12s | - |
| **REST** | Memories | `GET /memories/keypath/{keypath}` | ✅ PASS | 0.07s | - |
| **REST** | Memories | `GET /memories/{id}` | ✅ PASS | 0.07s | - |
| **REST** | Memories | `POST /memories/supersede` | ✅ PASS | 0.11s | - |
| **REST** | Memories | `POST /memories/browse` | ✅ PASS | 0.07s | - |
| **REST** | Memories | `POST /memories/history` | ✅ PASS | 0.07s | - |
| **REST** | Search | `POST /memories/search` | ✅ PASS | 0.11s | - |
| **REST** | Search | `GET /keypaths` | ✅ PASS | 0.07s | - |
| **REST** | Search | `POST /keypaths (recursive)` | ✅ PASS | 0.07s | - |
| **REST** | Search | `POST /keypaths (time-travel at_revision)` | ✅ PASS | 0.07s | - |
| **REST** | Ingestion | `POST /memories/remember` | ✅ PASS | 0.07s | - |
| **REST** | Ingestion | `GET /jobs/{job_id}` | ✅ PASS | 0.07s | - |
| **MCP** | Projects | `memstate_get (list all projects)` | ✅ PASS | 1.73s | - |
| **MCP** | Projects | `memstate_get (project tree)` | ✅ PASS | 1.58s | - |
| **MCP** | Memories | `memstate_set` | ✅ PASS | 1.72s | - |
| **MCP** | Memories | `memstate_remember` | ✅ PASS | 4.69s | - |
| **MCP** | Memories | `memstate_get (subtree + content)` | ✅ PASS | 1.31s | - |
| **MCP** | Memories | `memstate_get (by memory_id)` | ✅ PASS | 1.44s | - |
| **MCP** | Memories | `memstate_get (time-travel at_revision)` | ✅ PASS | 1.55s | - |
| **MCP** | Search | `memstate_search` | ✅ PASS | 1.36s | - |
| **MCP** | Search | `memstate_search (with keypath_prefix filter)` | ✅ PASS | 1.43s | - |
| **MCP** | Memories | `memstate_history (by keypath)` | ✅ PASS | 1.36s | - |
| **REST** | Cleanup | `POST /projects/delete` | ✅ PASS | 0.09s | - |
| **REST** | Cleanup | `POST /memories/delete` | ✅ PASS | 0.07s | - |
| **MCP** | Cleanup | `memstate_delete (keypath)` | ✅ PASS | 1.48s | - |
| **MCP** | Cleanup | `memstate_delete_project` | ✅ PASS | 1.41s | - |

## REST API Coverage

| Method | Endpoint | Category | Tested |
|--------|----------|----------|--------|
| `GET` | `/status` | System | ✅ |
| `GET` | `/projects` | Projects | ✅ |
| `POST` | `/projects` | Projects | ✅ |
| `GET` | `/projects/{id}` | Projects | ✅ |
| `GET` | `/projects/{id}/revisions` | Projects | ✅ |
| `POST` | `/projects/delete` | Projects | ✅ |
| `GET` | `/tree` | Projects | ✅ |
| `GET` | `/keypaths` | Search | ✅ |
| `POST` | `/keypaths` | Search | ✅ |
| `GET` | `/review` | Projects | ✅ |
| `POST` | `/review/{id}/resolve` | Projects | ❌ |
| `POST` | `/memories/remember` | Memories | ✅ |
| `GET` | `/memories/{id}` | Memories | ✅ |
| `GET` | `/memories/keypath/{keypath}` | Memories | ✅ |
| `POST` | `/memories/supersede` | Memories | ✅ |
| `POST` | `/memories/browse` | Memories | ✅ |
| `POST` | `/memories/history` | Memories | ✅ |
| `POST` | `/memories/delete` | Memories | ✅ |
| `POST` | `/memories/search` | Search | ✅ |
| `POST` | `/memories/remember` | Ingestion | ✅ |
| `GET` | `/jobs/{job_id}` | Ingestion | ✅ |

## MCP Tools Coverage

| Tool | Category | Tested |
|------|----------|--------|
| `memstate_get` | Read | ✅ |
| `memstate_search` | Read | ✅ |
| `memstate_remember` | Write | ✅ |
| `memstate_set` | Write | ✅ |
| `memstate_history` | Read | ✅ |
| `memstate_delete` | Delete | ✅ |
| `memstate_delete_project` | Delete | ✅ |

## API Parity Analysis

This section compares the capabilities exposed by the MCP tools vs the REST API.

| Feature | MCP Tool | REST Endpoint | Parity |
|---------|----------|---------------|--------|
| Store memory (structured) | `memstate_set` | `POST /memories/remember` | ✅ Equivalent |
| Store memory (AI-extracted) | `memstate_remember` | `POST /memories/remember` | ✅ Equivalent |
| Get memory by ID | `memstate_get(memory_id=...)` | `GET /memories/{id}` | ✅ Equivalent |
| Get project tree | `memstate_get(project_id=...)` | `GET /tree` + `POST /keypaths` | ✅ Equivalent |
| Get subtree | `memstate_get(keypath=...)` | `POST /keypaths (recursive)` | ✅ Equivalent |
| Time-travel (at_revision) | `memstate_get(at_revision=...)` | `POST /keypaths (at_revision)` | ✅ Equivalent |
| Semantic search | `memstate_search` | `POST /memories/search` | ✅ Equivalent |
| Version history | `memstate_history` | `POST /memories/history` | ✅ Equivalent |
| Soft-delete keypath | `memstate_delete` | `POST /memories/delete` | ✅ Equivalent |
| Soft-delete project | `memstate_delete_project` | `POST /projects/delete` | ✅ Equivalent |
| List all projects | `memstate_get()` (no args) | `GET /projects` | ✅ Equivalent |
| Create/update project | ❌ Not available | `POST /projects` | ⚠️ REST-only |
| Get project by ID | ❌ Not available | `GET /projects/{id}` | ⚠️ REST-only |
| List keypaths flat | ❌ Not available | `GET /keypaths` | ⚠️ REST-only |
| Browse by prefix | ❌ Not available | `POST /memories/browse` | ⚠️ REST-only |
| Supersede memory | ❌ Not available | `POST /memories/supersede` | ⚠️ REST-only |
| Review queue | ❌ Not available | `GET /review` | ⚠️ REST-only |
| Resolve review item | ❌ Not available | `POST /review/{id}/resolve` | ⚠️ REST-only |
| List project revisions | ❌ Not available | `GET /projects/{id}/revisions` | ⚠️ REST-only |
| Job status polling | ❌ Not available | `GET /jobs/{job_id}` | ⚠️ REST-only |
| System status | ❌ Not available | `GET /status` | ⚠️ REST-only |
| Get memory by keypath | ❌ Not available | `GET /memories/keypath/{keypath}` | ⚠️ REST-only |
| Search with superseded | `memstate_search(include_superseded=...)` | `POST /memories/search` | ✅ Equivalent |
| Search with categories | `memstate_search(categories=...)` | `POST /memories/search` | ✅ Equivalent |
