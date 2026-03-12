import { v4 as uuidv4 } from "uuid";
import {
  BenchmarkOptions,
  BenchmarkResult,
  BenchmarkScenario,
  SessionMetrics,
  AgentConfig,
  ComparisonResult,
  MemoryAdapter,
} from "./types";
import { MCPMemoryAdapter, getPreset, MCPAdapterConfig, MockMemoryAdapter } from "./adapters";
import { ALL_SCENARIOS, getScenarioById } from "./scenarios";
import {
  runAgentLoop,
  buildSystemPrompt,
  buildVerificationPrompt,
} from "./agents";
import {
  scoreVerifications,
  calculateScenarioScore,
  calculateAggregateScore,
  compareResults,
  formatSingleResult,
  formatComparisonResult,
  generateSingleResultMarkdown,
  generateMarkdownReport,
  setJudgeConfig,
} from "./metrics";
import * as fs from "fs";
import * as path from "path";

/**
 * Benchmark Runner — orchestrates the full benchmark flow.
 *
 * Flow for each adapter:
 * 1. Initialize the MCP memory adapter
 * 2. For each scenario:
 *    a. Clean up any prior memory for this project
 *    b. For each session in order:
 *       i.   Run the agent loop with the session prompt
 *       ii.  Run verification queries
 *       iii. Score the results
 *    c. Calculate scenario score
 * 3. Calculate aggregate scores
 * 4. Generate report
 */

export async function runBenchmark(
  options: BenchmarkOptions
): Promise<ComparisonResult> {
  const agentConfig: AgentConfig = {
    model: options.model,
    provider: options.agentProvider,
    maxTokens: 4096,
    maxIterations: 20,
    temperature: 0,
  };

  // Configure the judge model
  setJudgeConfig({
    model: options.judgeModel,
    provider: options.judgeProvider,
  });

  const scenarios = selectScenarios(options.scenarios);
  const results: BenchmarkResult[] = [];

  const agentProviderLabel = options.agentProvider.provider === "anthropic"
    ? "anthropic"
    : options.agentProvider.baseUrl || "openai-compatible";
  const judgeProviderLabel = options.judgeProvider.provider === "anthropic"
    ? "anthropic"
    : options.judgeProvider.baseUrl || "openai-compatible";

  console.log(`\nMemory MCP Benchmark`);
  console.log(`${"─".repeat(50)}`);
  console.log(`Scenarios: ${scenarios.map((s) => s.id).join(", ")}`);
  console.log(`Adapters:  ${options.adapters.join(", ")}`);
  console.log(`Agent:     ${agentConfig.model} (${agentProviderLabel})`);
  console.log(`Judge:     ${options.judgeModel} (${judgeProviderLabel})`);
  console.log(`Runs:      ${options.runs}`);
  console.log(`Delay:     ${options.ingestionDelaySeconds}s (between store and verify)`);
  console.log(`${"─".repeat(50)}\n`);

  for (const adapterName of options.adapters) {
    console.log(`\n${"═".repeat(50)}`);
    console.log(`Running benchmark for: ${adapterName}`);
    console.log(`${"═".repeat(50)}`);

    const adapter = createAdapter(adapterName, options);
    if (!adapter) {
      console.error(`Unknown adapter: ${adapterName}. Skipping.`);
      continue;
    }

    // Resolve per-adapter AGENTS.md: check for AGENTS-<name>.md first, fall back to --agents-md
    const adapterAgentsMd = resolveAgentsMdPath(adapterName, options.agentsMdPath);
    const systemPrompt = buildSystemPrompt(adapterAgentsMd);
    if (adapterAgentsMd) {
      console.log(`  AGENTS.md: ${adapterAgentsMd}`);
    }

    try {
      await adapter.initialize();
    } catch (err) {
      console.error(
        `Failed to initialize ${adapterName}: ${err instanceof Error ? err.message : err}`
      );
      continue;
    }

    const allScenarioScores = [];

    for (const scenario of scenarios) {
      console.log(`\n  Scenario: ${scenario.name}`);
      console.log(`  ${"─".repeat(46)}`);

      const projectName = `${options.projectPrefix}-${scenario.id}-${uuidv4().slice(0, 8)}`;

      try {
      // Clean up any prior memory
      try {
        await adapter.deleteProject(projectName);
      } catch {
        // OK if project doesn't exist
      }

      const sessionMetrics: SessionMetrics[] = [];

      for (const session of scenario.sessions) {
        console.log(`    Session ${session.sessionNumber}: ${session.title}`);

        // Preload facts if specified (simulates prior sessions)
        if (session.preloadFacts) {
          for (const fact of session.preloadFacts) {
            await adapter.storeFact(projectName, fact.key, fact.value);
          }
        }

        // Run the agent loop for this session
        const agentResult = await runAgentLoop(session.agentPrompt, {
          config: agentConfig,
          adapter,
          systemPrompt,
          projectName,
          verbose: options.verbose,
        });

        console.log(
          `      Agent: ${agentResult.turns.length} turns, ${agentResult.totalTokens.totalTokens} tokens, ${(agentResult.totalTimeMs / 1000).toFixed(1)}s`
        );

        // Wait for async ingestion to complete (simulates realistic human pause)
        if (options.ingestionDelaySeconds > 0) {
          console.log(
            `      Waiting ${options.ingestionDelaySeconds}s for ingestion...`
          );
          await new Promise((r) =>
            setTimeout(r, options.ingestionDelaySeconds * 1000)
          );
        }

        // Run verification queries
        const answers = new Map<string, string>();
        for (const query of session.verificationQueries) {
          const verificationPrompt = buildVerificationPrompt(query.question);
          const verResult = await runAgentLoop(verificationPrompt, {
            config: { ...agentConfig, maxIterations: 10 },
            adapter,
            systemPrompt,
            projectName,
            verbose: options.verbose,
          });
          answers.set(query.id, verResult.finalResponse);
        }

        // Score verifications
        const verificationResults = await scoreVerifications(
          session.verificationQueries,
          answers
        );

        const passCount = verificationResults.filter((v) => v.passed).length;
        console.log(
          `      Verifications: ${passCount}/${verificationResults.length} passed`
        );

        sessionMetrics.push({
          sessionId: session.id,
          scenarioId: scenario.id,
          adapterName: adapter.name,
          totalTokens: agentResult.totalTokens,
          totalTimeMs: agentResult.totalTimeMs,
          iterationCount: agentResult.turns.length,
          memoryToolCallCount: agentResult.memoryToolCalls.length,
          verificationResults,
          agentTurns: agentResult.turns,
          errors: agentResult.errors,
        });
      }

      // Calculate scenario score
      const scenarioScore = calculateScenarioScore(
        scenario,
        sessionMetrics,
        adapter.name
      );

      console.log(
        `    Score: ${scenarioScore.overallScore}/100 (Accuracy: ${scenarioScore.accuracyScore}, Conflicts: ${scenarioScore.conflictDetectionScore}, Continuity: ${scenarioScore.contextContinuityScore})`
      );

      allScenarioScores.push(scenarioScore);

      // Clean up
      try {
        await adapter.deleteProject(projectName);
      } catch {
        // Best effort cleanup
      }

      } catch (scenarioErr) {
        console.error(
          `    ERROR in scenario ${scenario.id}: ${scenarioErr instanceof Error ? scenarioErr.message : String(scenarioErr)}`
        );
        console.error(`    Skipping scenario and continuing...`);
        // Best effort cleanup
        try { await adapter.deleteProject(projectName); } catch { /* ignore */ }
      }
    }

    // Calculate aggregate
    const benchmarkResult = calculateAggregateScore(
      allScenarioScores,
      agentConfig,
      adapter.name
    );

    console.log(`\n${formatSingleResult(benchmarkResult)}`);
    results.push(benchmarkResult);

    await adapter.disconnect();
  }

  // Compare results
  const comparison = compareResults(results);

  if (results.length > 1) {
    console.log(formatComparisonResult(comparison));
  }

  // Save results
  saveResults(options.outputDir, results, comparison);

  return comparison;
}

/**
 * Resolve per-adapter AGENTS.md path.
 * Looks for benchmark/AGENTS-<adapter>.md first, then falls back to --agents-md.
 */
function resolveAgentsMdPath(adapterName: string, defaultPath?: string): string | undefined {
  // Check for adapter-specific file: AGENTS-memstate.md, AGENTS-mem0.md, etc.
  const adapterSpecific = path.resolve(__dirname, `../../AGENTS-${adapterName.toLowerCase()}.md`);
  if (fs.existsSync(adapterSpecific)) {
    return adapterSpecific;
  }
  return defaultPath;
}

function selectScenarios(ids: string[]): BenchmarkScenario[] {
  if (ids.length === 0) return ALL_SCENARIOS;
  return ids
    .map((id) => getScenarioById(id))
    .filter((s): s is BenchmarkScenario => s !== undefined);
}

function createAdapter(
  name: string,
  options: BenchmarkOptions
): MemoryAdapter | null {
  // Built-in mock adapter for testing the pipeline
  if (name.toLowerCase() === "mock") {
    return new MockMemoryAdapter();
  }

  // Check presets
  const preset = getPreset(name);
  if (preset) {
    return new MCPMemoryAdapter(preset);
  }

  // Check for custom config file
  const configPath = path.resolve(options.outputDir, `${name}-adapter.json`);
  if (fs.existsSync(configPath)) {
    const config: MCPAdapterConfig = JSON.parse(
      fs.readFileSync(configPath, "utf-8")
    );
    return new MCPMemoryAdapter(config);
  }

  return null;
}

function saveResults(
  outputDir: string,
  results: BenchmarkResult[],
  comparison: ComparisonResult
): void {
  const dir = path.resolve(outputDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const savedFiles: string[] = [];

  // ── Per-adapter: detailed JSON + markdown (always saved) ──

  for (const result of results) {
    const prefix = `${result.adapterName.toLowerCase()}-${timestamp}`;

    // Full JSON with all agent turns, tool calls, verification details
    const jsonPath = path.join(dir, `${prefix}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    savedFiles.push(jsonPath);

    // Detailed markdown report
    const mdPath = path.join(dir, `${prefix}.md`);
    fs.writeFileSync(mdPath, generateSingleResultMarkdown(result));
    savedFiles.push(mdPath);
  }

  // ── Comparison: JSON + markdown (when multiple adapters) ──

  if (results.length > 1) {
    const compJsonPath = path.join(dir, `comparison-${timestamp}.json`);
    fs.writeFileSync(compJsonPath, JSON.stringify(comparison, null, 2));
    savedFiles.push(compJsonPath);

    const compMdPath = path.join(dir, `comparison-${timestamp}.md`);
    fs.writeFileSync(compMdPath, generateMarkdownReport(comparison));
    savedFiles.push(compMdPath);
  }

  // ── Summary index: a latest-results.json that always points to the most recent run ──

  const summaryIndex = {
    timestamp: new Date().toISOString(),
    adapters: results.map((r) => ({
      name: r.adapterName,
      overallScore: r.aggregate.overallScore,
      jsonFile: path.basename(savedFiles.find((f) => f.endsWith(".json") && f.includes(r.adapterName.toLowerCase()))!),
      mdFile: path.basename(savedFiles.find((f) => f.endsWith(".md") && f.includes(r.adapterName.toLowerCase()))!),
    })),
    winner: comparison.winner,
    agentModel: results[0]?.agentConfig.model,
    agentProvider: results[0]?.agentConfig.provider.provider,
  };
  fs.writeFileSync(
    path.join(dir, "latest-results.json"),
    JSON.stringify(summaryIndex, null, 2)
  );

  console.log(`\nResults saved to: ${dir}`);
  for (const f of savedFiles) {
    console.log(`  ${path.basename(f)}`);
  }
}
