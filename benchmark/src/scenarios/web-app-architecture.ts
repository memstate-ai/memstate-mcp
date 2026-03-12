import { BenchmarkScenario } from "../types";

/**
 * Scenario 1: Web App Architecture Evolution
 *
 * Simulates a realistic multi-session project where architecture decisions
 * change over time. The agent must track that the project started with one
 * approach and migrated to another, without confusing old and new decisions.
 *
 * Session 1: Initial project setup — React + REST API + MongoDB
 * Session 2: Team decides to switch from REST to GraphQL
 * Session 3: Frontend framework changes from React to Next.js
 * Session 4: Agent must recall the CURRENT state accurately despite
 *            memory containing all historical decisions.
 */
export const webAppArchitectureEvolution: BenchmarkScenario = {
  id: "web-app-arch-evolution",
  name: "Web App Architecture Evolution",
  description:
    "A web app project where architecture decisions evolve across 4 sessions. " +
    "Tests whether the memory system correctly tracks superseded decisions " +
    "and returns the current state of the project.",
  category: "architecture_evolution",
  sessions: [
    {
      id: "session-1-initial-setup",
      sessionNumber: 1,
      title: "Initial Project Setup",
      agentPrompt: `You are a coding agent working on a new web application called "TaskFlow" — a project management tool.

The team has made the following initial architecture decisions:
- Frontend: React 18 with TypeScript
- State management: Redux Toolkit
- API layer: REST API with Express.js
- Database: MongoDB with Mongoose ODM
- Authentication: JWT tokens stored in httpOnly cookies
- Deployment: Docker containers on AWS ECS
- CSS: Tailwind CSS
- Testing: Jest + React Testing Library

Please store all of these architecture decisions in memory so they can be referenced in future sessions. Store them in a structured way using keypaths like "taskflow/frontend/framework", "taskflow/api/style", etc.

After storing, confirm what you've stored by listing the key decisions.`,
      verificationQueries: [
        {
          id: "v1-frontend",
          question: "What frontend framework is TaskFlow using?",
          expectedAnswer: "React 18 with TypeScript",
          expectedKeypaths: ["taskflow/frontend/framework"],
          type: "fact_recall",
          weight: 1.0,
        },
        {
          id: "v1-api",
          question: "What API style is TaskFlow using?",
          expectedAnswer: "REST API with Express.js",
          expectedKeypaths: ["taskflow/api/style"],
          type: "fact_recall",
          weight: 1.0,
        },
        {
          id: "v1-database",
          question: "What database is TaskFlow using?",
          expectedAnswer: "MongoDB with Mongoose ODM",
          expectedKeypaths: ["taskflow/database"],
          type: "fact_recall",
          weight: 1.0,
        },
      ],
    },
    {
      id: "session-2-graphql-migration",
      sessionNumber: 2,
      title: "Migration to GraphQL",
      agentPrompt: `You are continuing work on the TaskFlow project management app.

IMPORTANT UPDATE: The team has decided to migrate from REST API to GraphQL. The reasons are:
- The frontend needs flexible data fetching for complex dashboard views
- Over-fetching was causing performance issues on mobile
- We want to use Apollo Client for caching on the frontend

The new decisions are:
- API layer: GraphQL with Apollo Server (replaces REST/Express)
- Frontend data layer: Apollo Client (replaces direct fetch calls)
- Express.js is still used as the HTTP server, but routes are replaced by the GraphQL endpoint

Please UPDATE memory to reflect this change. The old REST API decision should be marked as superseded. Store the migration reasoning as well.

Confirm the updates you've made.`,
      preloadFacts: [
        {
          key: "taskflow/api/style",
          value: "GraphQL with Apollo Server (migrated from REST)",
          contradictsKey: "taskflow/api/style",
        },
      ],
      verificationQueries: [
        {
          id: "v2-api-current",
          question: "What is the CURRENT API style for TaskFlow?",
          expectedAnswer: "GraphQL with Apollo Server",
          type: "fact_recall",
          weight: 2.0,
        },
        {
          id: "v2-api-history",
          question: "What was the original API style before the migration?",
          expectedAnswer: "REST API with Express.js",
          type: "decision_tracking",
          weight: 1.5,
        },
        {
          id: "v2-migration-reason",
          question: "Why did the team switch from REST to GraphQL?",
          expectedAnswer:
            "Flexible data fetching for complex dashboards, over-fetching causing mobile performance issues, Apollo Client caching benefits",
          type: "fact_recall",
          weight: 1.0,
        },
      ],
    },
    {
      id: "session-3-nextjs-migration",
      sessionNumber: 3,
      title: "Migration to Next.js",
      agentPrompt: `You are continuing work on the TaskFlow project.

ANOTHER ARCHITECTURE CHANGE: The team has decided to migrate from plain React to Next.js. Reasons:
- We need server-side rendering for SEO on public project pages
- Next.js API routes can colocate some backend logic
- The App Router provides better code splitting
- We're keeping Apollo Client for GraphQL but integrating it with Next.js SSR

Updated decisions:
- Frontend: Next.js 14 with App Router (replaces plain React 18)
- State management: React Server Components + Apollo Client (Redux Toolkit removed)
- Deployment: Vercel (replaces AWS ECS Docker containers)

Please update memory. The React and Redux decisions should be superseded. The deployment change should also be tracked.`,
      verificationQueries: [
        {
          id: "v3-frontend-current",
          question: "What is the CURRENT frontend framework for TaskFlow?",
          expectedAnswer: "Next.js 14 with App Router",
          type: "fact_recall",
          weight: 2.0,
        },
        {
          id: "v3-state-mgmt",
          question: "What state management does TaskFlow currently use?",
          expectedAnswer: "React Server Components + Apollo Client",
          type: "fact_recall",
          weight: 1.5,
        },
        {
          id: "v3-deployment",
          question: "Where is TaskFlow currently deployed?",
          expectedAnswer: "Vercel",
          type: "fact_recall",
          weight: 1.0,
        },
        {
          id: "v3-conflict-detection",
          question:
            "Has the frontend framework changed during the project? What was it before?",
          expectedAnswer:
            "Yes, it changed from React 18 to Next.js 14 with App Router",
          type: "conflict_detection",
          weight: 2.0,
        },
      ],
    },
    {
      id: "session-4-full-recall",
      sessionNumber: 4,
      title: "Full Architecture Recall",
      agentPrompt: `You are starting a new session on the TaskFlow project. You have NO context about this project other than what's in memory.

A new team member needs a complete overview of the CURRENT architecture. Please retrieve all architecture decisions from memory and provide a comprehensive summary.

Important: Only report the CURRENT decisions. Do not report superseded decisions as current. If there is version history, acknowledge it briefly but be clear about what's current.

Provide the summary covering: frontend, API, database, auth, deployment, CSS, and testing.`,
      verificationQueries: [
        {
          id: "v4-frontend-accurate",
          question: "What frontend framework is reported as current?",
          expectedAnswer: "Next.js 14 with App Router",
          type: "context_continuity",
          weight: 3.0,
        },
        {
          id: "v4-api-accurate",
          question: "What API style is reported as current?",
          expectedAnswer: "GraphQL with Apollo Server",
          type: "context_continuity",
          weight: 3.0,
        },
        {
          id: "v4-no-stale-react",
          question:
            "Does the agent report React 18 (not Next.js) as the current frontend?",
          expectedAnswer: "No — the current frontend is Next.js 14, not plain React 18",
          type: "conflict_detection",
          weight: 3.0,
        },
        {
          id: "v4-no-stale-rest",
          question:
            "Does the agent report REST API as the current API style?",
          expectedAnswer: "No — the current API style is GraphQL, not REST",
          type: "conflict_detection",
          weight: 3.0,
        },
        {
          id: "v4-database-unchanged",
          question: "What database is reported? (Should be unchanged)",
          expectedAnswer: "MongoDB with Mongoose ODM",
          type: "context_continuity",
          weight: 2.0,
        },
      ],
    },
  ],
  expectedFinalFacts: [
    {
      keypath: "taskflow/frontend/framework",
      expectedValue: "Next.js 14 with App Router",
    },
    {
      keypath: "taskflow/api/style",
      expectedValue: "GraphQL with Apollo Server",
    },
    {
      keypath: "taskflow/database",
      expectedValue: "MongoDB with Mongoose ODM",
    },
    {
      keypath: "taskflow/deployment",
      expectedValue: "Vercel",
    },
  ],
  expectedConflicts: [
    {
      keypath: "taskflow/frontend/framework",
      oldValue: "React 18 with TypeScript",
      newValue: "Next.js 14 with App Router",
    },
    {
      keypath: "taskflow/api/style",
      oldValue: "REST API with Express.js",
      newValue: "GraphQL with Apollo Server",
    },
    {
      keypath: "taskflow/state-management",
      oldValue: "Redux Toolkit",
      newValue: "React Server Components + Apollo Client",
    },
    {
      keypath: "taskflow/deployment",
      oldValue: "Docker containers on AWS ECS",
      newValue: "Vercel",
    },
  ],
};
