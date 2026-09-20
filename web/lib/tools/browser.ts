// Playwright browser tool — dynamically imported to avoid native module issues on Vercel.
// Falls back to a fetch-based approach when Playwright is unavailable.

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

  // Try Playwright first
  try {
    const { chromium } = await import('playwright')
    return await fetchWithPlaywright(urls, chromium, signal)
  } catch {
    // Playwright unavailable (Vercel serverless) — fall back to HTTP fetch
    return await fetchWithHttp(urls, signal)
  }
}

async function fetchWithPlaywright(
  urls: string[],
  chromium: typeof import('playwright').chromium,
  signal?: AbortSignal,
): Promise<FetchResult[]> {
  const browser = await chromium.launch({ headless: true })
  const results: FetchResult[] = []
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 PuppeteerPlayground/0.1',
      viewport: { width: 1280, height: 800 },
    })
    for (const url of urls) {
      const start = Date.now()
      try {
        const page = await ctx.newPage()
        await page.goto(url, { timeout: DEFAULT_TIMEOUT_MS, waitUntil: 'domcontentloaded' })
        const title = await page.title()
        const text = await page.evaluate(() => document.body?.innerText ?? '')
        await page.close()
        results.push({ url, title, text: text.slice(0, MAX_TEXT_CHARS), ms: Date.now() - start })
      } catch (err) {
        results.push({ url, error: (err as Error).message.slice(0, 200), ms: Date.now() - start })
      }
    }
    await ctx.close()
  } finally {
    await browser.close()
  }
  return results
}

async function fetchWithHttp(urls: string[], signal?: AbortSignal): Promise<FetchResult[]> {
  const results: FetchResult[] = []
  for (const url of urls) {
    const start = Date.now()
    try {
      const res = await fetch(url, {
        signal,
        headers: { 'User-Agent': 'PuppeteerPlayground/0.1 (HTTP fallback)' },
      })
      const html = await res.text()
      // Basic HTML to text: strip tags
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_TEXT_CHARS)
      // Extract title from HTML
      const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
      results.push({ url, title: titleMatch?.[1]?.trim(), text, ms: Date.now() - start })
    } catch (err) {
      results.push({ url, error: (err as Error).message.slice(0, 200), ms: Date.now() - start })
    }
  }
  return results
}

export function extractUrls(text: string, max = 3): string[] {
  const urlPattern = /https?:\/\/[^\s)<>"]+/g
  const matches = text.match(urlPattern) ?? []
  return [...new Set(matches)].slice(0, max)
}
