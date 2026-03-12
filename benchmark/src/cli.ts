#!/usr/bin/env node

import { Command } from "commander";
import { runBenchmark } from "./runner";
import { ALL_SCENARIOS } from "./scenarios";
import { listPresets } from "./adapters";
import { BenchmarkOptions, LLMProviderConfig, PROVIDER_PRESETS } from "./types";

const program = new Command();

program
  .name("memory-benchmark")
  .description(
    "Head-to-head benchmark for MCP memory systems.\n\n" +
    "Runs realistic multi-session coding agent scenarios to measure:\n" +
    "  - Fact recall accuracy\n" +
    "  - Conflict/contradiction detection\n" +
    "  - Cross-session context continuity\n" +
    "  - Token efficiency\n\n" +
    "Supports multiple LLM providers for both agent and judge:\n" +
    "  anthropic, openai, gemini, openrouter, qwen, deepseek, groq, together, fireworks, ollama"
  )
  .version("1.0.0");

program
  .command("run")
  .description("Run the benchmark against one or more memory adapters")
  .option(
    "-a, --adapters <adapters...>",
    "Memory adapters to benchmark (e.g., memstate mem0)",
    ["memstate"]
  )
  .option(
    "-s, --scenarios <scenarios...>",
    "Scenario IDs to run (omit for all)",
    []
  )
  // Agent model options
  .option(
    "-m, --model <model>",
    "Model for the agent (e.g., claude-sonnet-4-20250514, gpt-4o, gemini-2.0-flash)",
    "claude-sonnet-4-20250514"
  )
  .option(
    "--agent-provider <provider>",
    "LLM provider for agent: anthropic, openai, gemini, openrouter, qwen, deepseek, groq, together, fireworks, ollama, or a base URL",
    "anthropic"
  )
  .option(
    "--agent-api-key <key>",
    "API key for the agent provider (falls back to env vars)"
  )
  // Judge model options
  .option(
    "--judge-model <model>",
    "Model for the judge/scorer (e.g., claude-haiku-4-5-20251001, gpt-4o-mini)",
    "claude-haiku-4-5-20251001"
  )
  .option(
    "--judge-provider <provider>",
    "LLM provider for judge: anthropic, openai, gemini, openrouter, qwen, deepseek, groq, together, fireworks, ollama, or a base URL",
    "anthropic"
  )
  .option(
    "--judge-api-key <key>",
    "API key for the judge provider (falls back to env vars)"
  )
  // Other options
  .option(
    "-r, --runs <number>",
    "Number of runs for statistical significance",
    "1"
  )
  .option(
    "-o, --output <dir>",
    "Output directory for results",
    "./benchmark-results"
  )
  .option(
    "--agents-md <path>",
    "Path to AGENTS.md for custom instructions"
  )
  .option(
    "-p, --project-prefix <prefix>",
    "Project name prefix for memory isolation",
    "bench"
  )
  .option("-v, --verbose", "Verbose logging", false)
  .action(async (opts) => {
    const agentProvider = resolveProvider(opts.agentProvider, opts.agentApiKey);
    const judgeProvider = resolveProvider(opts.judgeProvider, opts.judgeApiKey);

    const options: BenchmarkOptions = {
      adapters: opts.adapters,
      scenarios: opts.scenarios,
      model: opts.model,
      agentProvider,
      judgeModel: opts.judgeModel,
      judgeProvider,
      runs: parseInt(opts.runs, 10),
      outputDir: opts.output,
      agentsMdPath: opts.agentsMd,
      verbose: opts.verbose,
      projectPrefix: opts.projectPrefix,
    };

    try {
      const comparison = await runBenchmark(options);
      console.log(`\nBenchmark complete. Winner: ${comparison.winner}`);
      process.exit(0);
    } catch (err) {
      console.error(
        "Benchmark failed:",
        err instanceof Error ? err.message : err
      );
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List available scenarios, adapter presets, and LLM providers")
  .action(() => {
    console.log("\nAvailable Scenarios:");
    console.log("─".repeat(60));
    for (const scenario of ALL_SCENARIOS) {
      console.log(`  ${scenario.id}`);
      console.log(`    ${scenario.name}`);
      console.log(`    Category: ${scenario.category}`);
      console.log(`    Sessions: ${scenario.sessions.length}`);
      console.log(`    ${scenario.description}`);
      console.log();
    }

    console.log("\nAdapter Presets:");
    console.log("─".repeat(60));
    for (const preset of listPresets()) {
      console.log(`  ${preset}`);
    }
    console.log(
      "\n  Custom adapters: place a <name>-adapter.json in the output directory."
    );

    console.log("\n\nLLM Provider Presets:");
    console.log("─".repeat(60));
    for (const [name, config] of Object.entries(PROVIDER_PRESETS)) {
      const url = config.baseUrl || "(native SDK)";
      console.log(`  ${name.padEnd(14)} ${config.provider.padEnd(20)} ${url}`);
    }
    console.log(
      "\n  Custom: pass a base URL directly (e.g., --agent-provider https://my-server.com/v1)"
    );
    console.log();
  });

program
  .command("compare")
  .description("Compare results from previous runs")
  .argument("<files...>", "JSON result files to compare")
  .action(async (files: string[]) => {
    const { compareResults } = await import("./metrics/scorer");
    const { formatComparisonResult, generateMarkdownReport } = await import("./metrics/reporter");
    const fs = await import("fs");
    const path = await import("path");

    const results = files.map((f: string) => {
      const content = fs.readFileSync(path.resolve(f), "utf-8");
      return JSON.parse(content);
    });

    const comparison = compareResults(results);
    console.log(formatComparisonResult(comparison));

    const markdown = generateMarkdownReport(comparison);
    fs.writeFileSync("comparison-results.md", markdown);
    console.log("Markdown report saved to: comparison-results.md");
  });

/**
 * Resolve a provider string to an LLMProviderConfig.
 * Accepts:
 *   - A preset name: "anthropic", "openai", "gemini", "qwen", etc.
 *   - A base URL: "https://api.example.com/v1" → treated as openai-compatible
 */
function resolveProvider(providerStr: string, apiKey?: string): LLMProviderConfig {
  // Mock provider for pipeline testing
  if (providerStr.toLowerCase() === "mock") {
    return { provider: "mock" };
  }

  // Check presets
  const preset = PROVIDER_PRESETS[providerStr.toLowerCase()];
  if (preset) {
    return { ...preset, ...(apiKey ? { apiKey } : {}) };
  }

  // If it looks like a URL, treat as openai-compatible
  if (providerStr.startsWith("http://") || providerStr.startsWith("https://")) {
    return {
      provider: "openai-compatible",
      baseUrl: providerStr,
      ...(apiKey ? { apiKey } : {}),
    };
  }

  // Default: treat as anthropic
  console.warn(`Unknown provider "${providerStr}", defaulting to anthropic`);
  return { provider: "anthropic", ...(apiKey ? { apiKey } : {}) };
}

program.parse();
