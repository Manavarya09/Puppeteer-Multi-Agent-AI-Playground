import Link from 'next/link'
import { AGENTS } from '@/engine/agents'

export default function AgentsPage() {
  const tools = AGENTS.filter(a => a.kind === 'tool')
  const reasoning = AGENTS.filter(a => a.kind === 'reasoning')
  return (
    <div className="max-w-[1400px] mx-auto px-6 py-16">
      <div className="grid grid-cols-12 gap-8 mb-16">
        <div className="col-span-12 md:col-span-7">
          <span className="eyebrow">§ A · agent library specification</span>
          <h1 className="font-display text-[clamp(56px,8vw,120px)] leading-[0.95] mt-4 text-bone-100">Fifteen specialists,<br /><span className="serif-italic text-signal-amber">one orchestrator</span>.</h1>
        </div>
        <div className="col-span-12 md:col-span-5 self-end text-[15px] text-bone-300/85 leading-relaxed">
          Each agent is a containerized service exposing a uniform <code className="font-mono text-bone-100">/invoke</code> contract.
          The orchestrator picks among them step-by-step using a learned policy. Custom agents
          slot into the same invocation surface.
        </div>
      </div>

      <SectionHeader index="01" label="Reasoning agents" />
      <Grid agents={reasoning} />

      <div className="mt-20" />
      <SectionHeader index="02" label="Tool-use agents" />
      <Grid agents={tools} />

      <div className="mt-20 border hairline p-8">
        <div className="grid grid-cols-12 gap-6 items-center">
          <div className="col-span-12 md:col-span-7">
            <h3 className="font-display text-[44px] leading-tight text-bone-100">Build your own.</h3>
            <p className="text-[14px] text-bone-300/85 mt-2 max-w-prose">Add a custom agent in under ten minutes. The orchestrator re-evaluates its policy and starts routing to the new agent within minutes of deployment.</p>
          </div>
          <div className="col-span-12 md:col-span-5 md:text-right">
            <Link href="/playground" className="inline-block px-5 py-3 bg-signal-amber text-ink-950 font-mono text-[12px] tracking-[0.22em] uppercase hover:bg-bone-100 transition-colors">Try in the playground →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ index, label }: { index: string; label: string }) {
  return (
    <div className="flex items-baseline gap-4 mb-6">
      <span className="font-mono text-[10px] tracking-[0.22em] text-signal-amber">[{index}]</span>
      <h2 className="font-display text-[40px] leading-none text-bone-100">{label}</h2>
      <div className="flex-1 h-px hairline border-t" />
    </div>
  )
}

function Grid({ agents }: { agents: typeof AGENTS }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-bone-100/10 border hairline">
      {agents.map(a => (
        <article key={a.id} className="bg-ink-900 p-6 hover:bg-ink-850 transition-colors">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] tracking-[0.22em] text-signal-amber">{a.short}</span>
            <span className="eyebrow">cost {a.costWeight}/10</span>
          </div>
          <h3 className="font-display text-[32px] mt-2 text-bone-100 leading-none">{a.name}</h3>
          <p className="text-[13px] text-bone-300/85 mt-3 leading-relaxed">{a.blurb}</p>
          <dl className="grid grid-cols-2 gap-3 mt-5 text-[12px] font-mono">
            <div><dt className="eyebrow">pattern</dt><dd className="text-bone-100">{a.pattern}</dd></div>
            <div><dt className="eyebrow">max tokens</dt><dd className="text-bone-100">{a.maxTokens.toLocaleString()}</dd></div>
            <div><dt className="eyebrow">timeout</dt><dd className="text-bone-100">{(a.timeoutMs / 1000).toFixed(0)}s</dd></div>
            <div><dt className="eyebrow">tools</dt><dd className="text-bone-100">{a.tools.length || '—'}</dd></div>
          </dl>
          {a.tools.length > 0 && <div className="mt-3 text-[11px] text-bone-300/70 font-mono">{a.tools.join(' · ')}</div>}
        </article>
      ))}
    </div>
  )
}
