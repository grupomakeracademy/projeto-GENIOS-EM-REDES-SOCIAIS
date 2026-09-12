import { guard, fail } from '@/lib/security/context';
import { credentialStatus } from '@/lib/ai/credentials';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    await guard(request, 'admin');
    return Response.json(credentialStatus(), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const response = fail(error);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
}
