// Canned response templates that adapt to the task text. The simulator picks
// from these and streams them character-by-character. Real production would
// route through the LLM Router (PRD §7.1) — these stand in for that layer.

import type { TaskFeatures } from './types'

const sample = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

const truncate = (s: string, n = 60) => s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s

export interface AgentResponse {
  output: string
  confidence: number
  sources?: { title: string; url: string }[]
}

export function plannerResponse(task: string, f: TaskFeatures): AgentResponse {
  const verbs: string[] = []
  if (f.web > 0.3 || f.research > 0.3) verbs.push('Gather grounded sources from the open web and recent literature.')
  if (f.math > 0.3) verbs.push('Formalise the quantitative core of the question into solvable sub-problems.')
  if (f.code > 0.3) verbs.push('Sketch verification scripts to cross-check intermediate claims.')
  if (verbs.length === 0) verbs.push('Decompose the request into the smallest verifiable claims.')
  verbs.push('Have the critic flag any claim that is unsourced, off-topic, or numerically suspect.')
  verbs.push('Apply targeted edits, then synthesise the final response with inline citations.')

  const numbered = verbs.map((v, i) => `  ${String(i + 1).padStart(2, '0')}.  ${v}`).join('\n')
  const out = `PLAN  ·  ${truncate(task)}\n\n${numbered}\n\nExpected agent path: tool agents → critic → modifier → concluder → terminator.`
  return { output: out, confidence: 0.78 + Math.random() * 0.1 }
}

export function bingResponse(task: string): AgentResponse {
  const queries = generateQueries(task, 3)
  const results = queries.map((q, i) => `  [${i + 1}]  ${q}\n        snippet: ${syntheticSnippet(q)}`).join('\n')
  const sources = queries.map((q, i) => ({ title: q, url: `https://example.com/r/${i + 1}-${slug(q)}` }))
  return {
    output: `Bing  ·  ${queries.length} queries dispatched.\n\n${results}\n\nFiltered to recency window: 90 days. Domain-trust scores attached as metadata.`,
    confidence: 0.72,
    sources,
  }
}

export function arxivResponse(task: string): AgentResponse {
  const titles = [
    'Puppeteer: Dynamic Multi-Agent Orchestration via Reinforcement Learning',
    'On the Topology of Cooperative LLM Agents',
    'Reflexion: Language Agents with Verbal Reinforcement Learning',
    'Tree-of-Thought Prompting for Open-Ended Reasoning',
    'Compositional Tool-Use in Large Language Models',
  ]
  const picks = titles.sort(() => Math.random() - 0.5).slice(0, 2)
  const body = picks.map((t, i) => `  ${String(i + 1).padStart(2, '0')}.  ${t}\n        relevance: ${(0.6 + Math.random() * 0.35).toFixed(2)}  ·  cited by ~${100 + Math.floor(Math.random() * 900)}`).join('\n')
  return {
    output: `arXiv  ·  ${picks.length} relevant pre-prints surfaced for '${truncate(task, 50)}'.\n\n${body}`,
    confidence: 0.81,
    sources: picks.map((t, i) => ({ title: t, url: `https://arxiv.org/abs/24${10 + i}.${1000 + i}` })),
  }
}

export function pythonResponse(task: string, f: TaskFeatures): AgentResponse {
  const isMath = f.math > 0.3
  const code = isMath
    ? `>>> from sympy import symbols, solve, Rational\n>>> x = symbols('x')\n>>> result = solve(__derive_eq("${truncate(task, 40)}"), x)\n>>> print(result, sep="\\n")\n[Rational(7, 3), Rational(-1, 2)]\n>>> verify(result)\nTrue  · residual = 0.000`
    : `>>> import json, statistics\n>>> data = load("__task_input__")\n>>> summary = {\n...   "n": len(data),\n...   "mean": statistics.mean(data),\n...   "stdev": statistics.stdev(data),\n... }\n>>> print(json.dumps(summary, indent=2))\n{\n  "n": 128,\n  "mean": 42.13,\n  "stdev": 7.04\n}`
  return {
    output: `Python 3.11  ·  sandbox=gVisor  ·  rss=212MB\n\n${code}\n\nReturned cleanly in 1.84s. Output captured for synthesis.`,
    confidence: 0.88,
  }
}

export function dataResponse(): AgentResponse {
  const code = `>>> df.shape\n(2_481, 14)\n>>> df.groupby('cohort').agg({'retention': 'mean', 'arpu': 'mean'}).head()\n         retention   arpu\ncohort                     \n2026-Q1     0.512   28.40\n2026-Q2     0.539   30.11\n2026-Q3     0.567   31.92`
  return { output: `pandas 2.2  ·  query plan resolved in 38ms\n\n${code}`, confidence: 0.86 }
}

export function browserResponse(): AgentResponse {
  return { output: `Headless Chromium  ·  domain allow-list verified.\n\n  -> opened: stripe.com/pricing\n  -> opened: openai.com/pricing\n  -> dom snapshot: 2 pricing tables, 14 plan rows extracted.\n\nNo credentialed actions performed. Cookies discarded.`, confidence: 0.74 }
}

export function wolframResponse(): AgentResponse {
  return { output: `Wolfram  ·  query: Solve[x^2 - 5x + 6 == 0, x]\n\n  -> {x -> 2}, {x -> 3}\n\nProvenance: Wolfram knowledge graph, computation hash 0x8ad…f12.`, confidence: 0.95 }
}

export function criticResponse(): AgentResponse {
  const findings = [
    'Claim "growth was 22% YoY" lacks an inline citation — request grounding from BingAgent.',
    'Quantitative result reproduces, but units appear to mix percentages with basis-points.',
    'Step 03 of the plan was never executed; verify whether it is still required.',
    'No counter-evidence considered — surface dissenting sources before synthesis.',
  ]
  const picked = findings.sort(() => Math.random() - 0.5).slice(0, 2)
  const body = picked.map((p, i) => `  ${String(i + 1).padStart(2, '0')}.  ${p}`).join('\n')
  return { output: `Critique  ·  Socratic pass complete.\n\n${body}\n\nSeverity: medium. Recommending ModifierAgent invocation.`, confidence: 0.69 }
}

export function reflectResponse(): AgentResponse {
  return { output: `Reflection  ·  trajectory of 5 steps reviewed.\n\nThe orchestrator front-loaded retrieval and is now bottlenecked on synthesis. Next best action: invoke modifier on the highest-uncertainty paragraph rather than re-querying tools. Estimated token savings vs naive continuation: 18%.`, confidence: 0.77 }
}

export function modifierResponse(): AgentResponse {
  return { output: `Diff  ·  applying critic feedback.\n\n  -  growth was 22% YoY for FY25\n  +  growth was 21.8% YoY for FY25 [src 2]\n\n  -  step three not executed\n  +  step three skipped — superseded by tool agent output\n\n2 edits applied. Output now passes critic checks.`, confidence: 0.86 }
}

export function concluderResponse(task: string, f: TaskFeatures): AgentResponse {
  const cls = f.math > 0.4 ? 'quantitative' : f.research > 0.4 ? 'research-grounded' : f.code > 0.4 ? 'engineering' : 'analytical'
  const intro = `Final synthesis  ·  ${cls} response, citations attached.`
  const body = renderBody(task, f)
  return { output: `${intro}\n\n${body}`, confidence: 0.83 }
}

// ---------------------------------------------------------------------------

function renderBody(task: string, f: TaskFeatures): string {
  const lines: string[] = []
  lines.push(`In response to: "${truncate(task, 110)}"`)
  lines.push('')
  if (f.research > 0.3 || f.web > 0.3) {
    lines.push('Headline')
    lines.push('  The evidence base converges on three findings worth surfacing in priority order. Each is grounded in at least one externally verified source.')
    lines.push('')
    lines.push('Findings')
    lines.push('  01.  Trend velocity has accelerated in the last two quarters [src 1].')
    lines.push('  02.  The dominant explanation in the literature is structural rather than cyclical [src 2].')
    lines.push('  03.  Counter-evidence exists but is bounded to a narrow segment [src 3].')
  } else if (f.math > 0.4) {
    lines.push('Result')
    lines.push('  The closed-form solution is x ∈ {7/3, −1/2}. Numerical verification gives a residual below 1e-9.')
    lines.push('')
    lines.push('Method')
    lines.push('  Sympy was used to symbolically reduce the system, then PythonAgent re-evaluated each root by direct substitution.')
  } else if (f.code > 0.4) {
    lines.push('Recommendation')
    lines.push('  Replace the brittle if/else cascade with a state machine. The Python sandbox confirms equivalent behaviour on the supplied test cases.')
  } else {
    lines.push('Position')
    lines.push('  The strongest reading of your question is conditional on three assumptions, each surfaced in the transparency panel.')
    lines.push('')
    lines.push('Implications')
    lines.push('  Action A reduces downside variance; action B increases expected value but at higher operational cost. The tradeoff is non-trivial.')
  }
  lines.push('')
  lines.push('Confidence  ·  derived from CriticAgent agreement on the modified output (see panel).')
  return lines.join('\n')
}

function generateQueries(task: string, n: number): string[] {
  const tokens = task.toLowerCase().split(/[^\w]+/).filter(t => t.length > 3 && !STOP.has(t))
  const head = tokens.slice(0, 6)
  const queries: string[] = []
  while (queries.length < n) {
    const q = head.sort(() => Math.random() - 0.5).slice(0, 3).join(' ')
    if (q && !queries.includes(q)) queries.push(q + sample([' 2026', ' benchmark', ' overview', ' data', ' report']))
  }
  return queries
}

function syntheticSnippet(q: string): string {
  const snippets = [
    'a recent industry report places the figure at 21.8% with a 2pp confidence band.',
    'authors find that emergent topologies dominate static baselines on 7 of 9 benchmarks.',
    'the practitioner consensus has shifted noticeably over the last six months.',
    'the dataset is publicly released under CC-BY 4.0 with reproduction notebooks.',
  ]
  return sample(snippets)
}

function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) }

const STOP = new Set(['that', 'this', 'with', 'from', 'have', 'what', 'when', 'where', 'which', 'about', 'into', 'their', 'there', 'would', 'should', 'could', 'will', 'your', 'mine', 'they', 'them'])
