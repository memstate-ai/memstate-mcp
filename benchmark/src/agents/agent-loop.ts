import Anthropic from "@anthropic-ai/sdk";
import {
  AgentConfig,
  AgentTurn,
  AgentToolCall,
  TokenUsage,
  MemoryAdapter,
} from "../types";

/**
 * Agent Loop — drives a Claude-based coding agent through benchmark sessions.
 *
 * WHY NOT LANGCHAIN:
 * We use a raw agent loop (ReAct pattern) instead of LangChain to eliminate
 * framework bias. LangChain's tool-calling abstractions add their own prompt
 * engineering that could favor or penalize certain memory systems. By using
 * the raw Anthropic SDK, the only variables are:
 *   1. The system prompt (identical across runs)
 *   2. The user prompt (defined by the scenario)
 *   3. The memory tools (provided by the MCP adapter)
 *
 * This ensures the benchmark measures the MEMORY SYSTEM, not the framework.
 *
 * AGENT LOOP DESIGN:
 * 1. Agent receives a task prompt
 * 2. Agent can call memory tools (store, get, search, history)
 * 3. Agent decides when it's done (sends final text response)
 * 4. All tool calls, tokens, and latencies are recorded
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

/** Build the tool definitions that the agent can use */
function buildToolDefinitions(): Anthropic.Tool[] {
  return [
    {
      name: "memory_store",
      description:
        "Store a fact in the project's memory. Use structured keypaths like 'project/category/item'.",
      input_schema: {
        type: "object" as const,
        properties: {
          key: {
            type: "string",
            description: "The keypath to store the fact under (e.g., 'myproject/frontend/framework')",
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
        "Retrieve a fact or browse memory. Use a keypath to get a specific fact, or a partial path to browse a subtree.",
      input_schema: {
        type: "object" as const,
        properties: {
          key: {
            type: "string",
            description: "The keypath to retrieve (e.g., 'myproject/frontend' to browse all frontend facts)",
          },
        },
        required: ["key"],
      },
    },
    {
      name: "memory_search",
      description:
        "Search memory by meaning. Use natural language to find relevant facts.",
      input_schema: {
        type: "object" as const,
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
      input_schema: {
        type: "object" as const,
        properties: {
          key: {
            type: "string",
            description: "The keypath to get history for",
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
  const anthropic = new Anthropic();
  const tools = buildToolDefinitions();
  const turns: AgentTurn[] = [];
  const memoryToolCalls: AgentToolCall[] = [];
  const errors: string[] = [];
  const totalTokens: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const loopStart = Date.now();

  // Build conversation messages
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    const turnStart = Date.now();

    try {
      const response = await anthropic.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        system: systemPrompt,
        tools,
        messages,
      });

      const turnLatency = Date.now() - turnStart;
      const turnTokens: TokenUsage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      };
      totalTokens.inputTokens += turnTokens.inputTokens;
      totalTokens.outputTokens += turnTokens.outputTokens;
      totalTokens.totalTokens += turnTokens.totalTokens;

      // Check if the agent is done (end_turn with no tool calls)
      const hasToolUse = response.content.some((b) => b.type === "tool_use");

      if (response.stop_reason === "end_turn" && !hasToolUse) {
        // Agent is done — extract final text
        const textBlocks = response.content.filter((b) => b.type === "text");
        const finalResponse = textBlocks
          .map((b) => (b as Anthropic.TextBlock).text)
          .join("\n");

        turns.push({
          turnNumber: iteration + 1,
          role: "assistant",
          content: finalResponse,
          tokenUsage: turnTokens,
          latencyMs: turnLatency,
        });

        if (verbose) {
          console.log(`  [Turn ${iteration + 1}] Agent finished.`);
        }

        return {
          turns,
          finalResponse,
          totalTokens,
          totalTimeMs: Date.now() - loopStart,
          memoryToolCalls,
          errors,
        };
      }

      // Process tool calls
      const toolUseBlocks = response.content.filter(
        (b) => b.type === "tool_use"
      ) as Anthropic.ToolUseBlock[];
      const textBlocks = response.content.filter(
        (b) => b.type === "text"
      ) as Anthropic.TextBlock[];

      const turnToolCalls: AgentToolCall[] = [];

      // Add assistant message to conversation
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool call
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const input = toolUse.input as Record<string, string>;
        const toolStart = Date.now();
        let output: string;

        try {
          let result;
          switch (toolUse.name) {
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
              output = `Unknown tool: ${toolUse.name}`;
          }
        } catch (err) {
          output = `Error: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(`Tool ${toolUse.name}: ${output}`);
        }

        const toolLatency = Date.now() - toolStart;
        const toolCall: AgentToolCall = {
          toolName: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
          output,
          latencyMs: toolLatency,
          tokenCount: Math.ceil(output.length / 4),
        };
        turnToolCalls.push(toolCall);
        memoryToolCalls.push(toolCall);

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: output,
        });

        if (verbose) {
          console.log(
            `  [Turn ${iteration + 1}] ${toolUse.name}(${JSON.stringify(input)}) → ${output.substring(0, 100)}...`
          );
        }
      }

      // Add tool results to conversation
      messages.push({ role: "user", content: toolResults });

      turns.push({
        turnNumber: iteration + 1,
        role: "assistant",
        content: textBlocks.map((b) => b.text).join("\n"),
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

      // If we get an API error, don't keep looping
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
