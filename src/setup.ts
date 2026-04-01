#!/usr/bin/env node
/**
 * memstate setup — Interactive CLI setup tool
 *
 * Detects installed AI agents (Claude Desktop, Cursor, Cline, Windsurf, etc.)
 * and automatically adds the Memstate MCP server configuration.
 *
 * Usage: npx @memstate/mcp setup
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";
import { execSync } from "child_process";

const MEMSTATE_API_KEYS_URL = "https://memstate.ai/dashboard/api-keys?utm_source=cli&utm_medium=setup";
const MEMSTATE_DOCS_URL = "https://memstate.ai/docs/setup";

const MCP_CONFIG_TEMPLATE = (apiKey: string) => ({
  command: "npx",
  args: ["-y", "@memstate/mcp"],
  env: {
    MEMSTATE_API_KEY: apiKey,
  },
});

interface AgentConfig {
  name: string;
  configPaths: string[];
  configKey: string;
  isJsonFile: boolean;
  /** If true, use the `claude mcp add` CLI instead of direct JSON editing */
  useCli?: boolean;
}

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/** Check whether the `claude` CLI is available on PATH */
function claudeCliAvailable(): boolean {
  try {
    execSync("claude --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install Memstate into Claude Code via the official `claude mcp add` CLI.
 * Uses --scope user so it applies across all projects.
 * Returns { success, message }.
 */
function installViaClaudeCli(apiKey: string): { success: boolean; message: string } {
  try {
    // Remove any existing memstate entry first (ignore errors if not present)
    try {
      execSync("claude mcp remove memstate --scope user", { stdio: "ignore" });
    } catch {
      // Not present — that's fine
    }

    const cmd = `claude mcp add --scope user --env MEMSTATE_API_KEY=${apiKey} -- memstate npx -y @memstate/mcp`;
    execSync(cmd, { stdio: "pipe" });
    return { success: true, message: "✅ Configured via claude CLI (user scope)" };
  } catch (err) {
    return {
      success: false,
      message: `❌ claude CLI failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function getAgentConfigs(): AgentConfig[] {
  const home = os.homedir();
  const isWindows = process.platform === "win32";
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");

  return [
    {
      name: "Claude Code",
      configPaths: [path.join(home, ".claude.json")],
      configKey: "mcpServers",
      isJsonFile: true,
      useCli: true, // Prefer `claude mcp add` — the official supported method
    },
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

function detectInstalledAgents(agents: AgentConfig[]): AgentConfig[] {
  return agents.filter((agent) =>
    agent.configPaths.some((p) => {
      const expanded = expandHome(p);
      return fs.existsSync(path.dirname(expanded));
    })
  );
}

function readJsonConfig(filePath: string): Record<string, unknown> {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // ignore parse errors, start fresh
  }
  return {};
}

function writeJsonConfig(filePath: string, config: Record<string, unknown>): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function configureAgent(agent: AgentConfig, apiKey: string): { success: boolean; path: string; message: string } {
  // Claude Code: prefer the official CLI
  if (agent.useCli) {
    const hasCli = claudeCliAvailable();
    if (hasCli) {
      const result = installViaClaudeCli(apiKey);
      return { ...result, path: "~/.claude.json (via claude CLI)" };
    }
    // CLI not found — fall back to direct JSON edit with a warning
    console.log("  ⚠️  claude CLI not found — falling back to direct JSON edit");
  }

  const configPath = agent.configPaths.find((p) => fs.existsSync(expandHome(p))) || agent.configPaths[0];
  const expandedPath = expandHome(configPath);

  try {
    const config = readJsonConfig(expandedPath);
    const mcpServers = (config[agent.configKey] as Record<string, unknown>) || {};
    mcpServers["memstate"] = MCP_CONFIG_TEMPLATE(apiKey);
    config[agent.configKey] = mcpServers;
    writeJsonConfig(expandedPath, config);
    return { success: true, path: expandedPath, message: "✅ Configured successfully" };
  } catch (err) {
    return {
      success: false,
      path: expandedPath,
      message: `❌ Failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function openBrowser(url: string): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { exec } = require("child_process");
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? `open "${url}"` :
    platform === "win32" ? `start "" "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function promptUser(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

export async function main(): Promise<void> {
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
    const method = agent.useCli && claudeCliAvailable() ? " (via claude CLI)" : "";
    console.log(`  ${i + 1}. ${agent.name}${method}`);
  });

  const selection = await promptUser(
    rl,
    "\nConfigure all detected agents? (y/n, or enter numbers like '1,3'): "
  );

  let agentsToSetup: AgentConfig[] = [];
  if (selection.toLowerCase() === "y" || selection.trim() === "") {
    agentsToSetup = detectedAgents;
  } else if (selection.toLowerCase() === "n") {
    console.log("\nSetup cancelled. Run 'npx @memstate/mcp setup' again anytime.");
    rl.close();
    return;
  } else {
    const indices = selection.split(",").map((s) => parseInt(s.trim(), 10) - 1);
    agentsToSetup = indices
      .filter((i) => i >= 0 && i < detectedAgents.length)
      .map((i) => detectedAgents[i]);
  }

  // Step 3: Configure
  console.log("\nStep 3: Configuring agents...");
  console.log("──────────────────────────────");
  const results: { agent: string; success: boolean; path: string; message: string }[] = [];

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
