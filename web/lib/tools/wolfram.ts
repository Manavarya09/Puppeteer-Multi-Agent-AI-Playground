// Free math evaluator backed by math.js (https://api.mathjs.org/) — no API key required.
// File kept as wolfram.ts to minimise ripple in the orchestrator.

export interface WolframResponse {
  text: string
  sourceUrl: string
  expression: string
}

const MATHJS_URL = 'https://api.mathjs.org/v4/'

export async function queryWolfram(input: string, signal?: AbortSignal): Promise<WolframResponse> {
  const expr = sanitizeExpression(input)
  if (!expr) throw new Error('empty expression after sanitize')
  // POST avoids URL-encoding edge cases with quotes/braces.
  const res = await fetch(MATHJS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expr }),
    signal,
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`mathjs ${res.status}: ${raw.slice(0, 300)}`)
  }
  let text = raw.trim()
  // POST endpoint returns JSON {result, error}; GET returns plain text.
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      if (parsed.error) throw new Error(String(parsed.error).slice(0, 300))
      text = Array.isArray(parsed.result)
        ? parsed.result[parsed.result.length - 1]
        : String(parsed.result ?? '')
    }
  } catch (e) {
    if (e instanceof Error && e.message.length > 0 && !/^Unexpected token/i.test(e.message)) throw e
    // not JSON — keep raw text
  }
  if (/^Error[:\s]/i.test(text)) {
    throw new Error(text.slice(0, 300))
  }
  return {
    text: (text || '').trim() || '(no result)',
    expression: expr,
    sourceUrl: 'https://mathjs.org/',
  }
}

// Strip the wrappers an LLM or user might add around a math expression.
export function sanitizeExpression(input: string): string {
  let s = (input || '').trim()
  // Take first non-empty line.
  s = s.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? ''
  // Strip code fences and leading language tag.
  s = s.replace(/^`+|`+$/g, '').trim()
  s = s.replace(/^(?:math|mathjs|js|javascript)\s*[:>]?\s*/i, '').trim()
  // Strip leading labels like "Expression:", "Answer:", "Result:".
  s = s.replace(/^(?:expression|expr|answer|result|solution|compute|evaluate)\s*[:=]\s*/i, '').trim()
  // Strip leading natural-language fluff.
  s = s.replace(/^(?:what(?:'s| is)?|whats|how much is|calculate|compute|find|solve(?:\s+for)?|evaluate)\s+/i, '').trim()
  // Strip surrounding matched quotes.
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim()
  }
  // Drop trailing question marks, periods, semicolons, "= ?", "= ".
  s = s.replace(/\s*=\s*\?\s*$/, '').trim()
  s = s.replace(/[?;]+\s*$/g, '').trim()
  s = s.replace(/\.\s*$/g, '').trim()
  return s
}
