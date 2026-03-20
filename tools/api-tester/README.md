# Memstate AI API Tester

A comprehensive Go-based test suite that exhaustively validates both the Memstate AI **REST API** and **MCP Tools**, producing a comparison matrix and parity report.

## What It Tests

### REST API (21 endpoints)
| Category | Endpoints |
|----------|-----------|
| System | `GET /status` |
| Projects | `GET /projects`, `POST /projects`, `GET /projects/{id}`, `GET /projects/{id}/revisions`, `POST /projects/delete`, `GET /tree`, `GET /review` |
| Memories | `POST /memories/remember`, `GET /memories/{id}`, `GET /memories/keypath/{keypath}`, `POST /memories/supersede`, `POST /memories/browse`, `POST /memories/history`, `POST /memories/delete` |
| Search | `POST /memories/search`, `GET /keypaths`, `POST /keypaths` (recursive + time-travel) |
| Ingestion | `POST /ingest`, `GET /jobs/{job_id}` |

### MCP Tools (7 tools, 12 test cases)
| Tool | Test Cases |
|------|-----------|
| `memstate_get` | List all projects, get project tree, get subtree with content, get by memory_id, time-travel at_revision |
| `memstate_search` | Basic search, search with keypath_prefix filter |
| `memstate_remember` | AI-powered markdown ingestion |
| `memstate_set` | Structured keypath storage |
| `memstate_history` | Version history by keypath |
| `memstate_delete` | Soft-delete keypath |
| `memstate_delete_project` | Soft-delete entire project |

## Requirements

- **Go 1.22+**
- **Node.js 18+** (for MCP tool execution via `npx`)
- A valid Memstate API key

## Usage

```bash
# Set your API key (or edit the constant in main.go)
export MEMSTATE_API_KEY=mst_your_key_here

# Build and run
cd tools/api-tester
go build -o api-tester .
./api-tester
```

## Output

The tool produces:
- **Console output** with live pass/fail status for each test
- **`test-results.json`** — machine-readable results with response bodies and durations
- **`test-results.md`** — markdown report with full test matrix and parity analysis

## Architecture

The test suite spawns each MCP tool call as a separate `node` subprocess using `@modelcontextprotocol/sdk`. This mirrors how real MCP clients work (via stdio transport), ensuring the tests validate the full end-to-end MCP stack rather than mocking it.

```
Go test runner
    ├── REST calls: direct HTTP via net/http
    └── MCP calls: node subprocess → npx @memstate/mcp → Memstate Cloud
```

## CI Integration

```yaml
# Example GitHub Actions step
- name: Run API Tests
  working-directory: tools/api-tester
  env:
    MEMSTATE_API_KEY: ${{ secrets.MEMSTATE_API_KEY }}
  run: |
    go build -o api-tester .
    ./api-tester
```
