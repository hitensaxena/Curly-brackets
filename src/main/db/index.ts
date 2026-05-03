import Database from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import * as schema from './schema'

const DATA_DIR = app.getPath('userData')
mkdirSync(DATA_DIR, { recursive: true })

const DB_PATH = join(DATA_DIR, 'ai-os.sqlite')
const sqlite = new Database(DB_PATH)

sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// Load sqlite-vec extension for vector search (KNN, cosine distance, etc.).
//
// In a packaged Electron app the platform-specific dylib lives inside an asar
// archive, but `dlopen` (the syscall behind `db.loadExtension`) cannot read
// from asar. electron-builder's `asarUnpack` mirrors the file to
// `app.asar.unpacked/`, but `require.resolve(...)` still returns the asar path.
// So we ask sqlite-vec for the path, then rewrite `app.asar/` → `app.asar.unpacked/`.
let vecLoaded = false
try {
  let extPath: string = sqliteVec.getLoadablePath()
  if (extPath.includes(`${'/'}app.asar${'/'}`)) {
    extPath = extPath.replace(`${'/'}app.asar${'/'}`, `${'/'}app.asar.unpacked${'/'}`)
  }
  sqlite.loadExtension(extPath)
  vecLoaded = true
  console.log('[db] sqlite-vec loaded ok from', extPath)
} catch (err) {
  console.error('[db] FAILED to load sqlite-vec — knowledge indexing will not work:', err)
}
export const isVecExtensionLoaded = (): boolean => vecLoaded

// Expose the raw better-sqlite3 handle for vec0 virtual table queries
// (Drizzle doesn't model virtual tables; we use this for vector ops only)
export const sqliteRaw = sqlite

export const db = drizzle(sqlite, { schema })

export function initDb(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'custom',
      provider TEXT NOT NULL DEFAULT 'claude',
      model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      system_prompt TEXT DEFAULT '',
      memory_path TEXT DEFAULT '',
      tools_enabled TEXT DEFAULT '[]',
      project_id TEXT,
      status TEXT DEFAULT 'idle',
      active_session_id TEXT,
      daily_budget_usd REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      project_id TEXT,
      definition TEXT NOT NULL DEFAULT '{}',
      trigger_config TEXT,
      per_run_budget_usd REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      step_states TEXT,
      artifacts TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      triggered_by TEXT DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      repo_path TEXT,
      context_md_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      session_id TEXT,
      workflow_run_id TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      from_agent_id TEXT,
      to_agent_id TEXT,
      workflow_run_id TEXT,
      content_type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL,
      priority TEXT DEFAULT 'normal',
      timestamp INTEGER NOT NULL,
      read INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New conversation',
      project_id TEXT,
      default_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      default_agent_id TEXT,
      claude_session_id TEXT,
      pinned_source_ids TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_message_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      agent_id TEXT,
      content TEXT NOT NULL,
      sources TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_msgs_conv ON conversation_messages(conversation_id, created_at);

    CREATE TABLE IF NOT EXISTS vector_sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      title TEXT,
      header_chain TEXT,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      project_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_sources_kind_path ON vector_sources(kind, path);
    CREATE INDEX IF NOT EXISTS ix_sources_hash ON vector_sources(content_hash);

    CREATE TABLE IF NOT EXISTS knowledge_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      project_id TEXT,
      type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'idle',
      error_message TEXT,
      total_chunks INTEGER DEFAULT 0,
      last_indexed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ix_knowledge_sources_scope ON knowledge_sources(scope, project_id);
  `)

  // Additive migrations for previously-shipped schemas
  try {
    const convCols = sqlite.prepare(`PRAGMA table_info(conversation_messages)`).all() as Array<{ name: string }>
    if (!convCols.some((c) => c.name === 'sources')) {
      sqlite.exec(`ALTER TABLE conversation_messages ADD COLUMN sources TEXT`)
    }

    const vsCols = sqlite.prepare(`PRAGMA table_info(vector_sources)`).all() as Array<{ name: string }>
    if (!vsCols.some((c) => c.name === 'source_id')) {
      sqlite.exec(`ALTER TABLE vector_sources ADD COLUMN source_id TEXT`)
      sqlite.exec(`CREATE INDEX IF NOT EXISTS ix_vector_sources_source_id ON vector_sources(source_id)`)
    }

    const convoCols = sqlite.prepare(`PRAGMA table_info(conversations)`).all() as Array<{ name: string }>
    if (!convoCols.some((c) => c.name === 'pinned_source_ids')) {
      sqlite.exec(`ALTER TABLE conversations ADD COLUMN pinned_source_ids TEXT DEFAULT '[]'`)
    }

    const agentCols = sqlite.prepare(`PRAGMA table_info(agents)`).all() as Array<{ name: string }>
    if (!agentCols.some((c) => c.name === 'daily_budget_usd')) {
      sqlite.exec(`ALTER TABLE agents ADD COLUMN daily_budget_usd REAL`)
    }
    const wfCols = sqlite.prepare(`PRAGMA table_info(workflows)`).all() as Array<{ name: string }>
    if (!wfCols.some((c) => c.name === 'per_run_budget_usd')) {
      sqlite.exec(`ALTER TABLE workflows ADD COLUMN per_run_budget_usd REAL`)
    }
  } catch (err) {
    console.error('[db] migration check failed:', err)
  }

  // Virtual vec0 table for embeddings — separate exec because it's not in the schema literal
  try {
    sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vector_embeddings USING vec0(
        id TEXT PRIMARY KEY,
        embedding FLOAT[1536]
      );
    `)
  } catch (err) {
    console.error('[db] failed to create vec0 table:', err)
  }
}

export { schema }
