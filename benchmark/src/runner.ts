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
import { MCPMemoryAdapter, getPreset, MCPAdapterConfig } from "./adapters";
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
  generateMarkdownReport,
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
    maxTokens: 4096,
    maxIterations: 20,
    temperature: 0,
  };

  const systemPrompt = buildSystemPrompt(options.agentsMdPath);
  const scenarios = selectScenarios(options.scenarios);
  const results: BenchmarkResult[] = [];

  console.log(`\nMemory MCP Benchmark`);
  console.log(`${"─".repeat(50)}`);
  console.log(`Scenarios: ${scenarios.map((s) => s.id).join(", ")}`);
  console.log(`Adapters:  ${options.adapters.join(", ")}`);
  console.log(`Model:     ${agentConfig.model}`);
  console.log(`Runs:      ${options.runs}`);
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

function selectScenarios(ids: string[]): BenchmarkScenario[] {
  if (ids.length === 0) return ALL_SCENARIOS;
  return ids
    .map((id) => getScenarioById(id))
    .filter((s): s is BenchmarkScenario => s !== undefined);
}

function createAdapter(
  name: string,
  options: BenchmarkOptions
): MCPMemoryAdapter | null {
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

  // Save raw JSON results
  for (const result of results) {
    const filename = `${result.adapterName.toLowerCase()}-${result.benchmarkId}.json`;
    fs.writeFileSync(
      path.join(dir, filename),
      JSON.stringify(result, null, 2)
    );
  }

  // Save comparison
  if (results.length > 1) {
    fs.writeFileSync(
      path.join(dir, `comparison-${Date.now()}.json`),
      JSON.stringify(comparison, null, 2)
    );

    // Save markdown report
    const markdown = generateMarkdownReport(comparison);
    fs.writeFileSync(path.join(dir, `results.md`), markdown);
  }

  console.log(`\nResults saved to: ${dir}`);
}
