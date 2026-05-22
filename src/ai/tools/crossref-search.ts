import { ai, z } from '../genkit';

export const crossrefSearchTool = ai.defineTool(
  {
    name: 'crossrefSearch',
    description: 'Search Crossref for a paper by title or DOI to verify indexing status, publisher, and authors.',
    inputSchema: z.object({
      query: z.string().describe('The DOI or title of the paper to search for'),
    }),
    outputSchema: z.any(),
  },
  async ({ query }) => {
    try {
      const isDoi = query.includes('10.') && query.includes('/');
      const url = isDoi
        ? `https://api.crossref.org/works/${encodeURIComponent(query)}`
        : `https://api.crossref.org/works?query.title=${encodeURIComponent(query)}&rows=3`;
      
      const response = await fetch(url);
      if (!response.ok) {
        return { error: `Crossref API error: ${response.status}` };
      }
      const data = await response.json();
      return data;
    } catch (e: any) {
      return { error: e.message };
    }
  }
);
