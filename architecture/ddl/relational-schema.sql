-- =============================================================================
-- ActiOut — Canonical Relational Schema (v2)
-- =============================================================================
-- PostgreSQL DDL. This is the FORWARD-LOOKING canonical schema: the blueprint
-- for the eventual centralized server. It is NOT what runs today.
--
-- Today the app persists to IndexedDB via Dexie; the runtime object stores are
-- documented in ../ddl/indexeddb-stores.md and declared in src/db/schema.ts.
-- IndexedDB enforces only primary keys and declared unique indexes — the
-- constraints below (foreign keys, checks, cascades, NOT NULLs) are enforced in
-- the service layer (src/services/*) at runtime. This file expresses them as the
-- database-level constraints a real server WOULD enforce, so the two realizations
-- stay in sync and the future migration path is unambiguous.
--
-- Conventions:
--   * UUID primary keys everywhere (client-generated; sync-ready).
--   * created_at / updated_at on every mutable entity (TIMESTAMPTZ).
--   * Weight stored WITH its unit per row; never converted on write (INV-5).
--   * Calendar-local dates (session_date, entry_date) are DATE, not TIMESTAMPTZ.
--   * The local schema is single-user: NO users table / user_id here. A
--     multi-tenant extension is sketched in the appendix at the bottom.
-- =============================================================================

-- ------------------------------------------------------------------ enum types
CREATE TYPE weight_unit           AS ENUM ('lb', 'kg');
CREATE TYPE session_status        AS ENUM ('draft', 'completed', 'dnf');
CREATE TYPE source_mode           AS ENUM ('routine', 'quick');
CREATE TYPE theme_pref            AS ENUM ('system', 'light', 'dark');
CREATE TYPE distance_unit         AS ENUM ('mi', 'km');
CREATE TYPE draft_conflict_action AS ENUM ('ask', 'resume', 'close-and-start-new');
CREATE TYPE snapshot_reason       AS ENUM ('pre-import', 'pre-restore', 'pre-sync', 'manual');

-- ============================================================== preferences ===
-- Singleton in the local app (id = 'default'), but modeled as a table.
CREATE TABLE preferences (
    id                            UUID PRIMARY KEY,
    theme                         theme_pref            NOT NULL DEFAULT 'system',
    weight_unit                   weight_unit           NOT NULL DEFAULT 'lb',
    distance_unit                 distance_unit         NOT NULL DEFAULT 'mi',
    default_draft_conflict_action draft_conflict_action NOT NULL DEFAULT 'ask'
    -- v1 confirm_before_replacing_draft REMOVED: redundant with 'ask'.
);

-- ========================================================== exercise catalog ==
CREATE TABLE exercise_catalog (
    id              UUID PRIMARY KEY,
    canonical_name  TEXT        NOT NULL,
    normalized_name TEXT        NOT NULL,   -- lowercased/trimmed match key
    category        TEXT,
    is_custom       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_exercise_normalized_name UNIQUE (normalized_name)
);

-- ============================================================ routine template =
CREATE TABLE routine_templates (
    id            UUID PRIMARY KEY,
    name          TEXT        NOT NULL,
    category      TEXT,
    notes         TEXT,
    default_sets  INTEGER     CHECK (default_sets  IS NULL OR default_sets  >= 0),
    default_reps  INTEGER     CHECK (default_reps  IS NULL OR default_reps  >= 0),
    created_at    TIMESTAMPTZ NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL
    -- v1 is_archived REMOVED: no feature set it; routines are hard-deleted.
    -- daysOfWeek and items are normalized into the two child tables below.
);

-- weekday: 0..6, 0 = Sunday (matches utils/dates weekdayOf + analytics byWeekday).
CREATE TABLE routine_template_days (
    id                 UUID PRIMARY KEY,
    routine_template_id UUID   NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE,
    weekday            SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    CONSTRAINT uq_routine_weekday UNIQUE (routine_template_id, weekday)
);

CREATE TABLE routine_template_items (
    id                  UUID PRIMARY KEY,
    routine_template_id UUID        NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE,
    -- Nullable, snapshot link: exercise_name_snapshot is authoritative for display.
    exercise_catalog_id UUID        REFERENCES exercise_catalog(id) ON DELETE SET NULL,
    exercise_name_snapshot TEXT     NOT NULL,
    sequence_position   INTEGER     NOT NULL CHECK (sequence_position >= 1),
    default_sets        INTEGER     CHECK (default_sets   IS NULL OR default_sets   >= 0),
    default_reps        INTEGER     CHECK (default_reps   IS NULL OR default_reps   >= 0),
    default_weight      NUMERIC     CHECK (default_weight IS NULL OR default_weight >= 0),
    default_weight_unit weight_unit,                 -- present iff default_weight is
    rest_seconds        INTEGER     CHECK (rest_seconds IS NULL OR rest_seconds >= 0),
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL,
    -- Service layer keeps positions contiguous (INV-2); final state is unique.
    CONSTRAINT uq_routine_item_position UNIQUE (routine_template_id, sequence_position),
    CONSTRAINT ck_weight_has_unit CHECK (default_weight IS NULL OR default_weight_unit IS NOT NULL)
);

-- ==================================================================== sessions =
CREATE TABLE sessions (
    id               UUID PRIMARY KEY,
    session_date     DATE           NOT NULL,          -- calendar-local; may be backfilled (past)
    status           session_status NOT NULL DEFAULT 'draft',
    source_mode      source_mode    NOT NULL,          -- 'routine' or 'quick'
    notes            TEXT,
    started_at       TIMESTAMPTZ,
    ended_at         TIMESTAMPTZ,
    duration_seconds INTEGER        CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    created_at       TIMESTAMPTZ    NOT NULL,
    updated_at       TIMESTAMPTZ    NOT NULL
);

-- Partial unique index realizing INV-1 (at most one active draft) at the DB
-- level. On the server this becomes per-user (see appendix); locally it is global.
CREATE UNIQUE INDEX uq_single_active_draft
    ON sessions ((status)) WHERE status = 'draft';

-- Denormalized snapshot of the routine(s) a session was started from.
-- routine_template_id is intentionally NOT a foreign key: routines are
-- hard-deleted while the link (and routine_name_snapshot) must survive.
CREATE TABLE session_routine_links (
    id                  UUID PRIMARY KEY,
    session_id          UUID    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    routine_template_id UUID,                          -- weak ref, may dangle by design
    routine_name_snapshot TEXT  NOT NULL,
    source_sequence     INTEGER NOT NULL
);

-- A session item is the exercise SLOT. It holds planned targets + rest, but NOT
-- the actual work (that lives in session_sets). Item completion is DERIVED (INV-4).
CREATE TABLE session_items (
    id                     UUID    PRIMARY KEY,
    session_id             UUID    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    session_routine_link_id UUID   REFERENCES session_routine_links(id) ON DELETE SET NULL,
    exercise_catalog_id    UUID    REFERENCES exercise_catalog(id) ON DELETE SET NULL,
    exercise_name_snapshot TEXT    NOT NULL,
    sequence_position      INTEGER NOT NULL CHECK (sequence_position >= 1),
    sets_planned           INTEGER CHECK (sets_planned IS NULL OR sets_planned >= 0),
    reps_planned           INTEGER CHECK (reps_planned IS NULL OR reps_planned >= 0),
    rest_seconds           INTEGER CHECK (rest_seconds IS NULL OR rest_seconds >= 0),  -- snapshot from routine item
    notes                  TEXT,
    fatigue_group          TEXT,
    created_at             TIMESTAMPTZ NOT NULL,
    updated_at             TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_session_item_position UNIQUE (session_id, sequence_position)
);

-- A session set is one performed set. THIS is where logged work lives in v2.
CREATE TABLE session_sets (
    id              UUID        PRIMARY KEY,
    session_id      UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,      -- duplicated for direct analytics sweep
    session_item_id UUID        NOT NULL REFERENCES session_items(id) ON DELETE CASCADE,
    set_number      INTEGER     NOT NULL CHECK (set_number >= 1),
    reps            INTEGER     CHECK (reps   IS NULL OR reps   >= 0),
    weight          NUMERIC     CHECK (weight IS NULL OR weight >= 0),
    weight_unit     weight_unit NOT NULL,              -- stamped per set (INV-5)
    is_warmup       BOOLEAN     NOT NULL DEFAULT FALSE, -- excluded from analytics (INV-7)
    completed       BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_set_number UNIQUE (session_item_id, set_number)
);

CREATE INDEX ix_sets_by_session      ON session_sets (session_id);
CREATE INDEX ix_items_by_session     ON session_items (session_id);
CREATE INDEX ix_sessions_by_date     ON sessions (session_date);
CREATE INDEX ix_sessions_by_status   ON sessions (status);

-- ========================================================== bodyweight entries =
CREATE TABLE bodyweight_entries (
    id           UUID        PRIMARY KEY,
    entry_date   DATE        NOT NULL,
    weight_value NUMERIC     NOT NULL CHECK (weight_value > 0),
    weight_unit  weight_unit NOT NULL,                 -- stamped per row (INV-5)
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_bodyweight_by_date ON bodyweight_entries (entry_date);

-- ================================================================= app events ==
-- Append-only lifecycle AUDIT TRAIL (not a mergeable oplog; see
-- ../sync-architecture.md). Written transactionally with the mutation it records
-- (INV-8). payload_json holds a small human-meaningful payload ('null' if none).
CREATE TABLE app_events (
    id           UUID        PRIMARY KEY,
    entity_type  TEXT        NOT NULL,   -- 'session' | 'routine' | 'bodyweight' | 'app'
    entity_id    TEXT        NOT NULL,
    event_type   TEXT        NOT NULL,   -- 'started','completed','dnf','created','updated','deleted','import','restore','snapshot-created'
    payload_json TEXT        NOT NULL,
    occurred_at  TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_events_by_time   ON app_events (occurred_at);
CREATE INDEX ix_events_by_entity ON app_events (entity_type, entity_id);

-- ================================================================== snapshots ==
-- Device-local rollback points (see ../data-safety.md). NEVER included in the
-- export bundle — snapshots are a device concern, not user data. On a server
-- these would typically not exist at all (server-side backup replaces them).
CREATE TABLE snapshots (
    id          UUID            PRIMARY KEY,
    created_at  TIMESTAMPTZ     NOT NULL,
    reason      snapshot_reason NOT NULL,
    summary     TEXT            NOT NULL,   -- e.g. '8 routines, 142 sessions, 30 bodyweight'
    bundle_json TEXT            NOT NULL     -- a compressed ExportBundle (format v2)
);
CREATE INDEX ix_snapshots_by_time ON snapshots (created_at);

-- =============================================================================
-- APPENDIX — Future multi-tenant server extension (NOT part of the local schema)
-- =============================================================================
-- When a centralized server is introduced, multi-user support is added like so.
-- Kept out of the main schema above so the local single-user model has no dead
-- user_id columns (the exact drift the v1 review flagged).
--
--   CREATE TABLE users (
--       id         UUID PRIMARY KEY,
--       created_at TIMESTAMPTZ NOT NULL
--   );
--
--   -- Every user-owned table gains:
--   --   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
--   -- and per-user uniqueness, e.g. the single-draft rule becomes:
--   --   CREATE UNIQUE INDEX uq_single_active_draft
--   --       ON sessions (user_id) WHERE status = 'draft';
--   -- and exercise_catalog normalized-name uniqueness becomes (user_id, normalized_name).
--
--   -- Sync-support columns a server would likely add per row:
--   --   server_seq   BIGSERIAL   -- monotonic per-user change counter for pull-since
--   --   deleted_at   TIMESTAMPTZ -- soft-delete tombstone so deletes propagate
--
-- The local client would keep its existing UUIDs; no id remapping is required,
-- which is the whole point of client-generated UUID primary keys.
-- =============================================================================
