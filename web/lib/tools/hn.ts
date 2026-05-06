export interface HNHit {
  title: string
  url: string
  points?: number
  author?: string
  createdAt?: string
}

export interface HNResponse {
  hits: HNHit[]
}

const HN_URL = 'https://hn.algolia.com/api/v1/search'

export async function searchHackerNews(query: string, maxResults = 5, signal?: AbortSignal): Promise<HNResponse> {
  const url = `${HN_URL}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${maxResults}`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`hn ${res.status}: ${txt.slice(0, 300)}`)
  }
  const json = await res.json() as { hits?: Array<{ title?: string; url?: string; points?: number; author?: string; created_at?: string; objectID?: string }> }
  const hits = (json.hits ?? [])
    .filter(h => h.title)
    .map(h => ({
      title: h.title!,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: h.points,
      author: h.author,
      createdAt: h.created_at,
    }))
  return { hits }
}
