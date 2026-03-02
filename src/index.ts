#!/usr/bin/env node
/**
 * @memstate/mcp
 *
 * Adaptive MCP proxy for Memstate AI. Dynamically proxies all tools,
 * resources, and prompts from the Memstate hosted MCP server — no hardcoded
 * schemas. New server-side capabilities appear automatically without
 * requiring a client update.
 *
 * Environment variables:
 *   MEMSTATE_API_KEY  — Your API key (required). Get at https://memstate.ai/dashboard
 *   MEMSTATE_MCP_URL  — MCP server URL (default: https://mcp.memstate.ai)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: VERSION } = require("../package.json") as { version: string };

const API_KEY = process.env.MEMSTATE_API_KEY ?? "";
const MCP_URL = process.env.MEMSTATE_MCP_URL ?? "https://mcp.memstate.ai";
const TEST_MODE = process.argv.includes("--test");

async function connectRemote(): Promise<Client> {
  const remote = new Client(
    { name: "@memstate/mcp", version: VERSION },
    { capabilities: {} }
  );

  const httpTransport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: { "X-API-Key": API_KEY },
    },
  });

  await remote.connect(httpTransport);
  return remote;
}

async function main(): Promise<void> {
  if (!API_KEY) {
    process.stderr.write(
      "Error: MEMSTATE_API_KEY environment variable is required.\n" +
        "Get your API key at https://memstate.ai/dashboard\n\n" +
        'Add it to your MCP client config under "env":\n' +
        '  "env": { "MEMSTATE_API_KEY": "your_key_here" }\n'
    );
    process.exit(1);
  }

  let remote: Client;
  try {
    remote = await connectRemote();
  } catch (err) {
    process.stderr.write(
      `Error: Could not connect to Memstate at ${MCP_URL}\n` +
        `${err instanceof Error ? err.message : String(err)}\n` +
        "Check that your MEMSTATE_API_KEY is correct.\n"
    );
    process.exit(1);
  }

  // --test: verify connection, print available tools, then exit
  if (TEST_MODE) {
    try {
      const { tools } = await remote.listTools();
      process.stdout.write(`✓ Connected to ${MCP_URL}\n`);
      process.stdout.write(`✓ ${tools.length} tools available:\n`);
      for (const tool of tools) {
        const desc = tool.description?.slice(0, 70) ?? "";
        process.stdout.write(`    ${tool.name.padEnd(30)} ${desc}\n`);
      }
    } finally {
      await remote.close().catch(() => {});
    }
    process.exit(0);
  }

  // Discover remote capabilities to decide what to proxy
  const caps = remote.getServerCapabilities() ?? {};
  const instructions = remote.getInstructions();

  const server = new Server(
    { name: "memstate", version: VERSION },
    {
      capabilities: {
        tools: caps.tools ?? {},
        ...(caps.resources ? { resources: caps.resources } : {}),
        ...(caps.prompts ? { prompts: caps.prompts } : {}),
      },
      ...(instructions ? { instructions } : {}),
    }
  );

  // --- Tools (always proxied) -----------------------------------------------

  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    return await remote.listTools(request.params);
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return await remote.callTool({
      name: request.params.name,
      arguments: request.params.arguments,
    });
  });

  // --- Resources (proxied when remote advertises them) ----------------------

  if (caps.resources) {
    server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      return await remote.listResources(request.params);
    });

    server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (request) => {
        return await remote.listResourceTemplates(request.params);
      }
    );

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return await remote.readResource(request.params);
    });
  }

  // --- Prompts (proxied when remote advertises them) ------------------------

  if (caps.prompts) {
    server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      return await remote.listPrompts(request.params);
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      return await remote.getPrompt(request.params);
    });
  }

  // --- Lifecycle ------------------------------------------------------------

  const shutdown = async (): Promise<void> => {
    await server.close().catch(() => {});
    await remote.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const stdio = new StdioServerTransport();
  await server.connect(stdio);
  process.stderr.write(`memstate MCP ready (${MCP_URL})\n`);
}

main().catch((err) => {
  process.stderr.write(
    `Fatal error: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
