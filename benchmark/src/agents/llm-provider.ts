import Anthropic from "@anthropic-ai/sdk";
import { LLMProviderConfig, resolveApiKey } from "../types";
import { ToolDefinition } from "./agent-loop";

/**
 * LLM Provider Abstraction
 *
 * Normalizes different LLM APIs to a common interface for the agent loop.
 * Supports:
 *   - Anthropic (Claude models via native SDK)
 *   - OpenAI-compatible (GPT-4, Gemini, Qwen, Deepseek, local models via OpenAI SDK format)
 *
 * This abstraction is intentionally thin — it only covers the chat-with-tools
 * pattern needed by the benchmark agent. It does NOT aim to be a general-purpose
 * LLM wrapper.
 */

// ─── Common Types ────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}

export interface ChatRequest {
  model: string;
  maxTokens: number;
  temperature: number;
  system: string;
  tools: ToolDefinition[];
  messages: ChatMessage[];
}

export interface ChatResponse {
  text: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMProvider {
  name: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createLLMProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai-compatible":
      return new OpenAICompatibleProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

// ─── Anthropic Provider ──────────────────────────────────────────────────────

class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private client: Anthropic;

  constructor(config: LLMProviderConfig) {
    const apiKey = resolveApiKey(config);
    this.client = new Anthropic({
      ...(apiKey ? { apiKey } : {}),
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Convert generic tools to Anthropic format
    const tools: Anthropic.Tool[] = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: "object" as const,
        properties: t.parameters.properties,
        required: t.parameters.required,
      },
    }));

    // Convert generic messages to Anthropic format
    const messages = this.convertMessages(request.messages);

    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      system: request.system,
      tools,
      messages,
    });

    // Extract text and tool calls
    const textBlocks = response.content.filter((b) => b.type === "text") as Anthropic.TextBlock[];
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];

    return {
      text: textBlocks.map((b) => b.text).join("\n"),
      toolCalls: toolUseBlocks.map((b) => ({
        id: b.id,
        name: b.name,
        arguments: b.input as Record<string, unknown>,
      })),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private convertMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      if (msg.role === "user") {
        result.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        const content: Anthropic.ContentBlockParam[] = [];
        if (msg.content) {
          content.push({ type: "text", text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: JSON.parse(tc.arguments),
            });
          }
        }
        result.push({ role: "assistant", content });
      } else if (msg.role === "tool") {
        // Anthropic expects tool results as user messages with tool_result blocks
        // Group consecutive tool results together
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        let j = i;
        while (j < messages.length && messages[j].role === "tool") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: messages[j].toolCallId!,
            content: messages[j].content,
          });
          j++;
        }
        result.push({ role: "user", content: toolResults });
        i = j - 1; // Skip grouped messages (loop will increment)
      }
    }

    return result;
  }
}

// ─── OpenAI-Compatible Provider ──────────────────────────────────────────────

/**
 * Supports any API that follows the OpenAI chat completions format:
 *   - OpenAI (GPT-4, GPT-4o, o1, o3)
 *   - Google Gemini (via OpenAI-compatible endpoint)
 *   - Qwen (via DashScope OpenAI-compatible endpoint)
 *   - Deepseek
 *   - Together AI, Fireworks, Groq, etc.
 *   - Local models via Ollama, vLLM, LM Studio
 *
 * Uses raw fetch() to avoid adding openai as a dependency.
 */
class OpenAICompatibleProvider implements LLMProvider {
  name: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: LLMProviderConfig) {
    this.name = `openai-compatible(${config.baseUrl || "api.openai.com"})`;
    this.apiKey = resolveApiKey(config);
    this.baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    // Convert to OpenAI format
    const tools = request.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const messages = this.convertMessages(request.system, request.messages);

    const body = {
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      tools,
      messages,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI-compatible API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as OpenAIResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error("No choices returned from OpenAI-compatible API");
    }

    const toolCalls = (choice.message.tool_calls || []).map((tc: OpenAIToolCall) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    }));

    return {
      text: choice.message.content || "",
      toolCalls,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  private convertMessages(
    system: string,
    messages: ChatMessage[]
  ): OpenAIMessage[] {
    const result: OpenAIMessage[] = [
      { role: "system", content: system },
    ];

    for (const msg of messages) {
      if (msg.role === "user") {
        result.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        const openaiMsg: OpenAIMessage = {
          role: "assistant",
          content: msg.content || null,
        };
        if (msg.toolCalls) {
          openaiMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          }));
        }
        result.push(openaiMsg);
      } else if (msg.role === "tool") {
        result.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.toolCallId,
        });
      }
    }

    return result;
  }
}

// ─── OpenAI Response Types ───────────────────────────────────────────────────

interface OpenAIMessage {
  role: string;
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}
