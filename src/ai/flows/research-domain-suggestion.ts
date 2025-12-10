export async function getResearchDomainSuggestion(input: { paperTitles: string[] }): Promise<{ domain: string }> {
  const titles = input.paperTitles || [];
  const joined = titles.join(' ').toLowerCase();
  if (!joined) return { domain: 'General' };
  if (joined.includes('computer') || joined.includes('machine') || joined.includes('learning') || joined.includes('ai')) return { domain: 'Computer Science' };
  if (joined.includes('biology') || joined.includes('cell') || joined.includes('biochemical')) return { domain: 'Biological Sciences' };
  if (joined.includes('chem') || joined.includes('synthesis')) return { domain: 'Chemical Sciences' };
  if (joined.includes('physics') || joined.includes('quantum')) return { domain: 'Physical Sciences' };
  if (joined.includes('education') || joined.includes('pedagogy')) return { domain: 'Education' };
  return { domain: 'General' };
}
