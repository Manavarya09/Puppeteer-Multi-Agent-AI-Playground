export default function ResearchPage() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-16">
      <div className="grid grid-cols-12 gap-8 mb-16">
        <div className="col-span-12 md:col-span-8">
          <span className="eyebrow">§ R · research origins</span>
          <h1 className="font-display text-[clamp(56px,8vw,120px)] leading-[0.95] mt-4 text-bone-100">From paper to <span className="serif-italic text-signal-amber">production</span>.</h1>
        </div>
      </div>

      <article className="grid grid-cols-12 gap-8">
        <aside className="col-span-12 md:col-span-3 space-y-6 text-[12px] font-mono">
          <Meta k="paper" v="Puppeteer paper" />
          <Meta k="venue" v="ICLR submission · accepted" />
          <Meta k="authors" v="anonymised" />
          <Meta k="benchmarks" v="GSM-Hard · MMLU-Pro · HumanEval" />
          <Meta k="base model" v="Llama-3.1-405B" />
          <Meta k="orchestrator" v="4-layer Transformer · 512 hidden" />
        </aside>

        <div className="col-span-12 md:col-span-9 space-y-10 text-[16px] leading-[1.75] text-bone-300/90">
          <Section title="Abstract">
            We present <em className="serif-italic text-bone-100">Puppeteer</em>, a centralized RL-driven orchestrator for
            multi-agent language systems. The orchestrator learns a policy
            <code className="font-mono text-bone-100"> π(a_t | S_t, τ)</code> that selects a specialist agent at each step
            given the current system state and task description. Trained on episode rollouts and
            shaped by a reward of the form <code className="font-mono text-bone-100">R_t = r − λ · C_t</code>, the policy
            converges on dense, cyclic interaction patterns that consistently outperform both
            monolithic LLMs and statically-designed multi-agent baselines.
          </Section>

          <Section title="Headline results">
            <div className="grid grid-cols-3 gap-px bg-bone-100/10 border hairline">
              {[
                ['GSM-Hard', '13.5%', '70.0%'],
                ['MMLU-Pro', '76.0%', '83.0%'],
                ['HumanEval', '81.4%', '88.6%'],
              ].map(([n, b, e]) => (
                <div key={n} className="bg-ink-900 p-5">
                  <div className="eyebrow">{n}</div>
                  <div className="font-display text-[42px] text-bone-100 mt-2">{e}</div>
                  <div className="text-[12px] font-mono text-bone-300 mt-1">base · {b}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Reward function">
            <pre className="bg-ink-850 border hairline p-4 text-[13px] font-mono text-bone-100">{`R_t  =  r  −  λ · C_t

where   r    = solution-quality score in [0, 1]
        C_t  = cumulative cost at step t (normalised)
        λ    = cost sensitivity factor (default 0.3)`}</pre>
            <p>
              The cost penalty discourages the orchestrator from running redundant agents. As λ
              increases, the policy becomes more selective and the average step count drops; as λ
              decreases, the policy explores more aggressively at the cost of higher token spend.
            </p>
          </Section>

          <Section title="Structural evolution">
            <ul className="border hairline divide-y">
              {[
                ['Compaction', 'edges / N(N−1) — graph density', '> 0.40 vs < 0.10 initial'],
                ['Cyclicality', 'fraction of tasks with feedback loops', '> 60% of complex tasks'],
                ['Diversity', 'Shannon entropy of agent selections', 'increases then stabilises'],
                ['Termination eff.', 'steps taken / minimum required', '< 1.5 in evolved system'],
              ].map(([k, d, v]) => (
                <li key={k} className="grid grid-cols-12 gap-4 p-4">
                  <div className="col-span-3 eyebrow">{k}</div>
                  <div className="col-span-6 text-[14px] text-bone-300/85">{d}</div>
                  <div className="col-span-3 text-right font-mono text-[13px] text-bone-100">{v}</div>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Reproducibility">
            <p>
              Researchers can rerun the GSM-Hard benchmark inside the
              playground. Full interaction logs are exportable as JSON. Reproductions within ±5%
              of the paper figures earn a citation slot in the platform&apos;s published benchmarks.
            </p>
          </Section>
        </div>
      </article>
    </div>
  )
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="eyebrow">{k}</div>
      <div className="text-bone-100 mt-1">{v}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-[40px] text-bone-100 leading-tight mb-3">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
