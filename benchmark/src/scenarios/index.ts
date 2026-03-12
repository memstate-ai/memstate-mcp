import { BenchmarkScenario } from "../types";
import { webAppArchitectureEvolution } from "./web-app-architecture";
import { authSystemMigration } from "./auth-system-migration";
import { databaseSchemaEvolution } from "./database-schema-evolution";
import { apiVersioningConflicts } from "./api-versioning-conflicts";
import { teamDecisionReversal } from "./team-decision-reversal";

export const ALL_SCENARIOS: BenchmarkScenario[] = [
  webAppArchitectureEvolution,
  authSystemMigration,
  databaseSchemaEvolution,
  apiVersioningConflicts,
  teamDecisionReversal,
];

export function getScenarioById(id: string): BenchmarkScenario | undefined {
  return ALL_SCENARIOS.find((s) => s.id === id);
}

export function getScenariosByCategory(
  category: BenchmarkScenario["category"]
): BenchmarkScenario[] {
  return ALL_SCENARIOS.filter((s) => s.category === category);
}
