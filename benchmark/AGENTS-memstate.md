# Memstate MCP - Memory Storage

This project uses Memstate MCP for versioned, structured memory. Keypaths are hierarchical with dot separators (e.g., `database.engine`, `auth.method`).

## Tools — when to use each

### memstate_set — PREFERRED for storing individual facts
Store one fact per call. Synchronous — immediately available for retrieval.
```
memstate_set(keypath="database.engine", value="PostgreSQL", category="decision")
memstate_set(keypath="auth.method", value="JWT with httpOnly cookies", category="decision")
```
- Use for each specific decision, config value, or fact
- One keypath = one fact. Be specific: `api.style` not `api`
- When a fact changes, call memstate_set with the SAME keypath and the new value. Memstate handles versioning — the old value becomes history, the new value becomes current
- Always include `category`: "decision", "fact", or "config"

### memstate_remember — for markdown summaries and long-form content
Stores rich markdown. Server extracts keypaths automatically. **Async** — may take a few seconds to index.
```
memstate_remember(content="## Auth Migration\n- Changed from JWT to server-side sessions\n- Added MFA via TOTP\n- Kept OAuth2 providers", source="agent")
```
- Use AFTER storing individual facts with memstate_set, as a supplementary summary
- Good for meeting notes, migration plans, architecture overviews

### memstate_search — find facts by meaning
Semantic search. Use when you don't know the exact keypath.
```
memstate_search(query="what database does the project use")
```
- Returns results with relevance scores
- Each result has a `memory_id` you can use with memstate_get for full details
- Results show `is_latest: true/false` — only trust results marked `is_latest: true`

### memstate_get — retrieve by keypath or memory_id
```
memstate_get(keypath="database")           # returns all facts under "database.*"
memstate_get(memory_id="abc-123")          # fetch specific memory by ID
```
- With a keypath: returns that key and all children
- With a memory_id (from search results): returns full memory details
- **IMPORTANT**: keypath is required — do NOT call memstate_get with no arguments

### memstate_history — view how a fact changed over time
```
memstate_history(keypath="auth.method")
memstate_history(memory_id="abc-123")
```

## Workflow

### Before each task
1. `memstate_search(query="<topic>")` to find relevant existing facts
2. `memstate_get(keypath="<prefix>")` to browse a known subtree

### Storing facts
1. Use `memstate_set` for EACH individual fact — one call per fact
2. Use short, descriptive keypaths: `auth.method`, `database.engine`, `api.style`, `frontend.framework`
3. Optionally use `memstate_remember` for a markdown summary AFTER the individual facts

### When facts change (CRITICAL)
- Call `memstate_set` with the SAME keypath and the NEW value
- Memstate marks the old version as superseded automatically
- Do NOT create a new keypath for the updated value
- Example: framework changes from React to Next.js → `memstate_set(keypath="frontend.framework", value="Next.js 14 with App Router")`

### Resolving versions in search results
- Search results may show multiple versions of the same keypath
- `is_latest: true` means this is the CURRENT value — use this one
- `is_latest: false` or `needs_review: true` means this is OUTDATED — ignore it
- If `action: "superseded"` appears in a store response, that confirms the old value was replaced
- When answering questions, always report the LATEST value, not historical ones
- If asked about history/changes, use `memstate_history` to get the full timeline

## Keypath conventions
- Use dots: `auth.method`, `database.engine`, `api.pagination.style`
- Lowercase only
- Auto-prefixed with project ID — you don't need to include it
