# Memstate MCP

[![npm version](https://img.shields.io/npm/v/@memstate/mcp?color=brightgreen)](https://www.npmjs.com/package/@memstate/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)

**Versioned memory for AI agents.** Store facts, detect conflicts, and track how decisions change over time — exposed as a hosted MCP server.

[Dashboard](https://memstate.ai/dashboard) · [Docs](https://memstate.ai/docs) · [Pricing](https://memstate.ai/pricing)

---

## Why Memstate?

| | Mem0 | Memstate |
|---|---|---|
| Token usage per conversation | ~7,500 | ~1,500 |
| Agent visibility | Black box | Full transparency |
| Memory versioning | None | Full history |
| Token growth as memories scale | O(n) | O(1) |
| Infrastructure required | Yes | None — hosted SaaS |

Other memory systems dump everything into your context window and hope for the best. Memstate gives your agent a **structured, versioned knowledge base** it navigates precisely — load only what you need, know what changed, know when facts conflict.

---

## Quick Start

Get your API key at [memstate.ai/dashboard](https://memstate.ai/dashboard), then add to your MCP client config:

```json
{
  "mcpServers": {
    "memstate": {
      "command": "npx",
      "args": ["-y", "@memstate/mcp"],
      "env": {
        "MEMSTATE_API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

No Docker. No database. No infrastructure. Running in 60 seconds.

---

## Client Setup

### Claude Desktop

Config location:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "memstate": {
      "command": "npx",
      "args": ["-y", "@memstate/mcp"],
      "env": { "MEMSTATE_API_KEY": "YOUR_API_KEY_HERE" }
    }
  }
}
```

### Claude Code

```bash
claude mcp add memstate npx @memstate/mcp -e MEMSTATE_API_KEY=YOUR_API_KEY_HERE
```

### Cursor

In Cursor Settings → MCP → Add Server — same JSON format as Claude Desktop above.

### Cline / Windsurf / Kilo Code / Roo Code

All support the same stdio MCP config format. Add to your client's MCP settings file.

---

## Core Tools

| Tool | When to use |
|------|-------------|
| `memstate_remember` | Store markdown, task summaries, decisions. Server extracts keypaths and detects conflicts automatically. **Use for most writes.** |
| `memstate_set` | Set a single keypath to a short value (e.g. `config.port = 8080`). Not for prose. |
| `memstate_get` | Browse all memories for a project or subtree. **Use at the start of every task.** |
| `memstate_search` | Semantic search by meaning when you don't know the exact keypath. |
| `memstate_history` | See how a piece of knowledge changed over time — full version chain. |
| `memstate_delete` | Soft-delete a keypath. Creates a tombstone; full history is preserved. |
| `memstate_delete_project` | Soft-delete an entire project and all its memories. |

### How keypaths work

Memories are organized in hierarchical dot-notation:

```
project.myapp.database.schema
project.myapp.auth.provider
project.myapp.deploy.environment
```

Keypaths are auto-prefixed: `keypath="database"` with `project_id="myapp"` → `project.myapp.database`. Your agent can drill into exactly what it needs — no full-context dumps.

---

## How It Works

```
Agent: memstate_remember(project_id="myapp", content="## Auth\nUsing SuperTokens...")
         ↓
Server extracts keypaths:  [project.myapp.auth.provider, ...]
         ↓
Conflict detection:  compare against existing memories at those keypaths
         ↓
New version stored — old version preserved in history chain
         ↓
Next session: memstate_get(project_id="myapp") → structured summaries only
         ↓
Agent drills into project.myapp.auth only when it needs auth details
```

**Token cost stays constant** regardless of how many total memories exist.

---

## Add to Your Agent Instructions

Copy into your `AGENTS.md` or system prompt:

```markdown
## Memory (Memstate MCP)

### Before each task
- memstate_get(project_id="myproject") — browse existing knowledge
- memstate_search(query="topic", project_id="myproject") — find by meaning

### After each task
- memstate_remember(project_id="myproject", content="## Summary\n- ...", source="agent")

### Tool guide
- memstate_remember — markdown summaries, decisions, task results (preferred)
- memstate_set — single short values only (config flags, status)
- memstate_get — browse/retrieve before tasks
- memstate_search — semantic lookup when keypath unknown
- memstate_history — audit how knowledge evolved
- memstate_delete — remove outdated memories (history preserved)
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMSTATE_API_KEY` | *(required)* | API key from [memstate.ai/dashboard](https://memstate.ai/dashboard) |
| `MEMSTATE_MCP_URL` | `https://mcp.memstate.ai` | Override for self-hosted deployments |

## Verify Your Connection

```bash
MEMSTATE_API_KEY=your_key npx @memstate/mcp --test
```

Prints all available tools and confirms your API key works.

---

## License

MIT — see [LICENSE](LICENSE).

---

*Built for AI agents that deserve to know what they know.*
