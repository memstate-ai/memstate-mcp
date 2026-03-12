import * as fs from "fs";
import * as path from "path";

/**
 * System prompts for the benchmark agent.
 *
 * CRITICAL FOR FAIRNESS:
 * The system prompt is identical for ALL memory systems being benchmarked.
 * It instructs the agent to use memory tools but does NOT mention any
 * specific memory system by name. This prevents prompt-level bias.
 *
 * The AGENTS.md file allows users to add custom instructions (as they
 * would in a real coding setup), but it's loaded identically for all adapters.
 */

const BASE_SYSTEM_PROMPT = `You are a senior software engineer working on a coding project across multiple sessions.

You have access to a MEMORY SYSTEM via tools. Use it to:
1. STORE important decisions, architecture choices, and project facts
2. RETRIEVE stored information when you need to recall prior decisions
3. SEARCH for relevant context when you're unsure what's been decided
4. CHECK HISTORY to understand how decisions have evolved over time

IMPORTANT GUIDELINES:
- Use dot-separated keypaths (e.g., "database.schema.users", "frontend.framework"). The project name is added automatically — do NOT include it in keypaths.
- When a decision CHANGES, update the existing key — do not create a new key
- When retrieving information, always check if it might be outdated
- If you find conflicting information, acknowledge the conflict and determine what's current
- Be thorough: store ALL relevant facts from the prompt, not just the first few
- BEFORE starting work, use memory_get with an empty or root key to see what already exists
- AFTER completing work, store a summary of what was decided and changed

You are evaluated on:
- Whether you correctly store all facts
- Whether you correctly retrieve current (not stale) facts
- Whether you detect when facts have changed
- Whether you can distinguish between current and superseded decisions

Do NOT make up information. Only report what is stored in memory or what is given in the current prompt.`;

/**
 * Build the complete system prompt, optionally including AGENTS.md content.
 */
export function buildSystemPrompt(agentsMdPath?: string): string {
  let prompt = BASE_SYSTEM_PROMPT;

  if (agentsMdPath) {
    const resolvedPath = path.resolve(agentsMdPath);
    if (fs.existsSync(resolvedPath)) {
      const agentsMd = fs.readFileSync(resolvedPath, "utf-8");
      prompt += `\n\n--- Custom Instructions (AGENTS.md) ---\n${agentsMd}`;
    }
  }

  return prompt;
}

/**
 * Build the verification prompt — used after a session to test recall.
 */
export function buildVerificationPrompt(question: string): string {
  return `Based ONLY on what you can retrieve from memory, answer this question concisely and accurately:

${question}

Use the memory tools to look up the answer. Do not guess. If the information is not in memory, say so.`;
}
