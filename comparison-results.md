# Memory MCP Benchmark — Head-to-Head Comparison

**Date:** 2026-03-12T11:14:36.136Z  
**Winner:** Memstate

**Agent Model:** anthropic/claude-sonnet-4.6 (openai-compatible)  
**Temperature:** 0

## Summary

| Metric | Memstate | Mem0 | Winner |
| --- | --- | --- | --- |
| Overall Score | 84.42 | 20.35 | **Memstate** |
| Accuracy | 92.16 | 17.5 | **Memstate** |
| Conflict Detection | 95 | 20.2 | **Memstate** |
| Context Continuity | 88.74 | 17.21 | **Memstate** |
| Token Efficiency | 16.19 | 40 | **Mem0** |
| Total Tokens Used | 1226513 | 524285 | **Mem0** |
| Total Time (s) | 880.67 | 745.35 | **Mem0** |

## Scoring Weights

| Component | Weight |
| --- | --- |
| Accuracy (fact recall) | 40% |
| Conflict Detection | 25% |
| Context Continuity | 25% |
| Token Efficiency | 10% |

## Per-Scenario Comparison

### Web App Architecture Evolution

**Category:** architecture_evolution

| Metric | Memstate | Mem0 |
| --- | --- | --- |
| Overall | 85.77 | 70.57 |
| Accuracy | 92.14 | 70.09 |
| Conflict Detection | 95 | 79.21 |
| Context Continuity | 93.75 | 71.25 |
| Token Efficiency | 17.29 | 49.19 |

### Auth System Migration

**Category:** contradiction_handling

| Metric | Memstate | Mem0 |
| --- | --- | --- |
| Overall | 85.06 | 9.02 |
| Accuracy | 92.55 | 6.12 |
| Conflict Detection | 95 | 12 |
| Context Continuity | 87.94 | 3.53 |
| Token Efficiency | 23.01 | 26.87 |

### Database Schema Evolution

**Category:** cross_session_context

| Metric | Memstate | Mem0 |
| --- | --- | --- |
| Overall | 81.05 | 10.28 |
| Accuracy | 90.59 | 4.71 |
| Conflict Detection | 95 | 6.67 |
| Context Continuity | 80 | 4 |
| Token Efficiency | 10.62 | 57.29 |

### API Versioning Conflicts

**Category:** contradiction_handling

| Metric | Memstate | Mem0 |
| --- | --- | --- |
| Overall | 85.03 | 4.09 |
| Accuracy | 93.2 | 2.61 |
| Conflict Detection | 95 | 0 |
| Context Continuity | 90.63 | 0 |
| Token Efficiency | 13.41 | 30.51 |

### Team Decision Reversal (Monolith → Microservices → Monolith)

**Category:** project_complexity

| Metric | Memstate | Mem0 |
| --- | --- | --- |
| Overall | 85.18 | 7.8 |
| Accuracy | 92.32 | 3.97 |
| Conflict Detection | 95 | 3.1 |
| Context Continuity | 91.36 | 7.27 |
| Token Efficiency | 16.64 | 36.14 |

## Detailed Results Per Adapter

### Memstate

#### Web App Architecture Evolution

**session-1-initial-setup** — 3/3 passed, 11305 tokens, 16.0s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What frontend framework is TaskFlow using? | fact_recall | 0.95 | PASS |
| What API style is TaskFlow using? | fact_recall | 0.95 | PASS |
| What database is TaskFlow using? | fact_recall | 0.95 | PASS |

**session-2-graphql-migration** — 2/3 passed, 42423 tokens, 43.4s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What is the CURRENT API style for TaskFlow? | fact_recall | 0.95 | PASS |
| What was the original API style before the migration? | decision_tracking | 0.95 | PASS |
| Why did the team switch from REST to GraphQL? | fact_recall | 0.20 | FAIL |

**session-3-nextjs-migration** — 4/4 passed, 50131 tokens, 35.0s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What is the CURRENT frontend framework for TaskFlow? | fact_recall | 1.00 | PASS |
| What state management does TaskFlow currently use? | fact_recall | 0.95 | PASS |
| Where is TaskFlow currently deployed? | fact_recall | 0.90 | PASS |
| Has the frontend framework changed during the project? Wh... | conflict_detection | 0.95 | PASS |

**session-4-full-recall** — 5/5 passed, 127516 tokens, 56.5s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What frontend framework is reported as current? | context_continuity | 0.95 | PASS |
| What API style is reported as current? | context_continuity | 0.95 | PASS |
| Does the agent report React 18 (not Next.js) as the curre... | conflict_detection | 0.95 | PASS |
| Does the agent report REST API as the current API style? | conflict_detection | 0.95 | PASS |
| What database is reported? (Should be unchanged) | context_continuity | 0.90 | PASS |

#### Auth System Migration

**auth-s1-jwt** — 2/2 passed, 14445 tokens, 18.5s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What authentication method does SecureApp use? | fact_recall | 0.95 | PASS |
| Does SecureApp use server-side sessions? | fact_recall | 0.95 | PASS |

**auth-s2-oauth** — 3/3 passed, 26547 tokens, 26.1s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What OAuth2 providers does SecureApp support? | fact_recall | 0.95 | PASS |
| Is JWT still used after adding OAuth? | context_continuity | 0.95 | PASS |
| What OAuth2 flow is used? | fact_recall | 0.95 | PASS |

**auth-s3-security-audit** — 4/4 passed, 69654 tokens, 74.4s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| Does SecureApp still use JWT tokens? | conflict_detection | 0.95 | PASS |
| What type of sessions does SecureApp use now? | fact_recall | 0.95 | PASS |
| What is the MFA status for SecureApp? | decision_tracking | 0.95 | PASS |
| What OAuth2 flow is used after the security audit? | decision_tracking | 0.95 | PASS |

**auth-s4-recall** — 4/4 passed, 63199 tokens, 48.4s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| Does the recall report JWT as a current auth method? | conflict_detection | 0.95 | PASS |
| What authentication method is reported as current? | context_continuity | 0.75 | PASS |
| What is MFA status reported as? | context_continuity | 0.95 | PASS |
| Which OAuth providers are listed? | context_continuity | 0.95 | PASS |

#### Database Schema Evolution

**db-s1-initial** — 2/2 passed, 18578 tokens, 24.8s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What columns does the users table have? | fact_recall | 0.95 | PASS |
| What are the valid status values for a post? | fact_recall | 0.95 | PASS |

**db-s2-normalize** — 3/3 passed, 139912 tokens, 68.7s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| Where is the user's email stored now? | decision_tracking | 0.95 | PASS |
| What is the column name for post content? | conflict_detection | 0.95 | PASS |
| How is the tagging system structured? | fact_recall | 0.95 | PASS |

**db-s3-denormalize** — 4/4 passed, 124024 tokens, 60.0s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| List ALL current columns on the posts table (after all mi... | context_continuity | 0.70 | PASS |
| What are the current valid status values for a post? | decision_tracking | 0.95 | PASS |
| Does the posts table have a 'body' column? | conflict_detection | 0.95 | PASS |
| If I need to query a user's email, which table do I look in? | context_continuity | 0.95 | PASS |

#### API Versioning Conflicts

**api-s1-v1** — 2/2 passed, 10022 tokens, 17.6s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What is the pagination format for API v1? | fact_recall | 0.95 | PASS |
| What does DELETE /api/v1/datasets/:id do? | fact_recall | 0.95 | PASS |

**api-s2-v2** — 3/3 passed, 52980 tokens, 53.0s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| How does pagination work in API v2? | fact_recall | 0.95 | PASS |
| What is the difference between v1 and v2 DELETE behavior? | decision_tracking | 0.95 | PASS |
| How does v2 authentication differ from v1? | conflict_detection | 0.95 | PASS |

**api-s3-hotfix** — 3/3 passed, 133393 tokens, 66.1s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What does DELETE do in API v1 NOW (after the hotfix)? | conflict_detection | 0.95 | PASS |
| Do v1 and v2 DELETE behave the same way now? | decision_tracking | 0.95 | PASS |
| What is the status of API v1? | fact_recall | 0.95 | PASS |

**api-s4-recall** — 4/4 passed, 101935 tokens, 61.7s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What is the current DELETE behavior for both v1 and v2? | context_continuity | 0.92 | PASS |
| How does pagination differ between current v1 and v2? | context_continuity | 0.90 | PASS |
| How do response formats differ between v1 and v2? | context_continuity | 0.85 | PASS |
| How does authentication differ between v1 and v2? | context_continuity | 0.95 | PASS |

#### Team Decision Reversal (Monolith → Microservices → Monolith)

**reversal-s1-monolith** — 2/2 passed, 7222 tokens, 11.4s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What architecture does ShopStream use? | fact_recall | 0.70 | PASS |
| Why was monolith chosen? | fact_recall | 0.95 | PASS |

**reversal-s2-microservices** — 3/3 passed, 82364 tokens, 66.6s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What architecture does ShopStream use? | fact_recall | 0.85 | PASS |
| What are the ShopStream microservices? | fact_recall | 0.95 | PASS |
| Where is ShopStream deployed? | decision_tracking | 0.95 | PASS |

**reversal-s3-revert-monolith** — 5/5 passed, 105778 tokens, 87.0s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What is ShopStream's CURRENT architecture? | conflict_detection | 0.95 | PASS |
| Does ShopStream use microservices? | conflict_detection | 0.95 | PASS |
| Which decisions from the microservices era were kept? | decision_tracking | 0.95 | PASS |
| Where is ShopStream currently deployed? | decision_tracking | 0.95 | PASS |
| Why did the team revert from microservices? | fact_recall | 0.92 | PASS |

**reversal-s4-recall** — 5/5 passed, 45085 tokens, 45.5s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What architecture is reported as current? | context_continuity | 0.85 | PASS |
| Does the agent distinguish between the original monolith ... | context_continuity | 0.95 | PASS |
| What is the architecture decision timeline? | decision_tracking | 0.95 | PASS |
| Where is ShopStream currently deployed? | context_continuity | 0.95 | PASS |
| What frontend does ShopStream use? | context_continuity | 0.95 | PASS |

### Mem0

#### Web App Architecture Evolution

**session-1-initial-setup** — 0/3 passed, 7608 tokens, 19.9s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What frontend framework is TaskFlow using? | fact_recall | 0.20 | FAIL |
| What API style is TaskFlow using? | fact_recall | 0.10 | FAIL |
| What database is TaskFlow using? | fact_recall | 0.00 | FAIL |

**session-2-graphql-migration** — 3/3 passed, 20200 tokens, 30.8s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What is the CURRENT API style for TaskFlow? | fact_recall | 0.95 | PASS |
| What was the original API style before the migration? | decision_tracking | 0.95 | PASS |
| Why did the team switch from REST to GraphQL? | fact_recall | 0.95 | PASS |

**session-3-nextjs-migration** — 2/4 passed, 22640 tokens, 38.8s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What is the CURRENT frontend framework for TaskFlow? | fact_recall | 0.95 | PASS |
| What state management does TaskFlow currently use? | fact_recall | 0.90 | PASS |
| Where is TaskFlow currently deployed? | fact_recall | 0.00 | FAIL |
| Has the frontend framework changed during the project? Wh... | conflict_detection | 0.20 | FAIL |

**session-4-full-recall** — 4/5 passed, 30867 tokens, 30.8s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What frontend framework is reported as current? | context_continuity | 0.95 | PASS |
| What API style is reported as current? | context_continuity | 0.95 | PASS |
| Does the agent report React 18 (not Next.js) as the curre... | conflict_detection | 0.95 | PASS |
| Does the agent report REST API as the current API style? | conflict_detection | 0.95 | PASS |
| What database is reported? (Should be unchanged) | context_continuity | 0.00 | FAIL |

#### Auth System Migration

**auth-s1-jwt** — 0/2 passed, 7595 tokens, 22.8s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What authentication method does SecureApp use? | fact_recall | 0.00 | FAIL |
| Does SecureApp use server-side sessions? | fact_recall | 0.00 | FAIL |

**auth-s2-oauth** — 0/3 passed, 28779 tokens, 38.0s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What OAuth2 providers does SecureApp support? | fact_recall | 0.00 | FAIL |
| Is JWT still used after adding OAuth? | context_continuity | 0.20 | FAIL |
| What OAuth2 flow is used? | fact_recall | 0.00 | FAIL |

**auth-s3-security-audit** — 0/4 passed, 83613 tokens, 86.4s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| Does SecureApp still use JWT tokens? | conflict_detection | 0.00 | FAIL |
| What type of sessions does SecureApp use now? | fact_recall | 0.00 | FAIL |
| What is the MFA status for SecureApp? | decision_tracking | 0.00 | FAIL |
| What OAuth2 flow is used after the security audit? | decision_tracking | 0.00 | FAIL |

**auth-s4-recall** — 0/4 passed, 28862 tokens, 44.4s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| Does the recall report JWT as a current auth method? | conflict_detection | 0.30 | FAIL |
| What authentication method is reported as current? | context_continuity | 0.00 | FAIL |
| What is MFA status reported as? | context_continuity | 0.00 | FAIL |
| Which OAuth providers are listed? | context_continuity | 0.00 | FAIL |

#### Database Schema Evolution

**db-s1-initial** — 0/2 passed, 7401 tokens, 20.1s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What columns does the users table have? | fact_recall | 0.00 | FAIL |
| What are the valid status values for a post? | fact_recall | 0.00 | FAIL |

**db-s2-normalize** — 0/3 passed, 15290 tokens, 34.6s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| Where is the user's email stored now? | decision_tracking | 0.00 | FAIL |
| What is the column name for post content? | conflict_detection | 0.00 | FAIL |
| How is the tagging system structured? | fact_recall | 0.00 | FAIL |

**db-s3-denormalize** — 0/4 passed, 29677 tokens, 47.3s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| List ALL current columns on the posts table (after all mi... | context_continuity | 0.00 | FAIL |
| What are the current valid status values for a post? | decision_tracking | 0.00 | FAIL |
| Does the posts table have a 'body' column? | conflict_detection | 0.20 | FAIL |
| If I need to query a user's email, which table do I look in? | context_continuity | 0.10 | FAIL |

#### API Versioning Conflicts

**api-s1-v1** — 0/2 passed, 7103 tokens, 18.8s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What is the pagination format for API v1? | fact_recall | 0.00 | FAIL |
| What does DELETE /api/v1/datasets/:id do? | fact_recall | 0.15 | FAIL |

**api-s2-v2** — 0/3 passed, 21421 tokens, 36.0s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| How does pagination work in API v2? | fact_recall | 0.00 | FAIL |
| What is the difference between v1 and v2 DELETE behavior? | decision_tracking | 0.00 | FAIL |
| How does v2 authentication differ from v1? | conflict_detection | 0.00 | FAIL |

**api-s3-hotfix** — 0/3 passed, 22874 tokens, 39.0s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What does DELETE do in API v1 NOW (after the hotfix)? | conflict_detection | 0.00 | FAIL |
| Do v1 and v2 DELETE behave the same way now? | decision_tracking | 0.00 | FAIL |
| What is the status of API v1? | fact_recall | 0.30 | FAIL |

**api-s4-recall** — 0/4 passed, 79689 tokens, 65.6s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What is the current DELETE behavior for both v1 and v2? | context_continuity | 0.00 | FAIL |
| How does pagination differ between current v1 and v2? | context_continuity | 0.00 | FAIL |
| How do response formats differ between v1 and v2? | context_continuity | 0.00 | FAIL |
| How does authentication differ between v1 and v2? | context_continuity | 0.00 | FAIL |

#### Team Decision Reversal (Monolith → Microservices → Monolith)

**reversal-s1-monolith** — 0/2 passed, 7522 tokens, 23.4s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What architecture does ShopStream use? | fact_recall | 0.00 | FAIL |
| Why was monolith chosen? | fact_recall | 0.00 | FAIL |

**reversal-s2-microservices** — 0/3 passed, 20318 tokens, 37.5s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What architecture does ShopStream use? | fact_recall | 0.00 | FAIL |
| What are the ShopStream microservices? | fact_recall | 0.00 | FAIL |
| Where is ShopStream deployed? | decision_tracking | 0.00 | FAIL |

**reversal-s3-revert-monolith** — 0/5 passed, 22056 tokens, 50.4s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What is ShopStream's CURRENT architecture? | conflict_detection | 0.00 | FAIL |
| Does ShopStream use microservices? | conflict_detection | 0.00 | FAIL |
| Which decisions from the microservices era were kept? | decision_tracking | 0.00 | FAIL |
| Where is ShopStream currently deployed? | decision_tracking | 0.00 | FAIL |
| Why did the team revert from microservices? | fact_recall | 0.00 | FAIL |

**reversal-s4-recall** — 0/5 passed, 60770 tokens, 60.8s

| Question | Type | Score | Result |
| --- | --- | --- | --- |
| What architecture is reported as current? | context_continuity | 0.20 | FAIL |
| Does the agent distinguish between the original monolith ... | context_continuity | 0.00 | FAIL |
| What is the architecture decision timeline? | decision_tracking | 0.15 | FAIL |
| Where is ShopStream currently deployed? | context_continuity | 0.00 | FAIL |
| What frontend does ShopStream use? | context_continuity | 0.00 | FAIL |
