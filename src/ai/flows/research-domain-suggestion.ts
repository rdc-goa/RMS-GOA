
export async function getResearchDomainSuggestion(input: { paperTitles: string[] }): Promise<{ success: boolean, domain: string }> {
  const titles = input.paperTitles || [];
  const joined = titles.join(' ').toLowerCase();
  if (!joined) return { success: true, domain: 'General' };
  if (joined.includes('computer') || joined.includes('machine') || joined.includes('learning') || joined.includes('ai')) return { success: true, domain: 'Computer Science' };
  if (joined.includes('biology') || joined.includes('cell') || joined.includes('biochemical')) return { success: true, domain: 'Biological Sciences' };
  if (joined.includes('chem') || joined.includes('synthesis')) return { success: true, domain: 'Chemical Sciences' };
  if (joined.includes('physics') || joined.includes('quantum')) return { success: true, domain: 'Physical Sciences' };
  if (joined.includes('education') || joined.includes('pedagogy')) return { success: true, domain: 'Education' };
  return { success: true, domain: 'General' };
}
