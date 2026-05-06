import { dbEnabled, getRunSnapshot } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!dbEnabled()) {
    return new Response(JSON.stringify({ error: 'database not configured' }), { status: 501 })
  }
  try {
    const run = await getRunSnapshot(params.id)
    if (!run) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    return new Response(JSON.stringify({ run }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 })
  }
}
