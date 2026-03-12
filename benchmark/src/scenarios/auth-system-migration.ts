import { BenchmarkScenario } from "../types";

/**
 * Scenario 2: Auth System Migration
 *
 * A realistic scenario where authentication requirements change mid-project.
 * Tests the memory system's ability to handle security-critical facts that
 * MUST be accurate — reporting stale auth config is a security risk.
 *
 * Session 1: JWT-based auth with httpOnly cookies
 * Session 2: Add OAuth2 providers (Google, GitHub)
 * Session 3: Security audit requires migration to session-based auth + PKCE
 * Session 4: Recall — must report ONLY current auth setup
 */
export const authSystemMigration: BenchmarkScenario = {
  id: "auth-system-migration",
  name: "Auth System Migration",
  description:
    "Authentication system evolves from simple JWT to OAuth2 to session-based auth " +
    "after a security audit. Tests whether stale security decisions are correctly superseded.",
  category: "contradiction_handling",
  sessions: [
    {
      id: "auth-s1-jwt",
      sessionNumber: 1,
      title: "Initial JWT Auth Setup",
      agentPrompt: `You are building the auth system for "SecureApp", a financial dashboard.

The initial auth design:
- Authentication method: JWT tokens
- Token storage: httpOnly secure cookies
- Token expiry: Access token 15 min, refresh token 7 days
- Password hashing: bcrypt with 12 rounds
- Session handling: Stateless (JWT-based, no server-side sessions)
- Rate limiting: 5 failed attempts then 15 min lockout
- MFA: Not implemented yet (planned for v2)
- CORS: Restricted to app.secureapp.com

Store all of these authentication decisions in memory under the project "secureapp".`,
      verificationQueries: [
        {
          id: "auth-v1-method",
          question: "What authentication method does SecureApp use?",
          expectedAnswer: "JWT tokens stored in httpOnly secure cookies",
          type: "fact_recall",
          weight: 1.0,
        },
        {
          id: "auth-v1-session",
          question: "Does SecureApp use server-side sessions?",
          expectedAnswer: "No, it uses stateless JWT-based auth with no server-side sessions",
          type: "fact_recall",
          weight: 1.0,
        },
      ],
    },
    {
      id: "auth-s2-oauth",
      sessionNumber: 2,
      title: "Adding OAuth2 Providers",
      agentPrompt: `Continuing work on SecureApp's auth system.

We're adding OAuth2 social login. New decisions:
- OAuth2 providers: Google and GitHub
- OAuth2 flow: Authorization Code flow (NOT implicit)
- OAuth2 library: Passport.js with passport-google-oauth20 and passport-github2
- Account linking: Users can link OAuth accounts to existing email/password accounts
- JWT tokens are still used after OAuth login (unified token format)
- New user registration: Can now register via OAuth (auto-creates account)

Update memory with these additions. The JWT system is STILL in use — OAuth is an additional login method.`,
      verificationQueries: [
        {
          id: "auth-v2-oauth-providers",
          question: "What OAuth2 providers does SecureApp support?",
          expectedAnswer: "Google and GitHub",
          type: "fact_recall",
          weight: 1.0,
        },
        {
          id: "auth-v2-jwt-still-used",
          question: "Is JWT still used after adding OAuth?",
          expectedAnswer: "Yes, JWT tokens are still used after OAuth login as a unified token format",
          type: "context_continuity",
          weight: 1.5,
        },
        {
          id: "auth-v2-oauth-flow",
          question: "What OAuth2 flow is used?",
          expectedAnswer: "Authorization Code flow (not implicit)",
          type: "fact_recall",
          weight: 1.0,
        },
      ],
    },
    {
      id: "auth-s3-security-audit",
      sessionNumber: 3,
      title: "Post-Security-Audit Migration",
      agentPrompt: `CRITICAL UPDATE for SecureApp auth.

A security audit found vulnerabilities in our JWT approach:
1. JWT tokens in cookies are vulnerable to token theft if XSS occurs
2. Stateless JWTs cannot be revoked server-side
3. The implicit flow concern (even though we use auth code) flagged a review

The security team mandates these changes:
- Authentication method: Server-side sessions with Redis store (REPLACES JWT)
- Session ID: Stored in httpOnly secure sameSite=strict cookie
- Token type: Opaque session tokens (NOT JWT — JWTs are completely removed)
- Session expiry: 30 min idle timeout, 8 hour absolute timeout
- OAuth2 flow: Authorization Code with PKCE (upgraded from plain auth code)
- OAuth2 providers: Google, GitHub, and now Microsoft Entra ID (new)
- MFA: TOTP-based MFA now required for all users (was "planned for v2")
- Passport.js: REMOVED, replaced with custom OAuth2 implementation for tighter control

This is a BREAKING CHANGE. JWT is fully removed. Update memory to reflect that JWT is superseded and sessions are now server-side. Make sure the history is preserved so we know WHY this change was made.`,
      verificationQueries: [
        {
          id: "auth-v3-no-jwt",
          question: "Does SecureApp still use JWT tokens?",
          expectedAnswer:
            "No, JWT was completely removed after the security audit. SecureApp now uses server-side sessions with Redis.",
          type: "conflict_detection",
          weight: 3.0,
        },
        {
          id: "auth-v3-session-type",
          question: "What type of sessions does SecureApp use now?",
          expectedAnswer:
            "Server-side sessions stored in Redis with opaque session tokens in httpOnly secure sameSite=strict cookies",
          type: "fact_recall",
          weight: 2.0,
        },
        {
          id: "auth-v3-mfa",
          question: "What is the MFA status for SecureApp?",
          expectedAnswer: "TOTP-based MFA is required for all users",
          type: "decision_tracking",
          weight: 1.5,
        },
        {
          id: "auth-v3-oauth-upgraded",
          question: "What OAuth2 flow is used after the security audit?",
          expectedAnswer: "Authorization Code with PKCE",
          type: "decision_tracking",
          weight: 1.5,
        },
      ],
    },
    {
      id: "auth-s4-recall",
      sessionNumber: 4,
      title: "Security Configuration Recall",
      agentPrompt: `You are a new developer joining SecureApp. You have no context except what's in memory.

For the security onboarding document, retrieve ALL current authentication and authorization configuration for SecureApp.

CRITICAL: This is for a security document. Reporting stale/superseded security decisions (like saying "we use JWT" when we actually migrated to sessions) would be a security documentation error.

List the current auth configuration covering: authentication method, session handling, OAuth providers, MFA status, and any relevant security settings.`,
      verificationQueries: [
        {
          id: "auth-v4-no-jwt-reported",
          question: "Does the recall report JWT as a current auth method?",
          expectedAnswer: "No — JWT was removed. Current method is server-side sessions with Redis.",
          type: "conflict_detection",
          weight: 4.0,
        },
        {
          id: "auth-v4-current-auth",
          question: "What authentication method is reported as current?",
          expectedAnswer: "Server-side sessions with Redis store, opaque session tokens",
          type: "context_continuity",
          weight: 3.0,
        },
        {
          id: "auth-v4-mfa-current",
          question: "What is MFA status reported as?",
          expectedAnswer: "TOTP-based MFA required for all users",
          type: "context_continuity",
          weight: 2.0,
        },
        {
          id: "auth-v4-oauth-providers-current",
          question: "Which OAuth providers are listed?",
          expectedAnswer: "Google, GitHub, and Microsoft Entra ID",
          type: "context_continuity",
          weight: 2.0,
        },
      ],
    },
  ],
  expectedFinalFacts: [
    {
      keypath: "secureapp/auth/method",
      expectedValue: "Server-side sessions with Redis store",
    },
    {
      keypath: "secureapp/auth/mfa",
      expectedValue: "TOTP-based MFA required for all users",
    },
    {
      keypath: "secureapp/auth/oauth/flow",
      expectedValue: "Authorization Code with PKCE",
    },
  ],
  expectedConflicts: [
    {
      keypath: "secureapp/auth/method",
      oldValue: "JWT tokens in httpOnly cookies",
      newValue: "Server-side sessions with Redis store",
    },
    {
      keypath: "secureapp/auth/session-type",
      oldValue: "Stateless (JWT-based)",
      newValue: "Server-side with Redis",
    },
    {
      keypath: "secureapp/auth/mfa",
      oldValue: "Not implemented yet (planned for v2)",
      newValue: "TOTP-based MFA required for all users",
    },
  ],
};
