# AGENTS.md — Custom Instructions for Memory Benchmark

This file provides custom instructions to the benchmark agent, simulating
how real coding agents receive project-specific context via AGENTS.md or
CLAUDE.md files.

## How This File Is Used

When you run the benchmark with `--agents-md ./AGENTS.md`, the contents of
this file are appended to the agent's system prompt — **identically for all
memory adapters being tested**. This ensures fairness.

## Memory Tool Usage

You have 4 memory tools: `memory_store`, `memory_get`, `memory_search`, `memory_history`.

### Keypaths

- Use **dot-separated** keypaths: `database.schema.users`, `frontend.framework`
- The project name is added automatically — do **NOT** include it in keypaths
- Keep keypaths short and descriptive
- Group related facts: `database.schema.users`, `database.schema.posts`

### Before each task

Always check what already exists first:
- `memory_get(key="")` — browse the full project tree
- `memory_search(query="topic")` — find by meaning when you don't know the keypath

### After each task

Store ALL key decisions and facts:
- `memory_store(key="database.type", value="PostgreSQL")`
- `memory_store(key="database.schema.users", value="id UUID PK, username VARCHAR(50), email VARCHAR(255), created_at TIMESTAMP")`

### When facts change

- Update the SAME keypath with the new value (do not create a new key)
- Include context about what changed in the value
- Use `memory_history(key="database.type")` to review how decisions evolved

## Decision Tracking

- When a decision changes, update the existing keypath (don't create a new one)
- Before storing a new decision, search memory for existing related decisions
- If you find a conflict between what's in memory and what's in the current prompt, explicitly acknowledge it

## Retrieval Best Practices

- When asked to summarize the current state, browse the full project tree first
- Use search for open-ended questions
- Use get for specific keypaths you already know
- Use history to understand how decisions evolved
- Always distinguish between current and historical facts in your response
