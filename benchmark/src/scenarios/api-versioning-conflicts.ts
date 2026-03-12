import { BenchmarkScenario } from "../types";

/**
 * Scenario 4: API Versioning Conflicts
 *
 * Tests a scenario where multiple API versions coexist and the memory system
 * must track which endpoints exist in which versions without confusing them.
 * Also introduces deliberate contradictions between sessions.
 *
 * Session 1: Define v1 API endpoints
 * Session 2: Define v2 API with breaking changes
 * Session 3: Hotfix on v1 that contradicts v2 documentation
 * Session 4: Recall — must distinguish v1 vs v2 correctly
 */
export const apiVersioningConflicts: BenchmarkScenario = {
  id: "api-versioning-conflicts",
  name: "API Versioning Conflicts",
  description:
    "An API with multiple coexisting versions and contradictory changes. " +
    "Tests the memory system's ability to namespace versioned information " +
    "and detect cross-version conflicts.",
  category: "contradiction_handling",
  sessions: [
    {
      id: "api-s1-v1",
      sessionNumber: 1,
      title: "API v1 Definition",
      agentPrompt: `You are documenting the API for "DataHub", a data analytics platform.

API v1 endpoints:
- GET /api/v1/datasets — List all datasets (paginated, 20 per page)
- GET /api/v1/datasets/:id — Get dataset by ID
- POST /api/v1/datasets — Create dataset (body: { name, description, schema })
- PUT /api/v1/datasets/:id — Full update (all fields required)
- DELETE /api/v1/datasets/:id — Soft delete (sets deleted_at)

- GET /api/v1/queries — List saved queries
- POST /api/v1/queries — Create query (body: { sql, dataset_id, name })
- POST /api/v1/queries/:id/execute — Execute a saved query (sync, max 30s timeout)

Response format (v1):
- All responses wrapped in { "data": ..., "error": null }
- Errors: { "data": null, "error": { "code": int, "message": string } }
- Pagination: { "data": [...], "meta": { "page": 1, "per_page": 20, "total": 100 } }

Auth: API key in X-API-Key header

Store all of this in memory under the "datahub" project, namespaced by API version.`,
      verificationQueries: [
        {
          id: "api-v1-pagination",
          question: "What is the pagination format for API v1?",
          expectedAnswer:
            "20 items per page, meta object with page, per_page, and total fields",
          type: "fact_recall",
          weight: 1.0,
        },
        {
          id: "api-v1-delete",
          question: "What does DELETE /api/v1/datasets/:id do?",
          expectedAnswer: "Soft delete — sets deleted_at timestamp",
          type: "fact_recall",
          weight: 1.0,
        },
      ],
    },
    {
      id: "api-s2-v2",
      sessionNumber: 2,
      title: "API v2 with Breaking Changes",
      agentPrompt: `DataHub API v2 is being released with breaking changes.

API v2 changes (v1 continues to be supported):
- GET /api/v2/datasets — Pagination changed to cursor-based (NOT page-based)
  - Response: { "data": [...], "cursor": { "next": "abc123", "has_more": true } }
  - Default limit: 50 per request (was 20 in v1)
- POST /api/v2/datasets — Body changed: { name, description, schema, tags[], visibility }
  - Added required field: visibility (public/private)
- PUT replaced with PATCH:
  - PATCH /api/v2/datasets/:id — Partial update (only send changed fields)
  - PUT is REMOVED in v2
- DELETE /api/v2/datasets/:id — Hard delete (NOT soft delete — breaks from v1)

- POST /api/v2/queries/:id/execute — Now async:
  - Returns { "job_id": "..." } immediately
  - Poll GET /api/v2/jobs/:job_id for results
  - No more 30s timeout limit

Response format (v2):
- All responses wrapped in { "result": ..., "error": null } (changed key from "data" to "result")
- Errors: { "result": null, "error": { "type": string, "message": string, "details": {} } }

Auth: Bearer token in Authorization header (API key header NO LONGER ACCEPTED in v2)

IMPORTANT: v1 endpoints are UNCHANGED and still work. This is v2 only.

Store v2 details in memory. Make clear these are v2-specific and v1 is different.`,
      verificationQueries: [
        {
          id: "api-v2-pagination",
          question: "How does pagination work in API v2?",
          expectedAnswer:
            "Cursor-based pagination with next cursor and has_more flag, 50 items per request default",
          type: "fact_recall",
          weight: 1.5,
        },
        {
          id: "api-v2-vs-v1-delete",
          question:
            "What is the difference between v1 and v2 DELETE behavior?",
          expectedAnswer:
            "v1 does soft delete (sets deleted_at), v2 does hard delete",
          type: "decision_tracking",
          weight: 2.0,
        },
        {
          id: "api-v2-auth-change",
          question: "How does v2 authentication differ from v1?",
          expectedAnswer:
            "v1 uses API key in X-API-Key header, v2 uses Bearer token in Authorization header",
          type: "conflict_detection",
          weight: 2.0,
        },
      ],
    },
    {
      id: "api-s3-hotfix",
      sessionNumber: 3,
      title: "v1 Hotfix Creates Contradiction",
      agentPrompt: `HOTFIX on DataHub API v1:

A critical bug was found: v1 soft delete wasn't actually setting deleted_at correctly. The fix changes v1 behavior:

1. DELETE /api/v1/datasets/:id — NOW does hard delete (same as v2)
   - This is a BREAKING CHANGE to v1 but necessary for data integrity
   - The soft delete behavior was INCORRECT (bug) and has been removed
   - deleted_at column is removed from the datasets table entirely

2. GET /api/v1/datasets — Pagination limit increased from 20 to 50 (matching v2)
   - The per_page meta field still exists for backward compatibility

3. New deprecation notice:
   - v1 will be sunset in 6 months
   - All clients should migrate to v2
   - /api/v1/* endpoints now return a Sunset header

Update memory to reflect these v1 changes. Note that v1 delete behavior now MATCHES v2 (both hard delete), but previously they were different. This is important for migration documentation.`,
      verificationQueries: [
        {
          id: "api-v3-v1-delete-fixed",
          question: "What does DELETE do in API v1 NOW (after the hotfix)?",
          expectedAnswer:
            "Hard delete (changed from soft delete due to a bug fix)",
          type: "conflict_detection",
          weight: 2.5,
        },
        {
          id: "api-v3-delete-convergence",
          question: "Do v1 and v2 DELETE behave the same way now?",
          expectedAnswer:
            "Yes, both now do hard delete. v1 was changed from soft delete to hard delete via hotfix.",
          type: "decision_tracking",
          weight: 2.0,
        },
        {
          id: "api-v3-v1-sunset",
          question: "What is the status of API v1?",
          expectedAnswer:
            "Deprecated, will be sunset in 6 months, returns Sunset header",
          type: "fact_recall",
          weight: 1.5,
        },
      ],
    },
    {
      id: "api-s4-recall",
      sessionNumber: 4,
      title: "Complete API State Recall",
      agentPrompt: `You are writing migration documentation for DataHub API clients moving from v1 to v2.

Retrieve ALL API information from memory and create a comparison:
1. What are the current differences between v1 and v2?
2. What changed during the project? (e.g., v1 delete behavior changed)
3. What is the deprecation timeline?

Be precise — any incorrect information in migration docs will break client applications.`,
      verificationQueries: [
        {
          id: "api-v4-delete-both-hard",
          question: "What is the current DELETE behavior for both v1 and v2?",
          expectedAnswer:
            "Both v1 and v2 now do hard delete. v1 originally did soft delete but was changed via hotfix.",
          type: "context_continuity",
          weight: 3.0,
        },
        {
          id: "api-v4-pagination-diff",
          question: "How does pagination differ between current v1 and v2?",
          expectedAnswer:
            "v1: page-based with meta (per_page now 50, was 20). v2: cursor-based with 50 per request default.",
          type: "context_continuity",
          weight: 2.5,
        },
        {
          id: "api-v4-response-format-diff",
          question: "How do response formats differ between v1 and v2?",
          expectedAnswer:
            "v1 wraps in 'data' key, v2 wraps in 'result' key. Error structures also differ.",
          type: "context_continuity",
          weight: 2.0,
        },
        {
          id: "api-v4-auth-diff",
          question: "How does authentication differ between v1 and v2?",
          expectedAnswer:
            "v1 uses X-API-Key header, v2 uses Bearer token in Authorization header",
          type: "context_continuity",
          weight: 2.0,
        },
      ],
    },
  ],
  expectedFinalFacts: [
    {
      keypath: "datahub/api/v1/delete-behavior",
      expectedValue: "Hard delete (changed from soft delete via hotfix)",
    },
    {
      keypath: "datahub/api/v2/pagination",
      expectedValue: "Cursor-based, 50 per request",
    },
    {
      keypath: "datahub/api/v1/status",
      expectedValue: "Deprecated, sunset in 6 months",
    },
  ],
  expectedConflicts: [
    {
      keypath: "datahub/api/v1/delete-behavior",
      oldValue: "Soft delete (sets deleted_at)",
      newValue: "Hard delete (bug fix)",
    },
    {
      keypath: "datahub/api/v1/pagination/per_page",
      oldValue: "20",
      newValue: "50",
    },
  ],
};
