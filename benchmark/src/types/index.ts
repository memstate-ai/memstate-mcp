/**
 * Core types for the Memory MCP Benchmark system.
 *
 * The benchmark measures how well MCP memory systems support
 * a coding agent across multiple sessions with evolving requirements.
 */

// ─── Scenario & Session Definitions ───────────────────────────────────────────

export interface BenchmarkScenario {
  id: string;
  name: string;
  description: string;
  /** Category of challenge this scenario tests */
  category: ScenarioCategory;
  /** Ordered list of sessions the agent must complete */
  sessions: SessionDefinition[];
  /** Facts that should be remembered after all sessions */
  expectedFinalFacts: ExpectedFact[];
  /** Facts that should be detected as superseded/conflicting */
  expectedConflicts: ExpectedConflict[];
}

export type ScenarioCategory =
  | "fact_recall"           // Can the agent recall stored facts?
  | "architecture_evolution" // Can the agent track changing architecture decisions?
  | "contradiction_handling" // Can the agent detect and resolve contradictions?
  | "cross_session_context" // Can the agent maintain context across sessions?
  | "project_complexity";   // Can the agent handle complex, realistic projects?

export interface SessionDefinition {
  id: string;
  sessionNumber: number;
  title: string;
  /** Instructions given to the agent at the start of this session */
  agentPrompt: string;
  /**
   * Facts injected into memory BEFORE this session starts.
   * Simulates prior sessions having stored these facts.
   */
  preloadFacts?: PreloadFact[];
  /**
   * After the agent finishes, these verification queries test whether
   * the agent stored/retrieved memory correctly.
   */
  verificationQueries: VerificationQuery[];
}

export interface PreloadFact {
  key: string;
  value: string;
  /** If set, this fact intentionally contradicts a prior fact */
  contradictsKey?: string;
}

export interface VerificationQuery {
  id: string;
  /** Natural-language question to ask the agent after the session */
  question: string;
  /** Expected answer (used for semantic similarity scoring) */
  expectedAnswer: string;
  /** Keypaths that should have been stored/retrieved */
  expectedKeypaths?: string[];
  /** Weight for this query in the final score (default 1.0) */
  weight?: number;
  /** Type of verification */
  type: "fact_recall" | "conflict_detection" | "decision_tracking" | "context_continuity";
}

export interface ExpectedFact {
  keypath: string;
  expectedValue: string;
  /** Tolerance for semantic similarity (0.0 - 1.0, default 0.7) */
  similarityThreshold?: number;
}

export interface ExpectedConflict {
  keypath: string;
  /** The old value that should be detected as superseded */
  oldValue: string;
  /** The new value that should replace it */
  newValue: string;
}

// ─── MCP Memory Adapter ──────────────────────────────────────────────────────

export interface MemoryAdapter {
  name: string;
  /** Initialize connection to the MCP memory system */
  initialize(): Promise<void>;
  /** Store a fact via the MCP memory tool */
  storeFact(project: string, key: string, value: string): Promise<ToolCallResult>;
  /** Retrieve a fact via the MCP memory tool */
  getFact(project: string, key: string): Promise<ToolCallResult>;
  /** Search memory via the MCP memory tool */
  searchMemory(project: string, query: string): Promise<ToolCallResult>;
  /** Get history for a key */
  getHistory(project: string, key: string): Promise<ToolCallResult>;
  /** Delete a project's memory (cleanup between runs) */
  deleteProject(project: string): Promise<ToolCallResult>;
  /** Disconnect */
  disconnect(): Promise<void>;
}

export interface ToolCallResult {
  success: boolean;
  data?: unknown;
  rawResponse?: string;
  tokenCount: number;
  latencyMs: number;
  error?: string;
}

// ─── Agent Loop ──────────────────────────────────────────────────────────────

export interface AgentConfig {
  /** Model to use for the agent (e.g., "claude-sonnet-4-20250514") */
  model: string;
  /** Max tokens per agent turn */
  maxTokens: number;
  /** Max iterations in the agent loop per session */
  maxIterations: number;
  /** Temperature (should be 0 for reproducibility) */
  temperature: number;
}

export interface AgentTurn {
  turnNumber: number;
  role: "assistant" | "user" | "tool";
  content: string;
  toolCalls?: AgentToolCall[];
  tokenUsage: TokenUsage;
  latencyMs: number;
}

export interface AgentToolCall {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  latencyMs: number;
  tokenCount: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

// ─── Metrics & Scoring ───────────────────────────────────────────────────────

export interface SessionMetrics {
  sessionId: string;
  scenarioId: string;
  adapterName: string;
  /** Total tokens consumed across all agent turns */
  totalTokens: TokenUsage;
  /** Total wall-clock time for the session */
  totalTimeMs: number;
  /** Number of agent loop iterations */
  iterationCount: number;
  /** Number of MCP memory tool calls made */
  memoryToolCallCount: number;
  /** Detailed results for each verification query */
  verificationResults: VerificationResult[];
  /** All agent turns (for detailed analysis) */
  agentTurns: AgentTurn[];
  /** Errors encountered */
  errors: string[];
}

export interface VerificationResult {
  queryId: string;
  question: string;
  expectedAnswer: string;
  actualAnswer: string;
  /** Semantic similarity score (0.0 - 1.0) */
  similarityScore: number;
  /** Did the agent correctly identify this fact? */
  passed: boolean;
  type: VerificationQuery["type"];
  weight: number;
}

export interface ScenarioScore {
  scenarioId: string;
  scenarioName: string;
  category: ScenarioCategory;
  adapterName: string;
  /** Weighted accuracy across all verification queries (0-100) */
  accuracyScore: number;
  /** Token efficiency score (0-100, lower tokens = higher score) */
  tokenEfficiencyScore: number;
  /** Conflict detection accuracy (0-100) */
  conflictDetectionScore: number;
  /** Context continuity across sessions (0-100) */
  contextContinuityScore: number;
  /** Overall composite score (0-100) */
  overallScore: number;
  /** Raw metrics for each session in this scenario */
  sessionMetrics: SessionMetrics[];
}

export interface BenchmarkResult {
  benchmarkId: string;
  timestamp: string;
  adapterName: string;
  agentConfig: AgentConfig;
  scenarioScores: ScenarioScore[];
  /** Aggregate scores across all scenarios */
  aggregate: AggregateScore;
}

export interface AggregateScore {
  /** Mean accuracy across all scenarios */
  meanAccuracy: number;
  /** Mean token efficiency */
  meanTokenEfficiency: number;
  /** Mean conflict detection accuracy */
  meanConflictDetection: number;
  /** Mean context continuity */
  meanContextContinuity: number;
  /** Overall composite score */
  overallScore: number;
  /** Total tokens used across entire benchmark */
  totalTokensUsed: TokenUsage;
  /** Total wall-clock time */
  totalTimeMs: number;
}

export interface ComparisonResult {
  timestamp: string;
  results: BenchmarkResult[];
  /** Head-to-head comparison table */
  comparisonTable: ComparisonRow[];
  winner: string;
}

export interface ComparisonRow {
  metric: string;
  values: Record<string, number | string>;
  winner: string;
}

// ─── CLI Options ─────────────────────────────────────────────────────────────

export interface BenchmarkOptions {
  /** Memory adapters to benchmark */
  adapters: string[];
  /** Scenario IDs to run (empty = all) */
  scenarios: string[];
  /** Agent model */
  model: string;
  /** Number of runs for statistical significance */
  runs: number;
  /** Output directory for results */
  outputDir: string;
  /** Path to AGENTS.md for custom instructions */
  agentsMdPath?: string;
  /** Verbose logging */
  verbose: boolean;
  /** Project name prefix for memory isolation */
  projectPrefix: string;
}
