export interface WolframResponse {
  text: string
  sourceUrl: string
}

const WOLFRAM_URL = 'https://api.wolframalpha.com/v1/result'

export async function queryWolfram(input: string, signal?: AbortSignal): Promise<WolframResponse> {
  const appId = process.env.WOLFRAM_APP_ID
  if (!appId) throw new Error('WOLFRAM_APP_ID not set')

  const encoded = encodeURIComponent(input)
  const res = await fetch(`${WOLFRAM_URL}?i=${encoded}&appid=${appId}`, { signal })
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`wolfram ${res.status}: ${txt.slice(0, 300)}`)
  }
  const text = (await res.text()).trim()
  return {
    text: text || '(no result)',
    sourceUrl: `https://www.wolframalpha.com/input?i=${encoded}`,
  }
}
