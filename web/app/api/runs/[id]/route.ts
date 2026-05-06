import { dbEnabled, getRunSnapshot } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!dbEnabled()) {
    return new Response(JSON.stringify({ error: 'database not configured' }), { status: 501 })
  }
  try {
    const { id } = await params
    const run = await getRunSnapshot(id)
    if (!run) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
    return new Response(JSON.stringify({ run }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 })
  }
}
