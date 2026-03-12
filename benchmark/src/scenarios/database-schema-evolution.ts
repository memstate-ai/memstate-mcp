import { BenchmarkScenario } from "../types";

/**
 * Scenario 3: Database Schema Evolution
 *
 * Tests memory across schema migrations where column names, types, and
 * relationships change. The agent must track what the CURRENT schema looks
 * like even after multiple migrations.
 *
 * Session 1: Initial schema with users, posts, comments
 * Session 2: Normalize — extract profiles, add tags (many-to-many)
 * Session 3: Denormalize for performance — embed comment counts, add materialized views
 */
export const databaseSchemaEvolution: BenchmarkScenario = {
  id: "database-schema-evolution",
  name: "Database Schema Evolution",
  description:
    "Database schema changes across 3 sessions from normalized to denormalized. " +
    "Tests whether the memory system tracks column renames, type changes, and " +
    "relationship restructuring without confusing old and new schemas.",
  category: "cross_session_context",
  sessions: [
    {
      id: "db-s1-initial",
      sessionNumber: 1,
      title: "Initial Schema Design",
      agentPrompt: `You are designing the database schema for "BlogEngine", a content platform.

Initial schema (PostgreSQL):

Table: users
- id: UUID PRIMARY KEY
- username: VARCHAR(50) UNIQUE NOT NULL
- email: VARCHAR(255) UNIQUE NOT NULL
- password_hash: VARCHAR(255) NOT NULL
- created_at: TIMESTAMP DEFAULT NOW()

Table: posts
- id: UUID PRIMARY KEY
- author_id: UUID REFERENCES users(id)
- title: VARCHAR(255) NOT NULL
- body: TEXT NOT NULL
- status: VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived'))
- created_at: TIMESTAMP DEFAULT NOW()
- updated_at: TIMESTAMP DEFAULT NOW()

Table: comments
- id: UUID PRIMARY KEY
- post_id: UUID REFERENCES posts(id)
- user_id: UUID REFERENCES users(id)
- body: TEXT NOT NULL
- created_at: TIMESTAMP DEFAULT NOW()

Indexes:
- posts_author_id_idx ON posts(author_id)
- comments_post_id_idx ON comments(post_id)
- users_email_idx ON users(email)

Store this complete schema in memory under the "blogengine" project. Include table definitions, column types, and indexes.`,
      verificationQueries: [
        {
          id: "db-v1-users-table",
          question: "What columns does the users table have?",
          expectedAnswer:
            "id (UUID PK), username (VARCHAR 50), email (VARCHAR 255), password_hash (VARCHAR 255), created_at (TIMESTAMP)",
          type: "fact_recall",
          weight: 1.0,
        },
        {
          id: "db-v1-post-status",
          question: "What are the valid status values for a post?",
          expectedAnswer: "draft, published, archived",
          type: "fact_recall",
          weight: 1.0,
        },
      ],
    },
    {
      id: "db-s2-normalize",
      sessionNumber: 2,
      title: "Schema Normalization",
      agentPrompt: `Continuing on BlogEngine's database.

We're normalizing the schema and adding features:

CHANGES:
1. Extract user profile into separate table:
   - users table: REMOVE email (moved to profiles)
   - New table "profiles": id, user_id FK, email, display_name, bio, avatar_url

2. Add tagging system (many-to-many):
   - New table "tags": id (UUID PK), name (VARCHAR 50 UNIQUE), slug (VARCHAR 50 UNIQUE)
   - New junction table "post_tags": post_id FK, tag_id FK, PRIMARY KEY (post_id, tag_id)

3. Rename columns:
   - posts.body → posts.content (more descriptive)
   - comments.body → comments.content (consistency)

4. Add columns:
   - posts.slug: VARCHAR(255) UNIQUE NOT NULL
   - posts.excerpt: VARCHAR(500)
   - users.role: VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator'))

Update memory with ALL schema changes. Mark old column names as superseded.`,
      verificationQueries: [
        {
          id: "db-v2-email-moved",
          question: "Where is the user's email stored now?",
          expectedAnswer: "In the profiles table (moved from users table)",
          type: "decision_tracking",
          weight: 2.0,
        },
        {
          id: "db-v2-body-renamed",
          question: "What is the column name for post content?",
          expectedAnswer: "content (renamed from body)",
          type: "conflict_detection",
          weight: 2.0,
        },
        {
          id: "db-v2-tags-structure",
          question: "How is the tagging system structured?",
          expectedAnswer:
            "Many-to-many: tags table (id, name, slug) with post_tags junction table (post_id, tag_id)",
          type: "fact_recall",
          weight: 1.0,
        },
      ],
    },
    {
      id: "db-s3-denormalize",
      sessionNumber: 3,
      title: "Performance Denormalization",
      agentPrompt: `BlogEngine is scaling up. Performance issues require denormalization.

CHANGES:
1. Add denormalized counters:
   - posts.comment_count: INTEGER DEFAULT 0 (materialized count)
   - posts.tag_count: INTEGER DEFAULT 0
   - users.post_count: INTEGER DEFAULT 0

2. Add materialized view:
   - mv_post_feed: Materialized view joining posts + users + profiles + comment counts
   - Refreshed every 5 minutes via pg_cron

3. Add full-text search:
   - posts.search_vector: TSVECTOR (generated from title + content)
   - New GIN index on posts.search_vector

4. Change post status type:
   - posts.status: Changed from VARCHAR to ENUM type 'post_status_enum'
   - Added new status value: 'scheduled'
   - Valid values now: draft, published, archived, scheduled

5. Add table:
   - post_revisions: id, post_id FK, content TEXT, revised_at TIMESTAMP, revised_by UUID FK
   - Tracks edit history for posts

Update memory. The schema is getting complex — make sure current state is clear.

Then retrieve the COMPLETE current schema for the posts table to verify memory accuracy.`,
      verificationQueries: [
        {
          id: "db-v3-posts-columns",
          question:
            "List ALL current columns on the posts table (after all migrations).",
          expectedAnswer:
            "id, author_id, title, content (was body), status (now ENUM), slug, excerpt, comment_count, tag_count, search_vector, created_at, updated_at",
          type: "context_continuity",
          weight: 3.0,
        },
        {
          id: "db-v3-status-values",
          question: "What are the current valid status values for a post?",
          expectedAnswer: "draft, published, archived, scheduled (added scheduled, changed from VARCHAR to ENUM)",
          type: "decision_tracking",
          weight: 2.0,
        },
        {
          id: "db-v3-no-body-column",
          question: "Does the posts table have a 'body' column?",
          expectedAnswer:
            "No, it was renamed to 'content' in the normalization session",
          type: "conflict_detection",
          weight: 3.0,
        },
        {
          id: "db-v3-email-location",
          question: "If I need to query a user's email, which table do I look in?",
          expectedAnswer: "The profiles table (email was moved from users to profiles)",
          type: "context_continuity",
          weight: 2.0,
        },
      ],
    },
  ],
  expectedFinalFacts: [
    {
      keypath: "blogengine/schema/posts/columns/content",
      expectedValue: "TEXT NOT NULL (renamed from body)",
    },
    {
      keypath: "blogengine/schema/posts/columns/status",
      expectedValue: "post_status_enum (draft, published, archived, scheduled)",
    },
    {
      keypath: "blogengine/schema/profiles",
      expectedValue: "Separate table with email, display_name, bio, avatar_url",
    },
  ],
  expectedConflicts: [
    {
      keypath: "blogengine/schema/posts/columns/body",
      oldValue: "body: TEXT NOT NULL",
      newValue: "content: TEXT NOT NULL (renamed)",
    },
    {
      keypath: "blogengine/schema/posts/columns/status",
      oldValue: "VARCHAR(20) CHECK (draft, published, archived)",
      newValue: "post_status_enum (draft, published, archived, scheduled)",
    },
    {
      keypath: "blogengine/schema/users/columns/email",
      oldValue: "email: VARCHAR(255) on users table",
      newValue: "Moved to profiles table",
    },
  ],
};
