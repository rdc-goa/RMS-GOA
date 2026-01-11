
'use server';

import 'dotenv/config';
import { adminDb } from '@/lib/admin';
import type { User, Author } from '@/types';
import { addResearchPaper } from '@/app/bulkpapers';

const SERP_API_KEY = process.env.SERP_API_KEY;

type ScholarArticle = {
  title: string;
  link: string;
  publication: string;
  // This field contains the author list, journal name, and year.
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

async function findUserByName(name: string): Promise<{ uid: string; email: string; name: string } | null> {
    const usersRef = adminDb.collection('users');
    // This is a basic search. A more advanced implementation might use a search service like Algolia.
    const snapshot = await usersRef.where('name', '>=', name).where('name', '<=', name + '\uf8ff').limit(1).get();
    if (!snapshot.empty) {
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data() as User;
        return { uid: userDoc.id, email: userData.email, name: userData.name };
    }
    return null;
}


export async function fetchAndSaveScholarPublications(
    user: User,
): Promise<{ success: boolean; newPapersCount: number; error?: string }> {
    
    if (!SERP_API_KEY) {
        await logActivity('ERROR', 'SerpApi key is not configured.');
        return { success: false, newPapersCount: 0, error: 'Google Scholar integration is not configured on the server. Please ensure the SERP_API_KEY is in your .env.local file and restart the server.' };
    }

    if (!user.googleScholarId) {
        return { success: false, newPapersCount: 0, error: 'User does not have a Google Scholar ID set.' };
    }

    let allArticles: ScholarArticle[] = [];
    let nextPageUrl: string | undefined = `https://serpapi.com/search.json?engine=google_scholar_author&author_id=${user.googleScholarId}&api_key=${SERP_API_KEY}&num=100`;
    let newPapersCount = 0;

    try {
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

        for (const article of allArticles) {
            if (!article.title || !article.link || !article.publication) {
                continue;
            }

            const existingPaperQuery = await adminDb.collection('papers').where('url', '==', article.link).limit(1).get();
            if (!existingPaperQuery.empty) {
                continue; // Skip if paper already exists
            }

            // Extract author names from the publication string (e.g., "J Doe, S Smith - Journal of Science, 2023")
            const authorString = article.publication.split(' - ')[0];
            const authorNames = authorString.split(',').map(name => name.trim()).filter(Boolean);
            const journalName = article.publication.split(' - ')[1]?.split(',')[0]?.trim() || 'N/A';

            const authors: Author[] = await Promise.all(
              authorNames.map(async (name, index) => {
                const foundUser = await findUserByName(name);
                const role: Author['role'] = index === 0 ? 'First Author' : 'Co-Author';
                return {
                  uid: foundUser?.uid || null,
                  email: foundUser?.email || `${name.toLowerCase().replace(/\s/g, '.')}@external.scholar`,
                  name: name,
                  role: role,
                  isExternal: !foundUser,
                  status: 'approved',
                };
              })
            );

            // Ensure the user initiating the import is in the author list if they were missed
            if (!authors.some(a => a.uid === user.uid)) {
              authors.push({
                uid: user.uid,
                email: user.email,
                name: user.name,
                role: 'Co-Author',
                isExternal: false,
                status: 'approved'
              });
            }

            const addResult = await addResearchPaper({
                title: article.title,
                url: article.link,
                mainAuthorUid: user.uid, // The user performing the action owns the record
                authors: authors,
                journalName: journalName,
            });

            if (addResult.success) {
                newPapersCount++;
            } else {
                await logActivity('WARNING', 'Failed to add a single paper from Scholar fetch', { userId: user.uid, title: article.title, error: addResult.error });
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
