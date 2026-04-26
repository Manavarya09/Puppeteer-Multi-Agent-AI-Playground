import { AGENT_BY_ID, AGENTS } from './agents'
import { extractFeatures, scoreCandidates, selectAgent } from './policy'
import {
  arxivResponse, bingResponse, browserResponse, concluderResponse,
  criticResponse, dataResponse, modifierResponse, plannerResponse,
  pythonResponse, reflectResponse, wolframResponse,
  type AgentResponse,
} from './responses'
import type {
  EngineEvent, Invocation, OrchestratorDecision, Subspace, TaskState,
} from './types'

export interface EngineOpts {
  task: string
  subspace: Subspace
  budget: number              // max tokens across all agents
  speed?: number              // 1 = realtime; > 1 faster
  onEvent: (e: EngineEvent) => void
  shouldCancel?: () => boolean
}

export class OrchestrationEngine {
  private state: TaskState
  private opts: EngineOpts
  private cancelled = false

  constructor(opts: EngineOpts) {
    this.opts = opts
    const features = extractFeatures(opts.task)
    this.state = {
      id: rid(),
      task: opts.task,
      subspace: opts.subspace,
      budget: opts.budget,
      status: 'idle',
      features,
      invocations: [],
      decisions: [],
      edges: [],
      totalTokens: 0,
      costUsd: 0,
      finalOutput: '',
      finalConfidence: 0,
    }
  }

  cancel() { this.cancelled = true }

  async run(): Promise<TaskState> {
    this.state.status = 'running'
    this.state.startedAt = Date.now()
    this.emit({ type: 'state', state: this.snapshot() })

    let step = 0
    const MAX_STEPS = 12
    while (step < MAX_STEPS) {
      if (this.cancelled || this.opts.shouldCancel?.()) {
        this.state.status = 'cancelled'
        break
      }
      const budgetRemaining = Math.max(0, 1 - this.state.totalTokens / this.state.budget)
      if (budgetRemaining <= 0.02) break

      const candidates = scoreCandidates({
        features: this.state.features,
        step,
        invocations: this.state.invocations,
        budgetRemaining,
        lambda: 0.3,
        subspaceCostMul: this.state.subspace === 'titan' ? 1.6 : 1.0,
      })
      const { selected, rationale } = selectAgent(candidates)
      const decision: OrchestratorDecision = {
        step, candidates, selected, rationale, ts: Date.now(),
      }
      this.state.decisions.push(decision)
      this.emit({ type: 'decision', decision })

      if (selected === 'terminator') break

      await this.runAgent(selected, step)

      // Edge: orchestrator emits a directional edge between consecutive agents.
      const prev = this.state.invocations[this.state.invocations.length - 2]
      const cur = this.state.invocations[this.state.invocations.length - 1]
      if (prev && cur) this.touchEdge(prev.agentId, cur.agentId, step)

      // Cyclical feedback after critic→modifier: emit reverse edge.
      if (cur?.agentId === 'modifier' && prev?.agentId === 'critic') {
        const earlier = [...this.state.invocations].reverse().find(i => !['critic', 'modifier'].includes(i.agentId))
        if (earlier) this.touchEdge(cur.agentId, earlier.agentId, step)
      }

      step += 1
    }

    // Force a concluder if we exited without one and we have any output.
    const hasOutput = this.state.invocations.some(i => i.status === 'done')
    const hasConcluder = this.state.invocations.some(i => i.agentId === 'concluder')
    if (hasOutput && !hasConcluder && !this.cancelled) {
      const forced: OrchestratorDecision = {
        step, candidates: scoreCandidates({
          features: this.state.features, step,
          invocations: this.state.invocations, budgetRemaining: 0.3,
          lambda: 0.3, subspaceCostMul: 1,
        }),
        selected: 'concluder',
        rationale: 'budget exhausted — forcing synthesis to deliver a partial answer.',
        ts: Date.now(),
      }
      this.state.decisions.push(forced)
      this.emit({ type: 'decision', decision: forced })
      await this.runAgent('concluder', step)
      const last = this.state.invocations[this.state.invocations.length - 1]
      const before = this.state.invocations[this.state.invocations.length - 2]
      if (last && before) this.touchEdge(before.agentId, last.agentId, step)
    }

    const concluder = [...this.state.invocations].reverse().find(i => i.agentId === 'concluder')
    this.state.finalOutput = concluder?.output ?? '(no synthesis produced)'
    this.state.finalConfidence = concluder?.confidence ?? 0
    this.state.completedAt = Date.now()
    if (this.state.status === 'running') this.state.status = 'complete'
    this.emit({ type: 'complete', state: this.snapshot() })
    return this.snapshot()
  }

  private async runAgent(id: string, step: number): Promise<void> {
    const spec = AGENT_BY_ID[id]
    const inv: Invocation = {
      id: rid(),
      step,
      agentId: id,
      prompt: buildPrompt(id, this.state.task, this.state.invocations),
      output: '',
      status: 'running',
      promptTokens: estTokens(this.state.task) + 80,
      completionTokens: 0,
      durationMs: 0,
      confidence: 0,
      startTs: Date.now(),
    }
    this.state.invocations.push(inv)
    this.emit({ type: 'agent_start', invocation: { ...inv } })

    const resp = produceResponse(id, this.state.task, this.state.features)

    // Stream tokens
    const speed = this.opts.speed ?? 1
    const chars = resp.output.split('')
    const chunkSize = Math.max(1, Math.floor(2 + Math.random() * 4))
    const baseDelay = 14 / speed
    for (let i = 0; i < chars.length; i += chunkSize) {
      if (this.cancelled) break
      const piece = chars.slice(i, i + chunkSize).join('')
      inv.output += piece
      this.emit({ type: 'agent_token', invocationId: inv.id, token: piece })
      // Pause briefly on punctuation for cadence.
      const pause = piece.includes('\n') ? baseDelay * 4 : baseDelay
      await sleep(pause)
    }

    inv.completionTokens = estTokens(resp.output)
    inv.durationMs = Date.now() - inv.startTs
    inv.confidence = resp.confidence
    inv.sources = resp.sources
    inv.status = 'done'
    inv.endTs = Date.now()
    this.state.totalTokens += inv.promptTokens + inv.completionTokens
    this.state.costUsd += this.estCost(spec.id, inv.promptTokens + inv.completionTokens)
    this.emit({ type: 'agent_end', invocation: { ...inv } })
    this.emit({ type: 'state', state: this.snapshot() })
  }

  private touchEdge(from: string, to: string, step: number) {
    const existing = this.state.edges.find(e => e.from === from && e.to === to)
    if (existing) {
      existing.weight += 1
      existing.lastStep = step
      this.emit({ type: 'edge', edge: { ...existing } })
    } else {
      const e = { from, to, weight: 1, lastStep: step }
      this.state.edges.push(e)
      this.emit({ type: 'edge', edge: { ...e } })
    }
  }

  private estCost(agentId: string, tokens: number): number {
    // Mimas: $0.0015/1k. Titan: $0.0225/1k. Tool agents add a small fixed overhead.
    const per1k = this.state.subspace === 'titan' ? 0.0225 : 0.0015
    const tool = AGENT_BY_ID[agentId]?.kind === 'tool' ? 0.0008 : 0
    return (tokens / 1000) * per1k + tool
  }

  private emit(e: EngineEvent) { this.opts.onEvent(e) }

  snapshot(): TaskState {
    return {
      ...this.state,
      invocations: this.state.invocations.map(i => ({ ...i })),
      decisions: this.state.decisions.map(d => ({ ...d, candidates: d.candidates.map(c => ({ ...c })) })),
      edges: this.state.edges.map(e => ({ ...e })),
    }
  }

  // Compaction = edges / (N * (N-1)) over agents that actually fired.
  compaction(): number {
    const fired = new Set(this.state.invocations.map(i => i.agentId))
    const n = fired.size
    if (n < 2) return 0
    const possible = n * (n - 1)
    return Math.min(1, this.state.edges.length / possible)
  }

  // Cycle detection via DFS — identifies feedback loops (PRD §5.2 FR-019).
  cycles(): string[][] {
    const adj = new Map<string, string[]>()
    for (const e of this.state.edges) {
      const arr = adj.get(e.from) ?? []
      arr.push(e.to)
      adj.set(e.from, arr)
    }
    const cycles: string[][] = []
    const visited = new Set<string>()
    const stack = new Set<string>()
    const path: string[] = []
    function dfs(node: string) {
      visited.add(node); stack.add(node); path.push(node)
      for (const next of adj.get(node) ?? []) {
        if (stack.has(next)) {
          const idx = path.indexOf(next)
          if (idx >= 0) cycles.push([...path.slice(idx), next])
        } else if (!visited.has(next)) {
          dfs(next)
        }
      }
      stack.delete(node); path.pop()
    }
    for (const n of adj.keys()) if (!visited.has(n)) dfs(n)
    return cycles
  }
}

// ---------------------------------------------------------------------------

function produceResponse(id: string, task: string, f: ReturnType<typeof extractFeatures>): AgentResponse {
  switch (id) {
    case 'planner': return plannerResponse(task, f)
    case 'bing': return bingResponse(task)
    case 'arxiv': return arxivResponse(task)
    case 'python': return pythonResponse(task, f)
    case 'data': return dataResponse()
    case 'browser': return browserResponse()
    case 'wolfram': return wolframResponse()
    case 'critic': return criticResponse()
    case 'reflect': return reflectResponse()
    case 'modifier': return modifierResponse()
    case 'concluder': return concluderResponse(task, f)
    default: return { output: 'no-op', confidence: 0 }
  }
}

function buildPrompt(id: string, task: string, prior: Invocation[]): string {
  const spec = AGENT_BY_ID[id]
  const trace = prior.slice(-3).map(p => `[${AGENT_BY_ID[p.agentId].short}] ${p.output.slice(0, 240)}…`).join('\n---\n') || '(no prior context)'
  return [
    `# system`,
    `You are ${spec.name}. Pattern: ${spec.pattern}. Tools: ${spec.tools.join(', ') || 'none'}.`,
    ``,
    `# task`,
    task,
    ``,
    `# prior_state (truncated)`,
    trace,
    ``,
    `# instruction`,
    `Produce a structured output appropriate to your role. Stop when you have nothing further to add.`,
  ].join('\n')
}

function estTokens(s: string): number {
  return Math.max(1, Math.round(s.length / 3.7))
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const rid = () => Math.random().toString(36).slice(2, 10)

export { AGENTS as ALL_AGENTS }
