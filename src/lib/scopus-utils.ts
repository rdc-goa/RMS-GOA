export function formatScopusDocumentType(subtypeDesc?: string, aggType?: string): string {
  const sub = (subtypeDesc || '').toLowerCase().trim();
  const agg = (aggType || '').toLowerCase().trim();

  if (sub.includes('book chapter') || sub === 'ch' || sub === 'chapter') return 'Book Chapter';
  if (sub.includes('conference paper') || sub.includes('proceedings') || sub === 'cp' || agg.includes('conference')) return 'Conference Paper';
  if (sub.includes('book') || sub === 'bk' || agg.includes('book')) return 'Book';
  if (sub.includes('review') || sub === 're') return 'Review';
  if (sub.includes('article') || sub === 'ar' || agg.includes('journal')) return 'Research Article';
  if (sub.includes('editorial') || sub === 'ed') return 'Editorial';
  if (sub.includes('letter') || sub === 'le') return 'Letter';
  if (sub.includes('note') || sub.includes('short') || sub === 'no' || sub === 'sh') return 'Short Communication';
  if (sub.includes('erratum') || sub === 'er') return 'Erratum';

  if (subtypeDesc && subtypeDesc.trim()) return subtypeDesc.trim();
  if (aggType && aggType.trim()) return aggType.trim();
  return 'Research Article';
}

export function computeHIndex(citations: number[]): number {
  const sorted = [...citations].sort((a, b) => b - a);
  let h = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] >= i + 1) {
      h = i + 1;
    } else {
      break;
    }
  }
  return h;
}

export function formatOpenAccessStatus(openaccessFlag?: string | number | boolean, openaccessStatus?: string): { label: string; isOpen: boolean } {
  if (openaccessStatus) {
    const s = openaccessStatus.toLowerCase();
    if (s.includes('gold')) return { label: 'Gold OA', isOpen: true };
    if (s.includes('green')) return { label: 'Green OA', isOpen: true };
    if (s.includes('hybrid')) return { label: 'Hybrid OA', isOpen: true };
    if (s.includes('bronze')) return { label: 'Bronze OA', isOpen: true };
  }
  const flagStr = String(openaccessFlag || '').trim();
  if (flagStr === '1' || flagStr === 'true' || openaccessFlag === true) {
    return { label: 'Open Access', isOpen: true };
  }
  return { label: 'Subscribed', isOpen: false };
}

export function getQuartileBadgeProps(quartile?: string): { label: string; className: string } {
  const q = (quartile || '').toUpperCase().trim();
  if (q === 'Q1') return { label: 'Q1', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' };
  if (q === 'Q2') return { label: 'Q2', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30' };
  if (q === 'Q3') return { label: 'Q3', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' };
  if (q === 'Q4') return { label: 'Q4', className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30' };
  return { label: 'Unranked', className: 'bg-muted text-muted-foreground border-border' };
}

const KNOWN_Q1_PATTERNS = [
  'fuel', 'scientific reports', 'nature', 'science', 'ieee', 'acs', 'advanced',
  'energy', 'cleaner production', 'desalination', 'bioresource', 'materials today',
  'small', 'nanoscale', 'applied energy', 'environmental science', 'chemical engineering journal',
  'electrochimica acta', 'applied surface science', 'appl. surf. sci.', 'journal of energy storage',
  'construction and building materials', 'composite structures', 'ceramics international',
  'chemosphere', 'journal of molecular liquids', 'optics & laser technology', 'results in physics',
  'optical materials', 'renewable energy', 'solar energy', 'cell', 'lancet', 'angewandte',
  'journal of power sources', 'carbohydrate polymers', 'food chemistry', 'sensors and actuators',
  'journal of hazardous materials', 'water research', 'biomaterials', 'soft matter',
  'langmuir', 'journal of physical chemistry', 'physical review', 'optics express'
];

const KNOWN_Q2_PATTERNS = [
  'bulletin of materials science', 'journal of electronic materials', 'materials research express',
  'materials letters', 'journal of optics', 'applied physics a', 'journal of supercomputing',
  'computers & electrical engineering', 'optik', 'solid state communications'
];

export function estimateQuartile(citationCount: number = 0, pubYear?: string, journalName?: string, docQuartile?: string): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  if (docQuartile && ['Q1', 'Q2', 'Q3', 'Q4'].includes(docQuartile.toUpperCase())) {
    return docQuartile.toUpperCase() as 'Q1' | 'Q2' | 'Q3' | 'Q4';
  }

  const name = (journalName || '').toLowerCase().trim();
  if (name) {
    if (KNOWN_Q1_PATTERNS.some(p => name.includes(p))) return 'Q1';
    if (KNOWN_Q2_PATTERNS.some(p => name.includes(p))) return 'Q2';
  }

  const currentYear = new Date().getFullYear();
  const year = parseInt(pubYear || String(currentYear), 10);
  const age = Math.max(1, currentYear - year + 1);
  const citationsPerYear = citationCount / age;

  if (citationsPerYear >= 3 || citationCount >= 15) return 'Q1';
  if (citationsPerYear >= 1.2 || citationCount >= 5) return 'Q2';
  if (citationsPerYear >= 0.4 || citationCount >= 1) return 'Q3';
  return 'Q1'; // Default fallback for Scopus-indexed research publications
}


export function computeCareerTimeline(publications: { publicationYear?: string; coverDate?: string }[]): { startYear?: string; latestYear?: string; activeYears: number } {
  const years: number[] = [];
  publications.forEach(p => {
    const yStr = p.publicationYear || p.coverDate?.substring(0, 4);
    if (yStr && yStr.length === 4) {
      const parsed = parseInt(yStr, 10);
      if (!isNaN(parsed) && parsed > 1900 && parsed <= new Date().getFullYear()) {
        years.push(parsed);
      }
    }
  });

  if (years.length === 0) {
    return { activeYears: 0 };
  }

  years.sort((a, b) => a - b);
  const min = years[0];
  const max = years[years.length - 1];
  const activeYears = Math.max(1, max - min + 1);

  return {
    startYear: String(min),
    latestYear: String(max),
    activeYears
  };
}

export function extractUniqueCoAuthorsCount(publications: { authors?: string }[]): number {
  const set = new Set<string>();
  publications.forEach(p => {
    if (p.authors) {
      p.authors.split(',').forEach(a => {
        const clean = a.trim().toLowerCase();
        if (clean.length > 2) set.add(clean);
      });
    }
  });
  return set.size;
}

const SCOPUS_SUBJECT_MAP: Record<string, string> = {
  COMP: 'Computer Science',
  ENGIN: 'Engineering',
  MATE: 'Materials Science',
  PHYS: 'Physics & Astronomy',
  CHEM: 'Chemistry',
  MATH: 'Mathematics',
  BIOC: 'Biochemistry & Molecular Biology',
  MEDI: 'Medicine',
  ENVI: 'Environmental Science',
  EART: 'Earth & Planetary Sciences',
  ENER: 'Energy',
  CIMI: 'Chemical Engineering',
  PHAR: 'Pharmacology & Toxicology',
  NEUR: 'Neuroscience',
  SOCI: 'Social Sciences',
  BUSI: 'Business & Management',
  DECI: 'Decision Sciences',
  ECON: 'Economics & Finance',
  ARTS: 'Arts & Humanities',
  HEAL: 'Health Professions',
  NURS: 'Nursing',
  DENT: 'Dentistry',
  VETE: 'Veterinary',
  PSYC: 'Psychology',
  MULT: 'Multidisciplinary',
};

export function resolveSubjectAreaName(rawName?: string, abbrev?: string): string {
  if (abbrev && SCOPUS_SUBJECT_MAP[abbrev.toUpperCase()]) {
    return SCOPUS_SUBJECT_MAP[abbrev.toUpperCase()];
  }
  if (rawName && SCOPUS_SUBJECT_MAP[rawName.toUpperCase()]) {
    return SCOPUS_SUBJECT_MAP[rawName.toUpperCase()];
  }
  if (rawName && rawName.trim()) {
    return rawName.trim();
  }
  return 'General Research';
}

export function deriveSubjectAreasFromPublications(
  publications: { title?: string; journalName?: string; subtypeDescription?: string; aggregationType?: string }[],
  storedAreas?: { name: string; count: number }[]
): { name: string; count: number }[] {
  if (storedAreas && storedAreas.length > 0) {
    return storedAreas;
  }

  const counts: Record<string, number> = {};

  publications.forEach(p => {
    const text = `${p.title || ''} ${p.journalName || ''}`.toLowerCase();
    
    let matched = false;
    if (/material|nanomaterial|nanoflower|nanosheet|composite|alloy|ceramic|thin film|crystal|graphene|oxide|structure|coating|metal/i.test(text)) {
      counts['Materials Science'] = (counts['Materials Science'] || 0) + 1;
      matched = true;
    }
    if (/terahertz|metamaterial|absorber|optic|laser|photonic|plasma|quantum|acoustic|electromagnetic|dielectric|semiconductor|physics|wave/i.test(text)) {
      counts['Physics & Astronomy'] = (counts['Physics & Astronomy'] || 0) + 1;
      matched = true;
    }
    if (/deep learning|machine learning|neural|optimization|algorithm|sensor|control|simulation|computing|network|image processing|finite element|software/i.test(text)) {
      counts['Engineering & Computer Science'] = (counts['Engineering & Computer Science'] || 0) + 1;
      matched = true;
    }
    if (/water splitting|catalys|electrocatalys|hydrogen|polymer|synthesis|chemical|corrosion|electrochemical|bioresource|molecule|liquid|fuel/i.test(text)) {
      counts['Chemistry & Chemical Engineering'] = (counts['Chemistry & Chemical Engineering'] || 0) + 1;
      matched = true;
    }
    if (/biomass|storage|renewable|solar|battery|photovoltaic|emission|environment|energy|sustainable|water/i.test(text)) {
      counts['Energy & Environmental Science'] = (counts['Energy & Environmental Science'] || 0) + 1;
      matched = true;
    }

    if (!matched) {
      const cat = formatScopusDocumentType(p.subtypeDescription, p.aggregationType);
      counts[cat] = (counts[cat] || 0) + 1;
    }
  });

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function resolvePublisherName(publisherField?: string): string {
  if (publisherField && publisherField.trim() && publisherField.trim().length > 1) {
    return publisherField.trim();
  }
  return 'N/A';
}



export function extractTopCoAuthors(
  publications: { authors?: string }[],
  userName?: string,
  topN: number = 8
): { name: string; count: number }[] {
  const counts: Record<string, number> = {};
  const selfParts = (userName || '').toLowerCase().split(' ').filter(p => p.length > 2);

  publications.forEach(p => {
    if (p.authors) {
      const authorList = p.authors.split(',').map(a => a.trim()).filter(Boolean);
      authorList.forEach(rawAuthor => {
        const cleanLower = rawAuthor.toLowerCase();
        const isSelf = selfParts.some(part => cleanLower.includes(part));
        if (cleanLower.length > 2 && !isSelf) {
          const formatted = rawAuthor
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
          counts[formatted] = (counts[formatted] || 0) + 1;
        }
      });
    }
  });

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export function formatScopusDate(coverDate?: string, publicationYear?: string): string {
  const result = (() => {
    if (coverDate) {
      const parts = coverDate.split('-');
      if (parts.length >= 2) {
        const year = parts[0];
        const monthNum = parseInt(parts[1], 10);
        const dayNum = parts.length >= 3 ? parseInt(parts[2], 10) : null;
        
        // If date is exactly YYYY-01-01 or YYYY-12-31, it's typically a database placeholder
        // meaning only the year is available.
        const isPlaceholder = (monthNum === 1 && dayNum === 1) || (monthNum === 12 && dayNum === 31);
        
        if (year.length === 4 && !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 && !isPlaceholder) {
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          if (dayNum !== null && !isNaN(dayNum)) {
            return `${dayNum} ${months[monthNum - 1]} ${year}`;
          }
          return `${months[monthNum - 1]} ${year}`;
        }
      }
    }
    return publicationYear || coverDate?.substring(0, 4) || 'N/A';
  })();
  console.log(`[ScopusDate] input coverDate: "${coverDate}", publicationYear: "${publicationYear}" -> output: "${result}"`);
  return result;
}







