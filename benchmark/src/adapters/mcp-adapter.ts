import { MemoryAdapter, ToolCallResult } from "../types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Generic MCP Memory Adapter
 *
 * Wraps any MCP memory server that exposes standard memory tools.
 * Uses stdio transport to launch the MCP server as a subprocess.
 *
 * Each memory system must declare a tool mapping in its config
 * so the adapter knows which MCP tool names correspond to
 * store/get/search/history/delete operations.
 */
export interface MCPAdapterConfig {
  name: string;
  /** Command to launch the MCP server (e.g., "npx @memstate/mcp") */
  command: string;
  /** Arguments to the command */
  args: string[];
  /** Environment variables (e.g., API keys) */
  env: Record<string, string>;
  /** Mapping from generic operations to MCP tool names */
  toolMapping: {
    store: string;
    get: string;
    search: string;
    history: string;
    delete: string;
    deleteProject: string;
  };
  /** Mapping from generic parameter names to adapter-specific names */
  paramMapping?: {
    project?: string;
    key?: string;
    value?: string;
    query?: string;
  };
}

export class MCPMemoryAdapter implements MemoryAdapter {
  public name: string;
  private config: MCPAdapterConfig;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  constructor(config: MCPAdapterConfig) {
    this.name = config.name;
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.client = new Client(
      { name: `benchmark-${this.name}`, version: "1.0.0" },
      { capabilities: {} }
    );

    this.transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args,
      env: { ...process.env, ...this.config.env } as Record<string, string>,
    });

    await this.client.connect(this.transport);

    // Verify the server exposes the expected tools
    const tools = await this.client.listTools();
    const toolNames = tools.tools.map((t) => t.name);
    const requiredTools = Object.values(this.config.toolMapping);
    const missing = requiredTools.filter((t) => !toolNames.includes(t));
    if (missing.length > 0) {
      throw new Error(
        `${this.name}: MCP server missing required tools: ${missing.join(", ")}. ` +
        `Available: ${toolNames.join(", ")}`
      );
    }
  }

  async storeFact(
    project: string,
    key: string,
    value: string
  ): Promise<ToolCallResult> {
    return this.callTool(this.config.toolMapping.store, {
      [this.param("project")]: project,
      [this.param("key")]: key,
      [this.param("value")]: value,
    });
  }

  async getFact(project: string, key: string): Promise<ToolCallResult> {
    return this.callTool(this.config.toolMapping.get, {
      [this.param("project")]: project,
      [this.param("key")]: key,
    });
  }

  async searchMemory(project: string, query: string): Promise<ToolCallResult> {
    return this.callTool(this.config.toolMapping.search, {
      [this.param("project")]: project,
      [this.param("query")]: query,
    });
  }

  async getHistory(project: string, key: string): Promise<ToolCallResult> {
    return this.callTool(this.config.toolMapping.history, {
      [this.param("project")]: project,
      [this.param("key")]: key,
    });
  }

  async deleteProject(project: string): Promise<ToolCallResult> {
    return this.callTool(this.config.toolMapping.deleteProject, {
      [this.param("project")]: project,
    });
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
    }
    this.client = null;
    this.transport = null;
  }

  private param(generic: string): string {
    const mapping = this.config.paramMapping || {};
    return (mapping as Record<string, string>)[generic] || generic;
  }

  private async callTool(
    toolName: string,
    args: Record<string, string>
  ): Promise<ToolCallResult> {
    if (!this.client) {
      return {
        success: false,
        error: "Adapter not initialized",
        tokenCount: 0,
        latencyMs: 0,
      };
    }

    const start = Date.now();
    try {
      const result = await this.client.callTool({ name: toolName, arguments: args });
      const latencyMs = Date.now() - start;
      const rawResponse = JSON.stringify(result);

      return {
        success: !result.isError,
        data: result.content,
        rawResponse,
        tokenCount: estimateTokenCount(rawResponse),
        latencyMs,
        error: result.isError ? rawResponse : undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        tokenCount: 0,
        latencyMs: Date.now() - start,
      };
    }
  }
}

/** Rough token count estimator (4 chars ≈ 1 token) */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
