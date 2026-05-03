import { createHash, randomUUID } from 'crypto'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative, basename, extname } from 'path'
import { eq, and, inArray, isNull } from 'drizzle-orm'
import OpenAI from 'openai'
import matter from 'gray-matter'
import chokidar, { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { db, sqliteRaw } from '../db'
import { vectorSources, knowledgeSources, appSettings } from '../db/schema'

// ── Settings keys ────────────────────────────────────────────────────────────
const KEY_OPENAI_API_KEY = 'openaiApiKey'
const KEY_OBSIDIAN_VAULT_PATH = 'obsidianVaultPath' // legacy single-vault setting
const KEY_EMBEDDING_MODEL = 'embeddingModel'
const KEY_DEFAULT_SOURCE_BACKFILLED = 'defaultSourceBackfilled'
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIM = 1536

// ── Types ────────────────────────────────────────────────────────────────────
export type SourceType = 'obsidian' | 'folder' | 'pdf' | 'pdfFolder' | 'url' | 'codebase'
export type SourceScope = 'global' | 'project'
export interface ObsidianConfig { path: string }
export interface FolderConfig { path: string; extensions?: string[] }
export interface PdfConfig { path: string }
export interface PdfFolderConfig { path: string }
export interface UrlConfig { url: string }
export interface CodebaseConfig { path: string; extensions?: string[] }
export type SourceConfig = ObsidianConfig | FolderConfig | PdfConfig | PdfFolderConfig | UrlConfig | CodebaseConfig

// File extensions indexed for codebase sources by default. Keep generous; users can override via config.
const CODEBASE_DEFAULT_EXTS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.h', '.cpp', '.hpp', '.cs',
  '.php', '.scala', '.dart', '.lua', '.sh', '.bash', '.zsh',
  '.html', '.css', '.scss', '.sass', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.markdown', '.txt', '.sql', '.proto', '.graphql', '.gql'
]
const CODEBASE_IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache',
  'coverage', '__pycache__', '.venv', 'venv', '.gradle', '.idea', '.vscode'
])

export interface KnowledgeSourceRow {
  id: string
  name: string
  scope: SourceScope
  projectId: string | null
  type: SourceType
  config: SourceConfig
  enabled: boolean
  status: string
  errorMessage: string | null
  totalChunks: number
  lastIndexedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface RetrievedChunk {
  id: string
  sourceId: string | null
  sourceName: string | null
  sourceType: string | null
  kind: string
  path: string
  title: string | null
  headerChain: string[]
  content: string
  score: number
}

// ── Cached singletons ────────────────────────────────────────────────────────
let openaiClient: OpenAI | null = null
const watchers = new Map<string, FSWatcher>()

function getSetting(key: string): string | null {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  return row?.value ?? null
}

function setSetting(key: string, value: string): void {
  const now = Date.now()
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get()
  if (existing) db.update(appSettings).set({ value, updatedAt: now }).where(eq(appSettings.key, key)).run()
  else db.insert(appSettings).values({ key, value, updatedAt: now }).run()
}

function broadcastToAll(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

function getOpenAI(): OpenAI {
  const apiKey = getSetting(KEY_OPENAI_API_KEY) || process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not set. Add it in Settings → Knowledge.')
  if (openaiClient && (openaiClient as unknown as { apiKey: string }).apiKey === apiKey) return openaiClient
  openaiClient = new OpenAI({ apiKey })
  return openaiClient
}

export function isKnowledgeReady(): boolean {
  return !!(getSetting(KEY_OPENAI_API_KEY) || process.env.OPENAI_API_KEY)
}

async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const client = getOpenAI()
  const model = getSetting(KEY_EMBEDDING_MODEL) || DEFAULT_EMBEDDING_MODEL
  const res = await client.embeddings.create({ model, input: texts })
  return res.data.map((d) => d.embedding)
}

function hash(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16)
}

// ── Source row marshalling ───────────────────────────────────────────────────

function rowToSource(row: typeof knowledgeSources.$inferSelect): KnowledgeSourceRow {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope as SourceScope,
    projectId: row.projectId,
    type: row.type as SourceType,
    config: JSON.parse(row.config) as SourceConfig,
    enabled: row.enabled !== 0,
    status: row.status,
    errorMessage: row.errorMessage,
    totalChunks: row.totalChunks ?? 0,
    lastIndexedAt: row.lastIndexedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function refreshChunkCount(sourceId: string): void {
  const r = sqliteRaw.prepare('SELECT COUNT(*) AS n FROM vector_sources WHERE source_id = ?').get(sourceId) as { n: number }
  db.update(knowledgeSources).set({ totalChunks: r.n }).where(eq(knowledgeSources.id, sourceId)).run()
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function listSources(filter?: { scope?: SourceScope; projectId?: string | null }): KnowledgeSourceRow[] {
  let q = db.select().from(knowledgeSources).$dynamic()
  const conds = []
  if (filter?.scope) conds.push(eq(knowledgeSources.scope, filter.scope))
  if (filter && 'projectId' in filter) {
    if (filter.projectId === null) conds.push(isNull(knowledgeSources.projectId))
    else if (filter.projectId !== undefined) conds.push(eq(knowledgeSources.projectId, filter.projectId))
  }
  if (conds.length) q = q.where(and(...conds))
  return q.all().map(rowToSource)
}

export function getSource(id: string): KnowledgeSourceRow | null {
  const row = db.select().from(knowledgeSources).where(eq(knowledgeSources.id, id)).get()
  return row ? rowToSource(row) : null
}

export function createSource(input: {
  name: string
  scope: SourceScope
  projectId?: string | null
  type: SourceType
  config: SourceConfig
  enabled?: boolean
}): KnowledgeSourceRow {
  const id = randomUUID()
  const now = Date.now()
  const row = {
    id,
    name: input.name,
    scope: input.scope,
    projectId: input.scope === 'project' ? (input.projectId ?? null) : null,
    type: input.type,
    config: JSON.stringify(input.config),
    enabled: input.enabled === false ? 0 : 1,
    status: 'idle',
    errorMessage: null as string | null,
    totalChunks: 0,
    lastIndexedAt: null as number | null,
    createdAt: now,
    updatedAt: now
  }
  db.insert(knowledgeSources).values(row).run()
  const source = rowToSource(row as typeof knowledgeSources.$inferSelect)
  broadcastToAll('knowledge:sources:updated', { id })
  if (source.enabled) startWatcherForSource(source)
  return source
}

export function updateSource(id: string, updates: Partial<{
  name: string
  config: SourceConfig
  enabled: boolean
}>): void {
  const existing = getSource(id)
  if (!existing) throw new Error(`Source ${id} not found`)
  const patch: Record<string, unknown> = { updatedAt: Date.now() }
  if (updates.name !== undefined) patch.name = updates.name
  if (updates.config !== undefined) patch.config = JSON.stringify(updates.config)
  if (updates.enabled !== undefined) patch.enabled = updates.enabled ? 1 : 0
  db.update(knowledgeSources).set(patch).where(eq(knowledgeSources.id, id)).run()
  const next = getSource(id)
  if (next) {
    if (next.enabled) startWatcherForSource(next)
    else stopWatcherForSource(id)
  }
  broadcastToAll('knowledge:sources:updated', { id })
}

export function deleteSource(id: string): void {
  stopWatcherForSource(id)
  // Drop all chunks belonging to this source from both tables
  const rows = db.select().from(vectorSources).where(eq(vectorSources.sourceId, id)).all()
  const tx = sqliteRaw.transaction(() => {
    const delEmb = sqliteRaw.prepare('DELETE FROM vector_embeddings WHERE id = ?')
    for (const r of rows) delEmb.run(r.id)
    sqliteRaw.prepare('DELETE FROM vector_sources WHERE source_id = ?').run(id)
    sqliteRaw.prepare('DELETE FROM knowledge_sources WHERE id = ?').run(id)
  })
  tx()
  broadcastToAll('knowledge:sources:updated', { id, deleted: true })
}

export function setSourceStatus(id: string, status: string, errorMessage?: string | null): void {
  db.update(knowledgeSources).set({
    status,
    errorMessage: errorMessage ?? null,
    updatedAt: Date.now()
  }).where(eq(knowledgeSources.id, id)).run()
  broadcastToAll('knowledge:sources:updated', { id })
}

// ── Chunking ─────────────────────────────────────────────────────────────────

interface RawChunk {
  notePath: string
  noteTitle: string
  headerChain: string[]
  content: string
}

function chunkMarkdown(notePath: string, body: string): RawChunk[] {
  const noteTitle = basename(notePath, extname(notePath))
  const lines = body.split('\n')
  const chunks: RawChunk[] = []
  let buf: string[] = []
  let chain: string[] = []

  const flush = () => {
    const text = buf.join('\n').trim()
    if (text.length === 0) return
    const prefix = chain.length > 0 ? chain.join(' › ') + '\n\n' : ''
    chunks.push({ notePath, noteTitle, headerChain: [...chain], content: prefix + text })
    buf = []
  }

  for (const line of lines) {
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line)
    if (m) {
      flush()
      const level = m[1].length
      chain = chain.slice(0, level - 1)
      chain.push(m[2])
      continue
    }
    buf.push(line)
  }
  flush()

  if (chunks.length === 0 && body.trim().length > 0) {
    chunks.push({ notePath, noteTitle, headerChain: [noteTitle], content: body.trim() })
  }
  return chunks
}

function chunkPlainText(notePath: string, body: string, windowChars = 2400, overlap = 200): RawChunk[] {
  const noteTitle = basename(notePath, extname(notePath))
  if (body.trim().length === 0) return []
  const out: RawChunk[] = []
  for (let i = 0; i < body.length; i += windowChars - overlap) {
    const slice = body.slice(i, i + windowChars).trim()
    if (slice.length === 0) continue
    out.push({ notePath, noteTitle, headerChain: [noteTitle], content: slice })
  }
  return out
}

// ── File walking ─────────────────────────────────────────────────────────────

function listFilesByExt(root: string, exts: string[]): string[] {
  const out: string[] = []
  const ignore = new Set(['.obsidian', '.trash', 'node_modules', '.git'])
  const lowerExts = exts.map((e) => e.toLowerCase())
  const walk = (dir: string) => {
    let entries: string[] = []
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      if (ignore.has(name) || name.startsWith('.')) continue
      const full = join(dir, name)
      let st
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) walk(full)
      else if (st.isFile() && lowerExts.includes(extname(name).toLowerCase())) out.push(full)
    }
  }
  walk(root)
  return out
}

const MAX_CODEBASE_FILE_BYTES = 256 * 1024 // skip giant files (minified bundles, generated lockfiles, etc.)
function listCodebaseFiles(root: string, exts: string[]): string[] {
  const out: string[] = []
  const lowerExts = exts.map((e) => e.toLowerCase())
  const walk = (dir: string) => {
    let entries: string[] = []
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      if (CODEBASE_IGNORE_DIRS.has(name)) continue
      // Skip hidden EXCEPT recognised dotfiles people care about (.env.example, .eslintrc, etc.)
      if (name.startsWith('.') && !['.env.example', '.eslintrc', '.prettierrc', '.gitignore'].includes(name)) continue
      const full = join(dir, name)
      let st
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) {
        walk(full)
      } else if (st.isFile()) {
        if (st.size > MAX_CODEBASE_FILE_BYTES) continue
        if (!lowerExts.includes(extname(name).toLowerCase())) continue
        out.push(full)
      }
    }
  }
  walk(root)
  return out
}

// ── Per-source indexing ──────────────────────────────────────────────────────

function deleteChunksForSourcePath(sourceId: string, path: string): void {
  const rows = db.select().from(vectorSources)
    .where(and(eq(vectorSources.sourceId, sourceId), eq(vectorSources.path, path)))
    .all()
  for (const r of rows) {
    sqliteRaw.prepare('DELETE FROM vector_embeddings WHERE id = ?').run(r.id)
    db.delete(vectorSources).where(eq(vectorSources.id, r.id)).run()
  }
}

async function extractText(absPath: string, type: SourceType): Promise<{ chunks: RawChunk[]; rawHash: string } | null> {
  const ext = extname(absPath).toLowerCase()

  if (type === 'pdf' || type === 'pdfFolder' || ext === '.pdf') {
    let pdfBuf: Buffer
    try { pdfBuf = readFileSync(absPath) } catch { return null }
    const rawHash = hash(pdfBuf.toString('binary'))
    const pdfParse = (await import('pdf-parse')).default
    const data = await pdfParse(pdfBuf)
    const text = data.text || ''
    return { chunks: chunkPlainText(absPath, text), rawHash }
  }

  if (type === 'obsidian') {
    let raw: string
    try { raw = readFileSync(absPath, 'utf-8') } catch { return null }
    const fm = matter(raw)
    const body = fm.content
    return { chunks: chunkMarkdown(absPath, body), rawHash: hash(body) }
  }

  if (type === 'codebase') {
    let raw: string
    try { raw = readFileSync(absPath, 'utf-8') } catch { return null }
    // Skip files that look binary (lots of NULs in the first KB)
    const head = raw.slice(0, 1024)
    let nulCount = 0
    for (let i = 0; i < head.length; i++) if (head.charCodeAt(i) === 0) nulCount++
    if (nulCount > 4) return null
    return { chunks: chunkPlainText(absPath, raw), rawHash: hash(raw) }
  }

  // folder — markdown stays markdown-chunked, anything else as plain text
  let raw: string
  try { raw = readFileSync(absPath, 'utf-8') } catch { return null }
  if (ext === '.md' || ext === '.markdown') {
    return { chunks: chunkMarkdown(absPath, raw), rawHash: hash(raw) }
  }
  return { chunks: chunkPlainText(absPath, raw), rawHash: hash(raw) }
}

// URL extraction lives outside extractText since the input is a URL string, not a path.
async function extractFromUrl(url: string): Promise<{ title: string; chunks: RawChunk[]; rawHash: string } | null> {
  let html: string
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AIOSWorkstation/1.0; +https://github.com/)'
      },
      redirect: 'follow'
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (err) {
    console.error('[knowledge] url fetch failed', url, err)
    return null
  }

  // Use Mozilla Readability to extract the main article content
  const { JSDOM } = await import('jsdom')
  const { Readability } = await import('@mozilla/readability')
  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()
  const title = article?.title?.trim() || url
  // Prefer textContent (strips HTML); fallback to full body text
  const text = (article?.textContent || dom.window.document.body?.textContent || '').trim()
  if (text.length === 0) return null

  // Chunk in plain-text windows; tag every chunk with the URL as the "path"
  const chunks: RawChunk[] = chunkPlainText(url, text).map((c) => ({
    ...c,
    noteTitle: title,
    headerChain: [title]
  }))
  return { title, chunks, rawHash: hash(text) }
}

async function indexFile(source: KnowledgeSourceRow, absPath: string, root: string): Promise<{ added: number; skipped: number }> {
  const relPath = relative(root, absPath)
  const extracted = await extractText(absPath, source.type)
  if (!extracted) return { added: 0, skipped: 0 }
  const { chunks, rawHash } = extracted

  const existing = db.select().from(vectorSources)
    .where(and(eq(vectorSources.sourceId, source.id), eq(vectorSources.path, relPath)))
    .all()
  if (existing.length > 0 && existing[0].contentHash === rawHash) {
    return { added: 0, skipped: existing.length }
  }

  deleteChunksForSourcePath(source.id, relPath)
  if (chunks.length === 0) return { added: 0, skipped: 0 }

  const embeddings = await embed(chunks.map((c) => c.content))
  const now = Date.now()
  const model = getSetting(KEY_EMBEDDING_MODEL) || DEFAULT_EMBEDDING_MODEL

  const insertSource = sqliteRaw.prepare(
    `INSERT INTO vector_sources (id, source_id, kind, path, title, header_chain, content, content_hash, embedding_model, project_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertEmbedding = sqliteRaw.prepare(
    'INSERT INTO vector_embeddings (id, embedding) VALUES (?, ?)'
  )

  const tx = sqliteRaw.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      const id = randomUUID()
      insertSource.run(
        id, source.id, source.type, relPath, c.noteTitle, JSON.stringify(c.headerChain),
        c.content, rawHash, model, source.projectId, now, now
      )
      insertEmbedding.run(id, JSON.stringify(embeddings[i]))
    }
  })
  tx()
  return { added: chunks.length, skipped: 0 }
}

function getSourceRoot(source: KnowledgeSourceRow): string | null {
  const cfg = source.config as { path?: string }
  if (!cfg.path) return null
  return cfg.path
}

function getSourceFiles(source: KnowledgeSourceRow): string[] {
  if (source.type === 'url') return [] // URL sources have no file list
  const root = getSourceRoot(source)
  if (!root || !existsSync(root)) return []
  const st = statSync(root)
  switch (source.type) {
    case 'obsidian':
      return st.isDirectory() ? listFilesByExt(root, ['.md', '.markdown']) : []
    case 'folder':
      return st.isDirectory() ? listFilesByExt(root, ['.md', '.markdown', '.txt']) : []
    case 'pdf':
      return st.isFile() ? [root] : []
    case 'pdfFolder':
      return st.isDirectory() ? listFilesByExt(root, ['.pdf']) : []
    case 'codebase': {
      if (!st.isDirectory()) return []
      const exts = (source.config as CodebaseConfig).extensions ?? CODEBASE_DEFAULT_EXTS
      return listCodebaseFiles(root, exts)
    }
    default:
      return []
  }
}

export async function reindexSource(id: string): Promise<{ indexed: number; skipped: number; failed: number; firstError?: string }> {
  const source = getSource(id)
  if (!source) throw new Error(`Source ${id} not found`)
  if (!isKnowledgeReady()) throw new Error('OpenAI API key not configured.')

  // Self-test: if the vec extension didn't load, every embedding insert will fail.
  // Surface this up-front so the user sees a real error instead of "0 chunks indexed".
  try {
    sqliteRaw.prepare('SELECT 1 FROM vector_embeddings LIMIT 1').get()
  } catch (err) {
    const msg = `sqlite-vec extension unavailable — ${ (err as Error).message }. ` +
                `In a packaged app this usually means the native .dylib didn't unpack from asar.`
    setSourceStatus(id, 'error', msg)
    broadcastToAll('knowledge:index:complete', { sourceId: id, indexed: 0, skipped: 0, failed: 1, firstError: msg })
    broadcastToAll('knowledge:sources:updated', { id })
    return { indexed: 0, skipped: 0, failed: 1, firstError: msg }
  }

  setSourceStatus(id, 'indexing')
  let indexed = 0, skipped = 0, failed = 0
  let firstError: string | undefined

  if (source.type === 'url') {
    const url = (source.config as UrlConfig).url
    if (!url) {
      setSourceStatus(id, 'error', 'No URL configured')
      throw new Error('URL source missing url config')
    }
    broadcastToAll('knowledge:index:progress', { sourceId: id, current: 1, total: 1, file: url })
    try {
      const result = await indexUrlSource(source, url)
      indexed = result.added
      skipped = result.skipped
    } catch (err) {
      const msg = (err as Error).message ?? 'fetch failed'
      console.error('[knowledge] url index failed', url, err)
      failed = 1
      firstError = msg
      setSourceStatus(id, 'error', msg)
      broadcastToAll('knowledge:index:complete', { sourceId: id, indexed, skipped, failed, firstError })
      return { indexed, skipped, failed, firstError }
    }
  } else {
    const root = getSourceRoot(source)
    if (!root || !existsSync(root)) {
      setSourceStatus(id, 'error', 'Path not found')
      throw new Error(`Source path missing or unreachable: ${root}`)
    }
    const files = getSourceFiles(source)
    const fileRoot = source.type === 'pdf' ? join(root, '..') : root

    for (let i = 0; i < files.length; i++) {
      broadcastToAll('knowledge:index:progress', {
        sourceId: id, current: i + 1, total: files.length, file: files[i]
      })
      try {
        const r = await indexFile(source, files[i], fileRoot)
        indexed += r.added
        skipped += r.skipped
      } catch (err) {
        const msg = (err as Error).message ?? String(err)
        console.error('[knowledge] failed to index', files[i], err)
        failed++
        if (!firstError) firstError = `${files[i].split('/').slice(-2).join('/')}: ${msg}`
      }
    }
  }

  db.update(knowledgeSources).set({
    status: failed > 0 && indexed === 0 ? 'error' : 'idle',
    errorMessage: failed > 0 && indexed === 0 ? (firstError ?? 'all files failed') : null,
    lastIndexedAt: Date.now(),
    updatedAt: Date.now()
  }).where(eq(knowledgeSources.id, id)).run()
  refreshChunkCount(id)
  broadcastToAll('knowledge:index:complete', { sourceId: id, indexed, skipped, failed, firstError })
  broadcastToAll('knowledge:sources:updated', { id })
  return { indexed, skipped, failed, firstError }
}

async function indexUrlSource(source: KnowledgeSourceRow, url: string): Promise<{ added: number; skipped: number }> {
  const extracted = await extractFromUrl(url)
  if (!extracted) return { added: 0, skipped: 0 }
  const { chunks, rawHash, title } = extracted

  const existing = db.select().from(vectorSources)
    .where(and(eq(vectorSources.sourceId, source.id), eq(vectorSources.path, url)))
    .all()
  if (existing.length > 0 && existing[0].contentHash === rawHash) {
    return { added: 0, skipped: existing.length }
  }
  deleteChunksForSourcePath(source.id, url)
  if (chunks.length === 0) return { added: 0, skipped: 0 }

  const embeddings = await embed(chunks.map((c) => c.content))
  const now = Date.now()
  const model = getSetting(KEY_EMBEDDING_MODEL) || DEFAULT_EMBEDDING_MODEL

  const insertSource = sqliteRaw.prepare(
    `INSERT INTO vector_sources (id, source_id, kind, path, title, header_chain, content, content_hash, embedding_model, project_id, created_at, updated_at)
     VALUES (?, ?, 'url', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertEmbedding = sqliteRaw.prepare('INSERT INTO vector_embeddings (id, embedding) VALUES (?, ?)')

  const tx = sqliteRaw.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      const newId = randomUUID()
      insertSource.run(
        newId, source.id, url, title, JSON.stringify(c.headerChain),
        c.content, rawHash, model, source.projectId, now, now
      )
      insertEmbedding.run(newId, JSON.stringify(embeddings[i]))
    }
  })
  tx()
  return { added: chunks.length, skipped: 0 }
}

// ── Watchers ─────────────────────────────────────────────────────────────────

function startWatcherForSource(source: KnowledgeSourceRow): void {
  stopWatcherForSource(source.id)
  if (!source.enabled) return
  if (!isKnowledgeReady()) return
  if (source.type === 'url') return // URL sources are manually re-indexed; no fs watcher
  const root = getSourceRoot(source)
  if (!root || !existsSync(root)) return

  const codebaseExts = source.type === 'codebase'
    ? ((source.config as CodebaseConfig).extensions ?? CODEBASE_DEFAULT_EXTS)
    : []

  const watcher = chokidar.watch(root, {
    ignored: source.type === 'codebase'
      ? (path) => {
          // Honour codebase ignore set; chokidar checks each path
          const segs = path.split(/[/\\]/)
          return segs.some((s) => CODEBASE_IGNORE_DIRS.has(s))
        }
      : /(^|[/\\])\..|node_modules/,
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
  })

  const accept = (path: string): boolean => {
    const ext = extname(path).toLowerCase()
    switch (source.type) {
      case 'obsidian': return ext === '.md' || ext === '.markdown'
      case 'folder': return ['.md', '.markdown', '.txt'].includes(ext)
      case 'pdf': return path === root
      case 'pdfFolder': return ext === '.pdf'
      case 'codebase': return codebaseExts.includes(ext)
      default: return false
    }
  }

  const fileRoot = source.type === 'pdf' ? join(root, '..') : root

  const onChange = async (path: string) => {
    if (!accept(path)) return
    try {
      await indexFile(source, path, fileRoot)
      refreshChunkCount(source.id)
    } catch (err) {
      console.error('[knowledge] watcher reindex failed', path, err)
    }
  }
  const onUnlink = (path: string) => {
    if (!accept(path)) return
    deleteChunksForSourcePath(source.id, relative(fileRoot, path))
    refreshChunkCount(source.id)
  }

  watcher.on('add', onChange)
  watcher.on('change', onChange)
  watcher.on('unlink', onUnlink)
  watchers.set(source.id, watcher)
  console.log('[knowledge] watcher started for', source.name, '@', root)
}

function stopWatcherForSource(id: string): void {
  const w = watchers.get(id)
  if (w) { w.close(); watchers.delete(id) }
}

export function startAllWatchers(): void {
  // Back-fill: if user had a single Obsidian vault from v1, promote it to a default source
  if (!getSetting(KEY_DEFAULT_SOURCE_BACKFILLED)) {
    const legacyPath = getSetting(KEY_OBSIDIAN_VAULT_PATH)
    if (legacyPath && existsSync(legacyPath)) {
      const existing = listSources({ scope: 'global' }).find((s) =>
        s.type === 'obsidian' && (s.config as ObsidianConfig).path === legacyPath
      )
      if (!existing) {
        const created = createSource({
          name: 'Obsidian Vault',
          scope: 'global',
          type: 'obsidian',
          config: { path: legacyPath } as ObsidianConfig,
          enabled: true
        })
        // Re-tag any pre-existing chunks (where source_id IS NULL) to this source
        sqliteRaw.prepare('UPDATE vector_sources SET source_id = ? WHERE source_id IS NULL').run(created.id)
        refreshChunkCount(created.id)
        console.log('[knowledge] back-filled legacy single-vault setting into source', created.id)
      }
    }
    setSetting(KEY_DEFAULT_SOURCE_BACKFILLED, '1')
  }

  for (const s of listSources()) {
    if (s.enabled) startWatcherForSource(s)
  }
}

export function stopAllWatchers(): void {
  for (const id of watchers.keys()) stopWatcherForSource(id)
}

// ── Retrieval ────────────────────────────────────────────────────────────────

export async function retrieve(query: string, opts?: {
  k?: number
  sourceIds?: string[]
  globalScope?: boolean
  projectId?: string | null
}): Promise<RetrievedChunk[]> {
  if (!isKnowledgeReady()) return []
  const k = opts?.k ?? 8
  const queryEmbedding = (await embed([query]))[0]
  if (!queryEmbedding) return []

  // Resolve which source IDs to search
  let ids: string[] = []
  if (opts?.sourceIds && opts.sourceIds.length > 0) {
    ids = opts.sourceIds
  } else {
    const all = listSources()
    ids = all.filter((s) => {
      if (!s.enabled) return false
      if (s.scope === 'global') return opts?.globalScope !== false
      if (s.scope === 'project' && opts?.projectId) return s.projectId === opts.projectId
      return false
    }).map((s) => s.id)
  }

  if (ids.length === 0) return []

  const placeholders = ids.map(() => '?').join(',')
  const rows = sqliteRaw.prepare(`
    SELECT s.id, s.source_id, s.kind, s.path, s.title, s.header_chain, s.content,
           ks.name AS source_name, ks.type AS source_type,
           vec_distance_cosine(v.embedding, ?) AS dist
    FROM vector_embeddings v
    JOIN vector_sources s ON v.id = s.id
    LEFT JOIN knowledge_sources ks ON s.source_id = ks.id
    WHERE s.source_id IN (${placeholders})
    ORDER BY dist ASC
    LIMIT ?
  `).all(JSON.stringify(queryEmbedding), ...ids, k) as Array<{
    id: string; source_id: string | null; kind: string; path: string; title: string | null;
    header_chain: string; content: string; source_name: string | null; source_type: string | null; dist: number
  }>

  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceName: r.source_name,
    sourceType: r.source_type,
    kind: r.kind,
    path: r.path,
    title: r.title,
    headerChain: JSON.parse(r.header_chain || '[]'),
    content: r.content,
    score: 1 - r.dist
  }))
}

// ── Pinned-content lookup (raw chunks by vector_sources.id) ──────────────────

export interface PinnedChunk {
  id: string
  sourceId: string | null
  sourceName: string | null
  sourceType: string | null
  path: string
  title: string | null
  headerChain: string[]
  content: string
}

export function getChunksByIds(ids: string[]): PinnedChunk[] {
  if (ids.length === 0) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = sqliteRaw.prepare(`
    SELECT s.id, s.source_id, s.path, s.title, s.header_chain, s.content,
           ks.name AS source_name, ks.type AS source_type
    FROM vector_sources s
    LEFT JOIN knowledge_sources ks ON s.source_id = ks.id
    WHERE s.id IN (${placeholders})
  `).all(...ids) as Array<{
    id: string; source_id: string | null; path: string; title: string | null;
    header_chain: string; content: string; source_name: string | null; source_type: string | null
  }>
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceName: r.source_name,
    sourceType: r.source_type,
    path: r.path,
    title: r.title,
    headerChain: JSON.parse(r.header_chain || '[]'),
    content: r.content
  }))
}

/**
 * Search indexed chunks by path or title substring. Used for the pin autocomplete
 * so the user can pin notes/files to a conversation.
 */
export function searchChunkPaths(query: string, opts?: { projectId?: string | null; limit?: number }): Array<{
  id: string; sourceId: string | null; sourceName: string | null; sourceType: string | null;
  path: string; title: string | null; headerChain: string[]
}> {
  const limit = opts?.limit ?? 20
  // Group by path so we offer "the whole note" not every chunk; pick the lowest-id chunk
  const rows = sqliteRaw.prepare(`
    SELECT s.id, s.source_id, s.path, s.title, s.header_chain,
           ks.name AS source_name, ks.type AS source_type
    FROM vector_sources s
    LEFT JOIN knowledge_sources ks ON s.source_id = ks.id
    WHERE (s.path LIKE ? OR s.title LIKE ?)
    GROUP BY s.path
    ORDER BY length(s.path) ASC
    LIMIT ?
  `).all(`%${query}%`, `%${query}%`, limit) as Array<{
    id: string; source_id: string | null; path: string; title: string | null;
    header_chain: string; source_name: string | null; source_type: string | null
  }>
  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceName: r.source_name,
    sourceType: r.source_type,
    path: r.path,
    title: r.title,
    headerChain: JSON.parse(r.header_chain || '[]')
  }))
}

// ── Stats ────────────────────────────────────────────────────────────────────

export interface KnowledgeStats {
  totalChunks: number
  totalSources: number
  enabledSources: number
  hasApiKey: boolean
  embeddingModel: string
  watcherCount: number
}

export function getStats(): KnowledgeStats {
  const totalChunks = (sqliteRaw.prepare('SELECT COUNT(*) AS n FROM vector_sources').get() as { n: number }).n
  const sources = listSources()
  return {
    totalChunks,
    totalSources: sources.length,
    enabledSources: sources.filter((s) => s.enabled).length,
    hasApiKey: isKnowledgeReady(),
    embeddingModel: getSetting(KEY_EMBEDDING_MODEL) || DEFAULT_EMBEDDING_MODEL,
    watcherCount: watchers.size
  }
}

// Silence unused-var warnings while keeping these around for future use
void EMBEDDING_DIM
void inArray
