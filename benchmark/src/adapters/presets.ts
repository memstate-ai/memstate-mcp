import { MCPAdapterConfig } from "./mcp-adapter";

/**
 * Pre-configured adapter configs for popular MCP memory systems.
 * Users can override these or define their own in a JSON config file.
 */

export const ADAPTER_PRESETS: Record<string, MCPAdapterConfig> = {
  memstate: {
    name: "Memstate",
    command: "npx",
    args: ["-y", "@memstate/mcp"],
    env: {
      MEMSTATE_API_KEY: process.env.MEMSTATE_API_KEY || "",
    },
    toolMapping: {
      store: "memstate_set",
      get: "memstate_get",
      search: "memstate_search",
      history: "memstate_history",
      delete: "memstate_delete",
      deleteProject: "memstate_delete_project",
    },
    paramMapping: {
      project: "project",
      key: "keypath",
      value: "value",
      query: "query",
    },
  },

  mem0: {
    name: "Mem0",
    command: "npx",
    args: ["-y", "mem0-mcp"],
    env: {
      MEM0_API_KEY: process.env.MEM0_API_KEY || "",
    },
    toolMapping: {
      store: "add_memory",
      get: "get_memory",
      search: "search_memory",
      history: "get_memory",   // Mem0 may not have separate history
      delete: "delete_memory",
      deleteProject: "delete_memory",
    },
    paramMapping: {
      project: "user_id",
      key: "key",
      value: "content",
      query: "query",
    },
  },
};

export function getPreset(name: string): MCPAdapterConfig | undefined {
  return ADAPTER_PRESETS[name.toLowerCase()];
}

export function listPresets(): string[] {
  return Object.keys(ADAPTER_PRESETS);
}
