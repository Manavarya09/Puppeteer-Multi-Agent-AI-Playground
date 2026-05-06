import { AGENTS, AGENT_BY_ID } from './agents'
import type { AgentSpec } from './agents'
import type { CandidateScore, Invocation, TaskFeatures } from './types'

const KEYWORDS: Record<keyof Omit<TaskFeatures, 'complexity'>, RegExp[]> = {
  math: [/\bmath/i, /equation/i, /solve/i, /integral/i, /derivative/i, /prime/i, /factor/i, /algebra/i, /probability/i, /\b\d+\s*[+\-*/^]\s*\d+/, /\bgsm/i, /calculate/i, /compute/i, /matrix/i, /eigen/i],
  web: [/web/i, /search/i, /look ?up/i, /current/i, /latest/i, /news/i, /recent/i, /today/i, /price/i, /url/i, /http/i, /\.com\b/i, /trending/i, /launch/i, /released?/i],
  code: [/python/i, /javascript|typescript|tsx?\b/i, /script/i, /\bcode\b/i, /function/i, /algorithm/i, /implement/i, /debug/i, /unit test/i, /regex/i, /refactor/i, /api\b/i, /class\b/i, /component/i],
  research: [/paper/i, /arxiv/i, /citation/i, /literature/i, /benchmark/i, /survey/i, /study/i, /research/i, /report/i, /analysis/i, /state[- ]of[- ]the[- ]art|sota/i],
  critique: [/review/i, /critique/i, /audit/i, /verify/i, /fact ?check/i, /accuracy/i, /sound/i, /correct/i, /evaluate/i],
  synth: [/summari[sz]e/i, /synthesi[sz]e/i, /draft/i, /memo/i, /executive summary/i, /brief/i, /report/i, /write up/i],
  plan: [/plan/i, /steps?/i, /strategy/i, /roadmap/i, /breakdown/i, /how (?:do|would|to)/i, /design/i],
}

export function extractFeatures(task: string): TaskFeatures {
  const f: TaskFeatures = { math: 0, web: 0, code: 0, research: 0, critique: 0, synth: 0, plan: 0, complexity: 0 }
  const t = task.toLowerCase()
  for (const key of Object.keys(KEYWORDS) as (keyof typeof KEYWORDS)[]) {
    let score = 0
    for (const r of KEYWORDS[key]) if (r.test(task)) score += 1
    f[key] = Math.min(1, score / 2.5)
  }
  f.plan = Math.max(0.35, f.plan)
  f.synth = Math.max(0.4, f.synth)
  const len = Math.min(1, t.length / 600)
  const punct = Math.min(1, ((t.match(/[?,;]/g) || []).length) / 6)
  f.complexity = Math.min(1, 0.3 + 0.5 * len + 0.4 * punct)
  return f
}

interface PolicyContext {
  features: TaskFeatures
  step: number
  invocations: Invocation[]
  budgetRemaining: number
  lambda: number
  subspaceCostMul: number
}

export function scoreCandidates(ctx: PolicyContext): CandidateScore[] {
  const used = new Set(ctx.invocations.map(i => i.agentId))
  const lastAgent = ctx.invocations[ctx.invocations.length - 1]?.agentId
  const lastTwo = ctx.invocations.slice(-2).map(i => i.agentId)
  const planned = used.has('planner')
  const concluded = used.has('concluder')
  const verified = used.has('verifier')
  const TOOL_IDS = ['bing', 'hn', 'arxiv', 'python', 'browser', 'data', 'wolfram']
  const toolFiredCount = ctx.invocations.filter(i => TOOL_IDS.includes(i.agentId) && i.status === 'done').length
  const haveOutput = ctx.invocations.some(i => [...TOOL_IDS, 'modifier', 'coder'].includes(i.agentId))
  const recentlyCriticised = lastAgent === 'critic'

  const raw: { a: AgentSpec; score: number }[] = AGENTS.map(a => {
    let s = 0

    // 1. Plan first.
    if (a.id === 'planner') s += planned ? -3.0 : 1.9 + ctx.features.plan * 0.6

    // 2. Tool agents — affinity-driven, with diversity penalty.
    if (a.kind === 'tool') {
      const aff = a.affinities
      const matched: number[] = []
      for (const k of Object.keys(aff) as (keyof typeof aff)[]) {
        const fv = (ctx.features as any)[k] as number
        const av = aff[k] ?? 0
        matched.push(fv * av)
      }
      const peak = matched.length ? Math.max(...matched) : 0
      s += peak * 1.7
      if (used.has(a.id)) s -= 1.1
      // Bing and HN partially substitute — discourage firing both unless task is broad.
      if (a.id === 'hn' && used.has('bing') && ctx.features.web < 0.6) s -= 0.6
      if (a.id === 'bing' && used.has('hn') && ctx.features.web < 0.6) s -= 0.4
    }

    // 3. CoderAgent — pure code synthesis when code feature dominates.
    if (a.id === 'coder') {
      s += ctx.features.code * 1.7 - 0.4
      if (used.has('coder')) s -= 1.0
    }

    // 4. Critic / Modifier loop.
    if (a.id === 'critic') {
      s += haveOutput ? 1.3 : -1.6
      if (recentlyCriticised) s -= 1.8
      if (used.has('critic')) s -= 0.6
    }
    if (a.id === 'modifier') {
      s += recentlyCriticised ? 1.7 : -0.9
    }
    if (a.id === 'reflect') {
      s += ctx.step >= 3 && ctx.features.complexity > 0.55 ? 0.9 : -0.7
      if (used.has('reflect')) s -= 1.4
    }

    // 5. Concluder — needs at least one tool fire AND ideally a critic pass.
    if (a.id === 'concluder') {
      const enoughEvidence = toolFiredCount >= 1 || used.has('coder')
      const cycleDone = used.has('critic')
      s += enoughEvidence && cycleDone ? 1.6 : enoughEvidence ? 0.6 : -2.6
      if (used.has('concluder')) s -= 4.0
    }

    // 6. Verifier — final ground-check between concluder and terminator.
    if (a.id === 'verifier') {
      s += concluded && !verified ? 2.4 : -3.0
      if (used.has('verifier')) s -= 5.0
      // Skip verifier on tasks with no factual surface (pure code synth).
      if (ctx.features.research < 0.2 && ctx.features.web < 0.2 && ctx.features.math < 0.2) s -= 0.8
    }

    // 7. Terminator — only after concluder (and after verifier when warranted).
    if (a.id === 'terminator') {
      s += concluded ? 3.2 : -6.0
      if (concluded && !verified && (ctx.features.research >= 0.3 || ctx.features.web >= 0.3)) s -= 1.0
    }

    // 8. Anti-ping-pong.
    if (lastTwo.length === 2 && lastTwo[0] === a.id && lastTwo[1] !== a.id) s -= 0.4
    if (lastAgent === a.id) s -= 0.9

    // 9. Cost shaping.
    const stepCost = (a.costWeight / 7) * ctx.subspaceCostMul
    s -= ctx.lambda * stepCost
    if (ctx.budgetRemaining < 0.25 && !['concluder', 'verifier', 'terminator'].includes(a.id)) s -= 1.5

    return { a, score: s }
  })

  const T = 0.65
  const max = Math.max(...raw.map(r => r.score))
  const exps = raw.map(r => Math.exp((r.score - max) / T))
  const Z = exps.reduce((acc, v) => acc + v, 0)
  return raw.map((r, i) => ({ agentId: r.a.id, score: r.score, prob: exps[i] / Z }))
    .sort((a, b) => b.prob - a.prob)
}

export function selectAgent(scores: CandidateScore[]): { selected: string; rationale: string } {
  const top = scores[0]
  const second = scores[1]
  const margin = second ? top.prob - second.prob : top.prob
  const a = AGENT_BY_ID[top.agentId]
  const reason = describeRationale(a, margin)
  return { selected: top.agentId, rationale: reason }
}

function describeRationale(a: AgentSpec, margin: number): string {
  const conf = margin > 0.35 ? 'high-confidence' : margin > 0.15 ? 'moderate' : 'narrow'
  const bits: Record<string, string> = {
    planner: 'task lacks an explicit plan — decomposing into ordered sub-steps before tool dispatch.',
    bing: 'web context required — querying DuckDuckGo for grounded snippets.',
    hn: 'task has recency / dev-trend signal — pulling Hacker News stories.',
    arxiv: 'scholarly intent detected — fetching arXiv pre-prints.',
    python: 'computation or verification needed — running sandboxed Python.',
    wolfram: 'symbolic / numeric closed-form likely faster than free-form reasoning.',
    browser: 'snippets insufficient — opening URLs in headless Chromium for full text.',
    data: 'tabular operations required — generating pandas/sqlite over provided data.',
    coder: 'task is code-shaped — producing implementation with design tradeoffs.',
    critic: 'prior output substantive — auditing for hallucinations, gaps, unit errors.',
    modifier: 'critic flagged issues — applying corrections in-place.',
    reflect: 'trajectory deepening — reflecting before committing more budget.',
    concluder: 'evidence accrued — synthesising the final response.',
    verifier: 'concluder draft ready — ground-checking each load-bearing claim against sources.',
    terminator: 'final output verified; halting orchestration.',
  }
  return `${conf} pick · ${bits[a.id] ?? 'task-aligned default.'}`
}

export function policyTemperature(): number { return 0.65 }
