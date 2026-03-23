#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const index_js_2 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: VERSION } = require("../package.json");
const API_KEY = process.env.MEMSTATE_API_KEY ?? "";
const MCP_URL = process.env.MEMSTATE_MCP_URL ?? "https://mcp.memstate.ai";
const TEST_MODE = process.argv.includes("--test");
/**
 * Create a proxy-aware fetch function when HTTPS_PROXY is set.
 * Node.js native fetch() does not honor HTTP_PROXY/HTTPS_PROXY env vars,
 * so we use undici's ProxyAgent to route through the proxy.
 */
function createProxyFetch() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy ||
        process.env.HTTP_PROXY || process.env.http_proxy;
    if (!proxyUrl)
        return undefined;
    try {
        // undici is bundled with Node.js but may need explicit require
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ProxyAgent, fetch: undiciFetch } = require("undici");
        const dispatcher = new ProxyAgent(proxyUrl);
        return ((url, init) => undiciFetch(url, { ...init, dispatcher }));
    }
    catch {
        // If undici is not available, fall back to native fetch
        return undefined;
    }
}
async function connectRemote() {
    const remote = new index_js_1.Client({ name: "@memstate/mcp", version: VERSION }, { capabilities: {} });
    const proxyFetch = createProxyFetch();
    const httpTransport = new streamableHttp_js_1.StreamableHTTPClientTransport(new URL(MCP_URL), {
        requestInit: {
            headers: { "X-API-Key": API_KEY },
        },
        ...(proxyFetch ? { fetch: proxyFetch } : {}),
    });
    await remote.connect(httpTransport);
    return remote;
}
async function main() {
    if (!API_KEY) {
        process.stderr.write("Error: MEMSTATE_API_KEY environment variable is required.\n" +
            "Get your API key at https://memstate.ai/dashboard\n\n" +
            'Add it to your MCP client config under "env":\n' +
            '  "env": { "MEMSTATE_API_KEY": "your_key_here" }\n');
        process.exit(1);
    }
    let remote;
    try {
        remote = await connectRemote();
    }
    catch (err) {
        process.stderr.write(`Error: Could not connect to Memstate at ${MCP_URL}\n` +
            `${err instanceof Error ? err.message : String(err)}\n` +
            "Check that your MEMSTATE_API_KEY is correct.\n");
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
        }
        finally {
            await remote.close().catch(() => { });
        }
        process.exit(0);
    }
    // Discover remote capabilities to decide what to proxy
    const caps = remote.getServerCapabilities() ?? {};
    const instructions = remote.getInstructions();
    const server = new index_js_2.Server({ name: "memstate", version: VERSION }, {
        capabilities: {
            tools: caps.tools ?? {},
            ...(caps.resources ? { resources: caps.resources } : {}),
            ...(caps.prompts ? { prompts: caps.prompts } : {}),
        },
        ...(instructions ? { instructions } : {}),
    });
    // --- Tools (always proxied) -----------------------------------------------
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async (request) => {
        return await remote.listTools(request.params);
    });
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
        return await remote.callTool({
            name: request.params.name,
            arguments: request.params.arguments,
        });
    });
    // --- Resources (proxied when remote advertises them) ----------------------
    if (caps.resources) {
        server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async (request) => {
            return await remote.listResources(request.params);
        });
        server.setRequestHandler(types_js_1.ListResourceTemplatesRequestSchema, async (request) => {
            return await remote.listResourceTemplates(request.params);
        });
        server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
            return await remote.readResource(request.params);
        });
    }
    // --- Prompts (proxied when remote advertises them) ------------------------
    if (caps.prompts) {
        server.setRequestHandler(types_js_1.ListPromptsRequestSchema, async (request) => {
            return await remote.listPrompts(request.params);
        });
        server.setRequestHandler(types_js_1.GetPromptRequestSchema, async (request) => {
            return await remote.getPrompt(request.params);
        });
    }
    // --- Lifecycle ------------------------------------------------------------
    const shutdown = async () => {
        await server.close().catch(() => { });
        await remote.close().catch(() => { });
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    const stdio = new stdio_js_1.StdioServerTransport();
    await server.connect(stdio);
    process.stderr.write(`memstate MCP ready (${MCP_URL})\n`);
}
// CLI dispatcher — handles `npx @memstate/mcp setup` and `npx @memstate/mcp init`
// before falling through to the MCP server for normal agent use.
async function run() {
    const command = process.argv[2];
    if (command === "setup") {
        const { main: setupMain } = await import("./setup.js");
        await setupMain();
        return;
    }
    if (command === "init") {
        const { main: initMain } = await import("./init.js");
        await initMain();
        return;
    }
    // No subcommand — start the MCP server (normal agent use)
    await main();
}
run().catch((err) => {
    process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map