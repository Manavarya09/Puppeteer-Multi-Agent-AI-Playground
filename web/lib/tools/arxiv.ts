export interface ArxivEntry {
  id: string
  title: string
  summary: string
  updated?: string
}

export interface ArxivResponse {
  entries: ArxivEntry[]
}

const ARXIV_URL = 'https://export.arxiv.org/api/query'

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i')
  const m = re.exec(xml)
  if (!m) return ''
  return m[1].replace(/\s+/g, ' ').trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export async function queryArxiv(query: string, maxResults = 3, signal?: AbortSignal): Promise<ArxivResponse> {
  const q = encodeURIComponent(`all:${query}`)
  const url = `${ARXIV_URL}?search_query=${q}&start=0&max_results=${maxResults}&sortBy=relevance`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`arxiv ${res.status}: ${txt.slice(0, 300)}`)
  }
  const xml = await res.text()
  const entries = xml.split('<entry>').slice(1).map(chunk => {
    const id = extractTag(chunk, 'id')
    const title = decodeEntities(extractTag(chunk, 'title'))
    const summary = decodeEntities(extractTag(chunk, 'summary'))
    const updated = extractTag(chunk, 'updated')
    return { id, title, summary, updated }
  }).filter(e => e.id && e.title)

  return { entries }
}
