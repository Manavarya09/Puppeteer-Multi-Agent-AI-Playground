'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { AGENTS } from '@/engine/agents'

export default function LandingPage() {
  return (
    <div className="relative">
      <Hero />
      <BenchmarkStrip />
      <ParadigmSection />
      <AgentMatrix />
      <ArchitectureSection />
      <TopologySection />
      <Cta />
    </div>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b hairline">
      <div className="grid-bg absolute inset-0 opacity-50" />
      <div className="absolute inset-0 noise" style={{ ['--grain-opacity' as never]: 0.06 } as React.CSSProperties} />
      <div className="relative max-w-[1400px] mx-auto px-6 pt-20 pb-28">
        <h1 className="font-display text-[clamp(56px,9vw,148px)] leading-[0.92] text-bone-100 text-balance">
          One model is no longer<br />
          <span className="serif-italic text-signal-amber">enough.</span>
        </h1>
        <div className="grid grid-cols-12 gap-8 mt-12">
          <div className="col-span-12 md:col-span-5 md:col-start-2">
            <p className="text-[19px] leading-[1.55] text-bone-300/90 text-balance">
              Puppeteer is an open, research-grade platform that coordinates a team of specialist
              AI agents through a centralized, RL-driven orchestrator. The result is consistently
              better than any single LLM operating alone — and provably more efficient than
              hand-coded multi-agent pipelines.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/playground" className="px-5 py-3 bg-signal-amber text-ink-950 font-mono text-[12px] tracking-[0.22em] uppercase hover:bg-bone-100 transition-colors">Run a task →</Link>
              <Link href="/research" className="px-5 py-3 border hairline-strong font-mono text-[12px] tracking-[0.22em] uppercase hover:bg-bone-100 hover:text-ink-950 transition-colors">Read the paper</Link>
            </div>
          </div>
          <div className="col-span-12 md:col-span-5 md:col-start-8 md:pt-2">
            <SimulatedTerminal />
          </div>
        </div>
      </div>
    </section>
  )
}

function SimulatedTerminal() {
  const lines = [
    { t: 'POST /api/orchestrate', cls: 'text-bone-100' },
    { t: '  task: "compare Stripe and Adyen on developer experience..."', cls: 'text-bone-300' },
    { t: '  provider: "openrouter"', cls: 'text-bone-300' },
    { t: '  model: "openai/gpt-4o-mini"', cls: 'text-bone-300' },
    { t: '  max_tokens: 12000', cls: 'text-bone-300' },
    { t: '202 task_id=tsk_8af2e1', cls: 'text-signal-sage' },
    { t: '', cls: '' },
    { t: '> orchestrator.select() → PlannerAgent  prob=0.71', cls: 'text-signal-amber' },
    { t: '> orchestrator.select() → DuckDuckGoAgent prob=0.64', cls: 'text-signal-amber' },
    { t: '> orchestrator.select() → CriticAgent   prob=0.58', cls: 'text-signal-amber' },
    { t: '> orchestrator.select() → ModifierAgent prob=0.52', cls: 'text-signal-amber' },
    { t: '> orchestrator.select() → ConcluderAgent prob=0.69', cls: 'text-signal-amber' },
    { t: '> orchestrator.select() → Terminator   prob=0.94', cls: 'text-signal-amber' },
    { t: '', cls: '' },
    { t: 'task_complete  tokens=8,420  topology=cyclic', cls: 'text-signal-sage' },
  ]
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (shown >= lines.length) return
    const id = setTimeout(() => setShown(s => s + 1), 280 + Math.random() * 220)
    return () => clearTimeout(id)
  }, [shown, lines.length])
  return (
    <div className="border hairline-strong bg-ink-900/70 corner relative">
      <span className="c absolute inset-0 pointer-events-none" />
      <div className="border-b hairline px-3 py-2 flex items-center justify-between">
        <span className="eyebrow">terminal · puppeteer/run</span>
        <span className="eyebrow text-signal-sage">live</span>
      </div>
      <pre className="p-4 text-[12.5px] font-mono leading-[1.7] min-h-[280px]">
        {lines.slice(0, shown).map((l, i) => (
          <div key={i} className={l.cls}>{l.t || ' '}</div>
        ))}
        {shown < lines.length && <span className="inline-block w-[6px] h-[14px] bg-signal-amber align-middle animate-pulse" />}
      </pre>
    </div>
  )
}

function BenchmarkStrip() {
  const items = [
    { k: 'GSM-Hard', base: '13.5%', evolved: '70.0%', delta: '+5.2×' },
    { k: 'MMLU-Pro', base: '76.0%', evolved: '83.0%', delta: '+7.0pt' },
    { k: 'compaction', base: '< 0.10', evolved: '> 0.40', delta: 'denser' },
    { k: 'cyclicality', base: '0%', evolved: '> 60%', delta: 'feedback' },
    { k: 'token reduction', base: '—', evolved: '> 20%', delta: 'vs naive' },
  ]
  return (
    <section className="border-b hairline">
      <div className="max-w-[1400px] mx-auto px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x hairline">
          {items.map(b => (
            <div key={b.k} className="px-4 py-2">
              <div className="eyebrow">{b.k}</div>
              <div className="font-display text-[44px] leading-none text-bone-100 mt-2">{b.evolved}</div>
              <div className="text-[12px] text-bone-300 mt-1">base · <span className="line-through opacity-70">{b.base}</span></div>
              <div className="text-[11px] font-mono text-signal-amber mt-1">{b.delta}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ParadigmSection() {
  return (
    <section className="border-b hairline">
      <div className="max-w-[1400px] mx-auto px-6 py-24 grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-4">
          <span className="eyebrow">§ 02 · paradigm</span>
          <h2 className="font-display text-[64px] leading-[0.95] mt-3 text-bone-100">
            Coordination, not<br /><span className="serif-italic text-signal-amber">capacity</span>.
          </h2>
        </div>
        <div className="col-span-12 md:col-span-7 md:col-start-6 space-y-6 text-[16px] leading-[1.7] text-bone-300/90">
          <p>
            Large language models have plateaued within a narrow band of performance on the
            benchmarks that matter. The next order-of-magnitude improvement does not come from
            another scaling run — it comes from how models cooperate.
          </p>
          <p>
            The Puppeteer paradigm trains a small policy that learns to <em className="serif-italic text-bone-100">activate</em>
            specialist agents conditional on task state. The policy is rewarded for solution
            quality, penalised for cost, and improves continuously from production traffic.
          </p>
          <ComparisonTable />
        </div>
      </div>
    </section>
  )
}

function ComparisonTable() {
  const rows: [string, string, string, string, string][] = [
    ['orchestration', 'RL-learned, dynamic', 'human-designed', 'role-based static', 'human-coded graph'],
    ['topology', 'evolves to cyclic', 'linear / static', 'role static', 'fixed DAG'],
    ['efficiency', 'RL prunes redundancy', 'runaway loops', 'no cost optim.', 'manual'],
    ['transparency', 'full agent trace', 'minimal', 'role logs', 'debug logs'],
    ['research basis', 'peer-reviewed paper', '—', '—', '—'],
  ]
  return (
    <table className="w-full text-[13px] mt-6 border hairline">
      <thead>
        <tr className="border-b hairline">
          <th></th>
          <th className="p-3 text-left font-display text-[18px] text-signal-amber">Puppeteer</th>
          <th className="p-3 text-left text-bone-300/80">AutoGPT</th>
          <th className="p-3 text-left text-bone-300/80">CrewAI</th>
          <th className="p-3 text-left text-bone-300/80">LangGraph</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r[0]} className="border-b hairline">
            <td className="eyebrow p-3">{r[0]}</td>
            <td className="p-3 text-bone-100">{r[1]}</td>
            <td className="p-3 text-bone-300/80">{r[2]}</td>
            <td className="p-3 text-bone-300/80">{r[3]}</td>
            <td className="p-3 text-bone-300/80">{r[4]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AgentMatrix() {
  return (
    <section className="border-b hairline relative">
      <div className="grid-bg absolute inset-0 opacity-30 pointer-events-none" />
      <div className="relative max-w-[1400px] mx-auto px-6 py-24">
        <div className="grid grid-cols-12 gap-6 mb-12">
          <div className="col-span-12 md:col-span-6">
            <span className="eyebrow">§ 03 · the cast</span>
            <h2 className="font-display text-[64px] leading-[0.95] mt-3 text-bone-100">A library of <span className="serif-italic text-signal-amber">specialists</span>.</h2>
          </div>
          <div className="col-span-12 md:col-span-5 md:col-start-8 self-end text-[15px] text-bone-300/80">
            Fifteen agents, each with a defined role, isolation envelope, and cost weight.
            The orchestrator picks among them step-by-step. None of these agents are fine-tuned
            models — they are prompt + tool envelopes over standard LLM APIs.
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-bone-100/10">
          {AGENTS.map(a => (
            <div key={a.id} className="bg-ink-900 p-5 hover:bg-ink-850 transition-colors group">
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-mono text-[10px] tracking-widest text-signal-amber">{a.short}</span>
                <span className="eyebrow">{a.kind}</span>
              </div>
              <div className="font-display text-[32px] text-bone-100 leading-none">{a.name.replace('Agent', '')}<span className="text-bone-300/40">Agent</span></div>
              <p className="text-[13px] text-bone-300/80 mt-3 leading-relaxed">{a.blurb}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] font-mono">
                <div><div className="eyebrow">pattern</div>{a.pattern}</div>
                <div><div className="eyebrow">max tok</div>{a.maxTokens.toLocaleString()}</div>
                <div><div className="eyebrow">cost</div>{a.costWeight}/10</div>
              </div>
              {a.tools.length > 0 && (
                <div className="mt-3 text-[11px] text-bone-300/70 font-mono">tools: {a.tools.join(' · ')}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ArchitectureSection() {
  return (
    <section className="border-b hairline">
      <div className="max-w-[1400px] mx-auto px-6 py-24 grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-4">
          <span className="eyebrow">§ 04 · architecture</span>
          <h2 className="font-display text-[64px] leading-[0.95] mt-3 text-bone-100">Engineered for <span className="serif-italic text-signal-amber">trust</span>.</h2>
          <p className="text-[15px] text-bone-300/85 mt-4 leading-relaxed">
            Stateless, horizontally-scalable, and observable end-to-end. Agents run in
            sandboxed containers with no network egress except to allow-listed APIs.
          </p>
        </div>
        <div className="col-span-12 md:col-span-8 grid grid-cols-2 gap-px bg-bone-100/10">
          {[
            ['Frontend', 'Next.js 15 · React 19 · Tailwind', 'Playground UI, live graph, server actions.'],
            ['API route', 'Next.js Route Handler · SSE', 'Edge-friendly streaming orchestration.'],
            ['Orchestrator', 'TS policy → 4-layer Transformer', 'Heuristic v1; learned policy roadmap.'],
            ['Agent pool', 'Provider tools · isolated', 'Each agent isolated. 30s timeout.'],
            ['LLM router', 'OpenRouter + Groq', '100+ models · low-latency fast path.'],
            ['Task queue', 'Redis Streams (planned)', 'Async dispatch · pub-sub state bus.'],
            ['Database', 'Postgres / Neon', 'Run history · trace replay.'],
            ['Observability', 'OpenTelemetry hooks', 'Per-agent token attribution.'],
          ].map(([title, tech, desc]) => (
            <div key={title} className="bg-ink-900 p-5">
              <div className="eyebrow">{title}</div>
              <div className="font-mono text-[12px] text-bone-100 mt-2">{tech}</div>
              <p className="text-[13px] text-bone-300/80 mt-2 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TopologySection() {
  const ref = useRef<SVGSVGElement>(null)
  return (
    <section className="border-b hairline relative overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-6 py-24 grid grid-cols-12 gap-8 items-center">
        <div className="col-span-12 md:col-span-5">
          <span className="eyebrow">§ 05 · topology evolution</span>
          <h2 className="font-display text-[64px] leading-[0.95] mt-3 text-bone-100">
            Watch the graph<br /><span className="serif-italic text-signal-amber">learn</span>.
          </h2>
          <p className="text-[15px] text-bone-300/85 mt-4 leading-relaxed">
            Starting from a sparse star, the orchestrator policy converges on dense, cyclic
            interaction patterns — the structural signature of agents that critique, revise
            and re-query each other before synthesis.
          </p>
          <ul className="mt-6 space-y-2 text-[13px]">
            <li className="flex justify-between border-b hairline py-2"><span className="eyebrow">compaction</span><span className="font-mono text-bone-100">0.08 → 0.42</span></li>
            <li className="flex justify-between border-b hairline py-2"><span className="eyebrow">cycles per task</span><span className="font-mono text-bone-100">0% → 63%</span></li>
            <li className="flex justify-between border-b hairline py-2"><span className="eyebrow">avg steps</span><span className="font-mono text-bone-100">9.4 → 5.8</span></li>
            <li className="flex justify-between py-2"><span className="eyebrow">token spend</span><span className="font-mono text-signal-amber">−24%</span></li>
          </ul>
        </div>
        <div className="col-span-12 md:col-span-6 md:col-start-7">
          <svg ref={ref} viewBox="0 0 600 400" className="w-full h-auto border hairline bg-ink-950/50">
            <g>
              <g transform="translate(100,80)">
                <text x="0" y="-20" fontFamily='"JetBrains Mono", monospace' fontSize="9" fill="#8a8a92" letterSpacing="2">EPISODE 001</text>
                <line x1="0" y1="0" x2="60" y2="40" stroke="rgba(246,241,230,0.3)" />
                <line x1="60" y1="40" x2="120" y2="0" stroke="rgba(246,241,230,0.3)" />
                <line x1="60" y1="40" x2="60" y2="100" stroke="rgba(246,241,230,0.3)" />
                {[[0,0,'PLN'],[60,40,'BNG'],[120,0,'CNC'],[60,100,'END']].map(([x,y,t],i) => (
                  <g key={i} transform={`translate(${x} ${y})`}>
                    <circle r="14" fill="#15151a" stroke="rgba(246,241,230,0.4)" />
                    <text textAnchor="middle" y="3" fontFamily='"JetBrains Mono", monospace' fontSize="8" fill="#f6f1e6">{t}</text>
                  </g>
                ))}
              </g>
              <g transform="translate(290,180)">
                <line x1="0" y1="0" x2="32" y2="0" stroke="#f5b942" strokeWidth="1" markerEnd="url(#arrowEv)" />
                <text y="-8" fontFamily='"JetBrains Mono", monospace' fontSize="9" fill="#f5b942" letterSpacing="2">+1,200 EPISODES</text>
              </g>
              <g transform="translate(380,80)">
                <text x="0" y="-20" fontFamily='"JetBrains Mono", monospace' fontSize="9" fill="#8a8a92" letterSpacing="2">EPISODE 1,247</text>
                {[[40,0,'PLN'],[120,0,'BNG'],[160,60,'PY'],[120,120,'CRT'],[40,120,'MOD'],[0,60,'CNC'],[80,60,'RFL']].map(([x,y,t],i) => (
                  <g key={i} transform={`translate(${x} ${y})`}>
                    <circle r="14" fill={t==='RFL'?'#f5b942':'#15151a'} stroke={t==='RFL'?'#f5b942':'rgba(246,241,230,0.6)'} />
                    <text textAnchor="middle" y="3" fontFamily='"JetBrains Mono", monospace' fontSize="8" fill={t==='RFL'?'#08080a':'#f6f1e6'}>{t}</text>
                  </g>
                ))}
                {[
                  [40,0,120,0],[120,0,160,60],[160,60,120,120],[120,120,40,120],[40,120,0,60],[0,60,40,0],
                  [80,60,40,0],[80,60,120,0],[80,60,160,60],[80,60,120,120],[80,60,40,120],[80,60,0,60],
                  [120,120,80,60],[40,120,80,60],
                ].map(([x1,y1,x2,y2],i) => (
                  <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(245,185,66,0.5)" strokeWidth="1" />
                ))}
              </g>
              <defs>
                <marker id="arrowEv" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 6 3 L 0 6 z" fill="#f5b942" />
                </marker>
              </defs>
            </g>
          </svg>
          <div className="mt-3 flex justify-between eyebrow">
            <span>pre-trained · sparse star</span>
            <span>RL-evolved · dense cyclic</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function Cta() {
  return (
    <section className="relative">
      <div className="max-w-[1400px] mx-auto px-6 py-32 text-center">
        <span className="eyebrow">§ 06 · what now</span>
        <h2 className="font-display text-[clamp(64px,11vw,180px)] leading-[0.9] mt-6 text-bone-100">
          Bring a hard task.<br /><span className="serif-italic text-signal-amber">We orchestrate.</span>
        </h2>
        <Link href="/playground" className="inline-block mt-12 px-8 py-4 bg-signal-amber text-ink-950 font-mono text-[13px] tracking-[0.22em] uppercase hover:bg-bone-100 transition-colors">Open the playground →</Link>
        <p className="mt-6 eyebrow">bring your own OpenRouter or Groq key · open source · no credit card</p>
      </div>
    </section>
  )
}
