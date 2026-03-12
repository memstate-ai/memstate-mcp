import Anthropic from "@anthropic-ai/sdk";
import {
  AgentConfig,
  AgentTurn,
  AgentToolCall,
  TokenUsage,
  MemoryAdapter,
  NativeToolDefinition,
  LLMProviderConfig,
} from "../types";
import { createLLMProvider, LLMProvider } from "./llm-provider";

/**
 * Agent Loop — drives an LLM-based coding agent through benchmark sessions.
 *
 * WHY NOT LANGCHAIN:
 * We use a raw agent loop (ReAct pattern) instead of LangChain to eliminate
 * framework bias. LangChain's tool-calling abstractions add their own prompt
 * engineering that could favor or penalize certain memory systems. By using
 * raw LLM APIs, the only variables are:
 *   1. The system prompt (identical across runs)
 *   2. The user prompt (defined by the scenario)
 *   3. The memory tools (discovered from the MCP server — native names!)
 *
 * This ensures the benchmark measures the MEMORY SYSTEM, not the framework.
 *
 * NATIVE TOOL PASSTHROUGH:
 * When the adapter supports getNativeTools(), the agent sees the real MCP tool
 * names (e.g., memstate_set, memstate_get) exactly as a customer would. Tool
 * calls are passed through to the MCP server via callNativeTool(). This means
 * the AGENTS.md instructions (which reference real tool names) work naturally.
 *
 * MULTI-PROVIDER SUPPORT:
 * The agent loop supports any LLM via the LLMProvider abstraction:
 *   - Anthropic (Claude Opus, Sonnet, Haiku)
 *   - OpenAI-compatible (GPT-4, Gemini via OpenAI compat, Qwen, local models)
 *
 * All providers are normalized to a common tool-calling interface.
 */

export interface AgentLoopOptions {
  config: AgentConfig;
  adapter: MemoryAdapter;
  systemPrompt: string;
  projectName: string;
  verbose: boolean;
}

export interface AgentLoopResult {
  turns: AgentTurn[];
  finalResponse: string;
  totalTokens: TokenUsage;
  totalTimeMs: number;
  memoryToolCalls: AgentToolCall[];
  errors: string[];
}

/** Tool definition in a provider-agnostic format */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

/**
 * Convert native MCP tool definitions to the provider-agnostic format.
 * Strips out the project_id parameter since it's auto-injected by the adapter.
 */
function nativeToolsToDefinitions(
  nativeTools: NativeToolDefinition[],
  projectParam: string
): ToolDefinition[] {
  return nativeTools.map((t) => {
    const schema = t.inputSchema as {
      type?: string;
      properties?: Record<string, { type?: string; description?: string }>;
      required?: string[];
    };
    const properties: Record<string, { type: string; description: string }> = {};
    const required: string[] = [];

    if (schema.properties) {
      for (const [name, prop] of Object.entries(schema.properties)) {
        // Skip the project param — it's auto-injected
        if (name === projectParam) continue;
        properties[name] = {
          type: (prop as { type?: string }).type || "string",
          description: (prop as { description?: string }).description || "",
        };
      }
    }
    if (schema.required) {
      for (const r of schema.required) {
        if (r !== projectParam && properties[r]) {
          required.push(r);
        }
      }
    }

    return {
      name: t.name,
      description: t.description,
      parameters: { type: "object" as const, properties, required },
    };
  });
}

/** Fallback generic tool definitions (used when adapter doesn't support native tools) */
function buildGenericToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "memory_store",
      description:
        "Store a fact in the project's memory. Use dot-separated keypaths like 'database.schema.users'. The project name is added automatically.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Dot-separated keypath" },
          value: { type: "string", description: "The value to store" },
        },
        required: ["key", "value"],
      },
    },
    {
      name: "memory_get",
      description: "Retrieve a fact or browse memory. Leave key empty to browse everything.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Dot-separated keypath to retrieve" },
        },
        required: ["key"],
      },
    },
    {
      name: "memory_search",
      description: "Search memory by meaning using natural language.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search query" },
        },
        required: ["query"],
      },
    },
    {
      name: "memory_history",
      description: "View the version history of a specific keypath.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Dot-separated keypath to get history for" },
        },
        required: ["key"],
      },
    },
  ];
}

export async function runAgentLoop(
  userPrompt: string,
  options: AgentLoopOptions
): Promise<AgentLoopResult> {
  const { config, adapter, systemPrompt, projectName, verbose } = options;
  const provider = createLLMProvider(config.provider);

  // Determine whether to use native MCP tools or generic wrappers
  const useNativeTools = !!(adapter.getNativeTools && adapter.callNativeTool);
  const nativeTools = useNativeTools ? adapter.getNativeTools!() : [];
  const tools = useNativeTools
    ? nativeToolsToDefinitions(nativeTools, "project_id")
    : buildGenericToolDefinitions();

  // Track which tool names are native (for routing)
  const nativeToolNames = new Set(nativeTools.map((t) => t.name));

  if (verbose) {
    if (useNativeTools) {
      console.log(`  [Agent] Using native MCP tools: ${nativeTools.map(t => t.name).join(", ")}`);
    } else {
      console.log(`  [Agent] Using generic tool wrappers (adapter doesn't support native passthrough)`);
    }
  }

  const turns: AgentTurn[] = [];
  const memoryToolCalls: AgentToolCall[] = [];
  const errors: string[] = [];
  const totalTokens: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const loopStart = Date.now();

  // Conversation history in provider-agnostic format
  const messages: Array<{ role: "user" | "assistant" | "tool"; content: string; toolCallId?: string; toolCalls?: Array<{ id: string; name: string; arguments: string }> }> = [
    { role: "user", content: userPrompt },
  ];

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    const turnStart = Date.now();

    try {
      const response = await provider.chat({
        model: config.model,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        system: systemPrompt,
        tools,
        messages,
      });

      const turnLatency = Date.now() - turnStart;
      const turnTokens: TokenUsage = {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.inputTokens + response.usage.outputTokens,
      };
      totalTokens.inputTokens += turnTokens.inputTokens;
      totalTokens.outputTokens += turnTokens.outputTokens;
      totalTokens.totalTokens += turnTokens.totalTokens;

      // Check if the agent is done (no tool calls)
      if (!response.toolCalls || response.toolCalls.length === 0) {
        turns.push({
          turnNumber: iteration + 1,
          role: "assistant",
          content: response.text,
          tokenUsage: turnTokens,
          latencyMs: turnLatency,
        });

        if (verbose) {
          console.log(`  [Turn ${iteration + 1}] Agent finished.`);
        }

        return {
          turns,
          finalResponse: response.text,
          totalTokens,
          totalTimeMs: Date.now() - loopStart,
          memoryToolCalls,
          errors,
        };
      }

      // Process tool calls
      const turnToolCalls: AgentToolCall[] = [];

      // Add assistant message with tool calls to conversation
      messages.push({
        role: "assistant",
        content: response.text,
        toolCalls: response.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        })),
      });

      // Execute each tool call and add results
      for (const toolCall of response.toolCalls) {
        const input = toolCall.arguments as Record<string, unknown>;
        const toolStart = Date.now();
        let output: string;

        try {
          if (useNativeTools && nativeToolNames.has(toolCall.name)) {
            // Native passthrough — call the MCP tool directly
            const result = await adapter.callNativeTool!(
              projectName,
              toolCall.name,
              input
            );
            output = result.rawResponse || JSON.stringify(result.data);
          } else {
            // Generic fallback — route through adapter methods
            let result;
            const stringInput = input as Record<string, string>;
            switch (toolCall.name) {
              case "memory_store":
                result = await adapter.storeFact(projectName, stringInput.key, stringInput.value);
                output = result.rawResponse || JSON.stringify(result.data);
                break;
              case "memory_get":
                result = await adapter.getFact(projectName, stringInput.key);
                output = result.rawResponse || JSON.stringify(result.data);
                break;
              case "memory_search":
                result = await adapter.searchMemory(projectName, stringInput.query);
                output = result.rawResponse || JSON.stringify(result.data);
                break;
              case "memory_history":
                result = await adapter.getHistory(projectName, stringInput.key);
                output = result.rawResponse || JSON.stringify(result.data);
                break;
              default:
                output = `Unknown tool: ${toolCall.name}`;
            }
          }
        } catch (err) {
          output = `Error: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(`Tool ${toolCall.name}: ${output}`);
        }

        const toolLatency = Date.now() - toolStart;
        const agentToolCall: AgentToolCall = {
          toolName: toolCall.name,
          input: toolCall.arguments,
          output,
          latencyMs: toolLatency,
          tokenCount: Math.ceil(output.length / 4),
        };
        turnToolCalls.push(agentToolCall);
        memoryToolCalls.push(agentToolCall);

        // Add tool result to conversation
        messages.push({
          role: "tool",
          content: output,
          toolCallId: toolCall.id,
        });

        if (verbose) {
          console.log(
            `  [Turn ${iteration + 1}] ${toolCall.name}(${JSON.stringify(input)}) → ${output.substring(0, 100)}...`
          );
        }
      }

      turns.push({
        turnNumber: iteration + 1,
        role: "assistant",
        content: response.text,
        toolCalls: turnToolCalls,
        tokenUsage: turnTokens,
        latencyMs: turnLatency,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Agent loop iteration ${iteration + 1}: ${errMsg}`);

      if (verbose) {
        console.error(`  [Turn ${iteration + 1}] ERROR: ${errMsg}`);
      }

      return {
        turns,
        finalResponse: `Error: ${errMsg}`,
        totalTokens,
        totalTimeMs: Date.now() - loopStart,
        memoryToolCalls,
        errors,
      };
    }
  }

  // Max iterations reached
  const lastText = turns.length > 0 ? turns[turns.length - 1].content : "";
  return {
    turns,
    finalResponse: lastText || "Max iterations reached without completion",
    totalTokens,
    totalTimeMs: Date.now() - loopStart,
    memoryToolCalls,
    errors: [...errors, `Max iterations (${config.maxIterations}) reached`],
  };
}
