import { timingSafeEqual } from 'node:crypto';

import { fail } from '@/lib/security/context';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const provided = Buffer.from(request.headers.get('authorization') || ''),
    expected = Buffer.from(`Bearer ${process.env.WORKER_SECRET || ''}`);
  if (
    !process.env.WORKER_SECRET ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return Response.json({ error: 'continuous_generation_disabled' }, { status: 410 });
  } catch (e) {
    return fail(e);
  }
}
