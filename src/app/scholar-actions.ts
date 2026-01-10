
'use server';

import { adminDb } from '@/lib/admin';
import type { User, Author, ResearchPaper } from '@/types';
import { addResearchPaper } from '@/app/bulkpapers';

const SERP_API_KEY = process.env.SERP_API_KEY;

// Type definitions based on SerpApi's Google Scholar Author API results
type ScholarArticle = {
  title: string;
  link: string;
  publication: string;
  authors?: string;
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
    
    if (!SERP_API_KEY) {
        await logActivity('ERROR', 'SerpApi key is not configured.');
        return { success: false, newPapersCount: 0, error: 'Google Scholar integration is not configured on the server. Please ensure the SERP_API_KEY is in your .env file and restart the server.' };
    }

    if (!user.googleScholarId) {
        return { success: false, newPapersCount: 0, error: 'User does not have a Google Scholar ID set.' };
    }

    let allArticles: ScholarArticle[] = [];
    let nextPageUrl: string | undefined = `https://serpapi.com/search.json?engine=google_scholar_author&author_id=${user.googleScholarId}&api_key=${SERP_API_KEY}&num=100`;
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
            allArticles = allArticles.concat(data.articles || []);
            nextPageUrl = data.serpapi_pagination?.next;
        }
        
        await logActivity('INFO', 'Fetched Google Scholar data', { userId: user.uid, totalResults: allArticles.length });

        if (allArticles.length === 0) {
            return { success: true, newPapersCount: 0 };
        }

        const allUserDocs = await adminDb.collection('users').get();
        const allUsers = allUserDocs.docs.map(doc => doc.data() as User);

        for (const article of allArticles) {
            if (!article.title || !article.link) {
                continue; 
            }
            
            const existingPaperQuery = await adminDb.collection('papers').where('url', '==', article.link).limit(1).get();

            if (existingPaperQuery.empty) {
                const authorString = article.authors || '';
                const authorNames = authorString.split(',').map((name: string) => name.trim());
                
                const authors: Author[] = authorNames.map((name, index) => {
                    const matchedUser = allUsers.find(u => u.name.toLowerCase() === name.toLowerCase());
                    return {
                        uid: matchedUser?.uid || null,
                        email: matchedUser?.email || `${name.toLowerCase().replace(/\s/g, '.')}@external.scholar`,
                        name: name,
                        role: index === 0 ? 'First Author' : 'Co-Author',
                        isExternal: !matchedUser,
                        status: 'approved',
                    };
                });
                
                const addResult = await addResearchPaper({
                    title: article.title,
                    url: article.link,
                    mainAuthorUid: user.uid,
                    authors: authors,
                    journalName: article.publication ? article.publication.split(',')[0].trim() : 'N/A', // Extract journal name
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
