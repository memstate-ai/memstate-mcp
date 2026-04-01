#!/usr/bin/env node
"use strict";
/**
 * memstate init — Project-level agent instruction file generator
 *
 * Fetches the canonical instructions from https://memstate.ai/files/use-memstate-memory.md
 * and creates agent-specific rule files for the current project directory.
 *
 * Usage: npx @memstate/mcp init
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
const readline = __importStar(require("readline"));
const INSTRUCTIONS_URL = "https://memstate.ai/files/use-memstate-memory.md";
const FALLBACK_INSTRUCTIONS = `# Memstate MCP - Memory Storage

This project uses Memstate MCP for persistent, versioned memory across sessions.

## REQUIRED: Start and end every task with memory

**BEFORE starting any task**, load existing context so you don't redo past work or revert intentional decisions:
\`\`\`
memstate_get(project_id="<your_project>")
\`\`\`

**AFTER completing any task**, save what you did so the next session has context:
\`\`\`
memstate_remember(project_id="<your_project>", content="## Task Summary\\n- What was done\\n- Key decisions made\\n- Files modified", source="agent")
\`\`\`

These two calls are mandatory. Skipping them means the next session starts blind.

## Tool reference

| Tool | When to use |
|------|-------------|
| memstate_get | **Start of every task.** Browse project tree or fetch content at a keypath. |
| memstate_remember | **End of every task.** Save markdown summaries, notes, decisions. |
| memstate_search | Find memories by meaning when you don't know the exact keypath. |
| memstate_set | Store a single key=value fact (e.g. config.port). Not for summaries. |
| memstate_history | View version history of a keypath. |
| memstate_delete | Soft-delete a keypath (history preserved). |

## Project naming
Use a short snake_case name matching your repo or topic (e.g. my_app, api_service). All related memories should share the same project_id.`;
async function fetchInstructions() {
    try {
        const res = await fetch(INSTRUCTIONS_URL);
        if (res.ok) {
            const text = await res.text();
            if (text.includes("memstate_get"))
                return text;
        }
    }
    catch {
        // fall through to fallback
    }
    console.log("  (Using bundled instructions — could not reach memstate.ai)");
    return FALLBACK_INSTRUCTIONS;
}
function replaceProjectId(content, projectId) {
    return content
        .replace(/<your_project>/g, projectId)
        .replace(/my_project/g, projectId);
}
function promptUser(rl, question) {
    return new Promise((resolve) => rl.question(question, resolve));
}
async function main() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const cwd = process.cwd();
    console.log("\n╔══════════════════════════════════════════════╗");
    console.log("║     Memstate AI — Project Init               ║");
    console.log("║     Creating agent instruction files         ║");
    console.log("╚══════════════════════════════════════════════╝\n");
    console.log(`Project directory: ${cwd}\n`);
    const projectId = await promptUser(rl, "Project ID (short name, e.g. 'my_app'): ");
    const trimmedId = projectId.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_") || "my_project";
    console.log("\nFetching latest instructions...");
    const instructions = await fetchInstructions();
    const content = replaceProjectId(instructions, trimmedId);
    const filesToCreate = [
        {
            filename: "CLAUDE.md",
            content,
            description: "Claude Code / Claude Desktop",
        },
        {
            filename: "AGENTS.md",
            content,
            description: "OpenAI Codex, Gemini CLI, and other agents",
        },
        {
            filename: "use-memstate-memory.mdc",
            dir: ".cursor/rules",
            content: `---\nalwaysApply: true\n---\n\n${content}`,
            description: "Cursor rules (always active)",
        },
        {
            filename: ".clinerules",
            content,
            description: "Cline (VS Code)",
        },
        {
            filename: "rules.md",
            dir: ".windsurf",
            content,
            description: "Windsurf",
        },
    ];
    console.log("\nFiles to create:");
    filesToCreate.forEach((f, i) => {
        const fullPath = f.dir ? path.join(f.dir, f.filename) : f.filename;
        const exists = fs.existsSync(path.join(cwd, fullPath));
        console.log(`  ${i + 1}. ${fullPath} ${exists ? "(will append)" : "(new)"} — ${f.description}`);
    });
    const confirm = await promptUser(rl, "\nCreate these files? (y/n): ");
    if (confirm.toLowerCase() !== "y") {
        console.log("\nCancelled. Run 'npx @memstate/mcp init' again anytime.");
        rl.close();
        return;
    }
    console.log("\nCreating files...");
    for (const file of filesToCreate) {
        const dir = file.dir ? path.join(cwd, file.dir) : cwd;
        const filePath = path.join(dir, file.filename);
        const displayPath = file.dir ? path.join(file.dir, file.filename) : file.filename;
        if (file.dir && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (fs.existsSync(filePath)) {
            const existing = fs.readFileSync(filePath, "utf-8");
            if (existing.includes("memstate_get") || existing.includes("Memstate")) {
                console.log(`  ⏭️  Skipped ${displayPath} (already has Memstate instructions)`);
                continue;
            }
            fs.appendFileSync(filePath, "\n\n" + file.content, "utf-8");
            console.log(`  ✅ Appended to ${displayPath}`);
        }
        else {
            fs.writeFileSync(filePath, file.content, "utf-8");
            console.log(`  ✅ Created ${displayPath}`);
        }
    }
    console.log("\n═══════════════════════════════════════════════");
    console.log("✅ Project initialized!\n");
    console.log("Your AI agents will now:");
    console.log(`  • Load memory before tasks (project: "${trimmedId}")`);
    console.log("  • Save summaries after tasks automatically");
    console.log("  • Never lose context between sessions\n");
    console.log("Commit these files to share Memstate setup with your team.\n");
    rl.close();
}
// Allow direct execution
if (process.argv[1] && (process.argv[1].endsWith("init.js") || process.argv[1].endsWith("init.ts"))) {
    main().catch((err) => {
        console.error(`\nInit failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    });
}
//# sourceMappingURL=init.js.map