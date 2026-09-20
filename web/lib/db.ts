import fs from 'fs'
import path from 'path'
import type { Edge, Invocation, OrchestratorDecision, TaskState } from '@/engine/types'

// Dynamic import for better-sqlite3 — avoids native module issues on Vercel
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Database: any = null
let db: import('better-sqlite3').Database | null = null
let schemaApplied = false
const DEFAULT_DB_PATH = './db/local.sqlite'

async function loadDatabase() {
  if (!Database) {
    try {
      const mod = await import('better-sqlite3')
      Database = mod.default ?? mod
    } catch {
      // better-sqlite3 unavailable (e.g. Vercel serverless)
      return null
    }
  }
  return Database
}

export function dbEnabled(): boolean {
  return process.env.DB_DISABLED !== '1'
}

function resolveDbPath(): string {
  const configured = process.env.LOCAL_DB_PATH || process.env.DB_PATH || DEFAULT_DB_PATH
  if (path.isAbsolute(configured)) return configured
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured)
}

function ensureSchema(dbInstance: import('better-sqlite3').Database): void {
  if (schemaApplied) return
  const schemaPath = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'db/schema.sql')
  if (!fs.existsSync(schemaPath)) return
  const schema = fs.readFileSync(schemaPath, 'utf8')
  dbInstance.exec(schema)
  schemaApplied = true
}

async function getDb(): Promise<import('better-sqlite3').Database | null> {
  if (db) return db
  const DbModule = await loadDatabase()
  if (!DbModule) return null
  try {
    const filePath = resolveDbPath()
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const instance = new DbModule(filePath)
    instance.pragma('journal_mode = WAL')
    ensureSchema(instance)
    db = instance
    return db
  } catch {
    return null
  }
}

function toMs(ms?: number): number | null {
  if (typeof ms !== 'number') return null
  return ms
}

export async function createRun(state: TaskState): Promise<void> {
  const dbInstance = await getDb()
  if (!dbInstance) return
  dbInstance.prepare(
    `insert into runs (id, task, subspace, budget, status, total_tokens, cost_usd, final_output, final_confidence, started_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    state.id,
    state.task,
    state.subspace,
    state.budget,
    state.status,
    state.totalTokens,
    state.costUsd,
    state.finalOutput,
    state.finalConfidence,
    toMs(state.startedAt),
  )
}

export async function updateRunFinal(state: TaskState): Promise<void> {
  const dbInstance = await getDb()
  if (!dbInstance) return
  dbInstance.prepare(
    `update runs set status=?, total_tokens=?, cost_usd=?, final_output=?, final_confidence=?, completed_at=?, snapshot=?
     where id=?`
  ).run(
    state.status,
    state.totalTokens,
    state.costUsd,
    state.finalOutput,
    state.finalConfidence,
    toMs(state.completedAt),
    JSON.stringify(state),
    state.id,
  )
}

export async function insertInvocation(runId: string, inv: Invocation): Promise<void> {
  const dbInstance = await getDb()
  if (!dbInstance) return
  dbInstance.prepare(
    `insert into invocations (id, run_id, step, agent_id, prompt, output, status, prompt_tokens, completion_tokens, duration_ms, confidence, start_ts, end_ts, sources)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (id) do update set output=excluded.output, status=excluded.status, completion_tokens=excluded.completion_tokens, duration_ms=excluded.duration_ms, confidence=excluded.confidence, end_ts=excluded.end_ts, sources=excluded.sources`
  ).run(
    inv.id,
    runId,
    inv.step,
    inv.agentId,
    inv.prompt,
    inv.output,
    inv.status,
    inv.promptTokens,
    inv.completionTokens,
    inv.durationMs,
    inv.confidence,
    toMs(inv.startTs),
    toMs(inv.endTs),
    inv.sources ? JSON.stringify(inv.sources) : null,
  )
}

export async function insertDecision(runId: string, decision: OrchestratorDecision): Promise<void> {
  const dbInstance = await getDb()
  if (!dbInstance) return
  dbInstance.prepare(
    `insert into decisions (run_id, step, selected, rationale, candidates, decided_at)
     values (?, ?, ?, ?, ?, ?)`
  ).run(
    runId,
    decision.step,
    decision.selected,
    decision.rationale,
    JSON.stringify(decision.candidates),
    toMs(decision.ts),
  )
}

export async function upsertEdge(runId: string, edge: Edge): Promise<void> {
  const dbInstance = await getDb()
  if (!dbInstance) return
  dbInstance.prepare(
    `insert into edges (run_id, from_agent, to_agent, weight, last_step)
     values (?, ?, ?, ?, ?)
     on conflict (run_id, from_agent, to_agent) do update set weight=excluded.weight, last_step=excluded.last_step`
  ).run(runId, edge.from, edge.to, edge.weight, edge.lastStep)
}

export async function listRuns(limit = 20): Promise<Array<{ id: string; task: string; status: string; startedAt: string | null; completedAt: string | null; totalTokens: number; finalConfidence: number }>> {
  const dbInstance = await getDb()
  if (!dbInstance) return []
  const rows = dbInstance.prepare(
    `select id, task, status, started_at, completed_at, total_tokens, final_confidence
     from runs
     order by started_at desc
     limit ?`
  ).all(limit) as Array<Record<string, unknown>>
  return rows.map(r => ({
    id: r.id as string,
    task: r.task as string,
    status: r.status as string,
    startedAt: r.started_at ? new Date(Number(r.started_at)).toISOString() : null,
    completedAt: r.completed_at ? new Date(Number(r.completed_at)).toISOString() : null,
    totalTokens: Number(r.total_tokens ?? 0),
    finalConfidence: Number(r.final_confidence ?? 0),
  }))
}

export async function getRunSnapshot(runId: string): Promise<TaskState | null> {
  const dbInstance = await getDb()
  if (!dbInstance) return null
  const row = dbInstance.prepare('select snapshot from runs where id=?').get(runId) as { snapshot?: string } | undefined
  if (!row?.snapshot) return null
  return JSON.parse(row.snapshot) as TaskState
}
