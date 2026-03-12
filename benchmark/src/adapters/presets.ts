import { MCPAdapterConfig } from "./mcp-adapter";

/**
 * Pre-configured adapter configs for popular MCP memory systems.
 * Users can override these or define their own in a JSON config file.
 */

export const ADAPTER_PRESETS: Record<string, MCPAdapterConfig> = {
  memstate: {
    name: "Memstate",
    command: "node",
    args: [require("path").resolve(__dirname, "../../../dist/index.js")],
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
      project: "project_id",
      key: "keypath",
      value: "value",
      query: "query",
    },
    projectParam: "project_id",
    excludeNativeTools: ["memstate_delete", "memstate_delete_project"],
  },

  mem0: {
    name: "Mem0",
    command: "uvx",
    args: ["mem0-mcp-server"],
    env: {
      MEM0_API_KEY: process.env.MEM0_API_KEY || "",
    },
    toolMapping: {
      store: "add_memory",
      get: "get_memories",
      search: "search_memories",
      history: "get_memory",
      delete: "delete_memory",
      deleteProject: "delete_all_memories",
    },
    paramMapping: {
      project: "user_id",
      key: "memory_id",
      value: "text",
      query: "query",
    },
    projectParam: "user_id",
    excludeNativeTools: ["delete_memory", "delete_all_memories", "delete_entities"],
  },
};

export function getPreset(name: string): MCPAdapterConfig | undefined {
  return ADAPTER_PRESETS[name.toLowerCase()];
}

export function listPresets(): string[] {
  return Object.keys(ADAPTER_PRESETS);
}
