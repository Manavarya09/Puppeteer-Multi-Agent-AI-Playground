export default function DocsPage() {
  return (
    <div className="max-w-[1300px] mx-auto px-6 py-16 grid grid-cols-12 gap-10">
      <aside className="col-span-12 md:col-span-3 md:sticky md:top-24 self-start">
        <span className="eyebrow">§ D · developer docs</span>
        <h1 className="font-display text-[44px] leading-[0.95] mt-3 text-bone-100">REST · SDK · stream</h1>
        <nav className="mt-8 space-y-1 text-[13px]">
          {[
            ['#quickstart', 'Quickstart'],
            ['#config', 'Configure providers'],
            ['#run', 'POST /api/orchestrate'],
            ['#stream', 'SSE event types'],
            ['#sdk', 'SDKs'],
            ['#errors', 'Errors'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="block py-1 text-bone-300/80 hover:text-signal-amber border-l hairline pl-3">{label}</a>
          ))}
        </nav>
      </aside>

      <div className="col-span-12 md:col-span-9 space-y-16 text-[15px] leading-[1.75] text-bone-300/90">
        <Section id="quickstart" title="Quickstart">
          <p>Submit a task to the orchestrator and stream agent events back over SSE.</p>
          <Code lang="bash">{`curl -N -X POST http://localhost:3000/api/orchestrate \\
  -H "Content-Type: application/json" \\
  -d '{
    "task": "Compare Stripe and Adyen on developer experience.",
    "subspace": "mimas",
    "budget": 12000
  }'`}</Code>
        </Section>

        <Section id="config" title="Configure providers">
          <p>Add your provider key(s) to <code className="font-mono text-bone-100">.env.local</code>. OpenRouter is the default; Groq is an optional fast path.</p>
          <Code lang="env">{`OPENROUTER_API_KEY=sk-or-v1-...
GROQ_API_KEY=gsk_...           # optional
DEFAULT_MODEL=openai/gpt-4o-mini
FAST_MODEL=groq/llama-3.3-70b-versatile`}</Code>
        </Section>

        <Section id="run" title="POST /api/orchestrate">
          <p>Submit a task. Returns an SSE stream of agent events.</p>
          <table className="w-full text-[13px] border hairline">
            <thead>
              <tr className="border-b hairline">
                <th className="p-3 text-left eyebrow">field</th>
                <th className="p-3 text-left eyebrow">type</th>
                <th className="p-3 text-left eyebrow">required</th>
                <th className="p-3 text-left eyebrow">default</th>
              </tr>
            </thead>
            <tbody className="text-bone-100 font-mono text-[12px]">
              {[
                ['task', 'string', 'yes', '—'],
                ['subspace', 'enum', 'no', 'mimas'],
                ['budget', 'int', 'no', '12000'],
                ['model', 'string', 'no', 'env.DEFAULT_MODEL'],
                ['provider', 'enum', 'no', 'openrouter'],
              ].map(r => (
                <tr key={r[0]} className="border-b hairline">{r.map((c, i) => <td key={i} className="p-3">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="stream" title="SSE event types">
          <p>An open SSE connection emits typed events. Each line is <code className="font-mono text-bone-100">data: &lt;json&gt;\n\n</code>.</p>
          <ul className="border hairline divide-y">
            {[
              ['agent_start', 'agent selected and beginning execution'],
              ['agent_token', 'a streamed token from the current agent'],
              ['agent_end', 'full agent output, confidence, tokens used'],
              ['decision', 'orchestrator candidates, scores, rationale'],
              ['edge', 'directed edge added to the orchestration graph'],
              ['state', 'full task state snapshot'],
              ['complete', 'final synthesised output and totals'],
              ['error', 'recoverable or terminal error from any agent'],
            ].map(([k, v]) => (
              <li key={k} className="grid grid-cols-12 p-4 gap-4">
                <code className="col-span-3 font-mono text-bone-100">{k}</code>
                <span className="col-span-9 text-bone-300/85">{v}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="sdk" title="SDKs">
          <Code lang="ts">{`const res = await fetch('/api/orchestrate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ task: 'Summarise...', budget: 12000 }),
})
const reader = res.body!.getReader()
const decoder = new TextDecoder()
while (true) {
  const { value, done } = await reader.read()
  if (done) break
  for (const line of decoder.decode(value).split('\\n\\n')) {
    if (line.startsWith('data: ')) {
      const ev = JSON.parse(line.slice(6))
      console.log(ev.type, ev)
    }
  }
}`}</Code>
        </Section>

        <Section id="errors" title="Errors">
          <Code lang="json">{`{
  "type": "error",
  "code": "agent_timeout",
  "message": "BrowserAgent did not respond within 45,000ms",
  "agentId": "browser",
  "recoverable": true
}`}</Code>
          <p>Errors are recoverable when the orchestrator can retry with a different agent. Terminal errors (auth, quota, content moderation) end the task.</p>
        </Section>
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-[44px] leading-tight text-bone-100 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Code({ lang, children }: { lang: string; children: string }) {
  return (
    <div className="border hairline bg-ink-850/80">
      <div className="border-b hairline px-3 py-1 flex justify-between eyebrow">
        <span>{lang}</span><span>copy</span>
      </div>
      <pre className="p-4 text-[12.5px] font-mono leading-[1.7] text-bone-100 overflow-x-auto whitespace-pre">{children}</pre>
    </div>
  )
}
