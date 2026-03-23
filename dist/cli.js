#!/usr/bin/env node
"use strict";
/**
 * memstate CLI — Entry point for setup and init commands
 *
 * Usage:
 *   npx @memstate/mcp setup   — Auto-configure AI agents with Memstate MCP
 *   npx @memstate/mcp init    — Create agent instruction files for current project
 */
Object.defineProperty(exports, "__esModule", { value: true });
const command = process.argv[2];
async function main() {
    switch (command) {
        case "setup": {
            const { main: setupMain } = await import("./setup.js");
            await setupMain();
            break;
        }
        case "init": {
            const { main: initMain } = await import("./init.js");
            await initMain();
            break;
        }
        default: {
            console.log(`
Memstate AI CLI

Usage:
  npx @memstate/mcp setup   Auto-detect and configure AI agents
  npx @memstate/mcp init    Create AGENTS.md and agent instruction files

Examples:
  npx @memstate/mcp setup   # Set up Claude, Cursor, Cline, Windsurf automatically
  npx @memstate/mcp init    # Create AGENTS.md for your project

Learn more: https://memstate.ai/docs/setup
      `.trim());
            break;
        }
    }
}
main().catch((err) => {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map