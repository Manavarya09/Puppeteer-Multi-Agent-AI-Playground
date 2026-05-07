// Free math evaluator backed by math.js (https://api.mathjs.org/) — no API key required.
// File kept as wolfram.ts to minimise ripple in the orchestrator.

export interface WolframResponse {
  text: string
  sourceUrl: string
  expression: string
}

const MATHJS_URL = 'https://api.mathjs.org/v4/'

export async function queryWolfram(input: string, signal?: AbortSignal): Promise<WolframResponse> {
  const expr = input.trim()
  const res = await fetch(`${MATHJS_URL}?expr=${encodeURIComponent(expr)}`, { signal })
  const text = (await res.text()).trim()
  if (!res.ok) {
    throw new Error(`mathjs ${res.status}: ${text.slice(0, 300)}`)
  }
  // math.js returns plain text on success, or "Error: ..." text on a parse/eval failure.
  if (/^Error[:\s]/i.test(text)) {
    throw new Error(text.slice(0, 300))
  }
  return {
    text: text || '(no result)',
    expression: expr,
    sourceUrl: 'https://mathjs.org/',
  }
}
