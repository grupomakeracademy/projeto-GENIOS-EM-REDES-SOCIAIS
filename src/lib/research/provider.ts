import { z } from 'zod';
import { serverCredential } from '@/lib/ai/credentials';
import { apiJSON, systemPolicy } from '@/lib/ai/providers';
export const sourceSchema = z.object({
  title: z.string(),
  url: z.url(),
  source: z.string(),
  snippet: z.string(),
  published_at: z.string().nullable(),
  retrieved_at: z.string(),
});
export type Source = z.infer<typeof sourceSchema>;
export interface ResearchProvider {
  search(query: string): Promise<Source[]>;
}
export async function research(query: string): Promise<Source[]> {
  if (process.env.TAVILY_API_KEY?.trim()) return new TavilyResearchProvider().search(query);
  const key = serverCredential('openai');
  if (!key) throw new Error('research_not_configured');
  const response = z
    .object({
      output: z.array(
        z.object({
          type: z.string(),
          content: z
            .array(
              z.object({
                type: z.string(),
                text: z.string().optional(),
                annotations: z
                  .array(
                    z.object({
                      type: z.string(),
                      url: z.string().optional(),
                      title: z.string().optional(),
                    }),
                  )
                  .optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .parse(
      await apiJSON(
        'https://api.openai.com/v1/responses',
        key,
        {
          model: process.env.OPENAI_RESEARCH_MODEL || 'gpt-4.1-mini',
          instructions: systemPolicy,
          input: `Research this topic using web search. Return a short factual summary with citations. Topic: ${query}`,
          tools: [{ type: 'web_search', search_context_size: 'low' }],
          tool_choice: 'required',
          max_output_tokens: 1800,
        },
        'openai',
      ),
    );
  const sources = new Map<string, Source>();
  for (const output of response.output)
    for (const part of output.content || []) {
      for (const citation of part.annotations || []) {
        if (citation.type !== 'url_citation' || !citation.url) continue;
        const parsed = z.url().safeParse(citation.url);
        if (!parsed.success || !['http:', 'https:'].includes(new URL(parsed.data).protocol))
          continue;
        sources.set(parsed.data, {
          title: citation.title || new URL(parsed.data).hostname,
          url: parsed.data,
          source: new URL(parsed.data).hostname,
          snippet: (part.text || '').slice(0, 4000),
          published_at: null,
          retrieved_at: new Date().toISOString(),
        });
      }
    }
  return [...sources.values()].slice(0, 5);
}
export class TavilyResearchProvider implements ResearchProvider {
  async search(query: string) {
    if (!process.env.TAVILY_API_KEY) throw new Error('provider_missing');
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({ query, max_results: 5, search_depth: 'basic' }),
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
    if (!response.ok)
      throw new Error(response.status === 429 ? 'rate_limit' : 'provider_unavailable');
    const data = z
      .object({
        results: z.array(
          z.object({
            title: z.string(),
            url: z.url(),
            content: z.string(),
            published_date: z.string().optional(),
          }),
        ),
      })
      .parse(await response.json());
    return data.results.map((r) => ({
      title: r.title,
      url: r.url,
      source: new URL(r.url).hostname,
      snippet: r.content.slice(0, 4000),
      published_at: r.published_date ?? null,
      retrieved_at: new Date().toISOString(),
    }));
  }
}
