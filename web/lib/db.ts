import { Pool } from 'pg'
import type { Edge, Invocation, OrchestratorDecision, TaskState } from '@/engine/types'

let pool: Pool | null = null

export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set')
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL })
  return pool
}

function toDate(ms?: number): Date | null {
  if (!ms) return null
  return new Date(ms)
}

export async function createRun(state: TaskState): Promise<void> {
  const db = getPool()
  await db.query(
    `insert into runs (id, task, subspace, budget, status, total_tokens, cost_usd, final_output, final_confidence, started_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      state.id,
      state.task,
      state.subspace,
      state.budget,
      state.status,
      state.totalTokens,
      state.costUsd,
      state.finalOutput,
      state.finalConfidence,
      toDate(state.startedAt),
    ],
  )
}

export async function updateRunFinal(state: TaskState): Promise<void> {
  const db = getPool()
  await db.query(
    `update runs set status=$2, total_tokens=$3, cost_usd=$4, final_output=$5, final_confidence=$6, completed_at=$7, snapshot=$8
     where id=$1`,
    [
      state.id,
      state.status,
      state.totalTokens,
      state.costUsd,
      state.finalOutput,
      state.finalConfidence,
      toDate(state.completedAt),
      JSON.stringify(state),
    ],
  )
}

export async function insertInvocation(runId: string, inv: Invocation): Promise<void> {
  const db = getPool()
  await db.query(
    `insert into invocations (id, run_id, step, agent_id, prompt, output, status, prompt_tokens, completion_tokens, duration_ms, confidence, start_ts, end_ts, sources)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (id) do update set output=excluded.output, status=excluded.status, completion_tokens=excluded.completion_tokens, duration_ms=excluded.duration_ms, confidence=excluded.confidence, end_ts=excluded.end_ts, sources=excluded.sources`,
    [
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
      toDate(inv.startTs),
      toDate(inv.endTs),
      inv.sources ? JSON.stringify(inv.sources) : null,
    ],
  )
}

export async function insertDecision(runId: string, decision: OrchestratorDecision): Promise<void> {
  const db = getPool()
  await db.query(
    `insert into decisions (run_id, step, selected, rationale, candidates, decided_at)
     values ($1,$2,$3,$4,$5,$6)`,
    [
      runId,
      decision.step,
      decision.selected,
      decision.rationale,
      JSON.stringify(decision.candidates),
      toDate(decision.ts),
    ],
  )
}

export async function upsertEdge(runId: string, edge: Edge): Promise<void> {
  const db = getPool()
  await db.query(
    `insert into edges (run_id, from_agent, to_agent, weight, last_step)
     values ($1,$2,$3,$4,$5)
     on conflict (run_id, from_agent, to_agent) do update set weight=excluded.weight, last_step=excluded.last_step`,
    [runId, edge.from, edge.to, edge.weight, edge.lastStep],
  )
}

export async function listRuns(limit = 20): Promise<Array<{ id: string; task: string; status: string; startedAt: string | null; completedAt: string | null; totalTokens: number; finalConfidence: number }>> {
  const db = getPool()
  const res = await db.query(
    `select id, task, status, started_at, completed_at, total_tokens, final_confidence
     from runs
     order by started_at desc nulls last
     limit $1`,
    [limit],
  )
  return res.rows.map(r => ({
    id: r.id,
    task: r.task,
    status: r.status,
    startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
    totalTokens: Number(r.total_tokens ?? 0),
    finalConfidence: Number(r.final_confidence ?? 0),
  }))
}

export async function getRunSnapshot(runId: string): Promise<TaskState | null> {
  const db = getPool()
  const res = await db.query('select snapshot from runs where id=$1', [runId])
  if (res.rowCount === 0) return null
  const snap = res.rows[0]?.snapshot
  if (!snap) return null
  if (typeof snap === 'string') return JSON.parse(snap) as TaskState
  return snap as TaskState
}
