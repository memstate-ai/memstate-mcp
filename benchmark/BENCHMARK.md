# Memory MCP Benchmark — Methodology & Design

A head-to-head benchmark for comparing MCP memory systems in realistic multi-session coding agent scenarios.

## Why This Benchmark Exists

AI coding agents increasingly rely on external memory (via MCP tools) to persist context across sessions. But not all memory systems are equal. Some lose track of superseded decisions. Some can't detect contradictions. Some use excessive tokens to store and retrieve simple facts.

This benchmark provides an **objective, reproducible** framework to measure how well a memory system supports a coding agent's actual workflow — not toy examples, but realistic multi-session projects where architecture decisions evolve, get reversed, and contradict each other.

## What We Measure

| Metric | Weight | What It Tests |
|---|---|---|
| **Accuracy** | 40% | Can the agent recall stored facts correctly? |
| **Conflict Detection** | 25% | Does the memory system flag when a decision has been superseded? |
| **Context Continuity** | 25% | After multiple sessions, is the agent's world-view accurate? |
| **Token Efficiency** | 10% | How many tokens does the memory system consume? |

## How It Works

### Architecture

```
┌────────────────────────┐
│   Benchmark CLI        │
│   (orchestrator)       │
└──────────┬─────────────┘
           │
     ┌─────▼──────┐
     │  Agent Loop │ ← Claude API (same model, temp=0 for all adapters)
     │  (ReAct)    │
     └──┬──────┬───┘
        │      │
   ┌────▼──┐ ┌▼────────┐
   │Memory │ │Memory   │
   │Tool A │ │Tool B   │
   │(MCP)  │ │(MCP)    │
   └───────┘ └─────────┘
```

### The Agent Loop

The benchmark uses a **raw ReAct agent loop** built directly on the Anthropic SDK. This is a deliberate design choice:

**Why not LangChain/LlamaIndex/CrewAI?**

Frameworks like LangChain add their own abstractions, prompt engineering, and tool-calling logic. If we used LangChain, we'd be benchmarking "LangChain + Memory System X" vs "LangChain + Memory System Y" — and LangChain's internal decisions could favor one system over another.

By using the raw Anthropic SDK with a minimal ReAct loop, the only variables are:
1. **System prompt** — identical for all adapters
2. **User prompt** — defined by the scenario
3. **Memory tools** — provided by the MCP adapter under test
4. **Model** — same model (default: claude-sonnet-4-20250514) at temperature 0

This ensures we measure the **memory system**, not the framework.

### The Agent's Tools

The agent is given exactly 4 memory tools, regardless of which memory system is being tested:

| Tool | Description |
|---|---|
| `memory_store` | Store a fact under a structured keypath |
| `memory_get` | Retrieve a fact or browse a subtree |
| `memory_search` | Semantic search by meaning |
| `memory_history` | View version history of a keypath |

Each MCP memory adapter maps these generic tools to its own specific MCP tool names. The agent never knows which memory system it's talking to.

### Scoring: Semantic Similarity (Not String Matching)

Verification queries are scored using **Claude Haiku as an independent judge**. The judge receives:
- The question
- The expected answer
- The actual answer

The judge does **NOT** receive:
- Which memory system produced the answer
- The scenario name or context
- Any hint about which answer is "preferred"

This prevents scoring bias. The judge scores on a 0.0–1.0 scale for semantic similarity.

**Critical rule:** If the actual answer reports outdated/superseded information as current, the judge scores it LOW (0.0–0.3) even if the outdated info was once correct. This is the core test — can the memory system distinguish current from historical facts?

## Scenarios

### 1. Web App Architecture Evolution
**Category:** `architecture_evolution` | **Sessions:** 4

A web app (TaskFlow) where architecture decisions change over time:
- Session 1: React + REST + MongoDB (initial setup)
- Session 2: Migrate from REST to GraphQL
- Session 3: Migrate from React to Next.js
- Session 4: Full recall — must report CURRENT stack only

**What it tests:** Can the memory system track multiple rounds of technology changes and report only the current state?

### 2. Auth System Migration
**Category:** `contradiction_handling` | **Sessions:** 4

A security-critical auth system that evolves:
- Session 1: JWT-based auth
- Session 2: Add OAuth2 providers
- Session 3: Security audit requires migration from JWT to server-side sessions
- Session 4: Security recall — reporting stale auth config is a documentation error

**What it tests:** Can the memory system handle security-critical facts where reporting stale data is dangerous?

### 3. Database Schema Evolution
**Category:** `cross_session_context` | **Sessions:** 3

A database schema that goes through normalization and denormalization:
- Session 1: Initial schema (users, posts, comments)
- Session 2: Normalize (extract profiles, add tags, rename columns)
- Session 3: Denormalize for performance (add counters, materialized views)

**What it tests:** Can the memory system track fine-grained changes like column renames and type changes?

### 4. API Versioning Conflicts
**Category:** `contradiction_handling` | **Sessions:** 4

An API with coexisting versions and contradictory hotfixes:
- Session 1: Define v1 API
- Session 2: Define v2 with breaking changes (v1 still works)
- Session 3: Hotfix changes v1 behavior to match v2 (contradiction with original v1 docs)
- Session 4: Recall — must distinguish v1 vs v2 correctly, including post-hotfix v1

**What it tests:** Can the memory system namespace versioned information and handle cross-version contradictions?

### 5. Team Decision Reversal (The Hardest Test)
**Category:** `project_complexity` | **Sessions:** 4

Architecture goes monolith → microservices → back to monolith:
- Session 1: Monolith architecture chosen (small team, ship fast)
- Session 2: Migrate to microservices (team grew)
- Session 3: Revert to modular monolith (microservices too complex) — some decisions from microservices era are KEPT
- Session 4: Recall — must report modular monolith (not microservices, not original monolith)

**What it tests:** The ultimate challenge — non-linear decision history where the current state reverts a previous "forward" decision. Memory systems that simply track "latest = best" will fail because the latest *forward* decision (microservices) was reversed.

## Fairness Controls

### 1. Identical System Prompt
Every adapter receives the exact same system prompt. The prompt never mentions any memory system by name.

### 2. Temperature Zero
All agent runs use `temperature: 0` to minimize randomness. The agent should make the same tool-calling decisions given the same inputs.

### 3. Blind Scoring
The judge model never sees which adapter produced the answer. It only sees question + expected + actual. The judge can be any LLM (default: Claude Haiku, configurable to GPT-4o-mini, Gemini Flash, etc.).

### 4. Same Model
All runs use the same LLM model (configurable, default Sonnet). No adapter gets a "smarter" agent. The agent and judge models are independently configurable, and both can use any supported provider.

### 5. Isolated Memory
Each scenario run gets a unique project name (with UUID suffix). Adapters never see each other's data. Memory is cleaned up before and after each run.

### 6. AGENTS.md Support
Real-world memory setups often include custom instructions (like AGENTS.md or CLAUDE.md files). The benchmark supports loading an AGENTS.md file that applies equally to all adapters. This tests whether memory systems work well with custom agent instructions.

### 7. Custom Adapter Configs
Any MCP memory system can be benchmarked by providing a JSON adapter config file. The benchmark is not hardcoded to specific systems.

### 8. Raw Data Saved
All raw data (every agent turn, tool call, token count, latency) is saved as JSON. Anyone can independently verify the scoring.

## Running the Benchmark

### Prerequisites
- Node.js >= 18
- API key for at least one LLM provider (for the agent and judge)
- API keys for each memory system you want to test

### Quick Start

```bash
cd benchmark
npm install
npm run build

# Run against Memstate (default: Claude Sonnet agent + Claude Haiku judge)
MEMSTATE_API_KEY=your-key npx memory-benchmark run -a memstate

# Head-to-head comparison
MEMSTATE_API_KEY=key1 MEM0_API_KEY=key2 npx memory-benchmark run -a memstate mem0

# Run specific scenarios
npx memory-benchmark run -a memstate -s auth-system-migration team-decision-reversal

# With custom AGENTS.md
npx memory-benchmark run -a memstate --agents-md ./AGENTS.md

# Verbose mode (see every tool call)
npx memory-benchmark run -a memstate -v

# List available scenarios, presets, and providers
npx memory-benchmark list
```

### Using Different LLM Providers

The agent model and judge model are independently configurable. You can mix providers.

```bash
# Use GPT-4o as the agent
OPENAI_API_KEY=key npx memory-benchmark run -a memstate \
  -m gpt-4o --agent-provider openai

# Use Gemini as the agent, Claude Haiku as the judge
GEMINI_API_KEY=key npx memory-benchmark run -a memstate \
  -m gemini-2.0-flash --agent-provider gemini --agent-api-key $GEMINI_API_KEY

# Use Claude Opus as the agent, GPT-4o-mini as the judge
OPENAI_API_KEY=key npx memory-benchmark run -a memstate \
  -m claude-opus-4-20250514 --agent-provider anthropic \
  --judge-model gpt-4o-mini --judge-provider openai

# Use Qwen as the agent
DASHSCOPE_API_KEY=key npx memory-benchmark run -a memstate \
  -m qwen-plus --agent-provider qwen --agent-api-key $DASHSCOPE_API_KEY

# Use Deepseek as the agent
DEEPSEEK_API_KEY=key npx memory-benchmark run -a memstate \
  -m deepseek-chat --agent-provider deepseek --agent-api-key $DEEPSEEK_API_KEY

# Use a local Ollama model
npx memory-benchmark run -a memstate \
  -m llama3.1:70b --agent-provider ollama \
  --judge-model llama3.1:70b --judge-provider ollama

# Use any OpenAI-compatible endpoint by passing a URL directly
npx memory-benchmark run -a memstate \
  -m my-model --agent-provider https://my-server.com/v1 --agent-api-key $MY_KEY
```

### Supported Providers

| Provider | Flag | Default Base URL | Example Models |
|---|---|---|---|
| Anthropic | `anthropic` | Native SDK | claude-opus-4-20250514, claude-sonnet-4-20250514, claude-haiku-4-5-20251001 |
| OpenAI | `openai` | api.openai.com | gpt-4o, gpt-4o-mini, o1, o3 |
| Google Gemini | `gemini` | generativelanguage.googleapis.com | gemini-2.0-flash, gemini-2.5-pro |
| Qwen | `qwen` | dashscope.aliyuncs.com | qwen-plus, qwen-max, qwen2.5-72b-instruct |
| Deepseek | `deepseek` | api.deepseek.com | deepseek-chat, deepseek-reasoner |
| Groq | `groq` | api.groq.com | llama-3.1-70b, mixtral-8x7b |
| Together | `together` | api.together.xyz | meta-llama/Llama-3-70b |
| Fireworks | `fireworks` | api.fireworks.ai | accounts/fireworks/models/llama-v3p1-70b |
| Ollama | `ollama` | localhost:11434 | llama3.1:70b, qwen2.5:32b |
| Custom URL | `https://...` | (your URL) | (any model) |

### Custom Adapter

To benchmark a memory system not in the presets, create a JSON config file:

```json
{
  "name": "MyMemory",
  "command": "npx",
  "args": ["-y", "my-memory-mcp-server"],
  "env": {
    "MY_MEMORY_API_KEY": "your-key"
  },
  "toolMapping": {
    "store": "my_store_tool",
    "get": "my_get_tool",
    "search": "my_search_tool",
    "history": "my_history_tool",
    "delete": "my_delete_tool",
    "deleteProject": "my_delete_project_tool"
  },
  "paramMapping": {
    "project": "project_id",
    "key": "keypath",
    "value": "content",
    "query": "search_query"
  }
}
```

Save as `<name>-adapter.json` in the output directory, then:

```bash
npx memory-benchmark run -a mymemory
```

## Interpreting Results

### Score Breakdown

- **90–100:** Excellent — near-perfect recall, conflict detection, and continuity
- **70–89:** Good — solid performance with some gaps in edge cases
- **50–69:** Fair — basic recall works but struggles with contradictions or complex history
- **30–49:** Poor — frequently reports stale facts or misses conflicts
- **0–29:** Failing — fundamental memory storage/retrieval issues

### What to Look For

1. **Accuracy vs Conflict Detection gap:** If accuracy is high but conflict detection is low, the system stores facts fine but can't track when they change.

2. **Token efficiency outliers:** If one system uses 10x more tokens for the same accuracy, it's less cost-effective for real-world use.

3. **Scenario-specific weaknesses:** A system might ace simple recall but fail on the decision reversal scenario. This indicates it can't handle non-linear decision histories.

4. **Session 4 scores:** The final "recall" session in each scenario is the most important. It tests whether the memory system correctly represents the current state after all changes.

## Limitations & Transparency

1. **Model dependency:** Results may vary with different Claude models. Always compare adapters using the same model.

2. **Network latency:** Remote MCP servers add latency. Token efficiency scores normalize for this, but wall-clock times may differ based on server location.

3. **Semantic scoring subjectivity:** While Claude Haiku is a consistent judge, semantic similarity is inherently subjective. Raw scores are saved so alternative scoring can be applied.

4. **Scenario coverage:** 5 scenarios cannot cover every possible memory use case. We focus on the most common coding agent patterns: architecture evolution, security config, schema changes, API versioning, and decision reversals.

5. **Not a unit test:** This benchmark tests the memory system through an agent. If the agent makes a mistake (stores a fact wrong despite the memory system working correctly), it affects the score. Temperature 0 minimizes but doesn't eliminate this.

## Contributing

To add a new scenario:
1. Create a new file in `src/scenarios/`
2. Define sessions with clear prompts and verification queries
3. Add it to `src/scenarios/index.ts`
4. Ensure verification queries cover all 4 types: `fact_recall`, `conflict_detection`, `decision_tracking`, `context_continuity`

To add a new adapter preset:
1. Add the config to `src/adapters/presets.ts`
2. Document any required environment variables
