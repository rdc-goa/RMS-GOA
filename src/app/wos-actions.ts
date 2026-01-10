'use server';

type WoSAuthor = {
  displayName?: string;
  researcherId?: string;
};

type WoSRecord = {
  uid?: string;
  title?: { value?: string };
  source?: {
    sourceTitle?: string;
    issn?: string[];
    eissn?: string[];
  };
  identifiers?: {
    doi?: string;
    issn?: string[];
  };
  publicationInfo?: {
    year?: number;
    volume?: string;
    issue?: string;
    pages?: {
      begin?: string;
      end?: string;
    };
  };
  names?: {
    authors?: WoSAuthor[];
  };
  citations?: {
    count?: number;
    type?: string;
  }[];
  links?: {
    record?: string;
    citedReferences?: string;
    relatedRecords?: string;
  };
};

export async function fetchWosDataByUrl(
  identifier: string,
  claimantName: string,
): Promise<{
  success: boolean;
  data?: {
    paperTitle: string;
    journalName: string;
    publicationYear: string;
    isPuNameInPublication?: boolean;
    printIssn?: string;
    electronicIssn?: string;
    wosUrl?: string;
    publicationType?: string;
    
  };
  error?: string;
  warning?: string;
  claimantIsAuthor?: boolean;
}> {
  const apiKey = process.env.WOS_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: 'Web of Science API key is not configured on the server.',
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
      } catch {}
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

    const paperTitle = record.title?.value ?? '';
    const journalName = record.source?.sourceTitle ?? '';
    const publicationYear = record.publicationInfo?.year
      ? String(record.publicationInfo.year)
      : '';

    const printIssn =
      record.source?.issn?.[0] ?? record.identifiers?.issn?.[0];

    const electronicIssn = record.source?.eissn?.[0];

    const authors = record.names?.authors ?? [];

    const claimantParts = claimantName.trim().toLowerCase().split(/\s+/);
    const claimantLastName = claimantParts.pop() ?? '';
    const claimantFirstInitial = claimantParts[0]?.charAt(0) ?? '';

    const claimantIsAuthor = authors.some((author) => {
      const name = author.displayName?.toLowerCase() ?? '';
      if (!name || !claimantLastName) return false;
      if (name.includes(',')) {
        const [last, first] = name.split(',').map(p => p.trim());
        return (
          last === claimantLastName &&
          (!claimantFirstInitial ||
            first?.startsWith(claimantFirstInitial))
        );
      }
      return name.includes(claimantLastName);
    });

    const isPuNameInPublication = authors.some((author) =>
      author.displayName?.toLowerCase().includes('parul'),
    );


    return {
      success: true,
      data: {
        paperTitle,
        journalName,
        publicationYear,
        isPuNameInPublication,
        printIssn,
        electronicIssn,
        wosUrl: record.links?.record,
        publicationType: 'Journal Article',
   
      },
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
