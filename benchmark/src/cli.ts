#!/usr/bin/env node

import { Command } from "commander";
import { runBenchmark } from "./runner";
import { ALL_SCENARIOS } from "./scenarios";
import { listPresets } from "./adapters";
import { BenchmarkOptions } from "./types";

const program = new Command();

program
  .name("memory-benchmark")
  .description(
    "Head-to-head benchmark for MCP memory systems.\n\n" +
    "Runs realistic multi-session coding agent scenarios to measure:\n" +
    "  - Fact recall accuracy\n" +
    "  - Conflict/contradiction detection\n" +
    "  - Cross-session context continuity\n" +
    "  - Token efficiency"
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
  .option(
    "-m, --model <model>",
    "Claude model to use for the agent",
    "claude-sonnet-4-20250514"
  )
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
    const options: BenchmarkOptions = {
      adapters: opts.adapters,
      scenarios: opts.scenarios,
      model: opts.model,
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
  .description("List available scenarios and adapter presets")
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

program.parse();
