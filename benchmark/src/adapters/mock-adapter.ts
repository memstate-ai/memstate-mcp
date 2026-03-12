import { MemoryAdapter, ToolCallResult } from "../types";

/**
 * In-memory mock adapter for testing the benchmark pipeline.
 * Implements the same interface as real MCP adapters but stores
 * everything in a local Map. Supports versioning and history.
 */
export class MockMemoryAdapter implements MemoryAdapter {
  name = "MockMemory";
  private store = new Map<string, { value: string; versions: Array<{ value: string; timestamp: string }> }>();

  async initialize(): Promise<void> {
    // No-op
  }

  async storeFact(project: string, key: string, value: string): Promise<ToolCallResult> {
    const start = Date.now();
    const fullKey = `${project}/${key}`;
    const existing = this.store.get(fullKey);
    const versions = existing?.versions || [];
    if (existing) {
      versions.push({ value: existing.value, timestamp: new Date().toISOString() });
    }
    this.store.set(fullKey, { value, versions });

    return {
      success: true,
      data: { stored: fullKey, value },
      rawResponse: JSON.stringify({ status: "ok", keypath: fullKey, value }),
      tokenCount: Math.ceil(value.length / 4),
      latencyMs: Date.now() - start,
    };
  }

  async getFact(project: string, key: string): Promise<ToolCallResult> {
    const start = Date.now();
    const fullKey = `${project}/${key}`;

    // Exact match
    const exact = this.store.get(fullKey);
    if (exact) {
      const response = { keypath: fullKey, value: exact.value, versions: exact.versions.length };
      return {
        success: true,
        data: response,
        rawResponse: JSON.stringify(response),
        tokenCount: Math.ceil(JSON.stringify(response).length / 4),
        latencyMs: Date.now() - start,
      };
    }

    // Prefix match (browse subtree)
    const matches: Record<string, string> = {};
    for (const [k, v] of this.store) {
      if (k.startsWith(fullKey)) {
        matches[k.replace(`${project}/`, "")] = v.value;
      }
    }

    if (Object.keys(matches).length > 0) {
      const response = { keypath: key, children: matches };
      return {
        success: true,
        data: response,
        rawResponse: JSON.stringify(response),
        tokenCount: Math.ceil(JSON.stringify(response).length / 4),
        latencyMs: Date.now() - start,
      };
    }

    return {
      success: true,
      data: { keypath: fullKey, value: null, message: "Not found" },
      rawResponse: JSON.stringify({ keypath: fullKey, value: null }),
      tokenCount: 10,
      latencyMs: Date.now() - start,
    };
  }

  async searchMemory(project: string, query: string): Promise<ToolCallResult> {
    const start = Date.now();
    const queryLower = query.toLowerCase();
    const results: Array<{ keypath: string; value: string; relevance: number }> = [];

    for (const [k, v] of this.store) {
      if (!k.startsWith(project)) continue;
      const keyRelevance = k.toLowerCase().includes(queryLower) ? 0.8 : 0;
      const valueRelevance = v.value.toLowerCase().includes(queryLower) ? 0.9 : 0;
      const relevance = Math.max(keyRelevance, valueRelevance);
      // Also do a simple word overlap check
      const queryWords = queryLower.split(/\s+/);
      const valueWords = v.value.toLowerCase().split(/\s+/);
      const overlap = queryWords.filter(w => valueWords.some(vw => vw.includes(w))).length;
      const wordRelevance = overlap > 0 ? 0.3 + (overlap / queryWords.length) * 0.5 : 0;

      const finalRelevance = Math.max(relevance, wordRelevance);
      if (finalRelevance > 0.2) {
        results.push({
          keypath: k.replace(`${project}/`, ""),
          value: v.value,
          relevance: finalRelevance,
        });
      }
    }

    results.sort((a, b) => b.relevance - a.relevance);
    const top = results.slice(0, 10);
    const response = { query, results: top, total: results.length };

    return {
      success: true,
      data: response,
      rawResponse: JSON.stringify(response),
      tokenCount: Math.ceil(JSON.stringify(response).length / 4),
      latencyMs: Date.now() - start,
    };
  }

  async getHistory(project: string, key: string): Promise<ToolCallResult> {
    const start = Date.now();
    const fullKey = `${project}/${key}`;
    const entry = this.store.get(fullKey);

    if (!entry) {
      return {
        success: true,
        data: { keypath: fullKey, history: [], message: "No history found" },
        rawResponse: JSON.stringify({ keypath: fullKey, history: [] }),
        tokenCount: 15,
        latencyMs: Date.now() - start,
      };
    }

    const history = [
      ...entry.versions.map((v, i) => ({ version: i + 1, value: v.value, timestamp: v.timestamp, current: false })),
      { version: entry.versions.length + 1, value: entry.value, timestamp: new Date().toISOString(), current: true },
    ];

    const response = { keypath: key, history };
    return {
      success: true,
      data: response,
      rawResponse: JSON.stringify(response),
      tokenCount: Math.ceil(JSON.stringify(response).length / 4),
      latencyMs: Date.now() - start,
    };
  }

  async deleteProject(project: string): Promise<ToolCallResult> {
    const start = Date.now();
    const keysToDelete: string[] = [];
    for (const k of this.store.keys()) {
      if (k.startsWith(project)) keysToDelete.push(k);
    }
    for (const k of keysToDelete) this.store.delete(k);

    return {
      success: true,
      data: { deleted: keysToDelete.length },
      rawResponse: JSON.stringify({ deleted: keysToDelete.length }),
      tokenCount: 5,
      latencyMs: Date.now() - start,
    };
  }

  async disconnect(): Promise<void> {
    this.store.clear();
  }
}
