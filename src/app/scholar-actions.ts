
'use server';

import { adminDb } from '@/lib/admin';
import type { User, Author } from '@/types';
import { addResearchPaper } from '@/app/bulkpapers';

const SERP_API_KEY = process.env.SERP_API_KEY;

// Type definitions based on SerpApi's Google Scholar organic_results
type ScholarResult = {
  title: string;
  link: string;
  publication_info: {
    summary: string;
  };
  // other fields exist but we only need these
};

async function logActivity(level: 'INFO' | 'WARNING' | 'ERROR', message: string, context: Record<string, any> = {}) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };
    await adminDb.collection('logs').add(logEntry);
  } catch (error) {
    console.error("FATAL: Failed to write to logs collection.", error);
  }
}

/**
 * Fetches publications from a user's Google Scholar profile and saves them to the database.
 * @param user The user object for whom to fetch publications. Must have a googleScholarId.
 * @returns An object indicating success, the number of new papers added, and any errors.
 */
export async function fetchAndSaveScholarPublications(
    user: User,
): Promise<{ success: boolean; newPapersCount: number; error?: string }> {
    
    // Debugging line to check if the key is loaded on the server
    console.log("Server-side check: SERP_API_KEY is", SERP_API_KEY ? "loaded" : "NOT loaded");

    if (!SERP_API_KEY) {
        await logActivity('ERROR', 'SerpApi key is not configured.');
        return { success: false, newPapersCount: 0, error: 'Google Scholar integration is not configured on the server. The server may need to be restarted to load the API key.' };
    }

    if (!user.googleScholarId) {
        return { success: false, newPapersCount: 0, error: 'User does not have a Google Scholar ID set.' };
    }

    let allResults: ScholarResult[] = [];
    let nextPageUrl = `https://serpapi.com/search.json?engine=google_scholar_author&author_id=${user.googleScholarId}&api_key=${SERP_API_KEY}`;
    let newPapersCount = 0;

    try {
        // Loop through paginated results from SerpApi
        while (nextPageUrl) {
            const response = await fetch(nextPageUrl);
            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(errorBody.error || 'Failed to fetch data from SerpApi.');
            }
            const data = await response.json();
            allResults = allResults.concat(data.articles || []);
            
            // Check for next page
            const pagination = data.serpapi_pagination;
            nextPageUrl = pagination?.next;
        }
        
        await logActivity('INFO', 'Fetched Google Scholar data', { userId: user.uid, totalResults: allResults.length });

        // Check if any results were found
        if (allResults.length === 0) {
            return { success: true, newPapersCount: 0 };
        }

        // Process each article
        for (const article of allResults) {
            if (!article.title || !article.link) {
                continue; // Skip if essential data is missing
            }
            
            const existingPaperQuery = await adminDb.collection('papers')
                .where('url', '==', article.link)
                .limit(1)
                .get();

            if (existingPaperQuery.empty) {
                // If the paper doesn't exist, add it
                const author: Author = {
                    uid: user.uid,
                    email: user.email,
                    name: user.name,
                    role: 'First Author', // Default role, user can edit later
                    isExternal: false,
                    status: 'approved'
                };
                
                const addResult = await addResearchPaper({
                    title: article.title,
                    url: article.link,
                    mainAuthorUid: user.uid,
                    authors: [author],
                    journalName: article.publication_info?.summary || 'N/A',
                });
                
                if (addResult.success) {
                    newPapersCount++;
                } else {
                    await logActivity('WARNING', 'Failed to add a single paper from Scholar fetch', { userId: user.uid, title: article.title, error: addResult.error });
                }
            }
        }
        
        await logActivity('INFO', 'Completed Google Scholar import', { userId: user.uid, newPapersAdded: newPapersCount });
        return { success: true, newPapersCount };

    } catch (error: any) {
        console.error('Error fetching/saving Google Scholar publications:', error);
        await logActivity('ERROR', 'Failed to fetch/save Google Scholar publications', { userId: user.uid, error: error.message, stack: error.stack });
        return { success: false, newPapersCount: 0, error: error.message };
    }
}
