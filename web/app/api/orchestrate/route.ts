import { AGENT_BY_ID } from '@/engine/agents'
import { extractFeatures, scoreCandidates, selectAgent } from '@/engine/policy'
import { LLMConfigError, estTokens, streamCompletion, type Provider } from '@/lib/llm'
import { buildUserPrompt, systemPromptFor } from '@/lib/prompts'
import { extractUrls, fetchUrls } from '@/lib/tools/browser'
import type { Edge, EngineEvent, Invocation, OrchestratorDecision, Subspace, TaskState } from '@/engine/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface RunBody {
  task: string
  subspace?: Subspace
  budget?: number
  provider?: Provider
  model?: string
}

const MAX_STEPS = 12
const TASK_MAX_LEN = 4000

export async function POST(req: Request) {
  let body: RunBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 })
  }
  const task = (body.task ?? '').trim()
  if (!task) return new Response(JSON.stringify({ error: 'task required' }), { status: 400 })
  if (task.length > TASK_MAX_LEN) return new Response(JSON.stringify({ error: 'task too long' }), { status: 400 })

  const subspace: Subspace = body.subspace === 'titan' ? 'titan' : 'mimas'
  const budget = clamp(body.budget ?? 12000, 1000, 100000)
  const provider: Provider = body.provider === 'groq' ? 'groq' : 'openrouter'
  const model = body.model

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: EngineEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
      const close = () => { try { controller.close() } catch { /* already closed */ } }

      const features = extractFeatures(task)
      const state: TaskState = {
        id: rid(),
        task, subspace, budget,
        status: 'running',
        features,
        invocations: [], decisions: [], edges: [],
        totalTokens: 0, costUsd: 0,
        finalOutput: '', finalConfidence: 0,
        startedAt: Date.now(),
      }
      send({ type: 'state', state: snapshot(state) })

      // Per-step orchestration loop. Reuses the same heuristic policy from
      // engine/policy.ts (compiled both client- and server-side).
      for (let step = 0; step < MAX_STEPS; step++) {
        if (req.signal.aborted) { state.status = 'cancelled'; break }
        const budgetRemaining = Math.max(0, 1 - state.totalTokens / state.budget)
        if (budgetRemaining <= 0.02) break

        const candidates = scoreCandidates({
          features, step,
          invocations: state.invocations,
          budgetRemaining,
          lambda: 0.3,
          subspaceCostMul: subspace === 'titan' ? 1.6 : 1.0,
        })
        const { selected, rationale } = selectAgent(candidates)
        const decision: OrchestratorDecision = { step, candidates, selected, rationale, ts: Date.now() }
        state.decisions.push(decision)
        send({ type: 'decision', decision })

        if (selected === 'terminator') break

        try {
          const inv = await runAgent({
            agentId: selected, step, task, prior: state.invocations,
            provider, model, subspace,
            send, signal: req.signal,
          })
          state.invocations.push(inv)
          state.totalTokens += inv.promptTokens + inv.completionTokens

          const prev = state.invocations[state.invocations.length - 2]
          if (prev) touchEdge(state, prev.agentId, inv.agentId, step, send)
          if (inv.agentId === 'modifier' && prev?.agentId === 'critic') {
            const earlier = [...state.invocations].reverse().find(i => !['critic', 'modifier'].includes(i.agentId))
            if (earlier) touchEdge(state, inv.agentId, earlier.agentId, step, send)
          }
          send({ type: 'state', state: snapshot(state) })
        } catch (err) {
          if (err instanceof LLMConfigError) {
            state.status = 'error'
            send({ type: 'state', state: snapshot(state) })
            send({ type: 'complete', state: { ...snapshot(state), completedAt: Date.now() } })
            close()
            return
          }
          if ((err as Error).name === 'AbortError') {
            state.status = 'cancelled'
            break
          }
          // Continue with the next decision rather than killing the whole run.
          // eslint-disable-next-line no-console
          console.error('agent error:', err)
        }
      }

      // Force a concluder if we exited without one.
      const hasOutput = state.invocations.some(i => i.status === 'done')
      const hasConcluder = state.invocations.some(i => i.agentId === 'concluder')
      if (hasOutput && !hasConcluder && state.status === 'running') {
        const forced: OrchestratorDecision = {
          step: state.invocations.length,
          candidates: scoreCandidates({
            features, step: state.invocations.length,
            invocations: state.invocations, budgetRemaining: 0.2,
            lambda: 0.3, subspaceCostMul: 1,
          }),
          selected: 'concluder',
          rationale: 'budget exhausted — forcing synthesis to deliver a partial answer.',
          ts: Date.now(),
        }
        state.decisions.push(forced)
        send({ type: 'decision', decision: forced })
        try {
          const inv = await runAgent({
            agentId: 'concluder', step: forced.step, task, prior: state.invocations,
            provider, model, subspace,
            send, signal: req.signal,
          })
          state.invocations.push(inv)
          state.totalTokens += inv.promptTokens + inv.completionTokens
          const prev = state.invocations[state.invocations.length - 2]
          if (prev) touchEdge(state, prev.agentId, inv.agentId, forced.step, send)
        } catch { /* swallow — we still emit complete */ }
      }

      const concluder = [...state.invocations].reverse().find(i => i.agentId === 'concluder')
      state.finalOutput = concluder?.output ?? '(no synthesis produced)'
      state.finalConfidence = concluder?.confidence ?? 0
      state.completedAt = Date.now()
      if (state.status === 'running') state.status = 'complete'
      send({ type: 'complete', state: snapshot(state) })
      close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

interface RunAgentArgs {
  agentId: string
  step: number
  task: string
  prior: Invocation[]
  provider: Provider
  model?: string
  subspace: Subspace
  send: (e: EngineEvent) => void
  signal: AbortSignal
}

async function runAgent(args: RunAgentArgs): Promise<Invocation> {
  const spec = AGENT_BY_ID[args.agentId]
  const userPrompt = buildUserPrompt(args.task, args.prior)
  const systemPrompt = systemPromptFor(args.agentId)
  const promptText = `[system]\n${systemPrompt}\n\n[user]\n${userPrompt}`

  const inv: Invocation = {
    id: rid(),
    step: args.step,
    agentId: args.agentId,
    prompt: promptText,
    output: '',
    status: 'running',
    promptTokens: estTokens(promptText),
    completionTokens: 0,
    durationMs: 0,
    confidence: 0,
    startTs: Date.now(),
  }
  args.send({ type: 'agent_start', invocation: { ...inv } })

  if (args.agentId === 'browser') {
    await runBrowser(inv, args)
    inv.completionTokens = estTokens(inv.output)
    inv.durationMs = Date.now() - inv.startTs
    inv.confidence = inv.output.includes('[error]') ? 0.5 : 0.85
    inv.status = 'done'
    inv.endTs = Date.now()
    args.send({ type: 'agent_end', invocation: { ...inv } })
    return inv
  }

  const maxTokens = Math.min(spec.maxTokens || 1024, args.subspace === 'titan' ? 4000 : 2000)
  for await (const tok of streamCompletion({
    provider: args.provider,
    model: args.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens,
    temperature: args.subspace === 'titan' ? 0.3 : 0.5,
    signal: args.signal,
  })) {
    inv.output += tok
    args.send({ type: 'agent_token', invocationId: inv.id, token: tok })
  }

  inv.completionTokens = estTokens(inv.output)
  inv.durationMs = Date.now() - inv.startTs
  inv.confidence = inferConfidence(args.agentId, inv.output)
  inv.status = 'done'
  inv.endTs = Date.now()
  args.send({ type: 'agent_end', invocation: { ...inv } })
  return inv
}

function touchEdge(state: TaskState, from: string, to: string, step: number, send: (e: EngineEvent) => void) {
  const existing = state.edges.find(e => e.from === from && e.to === to)
  if (existing) {
    existing.weight += 1
    existing.lastStep = step
    send({ type: 'edge', edge: { ...existing } })
  } else {
    const e: Edge = { from, to, weight: 1, lastStep: step }
    state.edges.push(e)
    send({ type: 'edge', edge: { ...e } })
  }
}

function inferConfidence(agentId: string, output: string): number {
  const m = /confidence\s*[:=]\s*(low|medium|high)/i.exec(output)
  if (m) {
    const k = m[1].toLowerCase()
    return k === 'high' ? 0.9 : k === 'medium' ? 0.7 : 0.5
  }
  const base: Record<string, number> = {
    planner: 0.78, critic: 0.7, modifier: 0.85, concluder: 0.82, reflect: 0.76,
    bing: 0.7, arxiv: 0.78, python: 0.86, browser: 0.72, data: 0.8, wolfram: 0.92,
  }
  const b = base[agentId] ?? 0.7
  return Math.min(0.97, b + Math.min(0.1, output.length / 5000))
}

function snapshot(s: TaskState): TaskState {
  return {
    ...s,
    invocations: s.invocations.map(i => ({ ...i })),
    decisions: s.decisions.map(d => ({ ...d, candidates: d.candidates.map(c => ({ ...c })) })),
    edges: s.edges.map(e => ({ ...e })),
  }
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function rid() { return Math.random().toString(36).slice(2, 10) }

// Real Playwright fetch. Pulls URLs from the task + prior agent outputs, opens
// each in a headless chromium, extracts visible text, and streams the result
// back through the same agent_token channel the LLM agents use.
async function runBrowser(inv: Invocation, args: RunAgentArgs): Promise<void> {
  const corpus = [args.task, ...args.prior.map(p => p.output)].join('\n')
  const urls = extractUrls(corpus, 3)

  const emit = (s: string) => {
    inv.output += s
    args.send({ type: 'agent_token', invocationId: inv.id, token: s })
  }

  if (urls.length === 0) {
    emit('No URLs found in task or prior context. Browser agent skipped — pass URLs in the task or have an upstream agent surface them.\n')
    return
  }

  emit(`Visiting ${urls.length} URL${urls.length > 1 ? 's' : ''} via headless chromium…\n\n`)
  const results = await fetchUrls(urls, args.signal)
  for (const r of results) {
    if (r.error) {
      emit(`[error] ${r.url} — ${r.error} (${r.ms}ms)\n\n`)
      continue
    }
    emit(`## ${r.title || r.url}\n${r.url} — ${r.ms}ms\n\n${r.text || '(empty body)'}\n\n`)
  }
  emit(`Confidence: ${results.every(r => !r.error) ? 'high' : 'medium'}`)
}
