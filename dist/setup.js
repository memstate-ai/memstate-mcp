#!/usr/bin/env node
"use strict";
/**
 * memstate setup — Interactive CLI setup tool
 *
 * Detects installed AI agents (Claude Desktop, Cursor, Cline, Windsurf, etc.)
 * and automatically adds the Memstate MCP server configuration.
 *
 * Usage: npx @memstate/mcp setup
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const readline = __importStar(require("readline"));
const MEMSTATE_API_KEYS_URL = "https://memstate.ai/dashboard/api-keys?utm_source=cli&utm_medium=setup";
const MEMSTATE_DOCS_URL = "https://memstate.ai/docs/setup";
const MCP_CONFIG_TEMPLATE = (apiKey) => ({
    command: "npx",
    args: ["-y", "@memstate/mcp"],
    env: {
        MEMSTATE_API_KEY: apiKey,
    },
});
function expandHome(p) {
    if (p.startsWith("~/") || p === "~") {
        return path.join(os.homedir(), p.slice(2));
    }
    return p;
}
function getAgentConfigs() {
    const home = os.homedir();
    const isWindows = process.platform === "win32";
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return [
        {
            name: "Claude Desktop",
            configPaths: isWindows
                ? [path.join(appData, "Claude", "claude_desktop_config.json")]
                : [
                    path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
                    path.join(home, ".config", "Claude", "claude_desktop_config.json"),
                ],
            configKey: "mcpServers",
            isJsonFile: true,
        },
        {
            name: "Claude Code",
            configPaths: [path.join(home, ".claude.json")],
            configKey: "mcpServers",
            isJsonFile: true,
        },
        {
            name: "Cursor (global)",
            configPaths: [path.join(home, ".cursor", "mcp.json")],
            configKey: "mcpServers",
            isJsonFile: true,
        },
        {
            name: "Windsurf",
            configPaths: [path.join(home, ".codeium", "windsurf", "mcp_config.json")],
            configKey: "mcpServers",
            isJsonFile: true,
        },
        {
            name: "Gemini CLI",
            configPaths: [path.join(home, ".gemini", "settings.json")],
            configKey: "mcpServers",
            isJsonFile: true,
        },
    ];
}
function detectInstalledAgents(agents) {
    return agents.filter((agent) => agent.configPaths.some((p) => {
        const expanded = expandHome(p);
        return fs.existsSync(path.dirname(expanded));
    }));
}
function readJsonConfig(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, "utf-8");
            return JSON.parse(content);
        }
    }
    catch {
        // ignore parse errors, start fresh
    }
    return {};
}
function writeJsonConfig(filePath, config) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
function configureAgent(agent, apiKey) {
    const configPath = agent.configPaths.find((p) => fs.existsSync(expandHome(p))) || agent.configPaths[0];
    const expandedPath = expandHome(configPath);
    try {
        const config = readJsonConfig(expandedPath);
        const mcpServers = config[agent.configKey] || {};
        mcpServers["memstate"] = MCP_CONFIG_TEMPLATE(apiKey);
        config[agent.configKey] = mcpServers;
        writeJsonConfig(expandedPath, config);
        return { success: true, path: expandedPath, message: "✅ Configured successfully" };
    }
    catch (err) {
        return {
            success: false,
            path: expandedPath,
            message: `❌ Failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
function openBrowser(url) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { exec } = require("child_process");
    const platform = process.platform;
    const cmd = platform === "darwin" ? `open "${url}"` :
        platform === "win32" ? `start "" "${url}"` :
            `xdg-open "${url}"`;
    exec(cmd, () => { });
}
function promptUser(rl, question) {
    return new Promise((resolve) => rl.question(question, resolve));
}
async function main() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║     Memstate AI — Setup Tool                 ║");
    console.log("║     Versioned memory for AI agents           ║");
    console.log("╚══════════════════════════════════════════════╝\n");
    // Step 1: Get API key
    console.log("Step 1: Get your Memstate API key");
    console.log("─────────────────────────────────");
    console.log("Opening your browser to create an API key...\n");
    openBrowser(MEMSTATE_API_KEYS_URL);
    const apiKey = await promptUser(rl, "Paste your API key here (starts with mst_): ");
    const trimmedKey = apiKey.trim();
    if (!trimmedKey || !trimmedKey.startsWith("mst_")) {
        console.log("\n⚠️  API key should start with 'mst_'. You can still continue and update it later.");
        const proceed = await promptUser(rl, "Continue anyway? (y/n): ");
        if (proceed.toLowerCase() !== "y") {
            console.log("\nSetup cancelled. Run 'npx @memstate/mcp setup' again when you have your key.");
            rl.close();
            return;
        }
    }
    // Step 2: Detect agents
    console.log("\nStep 2: Detecting installed AI agents...");
    console.log("─────────────────────────────────────────");
    const allAgents = getAgentConfigs();
    const detectedAgents = detectInstalledAgents(allAgents);
    if (detectedAgents.length === 0) {
        console.log("No agents detected automatically.\n");
        console.log("You can configure manually — see the guide at:");
        console.log(`  ${MEMSTATE_DOCS_URL}\n`);
        rl.close();
        return;
    }
    console.log(`Found ${detectedAgents.length} agent(s):\n`);
    detectedAgents.forEach((agent, i) => {
        console.log(`  ${i + 1}. ${agent.name}`);
    });
    const selection = await promptUser(rl, "\nConfigure all detected agents? (y/n, or enter numbers like '1,3'): ");
    let agentsToSetup = [];
    if (selection.toLowerCase() === "y" || selection.trim() === "") {
        agentsToSetup = detectedAgents;
    }
    else if (selection.toLowerCase() === "n") {
        console.log("\nSetup cancelled. Run 'npx @memstate/mcp setup' again anytime.");
        rl.close();
        return;
    }
    else {
        const indices = selection.split(",").map((s) => parseInt(s.trim(), 10) - 1);
        agentsToSetup = indices
            .filter((i) => i >= 0 && i < detectedAgents.length)
            .map((i) => detectedAgents[i]);
    }
    // Step 3: Configure
    console.log("\nStep 3: Configuring agents...");
    console.log("──────────────────────────────");
    const results = [];
    for (const agent of agentsToSetup) {
        process.stdout.write(`  Configuring ${agent.name}... `);
        const result = configureAgent(agent, trimmedKey);
        console.log(result.message);
        results.push({ agent: agent.name, ...result });
    }
    // Step 4: Suggest init
    console.log("\nStep 4: Add agent rules to your project (recommended)");
    console.log("─────────────────────────────────────────────────────");
    console.log("Run this in your project directory to create rule files");
    console.log("(CLAUDE.md, AGENTS.md, .cursor/rules/, .clinerules, etc.):");
    console.log("\n  npx @memstate/mcp init\n");
    console.log("These rules tell agents to use memory before/after every task.\n");
    // Summary
    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    console.log("═══════════════════════════════════════════════");
    console.log(`✅ Setup complete! ${succeeded.length}/${results.length} agents configured.\n`);
    if (succeeded.length > 0) {
        console.log("Next steps:");
        console.log("  1. Restart your configured agent(s)");
        console.log("  2. Ask your agent: \"Use memstate_get() to list all projects\"");
        console.log("  3. Start building with persistent memory!\n");
    }
    if (failed.length > 0) {
        console.log("Failed agents (configure manually):");
        failed.forEach((r) => console.log(`  • ${r.agent}: ${r.path}`));
        console.log(`\n  Manual guide: ${MEMSTATE_DOCS_URL}\n`);
    }
    console.log(`Dashboard: https://memstate.ai/dashboard`);
    console.log(`Docs:      ${MEMSTATE_DOCS_URL}\n`);
    rl.close();
}
// Allow direct execution
if (process.argv[1] && (process.argv[1].endsWith("setup.js") || process.argv[1].endsWith("setup.ts"))) {
    main().catch((err) => {
        console.error(`\nSetup failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    });
}
//# sourceMappingURL=setup.js.map