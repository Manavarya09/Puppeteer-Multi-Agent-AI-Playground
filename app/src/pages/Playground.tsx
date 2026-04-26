import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENTS, AGENT_BY_ID } from '../engine/agents'
import { OrchestrationEngine } from '../engine/engine'
import type { EngineEvent, Invocation, OrchestratorDecision, Subspace, TaskState } from '../engine/types'
import { Graph } from '../components/Graph'

const TEMPLATES: { label: string; task: string }[] = [
  { label: 'Hard math', task: 'Solve the system: 3x² − 5x + 2 = 0 and 2x + 4y = 11. Show every step and verify the result with a Python script.' },
  { label: 'Market scan', task: 'Compare Stripe and Adyen on developer experience, pricing, and recent product launches in 2026. Include sources.' },
  { label: 'Paper deep-dive', task: 'Find the latest arXiv work on RL-driven multi-agent orchestration and summarise the three most cited approaches.' },
  { label: 'Research memo', task: 'Write a 200-word memo on the unit economics of selling AI orchestration to enterprise customers, with a clear recommendation.' },
  { label: 'Code review', task: 'Refactor a brittle if/else cascade for billing tier resolution into a clean state machine. Verify behaviour with unit tests.' },
]

export function Playground() {
  const [task, setTask] = useState(TEMPLATES[0].task)
  const [subspace, setSubspace] = useState<Subspace>('mimas')
  const [budget, setBudget] = useState(12000)
  const [state, setState] = useState<TaskState | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)   // selected invocation
  const [showTrace, setShowTrace] = useState(true)
  const engineRef = useRef<OrchestrationEngine | null>(null)
  const feedRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll feed.
  useEffect(() => {
    if (!feedRef.current) return
    feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [state?.invocations.length, state?.invocations[state?.invocations.length - 1]?.output.length])

  async function run() {
    setRunning(true)
    setSelected(null)
    const engine = new OrchestrationEngine({
      task,
      subspace,
      budget,
      speed: 1.4,
      onEvent: (e: EngineEvent) => {
        if (e.type === 'agent_start') setActiveId(e.invocation.agentId)
        if (e.type === 'agent_end') setActiveId(null)
        // Mirror the snapshot to React state
        if (engineRef.current) setState(engineRef.current.snapshot())
      },
    })
    engineRef.current = engine
    setState(engine.snapshot())
    await engine.run()
    setState(engine.snapshot())
    setRunning(false)
    setActiveId(null)
  }

  function cancel() {
    engineRef.current?.cancel()
  }

  const compaction = useMemo(() => {
    if (!state) return 0
    const fired = new Set(state.invocations.map(i => i.agentId))
    const n = fired.size
    if (n < 2) return 0
    return Math.min(1, state.edges.length / (n * (n - 1)))
  }, [state])

  const cycles = useMemo(() => {
    if (!state) return []
    const adj = new Map<string, string[]>()
    for (const e of state.edges) {
      const arr = adj.get(e.from) ?? []; arr.push(e.to); adj.set(e.from, arr)
    }
    const cyc: string[][] = []; const visited = new Set<string>(); const stack = new Set<string>(); const path: string[] = []
    function dfs(node: string) {
      visited.add(node); stack.add(node); path.push(node)
      for (const n of adj.get(node) ?? []) {
        if (stack.has(n)) { const idx = path.indexOf(n); if (idx >= 0) cyc.push([...path.slice(idx), n]) }
        else if (!visited.has(n)) dfs(n)
      }
      stack.delete(node); path.pop()
    }
    for (const k of adj.keys()) if (!visited.has(k)) dfs(k)
    return cyc
  }, [state])

  const selectedInv = state?.invocations.find(i => i.id === selected) ?? null
  const lastDecision = state?.decisions[state.decisions.length - 1] ?? null

  return (
    <div className="relative min-h-screen">
      <div className="grid-bg absolute inset-0 opacity-40 pointer-events-none" />
      <div className="relative max-w-[1600px] mx-auto px-4 lg:px-6 py-6">
        <div className="grid grid-cols-12 gap-4">
          {/* LEFT — TASK INPUT */}
          <aside className="col-span-12 lg:col-span-4 xl:col-span-3 space-y-4">
            <Panel title="Task input" idx="01">
              <textarea
                value={task}
                onChange={e => setTask(e.target.value)}
                rows={6}
                disabled={running}
                placeholder="Describe a task. The orchestrator will choose which agents to invoke."
                className="w-full bg-transparent border hairline p-3 text-[14px] text-bone-100 font-sans resize-none focus:outline-none focus:border-signal-amber"
                maxLength={4000}
              />
              <div className="flex justify-between eyebrow mt-2">
                <span>{task.length} / 4000</span>
                <span>NL · plain text</span>
              </div>

              <Field label="Model subspace">
                <Toggle
                  value={subspace}
                  options={[
                    { v: 'mimas', label: 'Mimas', sub: 'efficient' },
                    { v: 'titan', label: 'Titan', sub: 'high accuracy' },
                  ]}
                  onChange={v => !running && setSubspace(v as Subspace)}
                />
              </Field>

              <Field label={`Token budget · ${budget.toLocaleString()}`}>
                <input
                  type="range" min={2000} max={50000} step={500}
                  value={budget}
                  disabled={running}
                  onChange={e => setBudget(parseInt(e.target.value))}
                  className="w-full accent-signal-amber"
                />
                <div className="flex justify-between eyebrow mt-1">
                  <span>2k</span><span>est ${(budget / 1000 * (subspace === 'titan' ? 0.0225 : 0.0015)).toFixed(3)}</span><span>50k</span>
                </div>
              </Field>

              <div className="mt-5 flex gap-2">
                {!running ? (
                  <button
                    onClick={run}
                    className="flex-1 py-3 bg-signal-amber text-ink-950 font-mono text-[12px] tracking-[0.22em] uppercase hover:bg-bone-100 transition-colors"
                  >Run orchestration</button>
                ) : (
                  <button
                    onClick={cancel}
                    className="flex-1 py-3 border hairline-strong text-bone-100 font-mono text-[12px] tracking-[0.22em] uppercase hover:bg-signal-rust/30 transition-colors"
                  >Halt</button>
                )}
              </div>
            </Panel>

            <Panel title="Templates" idx="02">
              <ul className="divide-y hairline">
                {TEMPLATES.map(t => (
                  <li key={t.label}>
                    <button
                      disabled={running}
                      onClick={() => setTask(t.task)}
                      className="w-full text-left py-3 group"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-display text-[20px] text-bone-100 group-hover:text-signal-amber transition-colors">{t.label}</span>
                        <span className="eyebrow">load</span>
                      </div>
                      <p className="text-[12px] text-bone-300/70 mt-1 line-clamp-2">{t.task}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Telemetry" idx="03">
              <Stat label="Status" value={state?.status ?? 'idle'} />
              <Stat label="Steps taken" value={state?.invocations.length ?? 0} />
              <Stat label="Tokens used" value={(state?.totalTokens ?? 0).toLocaleString()} />
              <Stat label="Cost · USD" value={`$${(state?.costUsd ?? 0).toFixed(4)}`} />
              <Stat label="Compaction" value={`${(compaction * 100).toFixed(0)}%`} />
              <Stat label="Cycles detected" value={cycles.length} accent={cycles.length > 0} />
              <Stat label="Confidence" value={`${Math.round((state?.finalConfidence ?? 0) * 100)}%`} />
            </Panel>
          </aside>

          {/* CENTER — FEED + OUTPUT */}
          <main className="col-span-12 lg:col-span-5 xl:col-span-6 space-y-4">
            <Panel title="Agent activity feed" idx="04" right={<span className="eyebrow">{state?.invocations.length ?? 0} invocations</span>}>
              <div ref={feedRef} className="max-h-[420px] overflow-y-auto pr-2 -mr-2 space-y-3">
                {!state || state.invocations.length === 0 ? (
                  <Empty msg="No activity yet. Submit a task — the policy will route to the best first agent." />
                ) : (
                  state.invocations.map(inv => (
                    <InvocationCard
                      key={inv.id}
                      inv={inv}
                      active={inv.id === activeIdToInvocationId(state, activeId)}
                      selected={inv.id === selected}
                      onSelect={() => setSelected(inv.id === selected ? null : inv.id)}
                    />
                  ))
                )}
              </div>
            </Panel>

            <Panel
              title="Final synthesis"
              idx="05"
              right={state?.status === 'complete'
                ? <span className="eyebrow text-signal-sage">complete · {fmtMs((state.completedAt ?? 0) - (state.startedAt ?? 0))}</span>
                : state?.status === 'running'
                  ? <span className="eyebrow text-signal-amber">streaming…</span>
                  : <span className="eyebrow">awaiting</span>}
            >
              <FinalOutput state={state} />
            </Panel>
          </main>

          {/* RIGHT — GRAPH + TRANSPARENCY */}
          <aside className="col-span-12 lg:col-span-3 xl:col-span-3 space-y-4">
            <Panel title="Orchestration graph" idx="06" right={
              <span className="eyebrow">{state?.invocations.length ?? 0} nodes · {state?.edges.length ?? 0} edges</span>
            }>
              <div className="border hairline bg-ink-950/60">
                <Graph
                  invocations={state?.invocations ?? []}
                  edges={state?.edges ?? []}
                  activeId={activeId}
                  cycles={cycles}
                  height={340}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-bone-300/70 font-mono">
                <Legend dot="#f5b942" label="active" />
                <Legend dot="#f6f1e6" label="done" />
                <Legend dot="#5b5b66" label="idle" />
                <Legend dot="#f5b942" label="cycle edge" />
              </div>
            </Panel>

            <Panel title="Last orchestrator decision" idx="07">
              {lastDecision ? <DecisionView d={lastDecision} /> : <Empty msg="No decisions yet." />}
            </Panel>

            <Panel title="Transparency · selected agent" idx="08" right={
              <button onClick={() => setShowTrace(s => !s)} className="eyebrow hover:text-signal-amber">
                {showTrace ? 'collapse' : 'expand'}
              </button>
            }>
              {showTrace
                ? selectedInv
                  ? <TraceView inv={selectedInv} />
                  : <Empty msg="Click any agent in the feed to inspect its prompt, output, and orchestrator rationale." />
                : null}
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  )
}

function activeIdToInvocationId(state: TaskState | null, activeAgentId: string | null): string | null {
  if (!state || !activeAgentId) return null
  for (let i = state.invocations.length - 1; i >= 0; i--) {
    if (state.invocations[i].agentId === activeAgentId && state.invocations[i].status === 'running') return state.invocations[i].id
  }
  return null
}

// ---------------------------------------------------------------------------

function Panel({ title, idx, right, children }: { title: string; idx?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border hairline bg-ink-900/60 p-4 corner relative">
      <span className="c absolute inset-0 pointer-events-none" aria-hidden />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          {idx && <span className="font-mono text-[10px] text-signal-amber tracking-[0.22em]">[{idx}]</span>}
          <h3 className="eyebrow">{title}</h3>
        </div>
        {right}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="eyebrow mb-2">{label}</div>
      {children}
    </div>
  )
}

function Toggle({ value, options, onChange }: { value: string; options: { v: string; label: string; sub?: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 border hairline">
      {options.map(o => {
        const active = o.v === value
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`p-3 text-left transition-colors ${active ? 'bg-bone-100 text-ink-950' : 'text-bone-100 hover:bg-ink-800'}`}
          >
            <div className="font-display text-[20px] leading-none">{o.label}</div>
            {o.sub && <div className={`text-[10px] uppercase tracking-[0.22em] mt-1 ${active ? 'text-ink-700' : 'text-bone-300'}`}>{o.sub}</div>}
          </button>
        )
      })}
    </div>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b hairline py-2">
      <span className="eyebrow">{label}</span>
      <span className={`font-mono text-[13px] ${accent ? 'text-signal-amber' : 'text-bone-100'}`}>{value}</span>
    </div>
  )
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="border border-dashed hairline p-4 text-[13px] text-bone-300/60 italic">
      {msg}
    </div>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot }} />
      <span>{label}</span>
    </div>
  )
}

function InvocationCard({ inv, active, selected, onSelect }: { inv: Invocation; active: boolean; selected: boolean; onSelect: () => void }) {
  const spec = AGENT_BY_ID[inv.agentId]
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left border hairline p-3 bg-ink-850/60 transition-colors hover:border-bone-300/40 ${selected ? 'border-signal-amber' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center justify-center w-8 h-8 border hairline-strong font-mono text-[10px] tracking-widest ${
            active ? 'bg-signal-amber text-ink-950 border-signal-amber' : inv.status === 'done' ? 'text-bone-100' : 'text-bone-300'
          }`}>{spec.short}</span>
          <div>
            <div className="font-display text-[20px] text-bone-100 leading-none">{spec.name}</div>
            <div className="eyebrow mt-1">step {String(inv.step).padStart(2, '0')} · {spec.pattern}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[12px] text-bone-100">{inv.completionTokens.toLocaleString()}<span className="text-bone-300/60"> tok</span></div>
          <div className="eyebrow">{inv.status}{inv.status === 'done' ? ` · ${fmtMs(inv.durationMs)}` : ''}</div>
        </div>
      </div>
      <pre className="mt-3 text-[12px] font-mono leading-[1.6] text-bone-200/90 whitespace-pre-wrap break-words max-h-[180px] overflow-hidden relative">
        {inv.output}
        {inv.status === 'running' && <span className="inline-block w-[7px] h-[14px] bg-signal-amber align-middle ml-[1px] animate-pulse" />}
        {inv.status === 'done' && inv.output.length > 600 && (
          <span className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-ink-850 to-transparent" />
        )}
      </pre>
    </button>
  )
}

function FinalOutput({ state }: { state: TaskState | null }) {
  if (!state || state.invocations.length === 0) {
    return <Empty msg="The synthesised answer will appear here. ConcluderAgent runs after the critic / modifier loop completes." />
  }
  const concluder = [...state.invocations].reverse().find(i => i.agentId === 'concluder')
  if (!concluder) {
    return (
      <div className="text-[13px] text-bone-300/70 italic">
        Awaiting synthesis. Current step: <span className="text-bone-100 font-mono">{AGENT_BY_ID[state.invocations[state.invocations.length - 1].agentId].name}</span>.
      </div>
    )
  }
  return (
    <article className="prose-output">
      <pre className="font-sans text-[14.5px] leading-[1.7] text-bone-100 whitespace-pre-wrap">{concluder.output}</pre>
      {concluder.status === 'running' && <span className="inline-block w-[8px] h-[16px] bg-signal-amber align-middle ml-[2px] animate-pulse" />}
      <SourceCitations state={state} />
    </article>
  )
}

function SourceCitations({ state }: { state: TaskState }) {
  const sources = state.invocations.flatMap(i => i.sources ?? [])
  if (sources.length === 0) return null
  return (
    <div className="mt-6 pt-4 border-t hairline">
      <div className="eyebrow mb-2">Sources cited</div>
      <ol className="space-y-1 text-[12px]">
        {sources.map((s, i) => (
          <li key={i} className="flex items-baseline gap-3">
            <span className="font-mono text-bone-300/80">[{i + 1}]</span>
            <a href={s.url} target="_blank" rel="noreferrer" className="text-bone-100 hover:text-signal-amber underline decoration-bone-300/30 underline-offset-4">
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}

function DecisionView({ d }: { d: OrchestratorDecision }) {
  const top = d.candidates.slice(0, 5)
  return (
    <div>
      <div className="text-[13px] text-bone-100">
        Selected <span className="font-mono text-signal-amber">{AGENT_BY_ID[d.selected]?.name}</span> at step {String(d.step).padStart(2, '0')}.
      </div>
      <p className="text-[12px] text-bone-300/80 mt-1 italic serif">{d.rationale}</p>
      <div className="mt-3 space-y-1">
        {top.map(c => {
          const spec = AGENT_BY_ID[c.agentId]
          return (
            <div key={c.agentId} className="flex items-center gap-2 text-[11px] font-mono">
              <span className="w-20 text-bone-300/80">{spec.name.replace('Agent', '')}</span>
              <div className="flex-1 h-[6px] bg-ink-800 relative">
                <div className="absolute top-0 left-0 h-full" style={{ width: `${(c.prob * 100).toFixed(1)}%`, background: c.agentId === d.selected ? '#f5b942' : '#5b5b66' }} />
              </div>
              <span className="w-12 text-right text-bone-100">{(c.prob * 100).toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TraceView({ inv }: { inv: Invocation }) {
  const spec = AGENT_BY_ID[inv.agentId]
  return (
    <div className="space-y-3 text-[12.5px]">
      <div className="flex items-center justify-between">
        <span className="font-display text-[22px] text-bone-100">{spec.name}</span>
        <span className="eyebrow">step {String(inv.step).padStart(2, '0')} · {fmtMs(inv.durationMs)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-bone-300">
        <div><span className="block eyebrow">prompt tok</span>{inv.promptTokens}</div>
        <div><span className="block eyebrow">completion tok</span>{inv.completionTokens}</div>
        <div><span className="block eyebrow">confidence</span>{Math.round(inv.confidence * 100)}%</div>
      </div>
      <details className="border hairline p-2 group" open>
        <summary className="eyebrow cursor-pointer">prompt</summary>
        <pre className="mt-2 text-[11px] text-bone-300 font-mono whitespace-pre-wrap leading-relaxed">{inv.prompt}</pre>
      </details>
      <details className="border hairline p-2" open>
        <summary className="eyebrow cursor-pointer">output</summary>
        <pre className="mt-2 text-[11.5px] text-bone-100 font-mono whitespace-pre-wrap leading-relaxed">{inv.output}</pre>
      </details>
      {inv.sources && inv.sources.length > 0 && (
        <details className="border hairline p-2">
          <summary className="eyebrow cursor-pointer">sources ({inv.sources.length})</summary>
          <ol className="mt-2 space-y-1 text-[12px]">
            {inv.sources.map((s, i) => (
              <li key={i}><a href={s.url} target="_blank" rel="noreferrer" className="hover:text-signal-amber underline">{s.title}</a></li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// re-export so it tree-shakes correctly
export const _agents = AGENTS
