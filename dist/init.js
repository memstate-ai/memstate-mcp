#!/usr/bin/env node
"use strict";
/**
 * memstate init — Project-level agent instruction file generator
 *
 * Creates AGENTS.md, CLAUDE.md, GEMINI.md, .clinerules, and other
 * agent instruction files for the current project directory.
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
function agentsMdContent(projectId) {
    return `# Memstate MCP - Memory Storage

This project uses [Memstate MCP](https://memstate.ai) for versioned, structured memory.
Keypaths are hierarchical dot-separated paths (e.g. \`project.${projectId}.database\`).

## Which tool when

- **memstate_remember** — PREFERRED for markdown, task summaries, meeting notes, decisions.
  The server automatically extracts keypaths and creates structured memories. Use after tasks.
- **memstate_set** — Only for a single keypath = single short value (e.g. \`config.port = "8080"\`).
  Not for summaries or multi-fact content.
- **memstate_get** — Browse the project memory tree, fetch existing knowledge before starting tasks.
- **memstate_search** — Find memories by meaning/semantic search when you don't know the keypath.
- **memstate_history** — View version history of a keypath or memory entry.

## Before each task

Always check what already exists to avoid duplicate work and understand prior decisions:

\`\`\`
memstate_get(project_id="${projectId}")
\`\`\`

Or search by topic:

\`\`\`
memstate_search(query="authentication", project_id="${projectId}")
\`\`\`

## After each task

**Preferred — save a markdown summary:**

\`\`\`
memstate_remember(
  project_id="${projectId}",
  content="## Task Summary\\n- What was done\\n- Key decisions made\\n- Files modified\\n- Next steps",
  source="agent"
)
\`\`\`

**Only for a single value:**

\`\`\`
memstate_set(project_id="${projectId}", keypath="config.port", value="8080")
\`\`\`

## Keypath conventions

Keypaths are auto-prefixed with \`project.${projectId}.\`. Use short, descriptive project IDs.

Example keypaths:
- \`database.type\` → "PostgreSQL"
- \`auth.provider\` → "SuperTokens"
- \`api.port\` → "8080"
- \`deploy.platform\` → "Coolify"
`;
}
function clineRulesContent(projectId) {
    return `# Memstate Memory Rules

## Before each task
- Run memstate_get(project_id="${projectId}") to load existing context
- Search for relevant memories: memstate_search(query="<topic>", project_id="${projectId}")

## After each task
- Save a summary: memstate_remember(project_id="${projectId}", content="## Summary\\n...", source="agent")

## Key principles
- Always check memory before starting — never re-explain what's already stored
- Prefer memstate_remember for summaries, memstate_set only for single key=value facts
- Use short project IDs (e.g. "${projectId}" not "my-full-application-name")
`;
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
    const projectId = await promptUser(rl, "Project ID (short name, e.g. 'myapp'): ");
    const trimmedId = projectId.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "-") || "myproject";
    const filesToCreate = [
        {
            filename: "AGENTS.md",
            content: agentsMdContent(trimmedId),
            description: "Universal agent instructions (OpenAI Codex, Gemini CLI, etc.)",
        },
        {
            filename: "CLAUDE.md",
            content: agentsMdContent(trimmedId),
            description: "Claude-specific instructions",
        },
        {
            filename: "GEMINI.md",
            content: agentsMdContent(trimmedId),
            description: "Gemini CLI instructions",
        },
        {
            filename: ".clinerules",
            content: clineRulesContent(trimmedId),
            description: "Cline (VS Code) rules",
        },
    ];
    console.log("\nFiles to create:");
    filesToCreate.forEach((f, i) => {
        const exists = fs.existsSync(path.join(cwd, f.filename));
        console.log(`  ${i + 1}. ${f.filename} ${exists ? "(will overwrite)" : "(new)"} — ${f.description}`);
    });
    const confirm = await promptUser(rl, "\nCreate these files? (y/n): ");
    if (confirm.toLowerCase() !== "y") {
        console.log("\nCancelled. Run 'npx @memstate/mcp init' again anytime.");
        rl.close();
        return;
    }
    console.log("\nCreating files...");
    for (const file of filesToCreate) {
        const filePath = path.join(cwd, file.filename);
        fs.writeFileSync(filePath, file.content, "utf-8");
        console.log(`  ✅ Created ${file.filename}`);
    }
    console.log("\n═══════════════════════════════════════════════");
    console.log("✅ Project initialized!\n");
    console.log("Your AI agents will now:");
    console.log(`  • Check memory before tasks (project: "${trimmedId}")`);
    console.log("  • Save summaries after tasks automatically");
    console.log("  • Never re-explain your architecture\n");
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