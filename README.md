# Memstate AI - MCP

[![npm version](https://img.shields.io/npm/v/@memstate/mcp?color=brightgreen)](https://www.npmjs.com/package/@memstate/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)

**Versioned memory for AI agents.** Store facts, detect conflicts, and track how decisions change over time — exposed as a hosted MCP server.

[Dashboard](https://memstate.ai/dashboard) · [Docs](https://memstate.ai/docs) · [Pricing](https://memstate.ai/pricing)

---

## Why Memstate?

| | RAG (most other memory systems) | Memstate AI |
|---|---|---|
| Token usage per conversation | ~7,500 | ~1,500 |
| Agent visibility | Black box | Full transparency |
| Memory versioning | None | Full history |
| Token growth as memories scale | O(n) | O(1) |
| Infrastructure required | Yes | None — hosted SaaS |

Other memory systems dump everything into your context window and hope for the best. Memstate gives your agent a **structured, versioned knowledge base** it navigates precisely — load only what you need, know what changed, know when facts conflict.

---

## Benchmarks

We built an [open-source benchmark suite](benchmark/) that tests what actually matters for agent memory: can your system store facts, recall them accurately across sessions, detect conflicts when things change, and maintain context as a project evolves?

### Head-to-Head: Memstate AI vs Mem0

Both systems were tested under identical conditions using the same agent (Claude Sonnet 4.6, temperature 0), the same scenarios, and the same scoring rubric.

| Metric | Memstate AI | Mem0 | Winner |
|--------|:-----------:|:----:|--------|
| **Overall Score** | **69.1** | 15.4 | Memstate |
| Accuracy (fact recall) | 74.1 | 12.6 | Memstate |
| Conflict Detection | 85.5 | 19.0 | Memstate |
| Context Continuity | 63.7 | 10.1 | Memstate |
| Token Efficiency | 22.3 | 30.6 | Mem0 |

*Scoring weights: Accuracy 40%, Conflict Detection 25%, Context Continuity 25%, Token Efficiency 10%.*

### Per-Scenario Breakdown

The benchmark runs five real-world scenarios that simulate multi-session agent workflows:

| Scenario | Memstate AI | Mem0 |
|----------|:-----------:|:----:|
| Web App Architecture Evolution | 43.2 | 55.6 |
| Auth System Migration | 66.2 | 10.2 |
| Database Schema Evolution | 72.7 | 7.0 |
| API Versioning Conflicts | 86.5 | 0.9 |
| Team Decision Reversal | 77.2 | 3.3 |

Mem0 won the first scenario (simple architecture tracking), but struggled severely on scenarios requiring contradiction handling, cross-session context, and decision reversal tracking — scoring near zero on three of five scenarios.

### Why Memstate Wins

The benchmark reveals a fundamental architectural difference:

**Mem0 uses embedding-based semantic search.** Facts are chunked, embedded, and retrieved by similarity. This works for simple lookups but breaks down when:
- Facts contradict earlier facts (the system can't distinguish current vs. outdated)
- Precise recall is needed (embeddings return "similar" results, not exact ones)
- Write-to-read latency matters (new memories take seconds to become searchable)

**Memstate uses structured, versioned key-value storage.** Every fact lives at an explicit keypath with a full version history. This means:
- **Conflict detection is built in** — when a new fact contradicts an old one, the system knows and preserves both versions
- **Recall is deterministic** — you get back exactly what was stored, not an approximate match
- **Cross-session continuity is reliable** — the agent navigates a structured tree rather than hoping semantic search surfaces the right context
- **Token cost stays O(1)** — the agent loads summaries first and drills into detail only when needed, instead of dumping all potentially-relevant embeddings into the context window

### Fairness Notes

- Both systems used the same agent model, temperature, and evaluation rubric
- Mem0 was given a 10-second ingestion delay between writes and reads to account for its async embedding pipeline
- Token efficiency is the one area where Mem0 scores higher — its embedding-based retrieval can be more compact for simple lookups
- The benchmark source code is included in this repository for full reproducibility
- Mem0 may perform differently with custom configuration or a different embedding model

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

*Built for AI agents that deserve to know what they know.*
