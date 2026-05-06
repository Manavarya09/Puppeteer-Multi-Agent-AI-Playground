import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import type { Edge, Invocation, OrchestratorDecision, TaskState } from '@/engine/types'

let db: DatabaseType | null = null
let schemaApplied = false
const DEFAULT_DB_PATH = './db/local.sqlite'

export function dbEnabled(): boolean {
  return process.env.DB_DISABLED !== '1'
}

function resolveDbPath(): string {
  const configured = process.env.LOCAL_DB_PATH || process.env.DB_PATH || DEFAULT_DB_PATH
  if (path.isAbsolute(configured)) return configured
  return path.resolve(process.cwd(), configured)
}

function ensureSchema(dbInstance: DatabaseType): void {
  if (schemaApplied) return
  const schemaPath = path.resolve(process.cwd(), 'db/schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf8')
  dbInstance.exec(schema)
  schemaApplied = true
}

function getDb(): DatabaseType {
  if (!db) {
    const filePath = resolveDbPath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    db = new Database(filePath)
    db.pragma('journal_mode = WAL')
  }
  ensureSchema(db)
  return db
}

function toMs(ms?: number): number | null {
  if (typeof ms !== 'number') return null
  return ms
}

export async function createRun(state: TaskState): Promise<void> {
  const db = getDb()
  db.prepare(
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
  const db = getDb()
  db.prepare(
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
  const db = getDb()
  db.prepare(
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
  const db = getDb()
  db.prepare(
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
  const db = getDb()
  db.prepare(
    `insert into edges (run_id, from_agent, to_agent, weight, last_step)
     values (?, ?, ?, ?, ?)
     on conflict (run_id, from_agent, to_agent) do update set weight=excluded.weight, last_step=excluded.last_step`
  ).run(runId, edge.from, edge.to, edge.weight, edge.lastStep)
}

export async function listRuns(limit = 20): Promise<Array<{ id: string; task: string; status: string; startedAt: string | null; completedAt: string | null; totalTokens: number; finalConfidence: number }>> {
  const db = getDb()
  const rows = db.prepare(
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
  const db = getDb()
  const row = db.prepare('select snapshot from runs where id=?').get(runId) as { snapshot?: string } | undefined
  if (!row?.snapshot) return null
  return JSON.parse(row.snapshot) as TaskState
}
