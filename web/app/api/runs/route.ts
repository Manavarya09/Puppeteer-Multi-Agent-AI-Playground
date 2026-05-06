import { dbEnabled, listRuns } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!dbEnabled()) {
    return new Response(JSON.stringify({ error: 'database not configured' }), { status: 501 })
  }
  const url = new URL(req.url)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') || 20)))
  try {
    const runs = await listRuns(limit)
    return new Response(JSON.stringify({ runs }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 })
  }
}
