# Memstate MCP - Memory Storage

This project uses Memstate MCP for versioned memory. Keypaths are hierarchical (e.g. `project.myapp.database`). Memstate handles versioning and conflict detection.

## Which tool when

- **memstate_remember** — PREFERRED for markdown, task summaries, meeting notes.
  Server extracts keypaths and creates structured memories. Use after tasks.
- **memstate_set** — Only for one keypath = one short value (e.g. config.port, status).
  Not for summaries.
- **memstate_get** — Browse project, fetch existing knowledge before tasks.
- **memstate_search** — Find by meaning when you don't know the keypath.
- **memstate_history** — View version history of a keypath or memory.

## Before each task
Check what already exists: `memstate_get(project_id="myproject")` or `memstate_search(query="topic", project_id="myproject")`

## After each task
**Preferred — save markdown with remember:**
memstate_remember(project_id="myproject", content="## Task Summary\n- What was done\n- Key changes\n- Files modified", source="agent")

**Only for a single value:** `memstate_set(project_id="myproject", keypath="config.port", value="8080")`

Keypaths are auto-prefixed: `keypath="database"` → `project.myproject.database`. Use short project_id: `myapp`, `memstate`, etc.
