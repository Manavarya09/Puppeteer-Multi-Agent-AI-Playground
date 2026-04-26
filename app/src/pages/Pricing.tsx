const TIERS = [
  {
    name: 'Free', price: '$0', cap: '5 tasks / day',
    rows: ['Mimas subspace', '5,000 token budget', 'Final-snapshot graph', 'Basic transparency', '7-day history', 'Community support'],
  },
  {
    name: 'Pro', price: '$29', cap: '200 tasks / day', featured: true,
    rows: ['Mimas + Titan', '50,000 token budget', 'Live + replay graph', 'Full transparency', '90-day history', 'API access · 200 / day', 'JSON export', 'Email support · 48h'],
  },
  {
    name: 'Teams', price: '$99', cap: '2,000 / day · org',
    rows: ['Mimas + Titan', '100,000 token budget', 'Live + replay graph', 'Full transparency', '1-year history', 'API access · 2,000 / day', 'Custom agents · unlimited', 'JSON + CSV export', 'SSO · roles · webhooks', 'Slack + email · 24h'],
  },
  {
    name: 'Research', price: '$0', cap: '100 tasks / day',
    rows: ['Mimas + Titan', '50,000 token budget', 'Live + replay + export', 'Full + raw logs', '2-year history', 'API access · 100 / day', '3 custom agents', 'Full interaction logs', 'Community support'],
  },
]

export function Pricing() {
  return (
    <div className="max-w-[1400px] mx-auto px-6 py-16">
      <div className="grid grid-cols-12 gap-8 mb-16">
        <div className="col-span-12 md:col-span-7">
          <span className="eyebrow">§ P · pricing &amp; tiers</span>
          <h1 className="font-display text-[clamp(56px,8vw,120px)] leading-[0.95] mt-4 text-bone-100">Pay for <span className="serif-italic text-signal-amber">orchestration</span>,<br />not capacity.</h1>
        </div>
        <div className="col-span-12 md:col-span-5 self-end text-[15px] text-bone-300/85 leading-relaxed">
          Pricing maps to the number of orchestrated tasks per day, not raw tokens. The platform's RL policy actively prunes redundant agents, so a Pro plan typically delivers 1.4× more useful work than its token cap suggests.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-bone-100/10 border hairline">
        {TIERS.map(t => (
          <div key={t.name} className={`p-6 flex flex-col ${t.featured ? 'bg-bone-100 text-ink-950' : 'bg-ink-900'}`}>
            <div className={`eyebrow ${t.featured ? '!text-ink-700' : ''}`}>{t.name}</div>
            <div className={`font-display text-[64px] leading-none mt-3 ${t.featured ? 'text-ink-950' : 'text-bone-100'}`}>{t.price}</div>
            <div className={`text-[12px] mt-2 font-mono ${t.featured ? 'text-ink-700' : 'text-bone-300/70'}`}>per month · {t.cap}</div>
            <ul className={`mt-6 space-y-2 text-[13.5px] flex-1 ${t.featured ? 'text-ink-700' : 'text-bone-300/85'}`}>
              {t.rows.map(r => (
                <li key={r} className="flex gap-3 items-baseline">
                  <span className={`mt-[8px] w-2 h-px ${t.featured ? 'bg-ink-950' : 'bg-signal-amber'}`} />
                  {r}
                </li>
              ))}
            </ul>
            <button className={`mt-6 py-3 font-mono text-[12px] tracking-[0.22em] uppercase ${t.featured ? 'bg-ink-950 text-bone-100 hover:bg-signal-amber hover:text-ink-950' : 'border hairline-strong text-bone-100 hover:bg-bone-100 hover:text-ink-950'} transition-colors`}>
              {t.featured ? 'Start Pro' : 'Choose ' + t.name}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-20 grid grid-cols-12 gap-8">
        <div className="col-span-12 md:col-span-6">
          <h2 className="font-display text-[40px] text-bone-100">Unit economics</h2>
          <p className="text-[14px] text-bone-300/85 mt-3">Cost per task is dominated by LLM API spend. The orchestrator's cost penalty makes Mimas viable for the long tail of tasks; Titan is reserved for the cases where it is provably better.</p>
        </div>
        <div className="col-span-12 md:col-span-6">
          <table className="w-full text-[13px] border hairline">
            <tbody>
              {[
                ['Avg cost per task · Mimas', '$0.012'],
                ['Avg cost per task · Titan', '$0.180'],
                ['Pro tier gross margin', '~65%'],
                ['Teams tier gross margin', '~72%'],
                ['Free tier cost per user / month', '$0.72'],
                ['Target Pro LTV', '> $580'],
              ].map(([k, v]) => (
                <tr key={k} className="border-b hairline">
                  <td className="p-3 eyebrow">{k}</td>
                  <td className="p-3 font-mono text-bone-100 text-right">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
