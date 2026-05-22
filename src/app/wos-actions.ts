'use server';

import { checkRateLimit } from '@/lib/rate-limit';
import { callOpenRouter } from '@/lib/openrouter';


type WoSAuthor = {
  displayName?: string;
  researcherId?: string;
};

type WoSRecord = {
  uid?: string;
  title?: any;
  source?: any;
  identifiers?: any;
  publicationInfo?: any;
  publicationDate?: string;
  documentType?: string;
  names?: any;
  authors?: any[];
  citations?: any;
  links?: any;
};

export async function fetchWosDataByUrl(
  identifier: string,
  claimantName: string,
  userId: string,
): Promise<{
  success: boolean;
  data?: {
    title: string;
    paperTitle: string;
    journalName: string;
    journalWebsite?: string;
    publicationYear: string;
    publicationMonth?: string;
    isPuNameInPublication?: boolean;
    printIssn?: string;
    electronicIssn?: string;
    wosLink?: string;
    wosAccessionNumber?: string;
    publicationType?: string;
    wosType?: string;
    totalAuthors: number;
  };
  error?: string;
  warning?: string;
  claimantIsAuthor?: boolean;
}> {
  // Rate limiting [CRIT-02]
  const rateLimit = await checkRateLimit(`wos-fetch-${userId}`, { points: 100, duration: 600 }); // 5 lookups per 10 mins
  if (!rateLimit.success) {
    return { success: false, error: "Too many search requests. Please try again after 10 minutes." };
  }
  const apiKey = process.env.WOS_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'Web of Science data fetching is currently unavailable. Please fill in the data manually.',
    };
  }

  const isWosUid = /^WOS:\d+$/i.test(identifier);
  const doiMatch = identifier.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);

  let apiUrl: string;

  if (isWosUid) {
    apiUrl =
      `https://api.clarivate.com/apis/wos-starter/v1/documents/${identifier}`;
  } else if (doiMatch) {
    apiUrl =
      `https://api.clarivate.com/apis/wos-starter/v1/documents` +
      `?q=DO=${encodeURIComponent(doiMatch[1])}&limit=1`;
  } else {
    return {
      success: false,
      error: 'Identifier must be a valid DOI or Web of Science UID.',
    };
  }

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'X-ApiKey': apiKey,
        Accept: 'application/json;charset=UTF-8',
      },
    });

    if (!response.ok) {
      let message = 'Failed to fetch data from Web of Science.';
      try {
        const err = await response.json();
        message =
          err?.error?.details ||
          err?.error?.message ||
          err?.message ||
          message;
      } catch { }
      return { success: false, error: `WoS API Error: ${message}` };
    }

    const payload = await response.json();
    const record: WoSRecord | undefined =
      isWosUid ? payload : payload?.hits?.[0];

    if (!record) {
      return {
        success: false,
        error: 'No matching record found in Web of Science.',
      };
    }

    const paperTitle = typeof record.title === 'string'
      ? record.title
      : (record.title?.value || record.title?.title || '');

    const journalName = typeof record.source === 'string'
      ? record.source
      : (record.source?.sourceTitle ?? '');

    const printIssnObj = record.source?.issn ?? record.identifiers?.issn;
    const printIssn = Array.isArray(printIssnObj) ? printIssnObj[0] : (typeof printIssnObj === 'string' ? printIssnObj : '');

    const eIssnObj = record.source?.eissn ?? record.identifiers?.eissn;
    const electronicIssn = Array.isArray(eIssnObj) ? eIssnObj[0] : (typeof eIssnObj === 'string' ? eIssnObj : '');

    let journalWebsite = '';
    let processedTitle = paperTitle;

    if (journalName || paperTitle) {
      console.log("OpenRouter: Enhancing record for journal:", journalName);
      try {
        const prompt = `
          Task 1: Find the official website URL for the journal "${journalName}" (ISSN: ${printIssn}).
          Task 2: Format the research paper title "${paperTitle}" using HTML <sub> and <sup> tags for chemical formulas (e.g. H2O -> H<sub>2</sub>O, La2Ni -> La<sub>2</sub>Ni) and mathematical notation where appropriate.
          
          Return ONLY a JSON object: {"url": "...", "title": "..."}.
          If URL not found or you are not 100% sure it is the official journal homepage, use null.
        `;
        
        console.log("OpenRouter: Fetching from API...");
        const responseTextRaw = await callOpenRouter({ prompt });
        
        // Remove potential markdown code blocks
        const responseText = responseTextRaw.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
          const parsed = JSON.parse(responseText);
          if (parsed.url && parsed.url.startsWith('http')) {
            journalWebsite = parsed.url;
            console.log("OpenRouter: Found website:", journalWebsite);
          }
          if (parsed.title) {
            processedTitle = parsed.title;
            console.log("OpenRouter: Formatted title.");
          }
        } catch (parseError) {
          console.error("OpenRouter JSON Parse Error:", parseError, "Original text:", responseText);
        }
      } catch (e) {
        console.error("OpenRouter Enhancement Error:", e);
      }
    }

    let publicationYear = '';
    let publicationMonth = '';

    // Priority 1: publicationInfo
    if (record.publicationInfo?.year) {
      publicationYear = String(record.publicationInfo.year);
    }
    if (record.publicationInfo?.month) {
      const m = String(record.publicationInfo.month).split('-')[0].trim();
      const monthNum = parseInt(m, 10);
      if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        publicationMonth = new Date(2000, monthNum - 1, 1).toLocaleString('en-US', { month: 'long' });
      } else {
        const d = new Date(`${m} 1, 2000`);
        if (!isNaN(d.getTime())) {
          publicationMonth = d.toLocaleString('en-US', { month: 'long' });
        }
      }
    }

    // Priority 2: source publish fields
    if (!publicationYear && record.source?.publishYear) {
      publicationYear = String(record.source.publishYear);
    }
    if (!publicationMonth && record.source?.publishMonth) {
      const m = String(record.source.publishMonth).split('-')[0].trim();
      const monthNum = parseInt(m, 10);
      if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        publicationMonth = new Date(2000, monthNum - 1, 1).toLocaleString('en-US', { month: 'long' });
      } else {
        const d = new Date(`${m} 1, 2000`);
        if (!isNaN(d.getTime())) {
          publicationMonth = d.toLocaleString('en-US', { month: 'long' });
        }
      }
    }

    // Priority 3: publicationDate (YYYY-MM-DD)
    if (!publicationYear && record.publicationDate) {
      const parts = String(record.publicationDate).split('-');
      publicationYear = parts[0];
      if (!publicationMonth && parts.length >= 2) {
        const monthNum = parseInt(parts[1], 10);
        if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
          publicationMonth = new Date(2000, monthNum - 1, 1).toLocaleString('en-US', { month: 'long' });
        }
      }
    }

    // Ensure publicationMonth is capitalized correctly (e.g., "MAY" -> "May")
    if (publicationMonth) {
      publicationMonth = publicationMonth.charAt(0).toUpperCase() + publicationMonth.slice(1).toLowerCase();
    }

    // ISSN/eISSN already moved up for OpenRouter prompt

    let documentTypeRaw = record.documentType ?? '';
    let publicationType = 'Research Articles/Short Communications';
    if (typeof documentTypeRaw === 'string') {
      const dt = documentTypeRaw.toLowerCase();
      if (dt.includes('review')) {
        publicationType = 'Review Articles';
      } else if (dt.includes('letter') || dt.includes('editorial')) {
        publicationType = 'Letter to the Editor/Editorial';
      } else if (dt.includes('proceedings') || dt.includes('conference')) {
        publicationType = 'Scopus Indexed Conference Proceedings';
      }
    }

    let wosType: "SCIE" | "SSCI" | "A&HCI" | undefined = undefined;
    const strRecord = JSON.stringify(record).toUpperCase();
    if (strRecord.includes('"SCIE"')) wosType = 'SCIE';
    else if (strRecord.includes('"SSCI"')) wosType = 'SSCI';
    else if (strRecord.includes('"A&HCI"')) wosType = 'A&HCI';

    const authors = record.names?.authors ?? record.authors ?? [];

    const claimantParts = claimantName.trim().toLowerCase().split(/\s+/);
    const claimantLastName = claimantParts.pop() ?? '';
    const claimantFirstInitial = claimantParts[0]?.charAt(0) ?? '';

    const claimantIsAuthor = authors.some((author: any) => {
      const name = (typeof author === 'string' ? author : author.displayName)?.toLowerCase() ?? '';
      if (!name || !claimantLastName) return false;
      if (name.includes(',')) {
        const [last, first] = name.split(',').map((p: string) => p.trim());
        return (
          last === claimantLastName &&
          (!claimantFirstInitial ||
            first?.startsWith(claimantFirstInitial))
        );
      }
      return name.includes(claimantLastName);
    });

    const isPuNameInPublication = authors.some((author: any) =>
      (typeof author === 'string' ? author : author.displayName)?.toLowerCase().includes('parul'),
    );


    const wosLink = record.links?.record;
    let wosAccessionNumber = record.uid || '';

    // Fallback: Extract from URL if uid is missing or not a WOS ID
    if (!wosAccessionNumber && wosLink) {
      const match = wosLink.match(/KeyUT=(WOS:[A-Z0-9]+)/i);
      if (match) wosAccessionNumber = match[1];
    }

    const publisherName = record.publicationInfo?.publisher || record.source?.publisher || '';

    const responseData: any = {
      title: processedTitle,
      paperTitle: processedTitle,
      journalName,
      journalWebsite,
      publicationYear,
      publicationMonth,
      isPuNameInPublication,
      printIssn,
      electronicIssn,
      wosLink,
      wosAccessionNumber,
      publicationType,
      totalAuthors: authors.length,
      publisher: publisherName,
    };

    if (wosType) {
      responseData.wosType = wosType;
    }

    return {
      success: true,
      data: responseData,
      claimantIsAuthor,
    };
  } catch (err: any) {
    return {
      success: false,
      error:
        err?.message ||
        'An unexpected error occurred while fetching Web of Science data.',
    };
  }
}
