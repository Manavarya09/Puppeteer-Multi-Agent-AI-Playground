import { AGENTS, AGENT_BY_ID, AgentSpec } from './agents'
import type { CandidateScore, Invocation, TaskFeatures } from './types'

// ---------------------------------------------------------------------------
// Task feature extractor — keyword-driven proxy for the embedding-based
// classifier described in PRD §13.1. Intentionally interpretable so the
// orchestrator's rationale strings are meaningful to end users.
// ---------------------------------------------------------------------------

const KEYWORDS: Record<keyof Omit<TaskFeatures, 'complexity'>, RegExp[]> = {
  math: [/\bmath/i, /equation/i, /solve/i, /integral/i, /derivative/i, /prime/i, /factor/i, /algebra/i, /probability/i, /\b\d+\s*[+\-*/^]\s*\d+/, /\bgsm/i, /calculate/i, /compute/i],
  web: [/web/i, /search/i, /look ?up/i, /current/i, /latest/i, /news/i, /recent/i, /today/i, /price/i, /url/i, /http/i, /\.com\b/i],
  code: [/python/i, /script/i, /\bcode\b/i, /function/i, /algorithm/i, /implement/i, /debug/i, /unit test/i, /regex/i],
  research: [/paper/i, /arxiv/i, /citation/i, /literature/i, /benchmark/i, /survey/i, /study/i, /research/i, /report/i, /analysis/i],
  critique: [/review/i, /critique/i, /audit/i, /verify/i, /fact ?check/i, /accuracy/i, /sound/i, /correct/i],
  synth: [/summarise|summarize/i, /synthesi[sz]e/i, /draft/i, /memo/i, /executive summary/i, /brief/i, /report/i],
  plan: [/plan/i, /steps?/i, /strategy/i, /roadmap/i, /breakdown/i],
}

export function extractFeatures(task: string): TaskFeatures {
  const f: TaskFeatures = { math: 0, web: 0, code: 0, research: 0, critique: 0, synth: 0, plan: 0, complexity: 0 }
  const t = task.toLowerCase()
  for (const key of Object.keys(KEYWORDS) as (keyof typeof KEYWORDS)[]) {
    let score = 0
    for (const r of KEYWORDS[key]) if (r.test(task)) score += 1
    f[key] = Math.min(1, score / 2.5)
  }
  // Always at least a touch of plan + synth so the pipeline has structure.
  f.plan = Math.max(0.35, f.plan)
  f.synth = Math.max(0.4, f.synth)
  // Complexity: rough proxy — length + question marks + commas.
  const len = Math.min(1, t.length / 600)
  const punct = Math.min(1, ((t.match(/[?,;]/g) || []).length) / 6)
  f.complexity = Math.min(1, 0.3 + 0.5 * len + 0.4 * punct)
  return f
}

// ---------------------------------------------------------------------------
// Policy π(a_t | S_t, τ). A softmax over a hand-crafted score that mirrors
// the affinity / cost tradeoff the RL policy converges on per PRD §13.2.
// ---------------------------------------------------------------------------

interface PolicyContext {
  features: TaskFeatures
  step: number
  invocations: Invocation[]
  budgetRemaining: number   // 0..1
  lambda: number            // cost sensitivity (matches PRD R_t formula)
  subspaceCostMul: number   // titan more expensive than mimas
}

export function scoreCandidates(ctx: PolicyContext): CandidateScore[] {
  const used = new Set(ctx.invocations.map(i => i.agentId))
  const lastAgent = ctx.invocations[ctx.invocations.length - 1]?.agentId
  const lastTwo = ctx.invocations.slice(-2).map(i => i.agentId)
  const planned = used.has('planner')
  const concluded = used.has('concluder')
  const haveOutput = ctx.invocations.some(i => ['bing', 'arxiv', 'python', 'browser', 'data', 'wolfram', 'modifier'].includes(i.agentId))
  const recentlyCriticised = lastAgent === 'critic'

  const raw: { a: AgentSpec; score: number }[] = AGENTS.map(a => {
    let s = 0

    // 1. Plan-first prior
    if (a.id === 'planner') s += planned ? -2.4 : 1.8 + ctx.features.plan * 0.6

    // 2. Tool agents fire when their affinity hits.
    if (a.kind === 'tool') {
      const aff = a.affinities
      const matchedFeatures: number[] = []
      for (const k of Object.keys(aff) as (keyof typeof aff)[]) {
        const fv = (ctx.features as any)[k] as number
        const av = aff[k] ?? 0
        matchedFeatures.push(fv * av)
      }
      const peak = matchedFeatures.length ? Math.max(...matchedFeatures) : 0
      s += peak * 1.6
      // Encourage diversity — re-using the same tool penalised mildly.
      if (used.has(a.id)) s -= 0.9
    }

    // 3. Critic / Modifier loop after we have substantive output.
    if (a.id === 'critic') {
      s += haveOutput ? 1.2 : -1.5
      if (recentlyCriticised) s -= 1.6
    }
    if (a.id === 'modifier') {
      s += recentlyCriticised ? 1.6 : -0.8
    }
    if (a.id === 'reflect') {
      s += ctx.step >= 3 && ctx.features.complexity > 0.55 ? 0.8 : -0.6
      if (used.has('reflect')) s -= 1.2
    }

    // 4. Concluder gates on having a critic→modifier cycle (or plenty of output).
    if (a.id === 'concluder') {
      const cycleDone = used.has('critic') && used.has('modifier')
      const enoughOutput = ctx.invocations.filter(i => i.status === 'done').length >= 4
      s += cycleDone || enoughOutput ? 1.5 : -2.5
    }

    // 5. Terminator only after concluder.
    if (a.id === 'terminator') {
      s += concluded ? 3.0 : -5.0
    }

    // 6. Avoid two-step ping-pong.
    if (lastTwo.length === 2 && lastTwo[0] === a.id && lastTwo[1] !== a.id) s -= 0.4
    if (lastAgent === a.id) s -= 0.8

    // 7. Reward shaping: cost penalty from PRD R_t = r - λ·C_t
    const stepCost = (a.costWeight / 7) * ctx.subspaceCostMul
    s -= ctx.lambda * stepCost
    // Hard penalty when running out of budget.
    if (ctx.budgetRemaining < 0.25 && a.id !== 'concluder' && a.id !== 'terminator') s -= 1.4

    return { a, score: s }
  })

  // Softmax with temperature 0.7 — the policy is sharp but not greedy.
  const T = 0.7
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
    bing: 'real-time web context appears necessary; routing to Bing for a grounded snapshot.',
    arxiv: 'task has scholarly intent — pulling related literature via arXiv.',
    python: 'computation or verification step required — invoking sandboxed Python.',
    wolfram: 'symbolic / numeric closed-form likely faster than free-form reasoning.',
    browser: 'search snippets insufficient — opening a headless browser for deeper context.',
    data: 'tabular reasoning required — DataAgent loaded for pandas/SQL operations.',
    critic: 'prior output is now substantive enough to audit for hallucinations and gaps.',
    modifier: 'critic flagged issues — applying targeted edits to prior output.',
    reflect: 'trajectory is becoming long; reflecting before committing more budget.',
    concluder: 'sufficient evidence accrued — synthesising final response.',
    terminator: 'final output produced and validated; halting orchestration.',
  }
  return `${conf} pick · ${bits[a.id] ?? 'task-aligned default.'}`
}

export function policyTemperature(): number { return 0.7 }
