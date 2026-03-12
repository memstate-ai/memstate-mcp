# Mem0 MCP - Memory Storage

This project uses Mem0 for AI memory management. Mem0 automatically extracts and manages memories from conversations.

## Which tool when

- **add_memory** — Store new information. Pass text or conversation history.
  Mem0 automatically extracts key facts and manages deduplication.
- **search_memories** — Semantic search across all memories. Use natural language queries.
- **get_memories** — List all memories, optionally filtered.
- **get_memory** — Retrieve a specific memory by its memory_id.
- **update_memory** — Update an existing memory's text by memory_id.

## Before each task
Check what already exists: `search_memories(query="topic", user_id="myproject")` or `get_memories(user_id="myproject")`

## After each task
Store what was decided and changed:
`add_memory(text="## Task Summary\n- Database: PostgreSQL\n- Framework: Next.js\n- Key decision: chose PostgreSQL over MongoDB for ACID compliance", user_id="myproject")`

Mem0 automatically extracts structured facts from your text — you don't need to manage keypaths manually.

## When facts change
Just add the new information — Mem0 handles versioning and conflict resolution:
`add_memory(text="Changed database from PostgreSQL to MongoDB for flexibility with unstructured data", user_id="myproject")`
