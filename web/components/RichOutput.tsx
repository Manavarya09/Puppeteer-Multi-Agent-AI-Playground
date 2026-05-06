'use client'
import { useMemo, type ReactNode } from 'react'

interface Source { title: string; url: string }

export function RichOutput({ text, sources = [] }: { text: string; sources?: Source[] }) {
  const { confidence, body } = useMemo(() => splitConfidence(text), [text])
  const blocks = useMemo(() => parseBlocks(body), [body])
  return (
    <div className="rich-output text-bone-100">
      {blocks.map((b, i) => renderBlock(b, i, sources))}
      {confidence && <ConfidenceBadge raw={confidence} />}
    </div>
  )
}

function splitConfidence(text: string): { confidence: string | null; body: string } {
  const m = /(^|\n)\s*confidence\s*[:=]\s*([^\n]+)/i.exec(text)
  if (!m) return { confidence: null, body: text.trim() }
  const idx = m.index + m[1].length
  const before = text.slice(0, idx).replace(/\s+$/, '')
  return { confidence: m[2].trim(), body: before.trim() }
}

function ConfidenceBadge({ raw }: { raw: string }) {
  const lower = raw.toLowerCase()
  const level: 'high' | 'medium' | 'low' = lower.startsWith('high')
    ? 'high'
    : lower.startsWith('low')
      ? 'low'
      : 'medium'
  const why = raw.split('·').slice(1).join('·').trim().replace(/^why:\s*/i, '')
  const tone =
    level === 'high' ? 'border-signal-amber/50 bg-signal-amber/10 text-signal-amber'
    : level === 'low' ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
    : 'border-bone-100/30 bg-bone-100/[0.04] text-bone-200'
  const dot = level === 'high' ? 'bg-signal-amber' : level === 'low' ? 'bg-rose-400' : 'bg-bone-300'
  return (
    <div className={`mt-6 inline-flex items-center gap-3 px-3 py-2 border ${tone} font-mono text-[11px] tracking-[0.18em] uppercase`}>
      <span className={`inline-block w-[8px] h-[8px] rounded-full ${dot}`} />
      <span>Confidence · {level}</span>
      {why && <span className="opacity-70 normal-case tracking-normal text-[12px]">· {why}</span>}
    </div>
  )
}

type Block =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'code'; lang?: string; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'hr' }
  | { kind: 'blockquote'; text: string }

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const fence = /^```(\w+)?\s*$/.exec(line)
    if (fence) {
      const lang = fence[1]
      i++
      const buf: string[] = []
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++ }
      i++
      blocks.push({ kind: 'code', lang, text: buf.join('\n') })
      continue
    }

    if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) { blocks.push({ kind: 'hr' }); i++; continue }

    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length as 1 | 2 | 3
      blocks.push({ kind: (`h${level}` as 'h1' | 'h2' | 'h3'), text: h[2].trim() })
      i++
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*[-:|\s]+\|[-:|\s]+/.test(lines[i + 1])) {
      const head = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i]))
        i++
      }
      blocks.push({ kind: 'table', head, rows })
      continue
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push({ kind: 'blockquote', text: buf.join(' ') })
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i++
      }
      blocks.push({ kind: 'ul', items })
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocks.push({ kind: 'ol', items })
      continue
    }

    const buf: string[] = [line]
    i++
    while (
      i < lines.length
      && lines[i].trim()
      && !/^(#{1,3}\s|```|>\s|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])
      && !lines[i].includes('|')
    ) {
      buf.push(lines[i])
      i++
    }
    blocks.push({ kind: 'p', text: buf.join(' ') })
  }
  return blocks
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map(c => c.trim())
}

function renderBlock(b: Block, key: number, sources: Source[]): ReactNode {
  switch (b.kind) {
    case 'h1':
      return <h2 key={key} className="font-display text-[28px] leading-[1.1] mt-6 mb-3 text-bone-100">{inline(b.text, sources)}</h2>
    case 'h2':
      return <h3 key={key} className="font-display text-[20px] leading-[1.2] mt-5 mb-2 text-bone-100">{inline(b.text, sources)}</h3>
    case 'h3':
      return (
        <h4 key={key} className="eyebrow mt-5 mb-2 text-bone-200" style={{ letterSpacing: '0.18em' }}>
          {inline(b.text, sources)}
        </h4>
      )
    case 'p':
      if (/^\[(VERIFIED|UNVERIFIED|CONTRADICTED)\]/.test(b.text)) {
        return <ClaimLine key={key} text={b.text} sources={sources} />
      }
      return <p key={key} className="my-3 text-[14.5px] leading-[1.7] text-bone-100/95">{inline(b.text, sources)}</p>
    case 'ul':
      return (
        <ul key={key} className="my-3 space-y-1.5 text-[14.5px] leading-[1.65]">
          {b.items.map((it, j) => (
            <li key={j} className="flex gap-2.5 text-bone-100/95">
              <span className="text-signal-amber mt-[10px] inline-block w-[6px] h-[1px] bg-signal-amber shrink-0" />
              <span>{inline(it, sources)}</span>
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol key={key} className="my-3 space-y-1.5 text-[14.5px] leading-[1.65]">
          {b.items.map((it, j) => (
            <li key={j} className="flex gap-3 text-bone-100/95">
              <span className="font-mono text-[11.5px] text-signal-amber shrink-0 mt-[3px] w-5">{String(j + 1).padStart(2, '0')}</span>
              <span>{inline(it, sources)}</span>
            </li>
          ))}
        </ol>
      )
    case 'code':
      return (
        <div key={key} className="my-4 corner border hairline-strong bg-ink-900/70">
          <div className="c" />
          <div className="flex items-center justify-between px-3 py-1.5 border-b hairline">
            <span className="eyebrow">{b.lang || 'code'}</span>
            <span className="font-mono text-[10px] text-bone-300/60">{b.text.split('\n').length} lines</span>
          </div>
          <pre className="px-4 py-3 overflow-x-auto text-[13px] leading-[1.6] font-mono text-bone-100">
            <code>{b.text}</code>
          </pre>
        </div>
      )
    case 'table':
      return (
        <div key={key} className="my-5 corner border hairline-strong overflow-x-auto">
          <div className="c" />
          <table className="w-full text-[13.5px] border-collapse">
            <thead>
              <tr>
                {b.head.map((h, j) => (
                  <th key={j} className="text-left px-3 py-2 border-b hairline eyebrow text-bone-200" style={{ letterSpacing: '0.16em' }}>
                    {inline(h, sources)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className={ri % 2 === 1 ? 'bg-bone-100/[0.02]' : ''}>
                  {r.map((c, ci) => (
                    <td key={ci} className="px-3 py-2 align-top text-bone-100/95 border-b hairline">
                      {inline(c, sources)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'hr':
      return <hr key={key} className="my-6 border-0 h-px bg-bone-100/15" />
    case 'blockquote':
      return (
        <blockquote key={key} className="my-4 pl-4 border-l-2 border-signal-amber/60 text-[14px] italic text-bone-200/90">
          {inline(b.text, sources)}
        </blockquote>
      )
  }
}

function ClaimLine({ text, sources }: { text: string; sources: Source[] }) {
  const m = /^\[(VERIFIED|UNVERIFIED|CONTRADICTED)\]\s*(.*)$/s.exec(text)
  if (!m) return <p>{inline(text, sources)}</p>
  const status = m[1] as 'VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED'
  const rest = m[2]
  const tone =
    status === 'VERIFIED' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
    : status === 'CONTRADICTED' ? 'border-rose-400/40 bg-rose-400/10 text-rose-300'
    : 'border-amber-400/40 bg-amber-400/10 text-amber-300'
  return (
    <div className="my-2 flex gap-3 text-[13.5px] leading-[1.6] items-start">
      <span className={`shrink-0 px-2 py-0.5 border ${tone} font-mono text-[10px] tracking-[0.16em] uppercase`}>
        {status}
      </span>
      <span className="text-bone-100/95">{inline(rest, sources)}</span>
    </div>
  )
}

interface Token { type: 'text' | 'bold' | 'italic' | 'code' | 'link' | 'cite'; value: string; href?: string; idx?: number }

function tokenize(s: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < s.length) {
    if (s[i] === '`') {
      const end = s.indexOf('`', i + 1)
      if (end > i) { out.push({ type: 'code', value: s.slice(i + 1, end) }); i = end + 1; continue }
    }
    if (s[i] === '*' && s[i + 1] === '*') {
      const end = s.indexOf('**', i + 2)
      if (end > i) { out.push({ type: 'bold', value: s.slice(i + 2, end) }); i = end + 2; continue }
    }
    if (s[i] === '*' && s[i + 1] !== '*') {
      const end = s.indexOf('*', i + 1)
      if (end > i + 1 && !/\s/.test(s[i + 1])) { out.push({ type: 'italic', value: s.slice(i + 1, end) }); i = end + 1; continue }
    }
    if (s[i] === '[') {
      const close = s.indexOf(']', i + 1)
      if (close > i && s[close + 1] === '(') {
        const paren = s.indexOf(')', close + 2)
        if (paren > close) {
          out.push({ type: 'link', value: s.slice(i + 1, close), href: s.slice(close + 2, paren) })
          i = paren + 1
          continue
        }
      }
      const cite = /^\[(\d+)\]/.exec(s.slice(i))
      if (cite) {
        out.push({ type: 'cite', value: cite[1], idx: parseInt(cite[1], 10) })
        i += cite[0].length
        continue
      }
    }
    const url = /^https?:\/\/[^\s)<>"]+/.exec(s.slice(i))
    if (url) {
      out.push({ type: 'link', value: url[0], href: url[0] })
      i += url[0].length
      continue
    }
    let j = i + 1
    while (j < s.length && s[j] !== '`' && s[j] !== '*' && s[j] !== '[' && !s.startsWith('http', j)) j++
    out.push({ type: 'text', value: s.slice(i, j) })
    i = j
  }
  return out
}

function inline(s: string, sources: Source[]): ReactNode {
  const tokens = tokenize(s)
  return tokens.map((t, i) => {
    switch (t.type) {
      case 'bold': return <strong key={i} className="text-bone-100 font-semibold">{t.value}</strong>
      case 'italic': return <em key={i} className="italic text-bone-200">{t.value}</em>
      case 'code': return <code key={i} className="px-1.5 py-0.5 bg-bone-100/[0.07] border hairline font-mono text-[12.5px] text-signal-amber">{t.value}</code>
      case 'link': {
        const short = t.value.length > 60 ? t.value.slice(0, 57) + '…' : t.value
        return (
          <a key={i} href={t.href} target="_blank" rel="noreferrer noopener"
             className="text-signal-amber underline decoration-signal-amber/40 underline-offset-2 hover:decoration-signal-amber break-words">
            {short}
          </a>
        )
      }
      case 'cite': {
        const src = sources[(t.idx ?? 1) - 1]
        if (!src) return <sup key={i} className="text-signal-amber font-mono text-[10px] mx-0.5">[{t.value}]</sup>
        return (
          <a key={i} href={src.url} target="_blank" rel="noreferrer noopener"
             title={src.title}
             className="inline-flex items-center justify-center min-w-[18px] h-[18px] mx-0.5 px-1 border border-signal-amber/40 bg-signal-amber/10 text-signal-amber font-mono text-[10px] hover:bg-signal-amber/20 align-baseline">
            {t.value}
          </a>
        )
      }
      default: return <span key={i}>{t.value}</span>
    }
  })
}
