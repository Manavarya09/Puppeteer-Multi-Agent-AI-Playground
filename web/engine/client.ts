import type { EngineEvent, Subspace, TaskState } from './types'

export interface RunOptions {
  task: string
  subspace: Subspace
  budget: number
  provider?: 'openrouter' | 'groq'
  model?: string
  signal?: AbortSignal
  onEvent: (e: EngineEvent) => void
}

// Streams orchestration events from /api/orchestrate. The server emits
// SSE lines `data: <json EngineEvent>\n\n`. We dispatch each parsed event
// to onEvent and resolve with the final TaskState.
export async function runOrchestration(opts: RunOptions): Promise<TaskState | null> {
  const res = await fetch('/api/orchestrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: opts.task,
      subspace: opts.subspace,
      budget: opts.budget,
      provider: opts.provider,
      model: opts.model,
    }),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`orchestrate failed: ${res.status} ${text}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let final: TaskState | null = null
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)
        if (!payload) continue
        try {
          const ev = JSON.parse(payload) as EngineEvent
          opts.onEvent(ev)
          if (ev.type === 'complete') final = ev.state
        } catch {
          // Ignore malformed lines.
        }
      }
    }
  }
  return final
}
