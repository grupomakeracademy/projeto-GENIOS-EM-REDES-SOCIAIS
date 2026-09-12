import { contentList } from '@/features/content/queries';
import { fail } from '@/lib/security/context';
export async function GET(request: Request) {
  try {
    return Response.json(await contentList(Object.fromEntries(new URL(request.url).searchParams)));
  } catch (e) {
    return fail(e);
  }
}
