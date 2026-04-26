// Provider abstraction over OpenAI-compatible chat completions APIs
// (OpenRouter and Groq both speak this dialect). Streams content deltas.

export type Provider = 'openrouter' | 'groq'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionOpts {
  provider?: Provider
  model?: string
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export interface ProviderConfig {
  apiKey: string
  baseUrl: string
  defaultModel: string
  // OpenRouter wants these for analytics ranking; harmless on Groq.
  referer?: string
  appTitle?: string
}

export class LLMConfigError extends Error {}

export function getProviderConfig(provider: Provider): ProviderConfig {
  if (provider === 'groq') {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new LLMConfigError('GROQ_API_KEY not set')
    return {
      apiKey,
      baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
      defaultModel: process.env.FAST_MODEL || 'llama-3.3-70b-versatile',
    }
  }
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new LLMConfigError('OPENROUTER_API_KEY not set')
  return {
    apiKey,
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    defaultModel: process.env.DEFAULT_MODEL || 'openai/gpt-4o-mini',
    referer: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    appTitle: 'Puppeteer Playground',
  }
}

// Strip the "groq/" prefix from a model id when calling Groq directly.
function normalizeModel(model: string, provider: Provider): string {
  if (provider === 'groq' && model.startsWith('groq/')) return model.slice(5)
  return model
}

// Streams content tokens from the chosen provider. Yields each delta string
// as it arrives. Throws on HTTP error or malformed responses.
export async function* streamCompletion(opts: CompletionOpts): AsyncGenerator<string, void, unknown> {
  const provider: Provider = opts.provider ?? 'openrouter'
  const cfg = getProviderConfig(provider)
  const model = normalizeModel(opts.model || cfg.defaultModel, provider)
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (cfg.referer) headers['HTTP-Referer'] = cfg.referer
  if (cfg.appTitle) headers['X-Title'] = cfg.appTitle

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    signal: opts.signal,
    body: JSON.stringify({
      model,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.4,
      stream: true,
    }),
  })
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`${provider} ${res.status}: ${txt.slice(0, 400)}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const delta = json?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) yield delta
      } catch {
        // ignore parse errors on heartbeat or malformed lines
      }
    }
  }
}

export function estTokens(s: string): number {
  return Math.max(1, Math.round(s.length / 3.7))
}
