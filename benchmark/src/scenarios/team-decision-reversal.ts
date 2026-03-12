import { BenchmarkScenario } from "../types";

/**
 * Scenario 5: Team Decision Reversal
 *
 * The hardest scenario: decisions are made, then reversed, then partially
 * re-adopted. Tests the memory system's ability to handle non-linear
 * decision histories.
 *
 * Session 1: Monolith architecture chosen
 * Session 2: Team decides to switch to microservices
 * Session 3: After struggling, team REVERTS to monolith with modular structure
 * Session 4: Recall must show current = monolith, and explain the full journey
 */
export const teamDecisionReversal: BenchmarkScenario = {
  id: "team-decision-reversal",
  name: "Team Decision Reversal (Monolith → Microservices → Monolith)",
  description:
    "Architecture goes from monolith to microservices and back to monolith. " +
    "The hardest test: memory must track the full decision arc and report " +
    "the CURRENT state as monolith, not microservices, despite microservices " +
    "being the most recent 'forward' decision.",
  category: "project_complexity",
  sessions: [
    {
      id: "reversal-s1-monolith",
      sessionNumber: 1,
      title: "Initial Monolith Design",
      agentPrompt: `You are architecting "ShopStream", a new e-commerce platform.

The team has decided on a monolithic architecture for the MVP:

Architecture: Monolithic application
- Single Node.js application
- Framework: NestJS with modular structure
- Database: PostgreSQL (single database)
- ORM: Prisma
- Deployment: Single Heroku dyno
- API: REST
- Frontend: Embedded EJS templates (server-rendered)
- Background jobs: Bull queue (Redis-backed)
- File storage: Local filesystem (S3 planned for later)
- Monitoring: Basic console logging

Justification: Small team of 3, need to ship MVP fast, premature optimization is the root of all evil.

Store all of this in memory for the "shopstream" project.`,
      verificationQueries: [
        {
          id: "rev-v1-arch",
          question: "What architecture does ShopStream use?",
          expectedAnswer: "Monolithic application with NestJS",
          type: "fact_recall",
          weight: 1.0,
        },
        {
          id: "rev-v1-justification",
          question: "Why was monolith chosen?",
          expectedAnswer:
            "Small team of 3, need to ship MVP fast, avoid premature optimization",
          type: "fact_recall",
          weight: 1.0,
        },
      ],
    },
    {
      id: "reversal-s2-microservices",
      sessionNumber: 2,
      title: "Migration to Microservices",
      agentPrompt: `ShopStream is growing. The team (now 12 engineers) decided to switch to microservices.

NEW ARCHITECTURE: Microservices
- Services: user-service, product-service, order-service, payment-service, notification-service
- Communication: gRPC between services, REST for external API
- Database: Each service has its own PostgreSQL database (database-per-service)
- ORM: Each service uses Prisma with isolated schemas
- Service mesh: Istio on Kubernetes
- Deployment: Kubernetes on AWS EKS (replaces Heroku)
- API Gateway: Kong
- Frontend: React SPA (replaces EJS templates)
- Event bus: Apache Kafka for async events
- File storage: AWS S3 (finally moved from local)
- Monitoring: Datadog APM + structured logging with Pino
- CI/CD: GitHub Actions → ArgoCD for GitOps deployment

Justification: Team grew from 3 to 12, need independent deployability, monolith was causing merge conflicts and slow CI.

This REPLACES the monolith. Update memory to mark the monolith as superseded.`,
      verificationQueries: [
        {
          id: "rev-v2-arch",
          question: "What architecture does ShopStream use?",
          expectedAnswer: "Microservices with 5 services on Kubernetes",
          type: "fact_recall",
          weight: 1.5,
        },
        {
          id: "rev-v2-services",
          question: "What are the ShopStream microservices?",
          expectedAnswer:
            "user-service, product-service, order-service, payment-service, notification-service",
          type: "fact_recall",
          weight: 1.0,
        },
        {
          id: "rev-v2-deployment",
          question: "Where is ShopStream deployed?",
          expectedAnswer: "Kubernetes on AWS EKS (replaced Heroku)",
          type: "decision_tracking",
          weight: 1.5,
        },
      ],
    },
    {
      id: "reversal-s3-revert-monolith",
      sessionNumber: 3,
      title: "Revert to Modular Monolith",
      agentPrompt: `CRITICAL DECISION: ShopStream is reverting from microservices back to a monolith.

After 6 months with microservices, the team found:
- Operational complexity was overwhelming (Kubernetes, Istio, Kafka all need expertise)
- Distributed debugging was 10x harder than monolith debugging
- Data consistency across services was a nightmare (saga pattern was buggy)
- Team of 12 couldn't justify 5 separate deployment pipelines
- Latency increased due to inter-service gRPC calls
- Cost of AWS EKS + multiple RDS instances was 4x the Heroku cost

NEW ARCHITECTURE: Modular Monolith (NOT the same as the original monolith)
- Architecture: Modular monolith (single deployment, internal module boundaries)
- Framework: NestJS (same as original, but with strict module boundaries)
- Modules: UserModule, ProductModule, OrderModule, PaymentModule, NotificationModule
  (same domains as microservices, but as NestJS modules, not separate services)
- Database: Single PostgreSQL database with schema-per-module
- ORM: Prisma (single client, multiple schemas)
- Deployment: Railway.app (not Heroku, not AWS EKS)
- API: REST (removed gRPC)
- Frontend: React SPA (KEEPING this from microservices era, not reverting to EJS)
- Event bus: In-process EventEmitter (removed Kafka)
- File storage: AWS S3 (KEEPING this)
- Monitoring: Datadog APM (KEEPING this)
- CI/CD: GitHub Actions → Railway deploy (simplified from ArgoCD)

KEY POINT: This is NOT the same as session 1's monolith. It's a modular monolith with lessons learned. Some microservices-era decisions (React, S3, Datadog) are KEPT.

Update memory. The microservices architecture is now SUPERSEDED. The current state is modular monolith. Track the full arc: monolith → microservices → modular monolith.`,
      verificationQueries: [
        {
          id: "rev-v3-arch",
          question: "What is ShopStream's CURRENT architecture?",
          expectedAnswer:
            "Modular monolith (single deployment with strict module boundaries, NOT the same as the original monolith and NOT microservices)",
          type: "conflict_detection",
          weight: 3.0,
        },
        {
          id: "rev-v3-not-microservices",
          question: "Does ShopStream use microservices?",
          expectedAnswer:
            "No, microservices were tried but reverted due to operational complexity. Current architecture is a modular monolith.",
          type: "conflict_detection",
          weight: 3.0,
        },
        {
          id: "rev-v3-kept-decisions",
          question: "Which decisions from the microservices era were kept?",
          expectedAnswer:
            "React SPA frontend, AWS S3 for file storage, Datadog APM for monitoring",
          type: "decision_tracking",
          weight: 2.0,
        },
        {
          id: "rev-v3-deployment",
          question: "Where is ShopStream currently deployed?",
          expectedAnswer: "Railway.app (not Heroku from v1, not AWS EKS from v2)",
          type: "decision_tracking",
          weight: 2.0,
        },
        {
          id: "rev-v3-revert-reason",
          question: "Why did the team revert from microservices?",
          expectedAnswer:
            "Operational complexity, harder debugging, data consistency issues, cost was 4x higher, inter-service latency",
          type: "fact_recall",
          weight: 1.5,
        },
      ],
    },
    {
      id: "reversal-s4-recall",
      sessionNumber: 4,
      title: "Architecture History Recall",
      agentPrompt: `You're presenting ShopStream's architecture to the CTO. You have no context except memory.

The CTO wants to understand:
1. What is the CURRENT architecture?
2. What was tried before and why it didn't work?
3. What's the full decision timeline?
4. Which specific technology choices are current?

Retrieve everything from memory and give a comprehensive, accurate summary. Do NOT report microservices as current. Do NOT report the original basic monolith as current. The current state is a MODULAR monolith with specific technology choices.`,
      verificationQueries: [
        {
          id: "rev-v4-current-arch",
          question: "What architecture is reported as current?",
          expectedAnswer:
            "Modular monolith with NestJS, strict module boundaries, single PostgreSQL database with schema-per-module",
          type: "context_continuity",
          weight: 4.0,
        },
        {
          id: "rev-v4-not-basic-monolith",
          question:
            "Does the agent distinguish between the original monolith and the current modular monolith?",
          expectedAnswer:
            "Yes — the original was a basic monolith with EJS templates on Heroku. The current is a modular monolith with React SPA on Railway.app with lessons learned from microservices.",
          type: "context_continuity",
          weight: 3.0,
        },
        {
          id: "rev-v4-timeline",
          question: "What is the architecture decision timeline?",
          expectedAnswer:
            "1) Basic monolith (NestJS + EJS + Heroku) → 2) Microservices (5 services + K8s + Kafka) → 3) Modular monolith (NestJS modules + React + Railway)",
          type: "decision_tracking",
          weight: 3.0,
        },
        {
          id: "rev-v4-current-deployment",
          question: "Where is ShopStream currently deployed?",
          expectedAnswer: "Railway.app",
          type: "context_continuity",
          weight: 2.0,
        },
        {
          id: "rev-v4-current-frontend",
          question: "What frontend does ShopStream use?",
          expectedAnswer: "React SPA (kept from microservices era)",
          type: "context_continuity",
          weight: 2.0,
        },
      ],
    },
  ],
  expectedFinalFacts: [
    {
      keypath: "shopstream/architecture",
      expectedValue: "Modular monolith",
    },
    {
      keypath: "shopstream/deployment",
      expectedValue: "Railway.app",
    },
    {
      keypath: "shopstream/frontend",
      expectedValue: "React SPA",
    },
    {
      keypath: "shopstream/database",
      expectedValue: "Single PostgreSQL with schema-per-module",
    },
  ],
  expectedConflicts: [
    {
      keypath: "shopstream/architecture",
      oldValue: "Microservices",
      newValue: "Modular monolith",
    },
    {
      keypath: "shopstream/deployment",
      oldValue: "AWS EKS Kubernetes",
      newValue: "Railway.app",
    },
    {
      keypath: "shopstream/event-bus",
      oldValue: "Apache Kafka",
      newValue: "In-process EventEmitter",
    },
  ],
};
