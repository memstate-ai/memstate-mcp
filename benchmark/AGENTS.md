# AGENTS.md — Custom Instructions for Memory Benchmark

This file provides custom instructions to the benchmark agent, simulating
how real coding agents receive project-specific context via AGENTS.md or
CLAUDE.md files.

## How This File Is Used

When you run the benchmark with `--agents-md ./AGENTS.md`, the contents of
this file are appended to the agent's system prompt — **identically for all
memory adapters being tested**. This ensures fairness.

## Project Name

**Use the project name provided in each scenario prompt when storing memories.**
The project name is embedded in the task prompt (e.g., "TaskFlow", "SecureApp",
"BlogEngine", "DataHub", "ShopStream"). Use this as the project_id when calling
memory tools.

## Memstate MCP - Memory Storage

This project uses Memstate MCP for versioned memory. Keypaths are hierarchical
(e.g. `project.myapp.database`). Memstate handles versioning and conflict detection.

### Which tool when

- **memstate_remember** — PREFERRED for markdown, task summaries, meeting notes.
  Server extracts keypaths and creates structured memories. Use after tasks.
- **memstate_set** — Only for one keypath = one short value (e.g. config.port, status).
  Not for summaries.
- **memstate_get** — Browse project, fetch existing knowledge before tasks.
- **memstate_search** — Find by meaning when you don't know the keypath.
- **memstate_history** — View version history of a keypath or memory.

### Before each task

Check what already exists:
`memstate_get(project_id="myproject")` or `memstate_search(query="topic", project_id="myproject")`

### After each task

**Preferred — save markdown with remember:**
```
memstate_remember(project_id="myproject", content="## Task Summary\n- What was done\n- Key changes\n- Files modified", source="agent")
```

**Only for a single value:**
`memstate_set(project_id="myproject", keypath="config.port", value="8080")`

Keypaths are auto-prefixed: `keypath="database"` → `project.myproject.database`.
Use short project_id: `myapp`, `memstate`, etc.

## Memory Storage Conventions

- Store facts using hierarchical keypaths: `project/category/subcategory/item`
- Use descriptive values, not just "yes" or "no"
- When updating a fact, include context about what changed and why
- Group related facts under common parent keypaths

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
