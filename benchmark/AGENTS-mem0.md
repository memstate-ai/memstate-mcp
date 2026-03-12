# Mem0 MCP - Memory Storage

This project uses Mem0 for AI memory management. Mem0 automatically extracts and manages memories from conversations.

## Tools — when to use each

### add_memory — store new information
Pass text describing what to remember. Mem0 automatically extracts key facts.
```
add_memory(text="The project uses PostgreSQL as its database engine. Authentication is via JWT tokens stored in httpOnly cookies.")
```
- Include ALL facts in a single call when possible — Mem0 extracts structured facts automatically
- Be explicit and specific: state exactly what the current value is
- When facts change, add a NEW memory with the updated information — Mem0 handles deduplication and versioning

### search_memories — find facts by meaning
Semantic search across all stored memories.
```
search_memories(query="what database does the project use")
```
- Use natural language queries
- Returns memories ranked by relevance
- Each result has an `id` you can use with `get_memory`

### get_memories — list all memories
```
get_memories()
```
- Returns all stored memories
- Use to get a complete picture of what's been stored

### get_memory — retrieve a specific memory
```
get_memory(memory_id="abc-123")
```
- Fetch a specific memory by its ID (from search results)

### update_memory — update an existing memory
```
update_memory(memory_id="abc-123", text="Updated: now using GraphQL instead of REST")
```
- Update when you know the specific memory_id to change

## Workflow

### Before each task
1. `search_memories(query="<topic>")` to find relevant existing facts
2. `get_memories()` to see everything stored

### Storing facts
1. Use `add_memory` with clear, factual text
2. Include context about what the fact relates to
3. Store facts as soon as decisions are made — don't wait

### When facts change (CRITICAL)
- Use `search_memories` to find the existing memory about the topic
- Use `update_memory` with the memory_id to update the specific fact
- If you can't find the existing memory, use `add_memory` with the new information — Mem0 handles deduplication
- Always state what the NEW value is, not just that something changed
- Example: "The frontend framework is now Next.js 14 with App Router. Previously it was React 18."

### Answering questions from memory
- Always search first: `search_memories(query="<question topic>")`
- If search returns no results, try `get_memories()` for a broader view
- Only report what you find in memory — do not guess
