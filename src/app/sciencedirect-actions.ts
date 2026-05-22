
'use server';

import { checkRateLimit } from '@/lib/rate-limit';
import { callOpenRouter } from '@/lib/openrouter';


// This function is designed to fetch publication data from the ScienceDirect API.
export async function fetchScienceDirectData(
  identifier: string,
  claimantName: string,
  userId: string
): Promise<{
  success: boolean;
  data?: {
    title: string;
    paperTitle: string;
    journalName: string;
    publicationMonth: string;
    publicationYear: string;
    isPuNameInPublication: boolean;
    printIssn?: string;
    electronicIssn?: string;
  };
  error?: string;
}> {
  // Rate limiting [CRIT-02]
  const rateLimit = await checkRateLimit(`sd-fetch-${userId}`, { points: 15, duration: 600 }); // 5 lookups per 10 mins
  if (!rateLimit.success) {
    return { success: false, error: "Too many search requests. Please try again after 10 minutes." };
  }
  const apiKey = process.env.SCOPUS_API_KEY;
  if (!apiKey) {
    console.error("Scopus/ScienceDirect API key is not configured.");
    return { success: false, error: "API integration is not configured on the server." };
  }

  const doiMatch = identifier.match(/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  const doi = doiMatch ? doiMatch[1] : identifier;

  if (!doi) {
    return { success: false, error: 'Could not extract a valid DOI from the input.' };
  }

  // Switched to the Article Metadata API endpoint
  const apiUrl = `https://api.elsevier.com/content/metadata/article?query=DOI(${encodeURIComponent(doi)})`;

  try {
    const response = await fetch(apiUrl, {
      headers: { "X-ELS-APIKey": apiKey, Accept: "application/json" },
    });

    if (!response.ok) {
      // Return a more user-friendly message for authorization issues
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: "ScienceDirect fetching is not available right now." };
      }
      const errorData = await response.json();
      const errorMessage = errorData?.['service-error']?.status?.statusText || "The resource specified cannot be found.";
      throw new Error(`ScienceDirect API Error: ${errorMessage}`);
    }

    const data = await response.json();
    const entry = data?.["search-results"]?.entry?.[0];
    if (!entry) {
      return { success: false, error: "No matching record found in ScienceDirect for the provided DOI." };
    }

    const paperTitle = entry["dc:title"] || "";
    const journalName = entry["prism:publicationName"] || "";
    const coverDate = entry["prism:coverDate"];

    let publicationMonth = '';
    let publicationYear = '';
    if (coverDate) {
      const date = new Date(coverDate);
      publicationYear = date.getFullYear().toString();
      publicationMonth = date.toLocaleString('en-US', { month: 'long' });
    }

    // Affiliation check requires a different approach with this API
    let isPuNameInPublication = false;
    const affiliations = entry?.affiliation;
    if (Array.isArray(affiliations)) {
      isPuNameInPublication = affiliations.some((affil: any) => affil?.['affilname']?.toLowerCase().includes('parul'));
    } else if (affiliations && affiliations['affilname']) {
      isPuNameInPublication = (affiliations['affilname'] || '').toLowerCase().includes('parul');
    }

    let printIssn: string | undefined = entry["prism:issn"];
    let electronicIssn: string | undefined = entry["prism:eIssn"];

    let processedTitle = paperTitle;
    try {
      const prompt = `
        Format the following research paper title using HTML <sub> and <sup> tags for chemical formulas and scientific notation:
        "${paperTitle}"
        
        Example: H2O -> H<sub>2</sub>O, La2Ni -> La<sub>2</sub>Ni, 10^-3 -> 10<sup>-3</sup>.
        Return ONLY the formatted string. No extra text or markdown.
      `;
      
      console.log("OpenRouter: Formatting title...");
      const text = await callOpenRouter({ prompt });
      if (text && text.trim().length > 5) processedTitle = text.trim();
    } catch (e) {
      console.error("OpenRouter Title Formatting Error:", e);
    }

    return {
      success: true,
      data: {
        title: processedTitle,
        paperTitle: processedTitle,
        journalName,
        publicationMonth,
        publicationYear,
        isPuNameInPublication,
        printIssn: printIssn || '',
        electronicIssn: electronicIssn || '',
      },
    };

  } catch (error: any) {
    console.error('Error fetching from ScienceDirect API:', error);
    return { success: false, error: "ScienceDirect fetching is not available right now." };
  }
}
