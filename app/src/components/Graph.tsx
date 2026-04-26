import { useEffect, useMemo, useRef, useState } from 'react'
import { AGENT_BY_ID } from '../engine/agents'
import type { Edge, Invocation } from '../engine/types'

interface Props {
  invocations: Invocation[]
  edges: Edge[]
  activeId?: string | null
  cycles: string[][]
  height?: number
}

interface Node {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  fired: boolean
}

// Lightweight velocity-Verlet force layout. We render only agents that have
// fired so the graph is always meaningful — sized to the panel.
export function Graph({ invocations, edges, activeId, cycles, height = 360 }: Props) {
  const ref = useRef<SVGSVGElement | null>(null)
  const [size, setSize] = useState({ w: 480, h: height })
  const nodesRef = useRef<Map<string, Node>>(new Map())
  const [tick, setTick] = useState(0)
  const rafRef = useRef<number | null>(null)

  // Resize observer
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const r = e.contentRect
        setSize({ w: Math.max(280, r.width), h: r.height || height })
      }
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [height])

  // Maintain node set
  const firedIds = useMemo(() => Array.from(new Set(invocations.map(i => i.agentId))), [invocations])

  useEffect(() => {
    const map = nodesRef.current
    for (const id of firedIds) {
      if (!map.has(id)) {
        // Birth at the centre with a small radial nudge.
        const angle = Math.random() * Math.PI * 2
        const r = 40 + Math.random() * 60
        map.set(id, {
          id,
          x: size.w / 2 + Math.cos(angle) * r,
          y: size.h / 2 + Math.sin(angle) * r,
          vx: 0, vy: 0, fired: true,
        })
      } else {
        map.get(id)!.fired = true
      }
    }
  }, [firedIds, size.w, size.h])

  // Physics tick
  useEffect(() => {
    let prev = performance.now()
    function step(now: number) {
      const dt = Math.min(0.04, (now - prev) / 1000)
      prev = now
      simulate(dt, nodesRef.current, edges, size.w, size.h)
      setTick(t => (t + 1) % 1000000)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [edges, size.w, size.h])

  const cycleSet = useMemo(() => {
    const set = new Set<string>()
    for (const c of cycles) {
      for (let i = 0; i < c.length - 1; i++) set.add(`${c[i]}->${c[i + 1]}`)
    }
    return set
  }, [cycles])

  const maxW = Math.max(1, ...edges.map(e => e.weight))
  void tick

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${size.w} ${size.h}`}
      style={{ width: '100%', height }}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="ringGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f5b942" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#f5b942" stopOpacity="0" />
        </radialGradient>
        <marker id="arrow" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 6 3 L 0 6 z" fill="rgba(246,241,230,0.45)" />
        </marker>
        <marker id="arrow-amber" viewBox="0 0 6 6" refX="6" refY="3" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 6 3 L 0 6 z" fill="#f5b942" />
        </marker>
      </defs>

      {/* edges */}
      {edges.map(e => {
        const from = nodesRef.current.get(e.from)
        const to = nodesRef.current.get(e.to)
        if (!from || !to) return null
        const isCycle = cycleSet.has(`${e.from}->${e.to}`)
        const w = 0.8 + (e.weight / maxW) * 2.2
        const stroke = isCycle ? '#f5b942' : 'rgba(246,241,230,0.28)'
        const dash = isCycle ? undefined : undefined
        // Curve a little so reciprocal edges don't overlap.
        const dx = to.x - from.x, dy = to.y - from.y
        const mx = (from.x + to.x) / 2 + dy * 0.06
        const my = (from.y + to.y) / 2 - dx * 0.06
        return (
          <path
            key={`${e.from}-${e.to}`}
            d={`M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`}
            fill="none"
            stroke={stroke}
            strokeWidth={w}
            strokeDasharray={dash}
            markerEnd={isCycle ? 'url(#arrow-amber)' : 'url(#arrow)'}
            opacity={0.85}
          />
        )
      })}

      {/* nodes */}
      {firedIds.map(id => {
        const n = nodesRef.current.get(id)
        if (!n) return null
        const spec = AGENT_BY_ID[id]
        const active = id === activeId
        const done = invocations.some(i => i.agentId === id && i.status === 'done')
        const fill = active ? '#f5b942' : done ? '#f6f1e6' : '#5b5b66'
        const text = active ? '#08080a' : '#08080a'
        return (
          <g key={id} transform={`translate(${n.x} ${n.y})`}>
            {active && (
              <circle r={28} fill="url(#ringGrad)">
                <animate attributeName="r" from="20" to="42" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.7" to="0" dur="1.6s" repeatCount="indefinite" />
              </circle>
            )}
            <circle r={18} fill={fill} stroke={active ? '#f5b942' : 'rgba(246,241,230,0.35)'} strokeWidth={1} />
            <text
              x={0} y={4}
              textAnchor="middle"
              fontFamily='"JetBrains Mono", monospace'
              fontSize={10}
              fill={text}
              letterSpacing={0.6}
            >{spec.short}</text>
            <text
              x={0} y={34}
              textAnchor="middle"
              fontFamily='"Geist", sans-serif'
              fontSize={9}
              fill="rgba(246,241,230,0.55)"
              letterSpacing={0.4}
            >{spec.name.replace('Agent','')}</text>
          </g>
        )
      })}
    </svg>
  )
}

function simulate(dt: number, nodes: Map<string, Node>, edges: Edge[], w: number, h: number) {
  const arr = Array.from(nodes.values())
  const cx = w / 2, cy = h / 2
  // Repulsion
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j]
      const dx = b.x - a.x, dy = b.y - a.y
      const d2 = dx * dx + dy * dy + 0.01
      const d = Math.sqrt(d2)
      const force = 9000 / d2
      const fx = (dx / d) * force, fy = (dy / d) * force
      a.vx -= fx * dt; a.vy -= fy * dt
      b.vx += fx * dt; b.vy += fy * dt
    }
  }
  // Spring along edges
  for (const e of edges) {
    const a = nodes.get(e.from), b = nodes.get(e.to)
    if (!a || !b) continue
    const dx = b.x - a.x, dy = b.y - a.y
    const d = Math.sqrt(dx * dx + dy * dy) + 0.01
    const target = 110
    const k = 1.6
    const f = (d - target) * k
    const fx = (dx / d) * f, fy = (dy / d) * f
    a.vx += fx * dt; a.vy += fy * dt
    b.vx -= fx * dt; b.vy -= fy * dt
  }
  // Centring + damping
  for (const n of arr) {
    n.vx += (cx - n.x) * 0.6 * dt
    n.vy += (cy - n.y) * 0.6 * dt
    n.vx *= 0.86
    n.vy *= 0.86
    n.x += n.vx * dt * 60
    n.y += n.vy * dt * 60
    // Boundary
    const pad = 36
    n.x = Math.max(pad, Math.min(w - pad, n.x))
    n.y = Math.max(pad, Math.min(h - pad, n.y))
  }
}
