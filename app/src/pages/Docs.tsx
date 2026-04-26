export function Docs() {
  return (
    <div className="max-w-[1300px] mx-auto px-6 py-16 grid grid-cols-12 gap-10">
      <aside className="col-span-12 md:col-span-3 md:sticky md:top-24 self-start">
        <span className="eyebrow">§ D · developer docs</span>
        <h1 className="font-display text-[44px] leading-[0.95] mt-3 text-bone-100">REST · SDK · stream</h1>
        <nav className="mt-8 space-y-1 text-[13px]">
          {[
            ['#quickstart', 'Quickstart'],
            ['#auth', 'Authentication'],
            ['#run', 'POST /v1/run'],
            ['#stream', 'SSE event types'],
            ['#sdk', 'SDKs'],
            ['#limits', 'Rate limits'],
            ['#errors', 'Errors'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="block py-1 text-bone-300/80 hover:text-signal-amber border-l hairline pl-3">{label}</a>
          ))}
        </nav>
      </aside>

      <div className="col-span-12 md:col-span-9 space-y-16 text-[15px] leading-[1.75] text-bone-300/90">
        <Section id="quickstart" title="Quickstart">
          <p>Submit a task to the orchestrator and stream agent events back over SSE.</p>
          <Code lang="bash">{`curl -X POST https://api.puppeteer.ai/v1/run \\
  -H "Authorization: Bearer $PUPPETEER_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "task": "Compare Stripe and Adyen on developer experience.",
    "model_subspace": "mimas",
    "max_tokens": 12000,
    "stream": true
  }'`}</Code>
        </Section>

        <Section id="auth" title="Authentication">
          <p>All requests require an API key prefixed with <code className="font-mono text-bone-100">pk_live_</code> (or <code className="font-mono text-bone-100">pk_test_</code> for the sandboxed environment with mock agents).</p>
          <Code lang="http">{`Authorization: Bearer pk_live_8af2e1...`}</Code>
        </Section>

        <Section id="run" title="POST /v1/run">
          <p>Submit a task. Returns a <code className="font-mono text-bone-100">task_id</code> immediately; the orchestrator dispatches the first agent within 2 seconds (p95).</p>
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
                ['model_subspace', 'enum', 'no', 'mimas'],
                ['max_tokens', 'int', 'no', '10000'],
                ['agents', 'string[]', 'no', 'null'],
                ['stream', 'bool', 'no', 'true'],
                ['async', 'bool', 'no', 'false'],
                ['webhook_url', 'string', 'no', 'null'],
                ['metadata', 'object', 'no', 'null'],
              ].map(r => (
                <tr key={r[0]} className="border-b hairline">{r.map((c, i) => <td key={i} className="p-3">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="stream" title="SSE event types">
          <p>An open SSE connection emits typed events. Reconnect on <code className="font-mono text-bone-100">heartbeat</code> gaps &gt; 30s.</p>
          <ul className="border hairline divide-y">
            {[
              ['agent_start', 'agent selected and beginning execution'],
              ['agent_token', 'a streamed token from the current agent'],
              ['agent_end', 'full agent output, confidence, tokens used'],
              ['orchestrator_decision', 'next-agent candidates, scores, rationale'],
              ['task_complete', 'final synthesised output and totals'],
              ['error', 'recoverable or terminal error from any agent'],
              ['heartbeat', 'keep-alive every 15 seconds'],
            ].map(([k, v]) => (
              <li key={k} className="grid grid-cols-12 p-4 gap-4">
                <code className="col-span-3 font-mono text-bone-100">{k}</code>
                <span className="col-span-9 text-bone-300/85">{v}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="sdk" title="Python &amp; Node SDKs">
          <Code lang="python">{`from puppeteer import Client
client = Client(api_key="pk_live_…")

for event in client.run_stream(
    task="Summarise the latest arXiv work on RL-driven multi-agent orchestration.",
    model_subspace="mimas",
    max_tokens=15000,
):
    print(event.type, event.payload)`}</Code>
          <Code lang="ts">{`import { Puppeteer } from "puppeteer-ai"
const client = new Puppeteer({ apiKey: process.env.PUPPETEER_KEY! })

for await (const ev of client.runStream({
  task: "Draft a 200-word memo on enterprise AI orchestration economics.",
  modelSubspace: "titan",
  maxTokens: 20_000,
})) {
  console.log(ev.type, ev.payload)
}`}</Code>
        </Section>

        <Section id="limits" title="Rate limits">
          <table className="w-full text-[13px] border hairline">
            <thead><tr className="border-b hairline"><th className="p-3 text-left eyebrow">tier</th><th className="p-3 text-left eyebrow">tasks / day</th><th className="p-3 text-left eyebrow">parallel</th></tr></thead>
            <tbody className="text-bone-100 font-mono text-[12px]">
              {[['Free', '10', '1'], ['Pro', '200', '4'], ['Teams', '2,000', '20'], ['Research', '100', '4']].map(r => (
                <tr key={r[0]} className="border-b hairline">{r.map((c, i) => <td key={i} className="p-3">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="errors" title="Errors">
          <Code lang="json">{`{
  "error": {
    "code": "agent_timeout",
    "message": "BrowserAgent did not respond within 45,000ms",
    "agent_name": "BrowserAgent",
    "recoverable": true
  }
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
