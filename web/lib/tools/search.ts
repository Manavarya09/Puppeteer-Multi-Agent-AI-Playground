export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface SearchResponse {
  results: SearchResult[]
}

const DUCKDUCKGO_URL = 'https://duckduckgo.com/html/'
const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 PuppeteerPlayground/0.1'

export async function search(query: string, maxResults = 5, signal?: AbortSignal): Promise<SearchResponse> {
  return searchDuckDuckGo(query, maxResults, signal)
}

async function searchDuckDuckGo(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResponse> {
  const url = `${DUCKDUCKGO_URL}?q=${encodeURIComponent(query)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': DEFAULT_UA },
    signal,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`duckduckgo ${res.status}: ${txt.slice(0, 300)}`)
  }
  const html = await res.text()
  const links: Array<{ title: string; url: string }> = []
  const snippets: string[] = []

  const linkRe = /<a\s+[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRe = /<(?:a|span)\s+[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span)>/gi

  for (const m of html.matchAll(linkRe)) {
    if (links.length >= maxResults) break
    const rawUrl = decodeHtml(m[1])
    const url = normalizeDuckUrl(rawUrl)
    const title = stripHtml(decodeHtml(m[2])) || url
    links.push({ title, url })
  }

  for (const m of html.matchAll(snippetRe)) {
    if (snippets.length >= maxResults) break
    snippets.push(stripHtml(decodeHtml(m[1] || '')))
  }

  const results = links.map((l, i) => ({
    title: l.title,
    url: l.url,
    snippet: snippets[i] || '',
  }))
  return { results }
}

function normalizeDuckUrl(url: string): string {
  try {
    const u = new URL(url)
    const uddg = u.searchParams.get('uddg')
    if (uddg) return decodeURIComponent(uddg)
  } catch {
    // ignore
  }
  return url
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
