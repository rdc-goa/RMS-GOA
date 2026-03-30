
'use server';

import type { IncentiveClaim } from '@/types';

// This function is designed to fetch publication data from the ScienceDirect API.
export async function fetchScienceDirectData(
  identifier: string,
  claimantName: string
): Promise<{
  success: boolean;
  data?: {
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
        isPuNameInPublication = affiliations.some((affil: any) => affil['affilname']?.toLowerCase().includes('parul'));
    } else if (affiliations && affiliations['affilname']) {
        isPuNameInPublication = (affiliations['affilname'] || '').toLowerCase().includes('parul');
    }

    let printIssn: string | undefined = entry["prism:issn"];
    let electronicIssn: string | undefined = entry["prism:eIssn"];

    return {
      success: true,
      data: {
        paperTitle,
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
