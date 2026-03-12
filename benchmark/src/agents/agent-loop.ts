import Anthropic from "@anthropic-ai/sdk";
import {
  AgentConfig,
  AgentTurn,
  AgentToolCall,
  TokenUsage,
  MemoryAdapter,
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
 *   3. The memory tools (provided by the MCP adapter)
 *
 * This ensures the benchmark measures the MEMORY SYSTEM, not the framework.
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

/** Build the tool definitions that the agent can use */
function buildToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "memory_store",
      description:
        "Store a fact in the project's memory. Use dot-separated keypaths like 'database.schema.users'. The project name is added automatically — do NOT include it in the keypath.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Dot-separated keypath (e.g., 'frontend.framework', 'database.schema.users'). Do NOT include the project name.",
          },
          value: {
            type: "string",
            description: "The value to store",
          },
        },
        required: ["key", "value"],
      },
    },
    {
      name: "memory_get",
      description:
        "Retrieve a fact or browse memory. Use a dot-separated keypath to get a specific fact, or omit the key to browse everything. The project name is added automatically.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Dot-separated keypath to retrieve (e.g., 'database.schema' to browse all schema facts). Leave empty to browse entire project.",
          },
        },
        required: ["key"],
      },
    },
    {
      name: "memory_search",
      description:
        "Search memory by meaning. Use natural language to find relevant facts across the project.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language search query",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "memory_history",
      description:
        "View the version history of a specific keypath to see how a decision changed over time.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Dot-separated keypath to get history for (e.g., 'database.type')",
          },
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
  const tools = buildToolDefinitions();
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
        const input = toolCall.arguments as Record<string, string>;
        const toolStart = Date.now();
        let output: string;

        try {
          let result;
          switch (toolCall.name) {
            case "memory_store":
              result = await adapter.storeFact(projectName, input.key, input.value);
              output = result.rawResponse || JSON.stringify(result.data);
              break;
            case "memory_get":
              result = await adapter.getFact(projectName, input.key);
              output = result.rawResponse || JSON.stringify(result.data);
              break;
            case "memory_search":
              result = await adapter.searchMemory(projectName, input.query);
              output = result.rawResponse || JSON.stringify(result.data);
              break;
            case "memory_history":
              result = await adapter.getHistory(projectName, input.key);
              output = result.rawResponse || JSON.stringify(result.data);
              break;
            default:
              output = `Unknown tool: ${toolCall.name}`;
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
