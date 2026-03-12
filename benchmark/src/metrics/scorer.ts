import Anthropic from "@anthropic-ai/sdk";
import {
  SessionMetrics,
  VerificationResult,
  VerificationQuery,
  ScenarioScore,
  BenchmarkResult,
  AggregateScore,
  TokenUsage,
  BenchmarkScenario,
  AgentConfig,
  ComparisonResult,
  ComparisonRow,
} from "../types";

/**
 * Semantic Similarity Scorer
 *
 * Uses Claude to judge semantic similarity between expected and actual answers.
 * This is critical for fairness: we don't do exact string matching because
 * different memory systems may phrase answers differently.
 *
 * The judge model is given ONLY the question, expected answer, and actual answer.
 * It does NOT know which memory system produced the answer.
 */
export async function scoreSimilarity(
  question: string,
  expectedAnswer: string,
  actualAnswer: string
): Promise<number> {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 100,
    temperature: 0,
    system: `You are a strict grading judge. Score semantic similarity between an expected answer and an actual answer on a scale of 0.0 to 1.0.

Rules:
- 1.0 = semantically identical (same meaning, possibly different wording)
- 0.8+ = mostly correct with minor details missing
- 0.5-0.8 = partially correct, important details wrong or missing
- 0.2-0.5 = mostly wrong but has some relevant information
- 0.0-0.2 = completely wrong or unrelated

CRITICAL: If the actual answer reports OUTDATED/SUPERSEDED information as current, score it LOW (0.0-0.3) even if the outdated info was once correct.

Respond with ONLY a decimal number between 0.0 and 1.0. Nothing else.`,
    messages: [
      {
        role: "user",
        content: `Question: ${question}\n\nExpected Answer: ${expectedAnswer}\n\nActual Answer: ${actualAnswer}`,
      },
    ],
  });

  const text = (response.content[0] as Anthropic.TextBlock).text.trim();
  const score = parseFloat(text);
  return isNaN(score) ? 0.0 : Math.max(0, Math.min(1, score));
}

/**
 * Score all verification queries for a session.
 */
export async function scoreVerifications(
  queries: VerificationQuery[],
  answers: Map<string, string>
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  for (const query of queries) {
    const actualAnswer = answers.get(query.id) || "[No answer provided]";
    const similarityScore = await scoreSimilarity(
      query.question,
      query.expectedAnswer,
      actualAnswer
    );

    results.push({
      queryId: query.id,
      question: query.question,
      expectedAnswer: query.expectedAnswer,
      actualAnswer,
      similarityScore,
      passed: similarityScore >= (query.weight && query.weight > 2.0 ? 0.7 : 0.6),
      type: query.type,
      weight: query.weight || 1.0,
    });
  }

  return results;
}

/**
 * Calculate scenario score from session metrics.
 */
export function calculateScenarioScore(
  scenario: BenchmarkScenario,
  sessionMetrics: SessionMetrics[],
  adapterName: string
): ScenarioScore {
  // Accuracy: weighted average of verification scores
  let totalWeight = 0;
  let weightedSum = 0;
  let conflictWeight = 0;
  let conflictSum = 0;
  let continuityWeight = 0;
  let continuitySum = 0;

  for (const session of sessionMetrics) {
    for (const vr of session.verificationResults) {
      totalWeight += vr.weight;
      weightedSum += vr.similarityScore * vr.weight;

      if (vr.type === "conflict_detection" || vr.type === "decision_tracking") {
        conflictWeight += vr.weight;
        conflictSum += vr.similarityScore * vr.weight;
      }
      if (vr.type === "context_continuity") {
        continuityWeight += vr.weight;
        continuitySum += vr.similarityScore * vr.weight;
      }
    }
  }

  const accuracyScore = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;
  const conflictDetectionScore =
    conflictWeight > 0 ? (conflictSum / conflictWeight) * 100 : 100;
  const contextContinuityScore =
    continuityWeight > 0 ? (continuitySum / continuityWeight) * 100 : 100;

  // Token efficiency: compare to a baseline (lower is better)
  const totalTokens = sessionMetrics.reduce(
    (sum, s) => sum + s.totalTokens.totalTokens,
    0
  );
  // Baseline: 10000 tokens per session is "expected"
  const expectedTokens = sessionMetrics.length * 10000;
  const tokenEfficiencyScore = Math.max(
    0,
    Math.min(100, (expectedTokens / Math.max(totalTokens, 1)) * 100)
  );

  // Overall: weighted composite
  const overallScore =
    accuracyScore * 0.40 +
    conflictDetectionScore * 0.25 +
    contextContinuityScore * 0.25 +
    tokenEfficiencyScore * 0.10;

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    category: scenario.category,
    adapterName,
    accuracyScore: round(accuracyScore),
    tokenEfficiencyScore: round(tokenEfficiencyScore),
    conflictDetectionScore: round(conflictDetectionScore),
    contextContinuityScore: round(contextContinuityScore),
    overallScore: round(overallScore),
    sessionMetrics,
  };
}

/**
 * Calculate aggregate scores across all scenarios.
 */
export function calculateAggregateScore(
  scenarioScores: ScenarioScore[],
  agentConfig: AgentConfig,
  adapterName: string
): BenchmarkResult {
  const aggregate: AggregateScore = {
    meanAccuracy: mean(scenarioScores.map((s) => s.accuracyScore)),
    meanTokenEfficiency: mean(scenarioScores.map((s) => s.tokenEfficiencyScore)),
    meanConflictDetection: mean(scenarioScores.map((s) => s.conflictDetectionScore)),
    meanContextContinuity: mean(scenarioScores.map((s) => s.contextContinuityScore)),
    overallScore: mean(scenarioScores.map((s) => s.overallScore)),
    totalTokensUsed: sumTokens(
      scenarioScores.flatMap((s) =>
        s.sessionMetrics.map((m) => m.totalTokens)
      )
    ),
    totalTimeMs: scenarioScores
      .flatMap((s) => s.sessionMetrics)
      .reduce((sum, m) => sum + m.totalTimeMs, 0),
  };

  return {
    benchmarkId: `bench-${Date.now()}`,
    timestamp: new Date().toISOString(),
    adapterName,
    agentConfig,
    scenarioScores,
    aggregate,
  };
}

/**
 * Compare multiple benchmark results head-to-head.
 */
export function compareResults(results: BenchmarkResult[]): ComparisonResult {
  const metrics: Array<{
    name: string;
    getter: (r: BenchmarkResult) => number;
    higherIsBetter: boolean;
  }> = [
    { name: "Overall Score", getter: (r) => r.aggregate.overallScore, higherIsBetter: true },
    { name: "Accuracy", getter: (r) => r.aggregate.meanAccuracy, higherIsBetter: true },
    { name: "Conflict Detection", getter: (r) => r.aggregate.meanConflictDetection, higherIsBetter: true },
    { name: "Context Continuity", getter: (r) => r.aggregate.meanContextContinuity, higherIsBetter: true },
    { name: "Token Efficiency", getter: (r) => r.aggregate.meanTokenEfficiency, higherIsBetter: true },
    { name: "Total Tokens Used", getter: (r) => r.aggregate.totalTokensUsed.totalTokens, higherIsBetter: false },
    { name: "Total Time (s)", getter: (r) => r.aggregate.totalTimeMs / 1000, higherIsBetter: false },
  ];

  const comparisonTable: ComparisonRow[] = metrics.map((metric) => {
    const values: Record<string, number | string> = {};
    let bestAdapter = "";
    let bestValue = metric.higherIsBetter ? -Infinity : Infinity;

    for (const result of results) {
      const val = metric.getter(result);
      values[result.adapterName] = round(val);

      if (metric.higherIsBetter ? val > bestValue : val < bestValue) {
        bestValue = val;
        bestAdapter = result.adapterName;
      }
    }

    return { metric: metric.name, values, winner: bestAdapter };
  });

  // Overall winner = most wins in the comparison table
  const winCounts: Record<string, number> = {};
  for (const row of comparisonTable) {
    winCounts[row.winner] = (winCounts[row.winner] || 0) + 1;
  }
  const winner = Object.entries(winCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Tie";

  return {
    timestamp: new Date().toISOString(),
    results,
    comparisonTable,
    winner,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((s, v) => s + v, 0) / values.length);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumTokens(usages: TokenUsage[]): TokenUsage {
  return usages.reduce(
    (sum, u) => ({
      inputTokens: sum.inputTokens + u.inputTokens,
      outputTokens: sum.outputTokens + u.outputTokens,
      totalTokens: sum.totalTokens + u.totalTokens,
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  );
}
