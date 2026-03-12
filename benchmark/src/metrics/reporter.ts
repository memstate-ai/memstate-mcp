import {
  BenchmarkResult,
  ComparisonResult,
  ScenarioScore,
  VerificationResult,
} from "../types";

/**
 * Generate human-readable reports from benchmark results.
 * Outputs both console-friendly text and markdown files.
 */

export function formatSingleResult(result: BenchmarkResult): string {
  const lines: string[] = [];
  const hr = "═".repeat(70);
  const thinHr = "─".repeat(70);

  lines.push(hr);
  lines.push(`  MEMORY BENCHMARK RESULTS: ${result.adapterName}`);
  lines.push(`  ${result.timestamp}`);
  lines.push(`  Model: ${result.agentConfig.model}`);
  lines.push(hr);
  lines.push("");

  // Aggregate scores
  lines.push("  AGGREGATE SCORES");
  lines.push(thinHr);
  lines.push(`  Overall Score:        ${formatScore(result.aggregate.overallScore)}`);
  lines.push(`  Accuracy:             ${formatScore(result.aggregate.meanAccuracy)}`);
  lines.push(`  Conflict Detection:   ${formatScore(result.aggregate.meanConflictDetection)}`);
  lines.push(`  Context Continuity:   ${formatScore(result.aggregate.meanContextContinuity)}`);
  lines.push(`  Token Efficiency:     ${formatScore(result.aggregate.meanTokenEfficiency)}`);
  lines.push(`  Total Tokens:         ${result.aggregate.totalTokensUsed.totalTokens.toLocaleString()}`);
  lines.push(`  Total Time:           ${(result.aggregate.totalTimeMs / 1000).toFixed(1)}s`);
  lines.push("");

  // Per-scenario breakdown
  lines.push("  SCENARIO BREAKDOWN");
  lines.push(thinHr);

  for (const scenario of result.scenarioScores) {
    lines.push(`  ${scenario.scenarioName}`);
    lines.push(`    Category: ${scenario.category}`);
    lines.push(`    Overall: ${formatScore(scenario.overallScore)}  |  Accuracy: ${formatScore(scenario.accuracyScore)}  |  Conflicts: ${formatScore(scenario.conflictDetectionScore)}  |  Continuity: ${formatScore(scenario.contextContinuityScore)}`);

    // Per-session verification results
    for (const session of scenario.sessionMetrics) {
      const passCount = session.verificationResults.filter((v) => v.passed).length;
      const total = session.verificationResults.length;
      lines.push(`    Session ${session.sessionId}: ${passCount}/${total} verifications passed, ${session.totalTokens.totalTokens} tokens`);

      for (const vr of session.verificationResults) {
        const icon = vr.passed ? "PASS" : "FAIL";
        lines.push(`      [${icon}] ${vr.question}`);
        if (!vr.passed) {
          lines.push(`             Expected: ${truncate(vr.expectedAnswer, 80)}`);
          lines.push(`             Got:      ${truncate(vr.actualAnswer, 80)}`);
          lines.push(`             Score:    ${vr.similarityScore.toFixed(2)}`);
        }
      }
    }
    lines.push("");
  }

  lines.push(hr);
  return lines.join("\n");
}

export function formatComparisonResult(comparison: ComparisonResult): string {
  const lines: string[] = [];
  const hr = "═".repeat(80);

  lines.push(hr);
  lines.push("  HEAD-TO-HEAD COMPARISON");
  lines.push(`  ${comparison.timestamp}`);
  lines.push(hr);
  lines.push("");

  // Comparison table
  const adapterNames = comparison.results.map((r) => r.adapterName);
  const colWidth = 18;

  // Header
  let header = "  " + "Metric".padEnd(24);
  for (const name of adapterNames) {
    header += name.padStart(colWidth);
  }
  header += "  Winner".padStart(colWidth);
  lines.push(header);
  lines.push("  " + "─".repeat(24 + adapterNames.length * colWidth + colWidth));

  // Rows
  for (const row of comparison.comparisonTable) {
    let line = "  " + row.metric.padEnd(24);
    for (const name of adapterNames) {
      const val = row.values[name];
      line += String(val).padStart(colWidth);
    }
    line += row.winner.padStart(colWidth);
    lines.push(line);
  }

  lines.push("");
  lines.push(`  WINNER: ${comparison.winner}`);
  lines.push(hr);

  // Per-scenario head-to-head
  lines.push("");
  lines.push("  PER-SCENARIO BREAKDOWN");
  lines.push("  " + "─".repeat(78));

  // Get all scenario IDs
  const scenarioIds = new Set<string>();
  for (const result of comparison.results) {
    for (const score of result.scenarioScores) {
      scenarioIds.add(score.scenarioId);
    }
  }

  for (const scenarioId of scenarioIds) {
    const scores: Record<string, ScenarioScore> = {};
    for (const result of comparison.results) {
      const score = result.scenarioScores.find((s) => s.scenarioId === scenarioId);
      if (score) scores[result.adapterName] = score;
    }

    const first = Object.values(scores)[0];
    if (!first) continue;

    lines.push(`\n  ${first.scenarioName} [${first.category}]`);
    for (const [adapter, score] of Object.entries(scores)) {
      lines.push(
        `    ${adapter}: Overall ${formatScore(score.overallScore)} | Accuracy ${formatScore(score.accuracyScore)} | Conflicts ${formatScore(score.conflictDetectionScore)} | Continuity ${formatScore(score.contextContinuityScore)}`
      );
    }
  }

  lines.push("");
  lines.push(hr);
  return lines.join("\n");
}

export function generateMarkdownReport(comparison: ComparisonResult): string {
  const lines: string[] = [];

  lines.push("# Memory MCP Benchmark Results\n");
  lines.push(`**Date:** ${comparison.timestamp}\n`);
  lines.push(`**Winner:** ${comparison.winner}\n`);

  // Summary table
  lines.push("## Summary\n");
  const adapterNames = comparison.results.map((r) => r.adapterName);
  lines.push(`| Metric | ${adapterNames.join(" | ")} | Winner |`);
  lines.push(`| --- | ${adapterNames.map(() => "---").join(" | ")} | --- |`);

  for (const row of comparison.comparisonTable) {
    const vals = adapterNames.map((n) => String(row.values[n]));
    lines.push(`| ${row.metric} | ${vals.join(" | ")} | ${row.winner} |`);
  }

  // Scoring methodology reminder
  lines.push("\n## Scoring Weights\n");
  lines.push("| Component | Weight |");
  lines.push("| --- | --- |");
  lines.push("| Accuracy (fact recall) | 40% |");
  lines.push("| Conflict Detection | 25% |");
  lines.push("| Context Continuity | 25% |");
  lines.push("| Token Efficiency | 10% |");

  // Detailed per-scenario
  lines.push("\n## Scenario Details\n");

  for (const result of comparison.results) {
    lines.push(`### ${result.adapterName}\n`);

    for (const scenario of result.scenarioScores) {
      lines.push(`#### ${scenario.scenarioName}\n`);
      lines.push(`- **Overall:** ${scenario.overallScore}/100`);
      lines.push(`- **Accuracy:** ${scenario.accuracyScore}/100`);
      lines.push(`- **Conflict Detection:** ${scenario.conflictDetectionScore}/100`);
      lines.push(`- **Context Continuity:** ${scenario.contextContinuityScore}/100`);
      lines.push(`- **Token Efficiency:** ${scenario.tokenEfficiencyScore}/100\n`);

      // Verification details
      lines.push("| Verification | Type | Score | Pass |");
      lines.push("| --- | --- | --- | --- |");
      for (const session of scenario.sessionMetrics) {
        for (const vr of session.verificationResults) {
          lines.push(
            `| ${truncate(vr.question, 50)} | ${vr.type} | ${vr.similarityScore.toFixed(2)} | ${vr.passed ? "PASS" : "FAIL"} |`
          );
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatScore(score: number): string {
  const bar = "█".repeat(Math.round(score / 5)) + "░".repeat(20 - Math.round(score / 5));
  return `${score.toFixed(1).padStart(6)}/100 ${bar}`;
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.substring(0, maxLen - 3) + "..." : s;
}
