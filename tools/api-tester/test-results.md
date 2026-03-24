# Memstate AI API Test Results

**Run Date:** 2026-03-24 02:22:08 UTC

**Project Used:** `api_tester_1774318862`

**Base URL:** `https://api.memstate.ai/api/v1`

## Summary

| Total | Pass | Fail | Skip |
|-------|------|------|------|
| 38 | 38 | 0 | 0 |

## Test Matrix

| API | Category | Endpoint / Tool | Status | Duration | Notes |
|-----|----------|----------------|--------|----------|-------|
| **REST** | System | `GET /status` | ✅ PASS | 1.64s | - |
| **REST** | Projects | `POST /projects (create/update)` | ✅ PASS | 0.34s | - |
| **REST** | Projects | `GET /projects` | ✅ PASS | 0.47s | - |
| **REST** | Projects | `GET /projects/{id}` | ✅ PASS | 0.32s | - |
| **REST** | Projects | `GET /tree` | ✅ PASS | 0.43s | - |
| **REST** | Projects | `GET /projects/{id}/revisions` | ✅ PASS | 0.54s | - |
| **REST** | Memories | `POST /memories/store` | ✅ PASS | 0.71s | - |
| **REST** | Memories | `GET /memories/keypath/{keypath}` | ✅ PASS | 0.50s | - |
| **REST** | Memories | `GET /memories/keypath/{keypath}` | ✅ PASS | 0.50s | - |
| **REST** | Memories | `POST /memories/store (auto-versioning, v2)` | ✅ PASS | 0.37s | - |
| **REST** | Memories | `POST /memories/browse` | ✅ PASS | 0.45s | - |
| **REST** | Memories | `POST /memories/history` | ✅ PASS | 0.52s | - |
| **REST** | Search | `POST /memories/search` | ✅ PASS | 0.47s | - |
| **REST** | Search | `GET /keypaths` | ✅ PASS | 0.40s | - |
| **REST** | Search | `POST /keypaths (recursive)` | ✅ PASS | 0.41s | - |
| **REST** | Search | `POST /keypaths (time-travel at_revision)` | ✅ PASS | 0.27s | - |
| **REST** | Ingestion | `POST /memories/remember` | ✅ PASS | 0.59s | - |
| **REST** | Ingestion | `GET /jobs/{job_id}` | ✅ PASS | 0.40s | - |
| **MCP** | Projects | `memstate_get (list all projects)` | ✅ PASS | 4.50s | - |
| **MCP** | Projects | `memstate_get (project tree)` | ✅ PASS | 4.19s | - |
| **MCP** | Memories | `memstate_set` | ✅ PASS | 4.13s | - |
| **MCP** | Memories | `memstate_remember` | ✅ PASS | 5.11s | - |
| **MCP** | Memories | `memstate_get (subtree + content)` | ✅ PASS | 4.14s | - |
| **MCP** | Memories | `memstate_get (by project+keypath)` | ✅ PASS | 4.07s | - |
| **MCP** | Memories | `memstate_get (time-travel at_revision)` | ✅ PASS | 5.24s | - |
| **MCP** | Search | `memstate_search` | ✅ PASS | 5.19s | - |
| **MCP** | Search | `memstate_search (with keypath_prefix filter)` | ✅ PASS | 4.31s | - |
| **MCP** | Memories | `memstate_history (by keypath)` | ✅ PASS | 3.69s | - |
| **REST** | Changelog | `GET /changelog` | ✅ PASS | 0.42s | - |
| **REST** | Changelog | `GET /changelog (global, no project filter)` | ✅ PASS | 0.33s | - |
| **REST** | Changelog | `GET /changelog (with since filter)` | ✅ PASS | 0.38s | - |
| **REST** | Removed | `GET /review (removed — expect 410)` | ✅ PASS | 0.51s | - |
| **REST** | Removed | `POST /review/{id}/resolve (removed — expect 404)` | ✅ PASS | 0.53s | - |
| **REST** | Cleanup | `POST /projects/delete` | ✅ PASS | 0.47s | - |
| **REST** | Cleanup | `POST /projects/delete (idempotent — BUG-001 fix)` | ✅ PASS | 0.40s | - |
| **REST** | Cleanup | `POST /memories/delete` | ✅ PASS | 0.40s | - |
| **MCP** | Cleanup | `memstate_delete (keypath)` | ✅ PASS | 3.92s | - |
| **MCP** | Cleanup | `memstate_delete_project` | ✅ PASS | 3.91s | - |

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
| `GET` | `/review` | Removed | ✅ |
| `POST` | `/review/{id}/resolve` | Removed | ✅ |
| `GET` | `/changelog` | Changelog | ✅ |
| `POST` | `/memories/store` | Memories | ✅ |
| `POST` | `/memories/store (v2 auto-version)` | Memories | ❌ |
| `POST` | `/memories/remember` | Ingestion | ✅ |
| `GET` | `/memories/{id}` | Memories | ✅ |
| `GET` | `/memories/keypath/{keypath}` | Memories | ✅ |
| `POST` | `/memories/browse` | Memories | ✅ |
| `POST` | `/memories/history` | Memories | ✅ |
| `POST` | `/memories/delete` | Memories | ✅ |
| `POST` | `/memories/search` | Search | ✅ |
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
| Store memory (structured, sync) | `memstate_set` | `POST /memories/store` | ✅ Equivalent |
| Store memory (AI-extracted, async) | `memstate_remember` | `POST /memories/remember` | ✅ Equivalent |
| Get memory by project+keypath | `memstate_get(project_id=..., keypath=...)` | `GET /memories/keypath/{keypath}` | ✅ Equivalent |
| Get project tree | `memstate_get(project_id=...)` | `GET /tree` + `POST /keypaths` | ✅ Equivalent |
| Get subtree with content | `memstate_get(keypath=..., include_content=true)` | `POST /keypaths (recursive)` | ✅ Equivalent |
| Time-travel (at_revision) | `memstate_get(at_revision=...)` | `POST /keypaths (at_revision)` | ✅ Equivalent |
| Semantic search | `memstate_search` | `POST /memories/search` | ✅ Equivalent |
| Version history | `memstate_history` | `POST /memories/history` | ✅ Equivalent |
| Soft-delete keypath | `memstate_delete` | `POST /memories/delete` | ✅ Equivalent |
| Soft-delete project | `memstate_delete_project` | `POST /projects/delete` | ✅ Equivalent |
| List all projects | `memstate_get()` (no args) | `GET /projects` | ✅ Equivalent |
| Changelog / audit feed | ❌ Not available | `GET /changelog` | ⚠️ REST-only (new) |
| Create/update project | ❌ Not available | `POST /projects` | ⚠️ REST-only |
| Get project by ID | ❌ Not available | `GET /projects/{id}` | ⚠️ REST-only |
| List keypaths flat | ❌ Not available | `GET /keypaths` | ⚠️ REST-only |
| Browse by prefix | ❌ Not available | `POST /memories/browse` | ⚠️ REST-only |
| Version memory (auto) | ❌ Not needed | Auto-versioned on every write to same keypath | ✅ Automatic |
| Review queue | ❌ Removed | `GET /review` (410 Gone) | ⚠️ Removed — use POST /memories/history |
| List project revisions | ❌ Not available | `GET /projects/{id}/revisions` | ⚠️ REST-only |
| Job status polling | ❌ Not available | `GET /jobs/{job_id}` | ⚠️ REST-only |
| System status | ❌ Not available | `GET /status` | ⚠️ REST-only |
| Get memory by keypath | ❌ Not available | `GET /memories/keypath/{keypath}` | ⚠️ REST-only |
| Search with superseded | `memstate_search(include_superseded=...)` | `POST /memories/search` | ✅ Equivalent |
| Search with categories | `memstate_search(categories=...)` | `POST /memories/search` | ✅ Equivalent |

## API Changes (This Session)

| Change | Type | Status |
|--------|------|--------|
| Removed `POST /review/{id}/resolve` | Breaking removal | ✅ Done |
| Removed `GET /review` (returns 410 Gone) | Breaking removal | ✅ Done |
| Removed `POST /memories/supersede` (returns 410 Gone) | Breaking removal | ✅ Done |
| Added `GET /changelog` | New endpoint | ✅ Done |
| Fixed `POST /projects/delete` idempotency (500 → 200) | Bug fix | ✅ Done |
| Auto-versioning: every write to same keypath creates new version | New behavior | ✅ Done |
