import { chromium, type Browser } from 'playwright'

// Singleton browser reused across requests. Cold start ~500ms; subsequent
// fetches reuse the same chromium process.
let browserPromise: Promise<Browser> | null = null

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true })
  }
  return browserPromise
}

export interface FetchResult {
  url: string
  title?: string
  text?: string
  error?: string
  ms: number
}

const DEFAULT_TIMEOUT_MS = 15000
const MAX_TEXT_CHARS = 4000

export async function fetchUrls(urls: string[], signal?: AbortSignal): Promise<FetchResult[]> {
  if (urls.length === 0) return []
  const browser = await getBrowser()
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 PuppeteerPlayground/0.1',
    viewport: { width: 1280, height: 800 },
  })
  try {
    return await Promise.all(urls.map(u => fetchOne(ctx, u, signal)))
  } finally {
    await ctx.close().catch(() => {})
  }
}

async function fetchOne(
  ctx: Awaited<ReturnType<Browser['newContext']>>,
  url: string,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const start = Date.now()
  const page = await ctx.newPage()
  const onAbort = () => page.close().catch(() => {})
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS })
    const title = await page.title().catch(() => undefined)
    const text = await page.evaluate(() => {
      const body = document.body
      if (!body) return ''
      return (body.innerText || '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    })
    return {
      url,
      title,
      text: text.slice(0, MAX_TEXT_CHARS),
      ms: Date.now() - start,
    }
  } catch (err) {
    return { url, error: (err as Error).message.slice(0, 200), ms: Date.now() - start }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await page.close().catch(() => {})
  }
}

const URL_RE = /https?:\/\/[^\s)>\]"'`]+/gi

export function extractUrls(text: string, max = 3): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(URL_RE)) {
    const u = m[0].replace(/[.,;:!?)\]]+$/, '')
    if (u.includes('example.com')) continue
    if (seen.has(u)) continue
    seen.add(u)
    out.push(u)
    if (out.length >= max) break
  }
  return out
}
