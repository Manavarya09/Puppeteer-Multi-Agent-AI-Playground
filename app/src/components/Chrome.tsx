import { Link, NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'

export function Header() {
  const [time, setTime] = useState(() => fmtTime(new Date()))
  useEffect(() => {
    const id = setInterval(() => setTime(fmtTime(new Date())), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <header className="sticky top-0 z-30 backdrop-blur bg-ink-950/85 border-b hairline">
      <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-baseline gap-3 group">
          <span className="font-display text-[26px] leading-none text-bone-100">Puppeteer</span>
          <span className="eyebrow hidden sm:inline">v1.0 · orchestration · 2026</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-[13px] text-bone-300/80">
          <NavItem to="/playground" label="Playground" />
          <NavItem to="/agents" label="Agents" />
          <NavItem to="/research" label="Research" />
          <NavItem to="/pricing" label="Pricing" />
          <NavItem to="/docs" label="Docs" />
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden md:inline eyebrow">{time} · UTC</span>
          <Link
            to="/playground"
            className="text-[12px] uppercase tracking-[0.22em] font-mono px-3 py-2 border hairline-strong text-bone-100 hover:bg-bone-100 hover:text-ink-950 transition-colors"
          >Open playground</Link>
        </div>
      </div>
    </header>
  )
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `relative pb-1 transition-colors ${isActive ? 'text-bone-100' : 'hover:text-bone-100'}`
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {isActive && <span className="absolute -bottom-[2px] left-0 right-0 h-px bg-signal-amber" />}
        </>
      )}
    </NavLink>
  )
}

export function Footer() {
  return (
    <footer className="border-t hairline mt-24">
      <div className="max-w-[1400px] mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-5 gap-8 text-[13px] text-bone-300/80">
        <div className="col-span-2">
          <div className="font-display text-3xl text-bone-100">Puppeteer</div>
          <p className="mt-3 max-w-sm text-bone-300/70">
            A research-grade multi-agent orchestration platform. Built so collaborative AI is as accessible as a single API call — and smarter than any model alone.
          </p>
          <p className="eyebrow mt-6">Status · all systems nominal</p>
        </div>
        <Col title="Product" links={[['/playground', 'Playground'], ['/agents', 'Agent library'], ['/pricing', 'Pricing'], ['/docs', 'API & SDKs']]} />
        <Col title="Research" links={[['/research', 'Topology evolution'], ['/research', 'Benchmarks'], ['/research', 'Paper']]} />
        <Col title="Company" links={[['#', 'About'], ['#', 'Careers'], ['#', 'Press'], ['#', 'Contact']]} />
      </div>
      <div className="border-t hairline">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex flex-wrap gap-4 justify-between items-center text-[11px] uppercase tracking-[0.22em] font-mono text-bone-400">
          <span>© 2026 Puppeteer Labs · Internal Confidential</span>
          <span>Built on the Puppeteer paradigm · GSM-Hard 70.0% · MMLU-Pro 83.0%</span>
        </div>
      </div>
    </footer>
  )
}

function Col({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="eyebrow mb-3">{title}</div>
      <ul className="space-y-2">
        {links.map(([to, label]) => (
          <li key={label}>
            <Link to={to} className="hover:text-bone-100 transition-colors">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function fmtTime(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}
