# AGENTS.md — Custom Instructions for Memory Benchmark

This file provides custom instructions to the benchmark agent, simulating
how real coding agents receive project-specific context via AGENTS.md or
CLAUDE.md files.

## How This File Is Used

When you run the benchmark with `--agents-md ./AGENTS.md`, the contents of
this file are appended to the agent's system prompt — **identically for all
memory adapters being tested**. This ensures fairness.

## Why AGENTS.md Matters for Memory Benchmarks

In real-world usage, coding agents receive custom instructions that affect
how they interact with memory systems. For example:

- "Always store architecture decisions under `project/architecture/`"
- "When a decision changes, check the history first"
- "Use semantic search before storing to avoid duplicates"

These instructions can significantly impact memory system performance.
A memory system that works well with bare prompts might struggle when
custom instructions change the agent's behavior.

## Default Instructions (Edit These)

The instructions below are defaults that work well for most memory systems.
Edit them to test how different instruction styles affect results.

### Memory Storage Conventions

- Store facts using hierarchical keypaths: `project/category/subcategory/item`
- Use descriptive values, not just "yes" or "no"
- When updating a fact, include context about what changed and why
- Group related facts under common parent keypaths

### Decision Tracking

- When a decision changes, update the existing keypath (don't create a new one)
- Before storing a new decision, search memory for existing related decisions
- If you find a conflict between what's in memory and what's in the current prompt, explicitly acknowledge it

### Retrieval Best Practices

- When asked to summarize the current state, browse the full project tree first
- Use search for open-ended questions
- Use get for specific keypaths you already know
- Use history to understand how decisions evolved
- Always distinguish between current and historical facts in your response

## Scenario-Specific Notes

You can add scenario-specific instructions here to test edge cases:

```
# Uncomment to test aggressive memory usage:
# Always search memory before every response.
# Store every fact mentioned in every prompt, even if it seems minor.

# Uncomment to test minimal memory usage:
# Only store facts that are explicitly asked to be stored.
# Only retrieve from memory when explicitly asked.
```
