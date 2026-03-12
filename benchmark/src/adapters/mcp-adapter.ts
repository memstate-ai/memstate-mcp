import { MemoryAdapter, ToolCallResult, NativeToolDefinition } from "../types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Generic MCP Memory Adapter
 *
 * Wraps any MCP memory server that exposes standard memory tools.
 * Uses stdio transport to launch the MCP server as a subprocess.
 *
 * Supports two modes:
 * 1. **Native passthrough** (preferred): Discovers tools from the MCP server
 *    and exposes them directly to the agent. The agent sees the real tool names
 *    (e.g., memstate_set, memstate_get) exactly as a customer would.
 * 2. **Generic mapping** (fallback): Maps generic operations (store/get/search)
 *    to MCP tool names via toolMapping config.
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
  /**
   * The parameter name that identifies the project in native tool calls.
   * When the agent calls a native tool, the adapter auto-injects this param.
   * Default: "project_id"
   */
  projectParam?: string;
  /**
   * Tool names to exclude from native tool exposure (e.g., delete tools
   * that the agent shouldn't call directly during benchmark sessions).
   */
  excludeNativeTools?: string[];
}

export class MCPMemoryAdapter implements MemoryAdapter {
  public name: string;
  private config: MCPAdapterConfig;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private nativeTools: NativeToolDefinition[] = [];

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

    // Discover native tools from the MCP server
    const tools = await this.client.listTools();
    const excludeSet = new Set(this.config.excludeNativeTools || []);

    this.nativeTools = tools.tools
      .filter((t) => !excludeSet.has(t.name))
      .map((t) => ({
        name: t.name,
        description: t.description || "",
        inputSchema: (t.inputSchema as Record<string, unknown>) || { type: "object", properties: {}, required: [] },
      }));

    // Verify the server exposes the tools needed for generic fallback
    const toolNames = tools.tools.map((t) => t.name);
    const requiredTools = Object.values(this.config.toolMapping);
    const missing = requiredTools.filter((t) => !toolNames.includes(t));
    if (missing.length > 0) {
      console.warn(
        `${this.name}: MCP server missing some mapped tools: ${missing.join(", ")}. ` +
        `Available: ${toolNames.join(", ")}. Native passthrough will still work.`
      );
    }
  }

  /**
   * Return the native MCP tools discovered from the server.
   * These are exposed directly to the agent — no generic wrappers.
   */
  getNativeTools(): NativeToolDefinition[] {
    return this.nativeTools;
  }

  /**
   * Call a native MCP tool by name, auto-injecting the project_id.
   */
  async callNativeTool(
    project: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    if (!this.client) {
      return {
        success: false,
        error: "Adapter not initialized",
        tokenCount: 0,
        latencyMs: 0,
      };
    }

    const projectParam = this.config.projectParam || "project_id";

    // Auto-inject project_id if not already provided by the agent
    const finalArgs = { ...args };
    if (!(projectParam in finalArgs)) {
      finalArgs[projectParam] = project;
    }

    const start = Date.now();
    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: finalArgs as Record<string, string>,
      });
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

  // ─── Generic adapter methods (used for preloading facts, cleanup, etc.) ───

  async storeFact(
    project: string,
    key: string,
    value: string
  ): Promise<ToolCallResult> {
    return this.callNativeTool(project, this.config.toolMapping.store, {
      [this.param("key")]: key,
      [this.param("value")]: value,
    });
  }

  async getFact(project: string, key: string): Promise<ToolCallResult> {
    return this.callNativeTool(project, this.config.toolMapping.get, {
      [this.param("key")]: key,
    });
  }

  async searchMemory(project: string, query: string): Promise<ToolCallResult> {
    return this.callNativeTool(project, this.config.toolMapping.search, {
      [this.param("query")]: query,
    });
  }

  async getHistory(project: string, key: string): Promise<ToolCallResult> {
    return this.callNativeTool(project, this.config.toolMapping.history, {
      [this.param("key")]: key,
    });
  }

  async deleteProject(project: string): Promise<ToolCallResult> {
    return this.callNativeTool(project, this.config.toolMapping.deleteProject, {});
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
}

/** Rough token count estimator (4 chars ≈ 1 token) */
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
