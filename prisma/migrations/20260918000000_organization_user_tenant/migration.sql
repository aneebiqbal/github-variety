-- Phase 1: Organization + User models, per-org auth, tenant scoping.
--
-- SAFETY: The default-Organization INSERT is unconditional — it always inserts
-- exactly one row. installationId/githubOwner come from a scalar subquery over
-- existing Projects with a COALESCE NULL fallback, so it works whether the
-- Project table has rows or not (no LIMIT 1 dependency that could insert zero rows).

-- =============================================================
-- 1. Organization
-- =============================================================
CREATE TABLE "Organization" (
    "id"               TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "installationId"   TEXT,
    "githubOwner"      TEXT,
    "stripeCustomerId" TEXT,
    "plan"             TEXT,
    "planStatus"       TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- =============================================================
-- 2. User
-- =============================================================
CREATE TABLE "User" (
    "id"             TEXT NOT NULL,
    "email"          TEXT NOT NULL,
    "passwordHash"   TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================
-- 3. Default Organization (unconditional; COALESCE fallback if no Projects)
-- =============================================================
INSERT INTO "Organization" ("id", "name", "installationId", "githubOwner", "createdAt", "updatedAt")
VALUES (
    'org_bp_default',
    'Default Organization',
    COALESCE((SELECT "installationId" FROM "Project" LIMIT 1), NULL),
    COALESCE((SELECT "githubOwner" FROM "Project" LIMIT 1), NULL),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- =============================================================
-- 4. Project: add organizationId (nullable → backfill → NOT NULL)
-- =============================================================
ALTER TABLE "Project" ADD COLUMN "organizationId" TEXT;

UPDATE "Project" SET "organizationId" = 'org_bp_default';

ALTER TABLE "Project" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- =============================================================
-- 5. Project: drop installationId (now lives on Organization)
-- =============================================================
ALTER TABLE "Project" DROP COLUMN "installationId";

-- =============================================================
-- 6. Feedback: change FK from RESTRICT → CASCADE so org/project deletes
--    clean up child feedbacks without manual delete-many.
-- =============================================================
ALTER TABLE "Feedback" DROP CONSTRAINT "Feedback_projectId_fkey";

ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================
-- 7. Session: add userId + organizationId, then invalidate all old
--    sessions (they were issued under the single-admin model).
-- =============================================================
ALTER TABLE "Session" ADD COLUMN "userId" TEXT;
ALTER TABLE "Session" ADD COLUMN "organizationId" TEXT;

DELETE FROM "Session";

ALTER TABLE "Session" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Session" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Session_organizationId_idx" ON "Session"("organizationId");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
