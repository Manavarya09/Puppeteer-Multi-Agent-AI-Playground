import { AGENT_BY_ID } from '@/engine/agents'
import { extractFeatures, scoreCandidates, selectAgent } from '@/engine/policy'
import { LLMConfigError, estTokens, streamCompletion, type Provider } from '@/lib/llm'
import { buildUserPrompt, systemPromptFor } from '@/lib/prompts'
import { extractUrls, fetchUrls } from '@/lib/tools/browser'
import { queryArxiv } from '@/lib/tools/arxiv'
import { search } from '@/lib/tools/search'
import { searchHackerNews } from '@/lib/tools/hn'
import { queryWolfram } from '@/lib/tools/wolfram'
import { runPython } from '@/lib/tools/python'
import { createRun, dbEnabled, insertDecision, insertInvocation, upsertEdge, updateRunFinal } from '@/lib/db'
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
const RATE_WINDOW_MS = 60_000
const DEFAULT_RATE_LIMIT = 30

const rateBuckets = new Map<string, { windowStart: number; count: number }>()

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

function checkRateLimit(ip: string): boolean {
  const limit = Math.max(1, Number(process.env.RATE_LIMIT_PER_MIN || DEFAULT_RATE_LIMIT))
  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(ip, { windowStart: now, count: 1 })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count += 1
  return true
}

async function safeDb<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!dbEnabled()) return null
  try {
    return await fn()
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('db error:', err)
    return null
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req)
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'rate limit exceeded' }), { status: 429 })
  }
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
  const { model } = body

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
      await safeDb(() => createRun(state))

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
        void safeDb(() => insertDecision(state.id, decision))

        if (selected === 'terminator') break

        try {
          const inv = await runAgent({
            agentId: selected, step, task, prior: state.invocations,
            provider, model, subspace,
            send, signal: req.signal,
          })
          state.invocations.push(inv)
          state.totalTokens += inv.promptTokens + inv.completionTokens
          void safeDb(() => insertInvocation(state.id, inv))

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
          void safeDb(() => insertInvocation(state.id, inv))
          const prev = state.invocations[state.invocations.length - 2]
          if (prev) touchEdge(state, prev.agentId, inv.agentId, forced.step, send)
        } catch { /* swallow — we still emit complete */ }
      }

      // If we have a concluder but no verifier, run one verifier pass for accuracy.
      const hasConcluderNow = state.invocations.some(i => i.agentId === 'concluder' && i.status === 'done')
      const hasVerifier = state.invocations.some(i => i.agentId === 'verifier')
      const shouldVerify = hasConcluderNow && !hasVerifier && state.status === 'running'
        && (features.research >= 0.2 || features.web >= 0.2 || features.math >= 0.3)
      if (shouldVerify) {
        const forced: OrchestratorDecision = {
          step: state.invocations.length,
          candidates: scoreCandidates({
            features, step: state.invocations.length,
            invocations: state.invocations, budgetRemaining: 0.15,
            lambda: 0.3, subspaceCostMul: 1,
          }),
          selected: 'verifier',
          rationale: 'forcing final verifier pass to ground-check claims before completion.',
          ts: Date.now(),
        }
        state.decisions.push(forced)
        send({ type: 'decision', decision: forced })
        try {
          const inv = await runAgent({
            agentId: 'verifier', step: forced.step, task, prior: state.invocations,
            provider, model, subspace,
            send, signal: req.signal,
          })
          state.invocations.push(inv)
          state.totalTokens += inv.promptTokens + inv.completionTokens
          void safeDb(() => insertInvocation(state.id, inv))
          const prev = state.invocations[state.invocations.length - 2]
          if (prev) touchEdge(state, prev.agentId, inv.agentId, forced.step, send)
        } catch { /* swallow */ }
      }

      const concluder = [...state.invocations].reverse().find(i => i.agentId === 'concluder')
      const verifier = [...state.invocations].reverse().find(i => i.agentId === 'verifier' && i.status === 'done')
      state.finalOutput = concluder?.output ?? '(no synthesis produced)'
      // Penalise final confidence if verifier flagged the draft.
      const verifierVerdict = verifier?.output.toLowerCase() ?? ''
      const verdictPenalty = /overall:\s*block/.test(verifierVerdict) ? 0.4
        : /overall:\s*revise/.test(verifierVerdict) ? 0.15
        : 0
      state.finalConfidence = Math.max(0, (concluder?.confidence ?? 0) - verdictPenalty)
      state.completedAt = Date.now()
      if (state.status === 'running') state.status = 'complete'
      send({ type: 'complete', state: snapshot(state) })
      await safeDb(() => updateRunFinal(state))
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

interface ToolOutput {
  output: string
  sources?: { title: string; url: string }[]
  confidence?: number
}

async function runAgent(args: RunAgentArgs): Promise<Invocation> {
  const spec = AGENT_BY_ID[args.agentId]
  const userPrompt = buildUserPrompt(args.task, args.prior)
  const systemPrompt = systemPromptFor(args.agentId)
  let promptText = `[system]\n${systemPrompt}\n\n[user]\n${userPrompt}`
  if (['bing', 'hn', 'arxiv', 'wolfram', 'browser'].includes(args.agentId)) {
    promptText = `Tool invocation: ${args.agentId} for task "${args.task}"`
  }

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

  try {
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

    if (args.agentId === 'bing') {
      const tool = await runSearchAgent(args)
      applyToolResult(inv, tool, args.send)
      return inv
    }

    if (args.agentId === 'hn') {
      const tool = await runHnAgent(args)
      applyToolResult(inv, tool, args.send)
      return inv
    }

    if (args.agentId === 'arxiv') {
      const tool = await runArxivAgent(args)
      applyToolResult(inv, tool, args.send)
      return inv
    }

    if (args.agentId === 'wolfram') {
      const tool = await runWolframAgent(args)
      applyToolResult(inv, tool, args.send)
      return inv
    }

    if (args.agentId === 'python') {
      const tool = await runPythonAgent(args, inv)
      applyToolResult(inv, tool, args.send)
      return inv
    }

    if (args.agentId === 'data') {
      const tool = await runDataAgent(args, inv)
      applyToolResult(inv, tool, args.send)
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
  } catch (err) {
    inv.output = `${inv.output}\n[error] ${(err as Error).message}`.trim()
    inv.completionTokens = estTokens(inv.output)
    inv.durationMs = Date.now() - inv.startTs
    inv.confidence = 0.4
    inv.status = 'error'
    inv.endTs = Date.now()
    args.send({ type: 'agent_end', invocation: { ...inv } })
    return inv
  }
}

function applyToolResult(inv: Invocation, tool: ToolOutput, send: (e: EngineEvent) => void) {
  const text = tool.output || ''
  if (text) {
    inv.output += text
    send({ type: 'agent_token', invocationId: inv.id, token: text })
  }
  inv.sources = tool.sources
  inv.completionTokens = estTokens(inv.output)
  inv.durationMs = Date.now() - inv.startTs
  inv.confidence = tool.confidence ?? (tool.sources && tool.sources.length > 0 ? 0.85 : 0.7)
  inv.status = 'done'
  inv.endTs = Date.now()
  send({ type: 'agent_end', invocation: { ...inv } })
}

async function runSearchAgent(args: RunAgentArgs): Promise<ToolOutput> {
  const res = await search(args.task, 5, args.signal)
  if (res.results.length === 0) {
    return { output: 'No search results found for the query.\n', confidence: 0.5 }
  }
  const lines: string[] = ['Search results (DuckDuckGo):', '']
  res.results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title}`)
    lines.push(`${r.url}`)
    if (r.snippet) lines.push(r.snippet)
    lines.push('')
  })
  return {
    output: lines.join('\n'),
    sources: res.results.map(r => ({ title: r.title, url: r.url })),
    confidence: 0.82,
  }
}

async function runHnAgent(args: RunAgentArgs): Promise<ToolOutput> {
  const res = await searchHackerNews(args.task, 5, args.signal)
  if (res.hits.length === 0) {
    return { output: 'No Hacker News stories found for the query.\n', confidence: 0.5 }
  }
  const lines: string[] = ['Hacker News stories (Algolia, sorted by relevance):', '']
  res.hits.forEach((h, i) => {
    lines.push(`${i + 1}. ${h.title}`)
    lines.push(h.url)
    const meta: string[] = []
    if (typeof h.points === 'number') meta.push(`${h.points} points`)
    if (h.author) meta.push(`by ${h.author}`)
    if (h.createdAt) meta.push(h.createdAt.slice(0, 10))
    if (meta.length) lines.push(meta.join(' · '))
    lines.push('')
  })
  return {
    output: lines.join('\n'),
    sources: res.hits.map(h => ({ title: h.title, url: h.url })),
    confidence: 0.8,
  }
}

async function runArxivAgent(args: RunAgentArgs): Promise<ToolOutput> {
  const res = await queryArxiv(args.task, 3, args.signal)
  if (res.entries.length === 0) {
    return { output: 'No arXiv papers found for the query.\n', confidence: 0.5 }
  }
  const lines: string[] = ['arXiv results:', '']
  res.entries.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.title}`)
    lines.push(`${e.id}`)
    if (e.updated) lines.push(`Updated: ${e.updated}`)
    if (e.summary) lines.push(e.summary)
    lines.push('')
  })
  return {
    output: lines.join('\n'),
    sources: res.entries.map(e => ({ title: e.title, url: e.id })),
    confidence: 0.84,
  }
}

async function runWolframAgent(args: RunAgentArgs): Promise<ToolOutput> {
  const res = await queryWolfram(args.task, args.signal)
  const lines = [
    'Wolfram Alpha result:',
    '',
    `Input: ${args.task}`,
    `Result: ${res.text}`,
  ]
  return {
    output: lines.join('\n'),
    sources: [{ title: 'Wolfram Alpha', url: res.sourceUrl }],
    confidence: 0.9,
  }
}

async function runPythonAgent(args: RunAgentArgs, inv: Invocation): Promise<ToolOutput> {
  const { code, promptText } = await generateProgram('python', args)
  inv.prompt = promptText
  inv.promptTokens = estTokens(promptText)
  const res = await runPython(code, 25000)
  const lines = [
    'Python execution (local):',
    '',
    '```python',
    code,
    '```',
    '',
    'stdout:',
    res.stdout || '(empty)',
    '',
    'stderr:',
    res.stderr || '(none)',
    '',
    `exit_code: ${res.exitCode ?? 'unknown'}`,
  ]
  const confidence = res.stderr ? 0.65 : 0.88
  return { output: lines.join('\n'), confidence }
}

async function runDataAgent(args: RunAgentArgs, inv: Invocation): Promise<ToolOutput> {
  const { code, promptText } = await generateProgram('data', args)
  inv.prompt = promptText
  inv.promptTokens = estTokens(promptText)
  const res = await runPython(code, 25000)
  const lines = [
    'Data analysis (pandas/sqlite):',
    '',
    '```python',
    code,
    '```',
    '',
    'stdout:',
    res.stdout || '(empty)',
    '',
    'stderr:',
    res.stderr || '(none)',
    '',
    `exit_code: ${res.exitCode ?? 'unknown'}`,
  ]
  const confidence = res.stderr ? 0.6 : 0.86
  return { output: lines.join('\n'), confidence }
}

async function generateProgram(kind: 'python' | 'data', args: RunAgentArgs): Promise<{ code: string; promptText: string }> {
  const dataBlocks = extractDataBlocks(args.task)
  const system = kind === 'python'
    ? 'You are PythonAgent. Return ONLY valid Python code. Use print() for results. No markdown.'
    : 'You are DataAgent. Return ONLY valid Python code using pandas/sqlite. Parse any provided data blocks. Use print() for results. No markdown.'
  const user = `${buildUserPrompt(args.task, args.prior, 800)}\n\n${dataBlocks ? `# Data blocks\n${dataBlocks}` : ''}`
  const promptText = `[system]\n${system}\n\n[user]\n${user}`
  let raw = ''
  for await (const tok of streamCompletion({
    provider: args.provider,
    model: args.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: kind === 'python' ? 900 : 1200,
    temperature: 0.2,
    signal: args.signal,
  })) {
    raw += tok
  }
  const code = extractCode(raw)
  return { code, promptText }
}

function extractCode(raw: string): string {
  const fenced = /```(?:python)?\n([\s\S]*?)```/i.exec(raw)
  if (fenced?.[1]) return fenced[1].trim()
  return raw.trim()
}

function extractDataBlocks(task: string): string | null {
  const blocks: string[] = []
  const re = /```(csv|tsv|json)?\n([\s\S]*?)```/gi
  for (const m of task.matchAll(re)) {
    const label = m[1] ? m[1].toUpperCase() : 'DATA'
    blocks.push(`[${label}]\n${m[2].trim()}`)
  }
  return blocks.length > 0 ? blocks.join('\n\n') : null
}

function touchEdge(state: TaskState, from: string, to: string, step: number, send: (e: EngineEvent) => void) {
  const existing = state.edges.find(e => e.from === from && e.to === to)
  if (existing) {
    existing.weight += 1
    existing.lastStep = step
    send({ type: 'edge', edge: { ...existing } })
    void safeDb(() => upsertEdge(state.id, existing))
  } else {
    const e: Edge = { from, to, weight: 1, lastStep: step }
    state.edges.push(e)
    send({ type: 'edge', edge: { ...e } })
    void safeDb(() => upsertEdge(state.id, e))
  }
}

function inferConfidence(agentId: string, output: string): number {
  const m = /confidence\s*[:=]\s*(low|medium|high)/i.exec(output)
  if (m) {
    const k = m[1].toLowerCase()
    return k === 'high' ? 0.9 : k === 'medium' ? 0.7 : 0.5
  }
  if (agentId === 'verifier') {
    if (/overall:\s*ok/i.test(output)) return 0.92
    if (/overall:\s*revise/i.test(output)) return 0.7
    if (/overall:\s*block/i.test(output)) return 0.45
  }
  const base: Record<string, number> = {
    planner: 0.78, critic: 0.7, modifier: 0.85, concluder: 0.82, reflect: 0.76, coder: 0.84, verifier: 0.85,
    bing: 0.7, hn: 0.7, arxiv: 0.78, python: 0.86, browser: 0.72, data: 0.8, wolfram: 0.92,
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
  inv.sources = results.filter(r => !r.error).map(r => ({ title: r.title || r.url, url: r.url }))
  emit(`Confidence: ${results.every(r => !r.error) ? 'high' : 'medium'}`)
}
