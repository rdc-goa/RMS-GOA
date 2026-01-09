
'use server';

import { adminDb } from '@/lib/admin';
import type { ResearchPaper, Author, User, Notification, IncentiveClaim } from '@/types';
import { FieldValue } from 'firebase-admin/firestore';
import { getResearchDomainSuggestion } from '@/ai/flows/research-domain-suggestion';
import admin from 'firebase-admin';
import { sendEmail } from '@/app/server-actions';

type PaperUploadData = {
    PublicationTitle: string;
    PublicationURL: string;
    PublicationYear?: number;
    PublicationMonthName?: string;
    ImpactFactor?: number;
    JournalName?: string;
    JournalWebsite?: string;
    QRating?: string;
};

const EMAIL_STYLES = {
  background: 'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-WHITE.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: ` 
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University Goa</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`
};

export async function checkUserOrStaff(email: string): Promise<{ success: boolean; name: string | null; uid: string | null }> {
  try {
    const lowercasedEmail = email.toLowerCase();

    // 1. Check existing users in Firestore
    const usersRef = adminDb.collection('users');
    const userQuery = usersRef.where('email', '==', lowercasedEmail);
    const userSnapshot = await userQuery.get();

    if (!userSnapshot.empty) {
      const userDoc = userSnapshot.docs[0];
      const userData = userDoc.data();
      return { success: true, name: userData.name, uid: userDoc.id };
    }

    // 2. Check staffdata via API route
    const baseUrl = process.env.BASE_URL || 'http://localhost:9002';
    const response = await fetch(`${baseUrl}/api/get-staff-data?email=${encodeURIComponent(lowercasedEmail)}`);
    const staffResult = await response.json();
    
    if (staffResult.success && staffResult.data) {
      return { success: true, name: staffResult.data.name, uid: null }; // No UID because they haven't signed up
    }

    // 3. Not found in either
    return { success: true, name: null, uid: null };

  } catch (error) {
    console.error("Error checking user/staff:", error);
    return { success: false, name: null, uid: null };
  }
}

export async function addResearchPaper(
  paperData: Pick<ResearchPaper, 'title' | 'url' | 'mainAuthorUid' | 'authors' | 'journalName' | 'journalWebsite' | 'qRating' | 'impactFactor'>
): Promise<{ success: boolean; paper?: ResearchPaper; error?: string }> {
  try {
    const paperRef = adminDb.collection('papers').doc();
    const now = new Date().toISOString();
    
    const { authors, title } = paperData;

    // Determine the main author based on the "First Author" role
    const firstAuthor = authors.find(a => a.role === 'First Author' || a.role === 'First & Corresponding Author');
    const mainAuthorUid = firstAuthor?.uid || paperData.mainAuthorUid;

    if (!mainAuthorUid) {
        return { success: false, error: "A main author (either the creator or a designated First Author) is required." };
    }

    const authorUids = authors.map((a) => a.uid).filter(Boolean) as string[];
    const authorEmails = authors.map((a) => a.email.toLowerCase());

    const newPaperData: Omit<ResearchPaper, 'id'> = {
      ...paperData,
      mainAuthorUid, // Set the determined main author
      authorUids,
      authorEmails,
      createdAt: now,
      updatedAt: now,
    };
    
    // AI Domain Suggestion
    try {
      if (authorUids.length > 0) {
        const allPapersQuery = await adminDb.collection('papers').where('authorUids', 'array-contains-any', authorUids).get();
        const existingTitles = allPapersQuery.docs.map(doc => doc.data().title);
        const allTitles = [...new Set([title, ...existingTitles])];

        if (allTitles.length > 0) {
          const domainResult = await getResearchDomainSuggestion({ paperTitles: allTitles });
          newPaperData.domain = domainResult.domain;

          const batch = adminDb.batch();
          const userDocs = await adminDb.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', authorUids).get();
            
          userDocs.forEach(doc => {
            batch.update(doc.ref, { researchDomain: domainResult.domain });
          });
          await batch.commit();
        }
      }
    } catch (aiError: any) {
      console.warn("AI domain suggestion failed, but proceeding to save paper. Error:", aiError.message);
    }

    await paperRef.set(newPaperData);

    const mainAuthorDoc = await adminDb.collection('users').doc(mainAuthorUid!).get();
    const mainAuthorData = mainAuthorDoc.exists ? mainAuthorDoc.data() as User : null;
    const mainAuthorName = mainAuthorData?.name || 'A colleague';
    const mainAuthorMisId = mainAuthorData?.misId;
    const mainAuthorCampus = mainAuthorData?.campus;
    
    const profileLink = mainAuthorCampus === 'Goa' ? `/goa/${mainAuthorMisId}` : `/profile/${mainAuthorMisId}`;

    const notificationBatch = adminDb.batch();
    authors.forEach((author) => {
      if (author.uid && author.uid !== mainAuthorUid) {
        const notificationRef = adminDb.collection('notifications').doc();
        notificationBatch.set(notificationRef, {
          uid: author.uid,
          title: `${mainAuthorName} added you as a co-author on the paper: "${title}"`,
          createdAt: new Date().toISOString(),
          isRead: false,
          projectId: mainAuthorMisId ? profileLink : `/dashboard/my-projects`,
        });
      }
    });
    await notificationBatch.commit();

    return { success: true, paper: { id: paperRef.id, ...newPaperData } };

  } catch (error: any) {
    console.error("Error adding research paper:", error);
    return { success: false, error: error.message || "Failed to add research paper." };
  }
}

export async function updateResearchPaper(
  paperId: string,
  userId: string, 
  data: Partial<ResearchPaper>
): Promise<{ success: boolean; paper?: ResearchPaper; error?: string }> {
  try {
    const paperRef = adminDb.collection('papers').doc(paperId);
    const paperSnap = await paperRef.get();

    if (!paperSnap.exists) {
      return { success: false, error: "Paper not found." };
    }

    const paperData = paperSnap.data() as ResearchPaper;
    const oldAuthors = paperData.authors || [];

    if (paperData.mainAuthorUid !== userId) {
      return { success: false, error: "You do not have permission to edit this paper." };
    }
    
    // Determine the new main author if a "First Author" is set
    const firstAuthor = data.authors?.find(a => a.role === 'First Author' || a.role === 'First & Corresponding Author');
    const mainAuthorUid = firstAuthor?.uid || paperData.mainAuthorUid;
    
    const authorUids = data.authors?.map((a) => a.uid).filter(Boolean) as string[] || paperData.authorUids;
    const authorEmails = data.authors?.map((a) => a.email.toLowerCase()) || paperData.authorEmails;

    const updatedData: Partial<ResearchPaper> = {
      ...data,
      mainAuthorUid, // Update main author
      authorUids: authorUids,
      authorEmails: authorEmails,
      updatedAt: new Date().toISOString(),
    };

    await paperRef.update(updatedData);

    const mainAuthorDoc = await adminDb.collection('users').doc(userId).get();
    const mainAuthorData = mainAuthorDoc.exists ? mainAuthorDoc.data() as User : null;
    const mainAuthorName = mainAuthorData?.name || 'A colleague';
    const mainAuthorMisId = mainAuthorData?.misId;
    const mainAuthorCampus = mainAuthorData?.campus;

    const profileLink = mainAuthorCampus === 'Goa' ? `/goa/${mainAuthorMisId}` : `/profile/${mainAuthorMisId}`;

    const oldAuthorUids = new Set(oldAuthors.map(a => a.uid));

    const notificationBatch = adminDb.batch();
    data.authors?.forEach(author => {
      if (author.uid && author.uid !== userId && !oldAuthorUids.has(author.uid)) {
        const notificationRef = adminDb.collection('notifications').doc();
        notificationBatch.set(notificationRef, {
          uid: author.uid,
          title: `${mainAuthorName} added you as a co-author on the paper: "${data.title}"`,
          createdAt: new Date().toISOString(),
          isRead: false,
          projectId: mainAuthorMisId ? profileLink : `/dashboard/my-projects`,
        });
      }
    });
    await notificationBatch.commit();
    
    return { success: true, paper: { ...paperData, ...updatedData, id: paperId } };

  } catch (error: any) {
    console.error("Error updating research paper:", error);
    return { success: false, error: error.message || "Failed to update paper." };
  }
}

export async function deleteResearchPaper(paperId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const paperRef = adminDb.collection('papers').doc(paperId);
    const paperSnap = await paperRef.get();

    if (!paperSnap.exists) {
      return { success: false, error: "Paper not found." };
    }

    const paperData = paperSnap.data() as ResearchPaper;

    if (paperData.mainAuthorUid !== userId) {
      return { success: false, error: "You do not have permission to delete this paper." };
    }

    // Check for associated incentive claims
    const claimsRef = adminDb.collection('incentiveClaims');
    const claimsQuery = claimsRef.where('paperId', '==', paperId).limit(1);
    const claimsSnapshot = await claimsQuery.get();

    if (!claimsSnapshot.empty) {
        return { success: false, error: "This paper cannot be deleted because it is linked to an incentive claim." };
    }

    await paperRef.delete();
    return { success: true };

  } catch (error: any) {
    console.error("Error deleting research paper:", error);
    return { success: false, error: error.message || "Failed to delete paper." };
  }
}


async function findExistingPaper(title: string, url: string): Promise<ResearchPaper | null> {
    const papersRef = adminDb.collection('papers');
    const titleQuery = papersRef.where('title', '==', title);
    const urlQuery = papersRef.where('url', '==', url);

    const [titleSnapshot, urlSnapshot] = await Promise.all([
        titleQuery.get(),
        urlQuery.get()
    ]);

    if (!titleSnapshot.empty) {
        return { id: titleSnapshot.docs[0].id, ...titleSnapshot.docs[0].data() } as ResearchPaper;
    }
    if (!urlSnapshot.empty) {
        return { id: urlSnapshot.docs[0].id, ...urlSnapshot.docs[0].data() } as ResearchPaper;
    }

    return null;
}

export async function sendCoAuthorRequest(
    existingPaper: ResearchPaper, 
    requestingUser: User, 
    requesterRole: Author['role']
): Promise<{ success: boolean; error?: string }> {
    try {
        const paperRef = adminDb.collection('papers').doc(existingPaper.id);
        
        const isAlreadyAuthor = existingPaper.authors?.some(a => a.uid === requestingUser.uid && a.status === 'approved');
        const isAlreadyRequested = existingPaper.coAuthorRequests?.some(a => a.uid === requestingUser.uid);

        if (isAlreadyAuthor || isAlreadyRequested) {
            return { success: false, error: 'You are already an author or have a pending request for this paper.' };
        }

        const newAuthorRequest: Author = {
            uid: requestingUser.uid,
            email: requestingUser.email,
            name: requestingUser.name,
            role: requesterRole, 
            isExternal: false,
            status: 'pending',
        };
        
        await paperRef.update({
            coAuthorRequests: FieldValue.arrayUnion(newAuthorRequest),
        });

        if (existingPaper.mainAuthorUid) {
            const mainAuthorDoc = await adminDb.collection('users').doc(existingPaper.mainAuthorUid).get();
            const mainAuthorData = mainAuthorDoc.exists ? mainAuthorDoc.data() as User : null;
            const profileLink = `/dashboard/notifications`;
            
            const notification: Omit<Notification, 'id'> = {
                uid: existingPaper.mainAuthorUid,
                title: `${requestingUser.name} has requested to be added as a ${requesterRole} on your paper: "${existingPaper.title}"`,
                createdAt: new Date().toISOString(),
                isRead: false,
                type: 'coAuthorRequest',
                paperId: existingPaper.id,
                requester: newAuthorRequest,
                projectId: profileLink,
            };
            await adminDb.collection('notifications').add(notification);
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error sending co-author request:', error);
        return { success: false, error: error.message || 'Server error while sending request.' };
    }
}


async function createNewPaper(paperData: PaperUploadData, user: User, role: Author['role']): Promise<ResearchPaper> {
    const mainAuthor: Author = {
        uid: user.uid,
        email: user.email,
        name: user.name,
        role: role,
        isExternal: false,
        status: 'approved',
    };

    const result = await addResearchPaper({
        title: paperData.PublicationTitle,
        url: paperData.PublicationURL,
        mainAuthorUid: user.uid,
        authors: [mainAuthor],
        journalName: paperData.JournalName ?? null,
        journalWebsite: paperData.JournalWebsite ?? null,
        qRating: paperData.QRating ?? null,
        impactFactor: paperData.ImpactFactor ?? null,
    });
    
    if (!result.success || !result.paper) {
        throw new Error(result.error || "Failed to create new paper.");
    }
    
    return result.paper;
}


export async function bulkUploadPapers(
  papersData: PaperUploadData[],
  user: User,
  roles: Author['role'][]
): Promise<{ 
    success: boolean; 
    data: {
        newPapers: { title: string }[];
        linkedPapers: { paper: ResearchPaper, role: Author['role'] }[];
        errors: { title: string; reason: string }[];
    };
    error?: string 
}> {
  const newPapers: { title: string }[] = [];
  const linkedPapers: { paper: ResearchPaper, role: Author['role'] }[] = [];
  const errors: { title: string; reason: string }[] = [];

  for (const [index, row] of papersData.entries()) {
    const title = row.PublicationTitle?.trim();
    const url = row.PublicationURL?.trim();
    const role = roles[index];

    if (!title || !url) {
      errors.push({ title: title || 'Untitled', reason: 'Missing title or URL.' });
      continue;
    }
    if (!role) {
      errors.push({ title, reason: 'Missing role for this paper.' });
      continue;
    }

    try {
      const existingPaper = await findExistingPaper(title, url);

      if (existingPaper) {
        linkedPapers.push({ paper: existingPaper, role: role });
      } else {
        await createNewPaper(row, user, role);
        newPapers.push({ title });
      }
    } catch (error: any) {
      console.error(`Error processing paper "${title}":`, error);
      errors.push({ title, reason: error.message || "An unknown server error occurred." });
    }
  }

  return { success: true, data: { newPapers, linkedPapers, errors } };
}

export async function manageCoAuthorRequest(
    paperId: string,
    requestingAuthor: Author,
    action: 'accept' | 'reject',
    assignedRole?: Author['role'],
    mainAuthorNewRole?: Author['role']
): Promise<{ success: boolean; error?: string }> {
    try {
        const paperRef = adminDb.collection('papers').doc(paperId);
        
        const result = await adminDb.runTransaction(async (transaction) => {
            const paperSnap = await transaction.get(paperRef);
            if (!paperSnap.exists) {
                throw new Error('Paper not found.');
            }
            const paperData = paperSnap.data() as ResearchPaper;
            const mainAuthorUid = paperData.mainAuthorUid;
            const mainAuthor = paperData.authors.find(a => a.uid === mainAuthorUid);
            if (!mainAuthor) {
                throw new Error('Main author not found on paper.');
            }

            const requestToRemove = (paperData.coAuthorRequests || []).find(req => req.uid === requestingAuthor.uid && req.email === requestingAuthor.email);
            if (!requestToRemove) {
                throw new Error('This co-author request was not found. It may have been withdrawn or already processed.');
            }

            // Always remove the request from the array
            transaction.update(paperRef, { coAuthorRequests: FieldValue.arrayRemove(requestToRemove) });

            if (action === 'accept' && assignedRole) {
                let currentAuthors = paperData.authors || [];
                let newMainAuthorUid = paperData.mainAuthorUid;

                if (mainAuthorNewRole && mainAuthorUid) {
                    const mainAuthorIndex = currentAuthors.findIndex(author => author.uid === mainAuthorUid);
                    if (mainAuthorIndex !== -1) {
                        currentAuthors[mainAuthorIndex].role = mainAuthorNewRole;
                    }
                }
                
                const newAuthor: Author = { ...requestingAuthor, role: assignedRole, status: 'approved' };
                const updatedAuthors = [...currentAuthors, newAuthor];
                
                const firstAuthor = updatedAuthors.find(a => a.role === 'First Author' || a.role === 'First & Corresponding Author');
                if (firstAuthor && firstAuthor.uid) {
                    newMainAuthorUid = firstAuthor.uid;
                }
                
                const updatedAuthorUids = [...new Set([...(paperData.authorUids || []), newAuthor.uid])].filter(Boolean) as string[];
                const updatedAuthorEmails = [...new Set([...(paperData.authorEmails || []), newAuthor.email.toLowerCase()])];

                transaction.update(paperRef, {
                    authors: updatedAuthors,
                    authorUids: updatedAuthorUids,
                    authorEmails: updatedAuthorEmails,
                    mainAuthorUid: newMainAuthorUid, // Update main author if a first author is set
                });
            }
            
            return { paper: paperData, mainAuthor };
        });

        const { paper, mainAuthor } = result;
        const mainAuthorName = mainAuthor.name;

        // --- Send Notifications Outside Transaction ---
        if (requestingAuthor.uid) {
            const notificationTitle = action === 'accept'
                ? `${mainAuthorName} accepted your request to be a ${assignedRole} on "${paper.title}"`
                : `${mainAuthorName} rejected your co-author request for "${paper.title}"`;
            
            const notification: Omit<Notification, 'id'> = {
                uid: requestingAuthor.uid,
                title: notificationTitle,
                createdAt: new Date().toISOString(),
                isRead: false,
                type: 'default',
            };
            await adminDb.collection('notifications').add(notification);
            
            const acceptedHtml = `
                <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <p style="color:#ffffff;">Dear ${requestingAuthor.name},</p>
                    <p style="color:#e0e0e0;">
                        This is to inform you that ${mainAuthorName} has <strong>accepted</strong> your request to be added as a
                        <strong style="color:#ffffff;">${assignedRole}</strong> on the paper titled:
                        <br>
                        "<strong style="color:#ffffff;">${paper.title}</strong>".
                    </p>
                    <p style="color:#e0e0e0;">You have been successfully added to the list of authors.</p>
                    <p style="color:#e0e0e0;">
                        You can view your updated publication list on the 
                        <a href="${process.env.BASE_URL}/dashboard/my-projects" style="color:#64b5f6; text-decoration:underline;">
                          PU Goa Research Projects Portal
                        </a>.
                    </p>
                    ${EMAIL_STYLES.footer}
                </div>
            `;
            
            const rejectedHtml = `
                 <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <p style="color:#ffffff;">Dear ${requestingAuthor.name},</p>
                    <p style="color:#e0e0e0;">
                        This is an update regarding your co-author request for the paper titled:
                        <br>
                        "<strong style="color:#ffffff;">${paper.title}</strong>".
                    </p>
                    <p style="color:#e0e0e0;">
                        ${mainAuthorName} has <strong>rejected</strong> your request.
                    </p>
                     <p style="color:#e0e0e0;">If you believe this is a mistake, please contact the main author directly.</p>
                    ${EMAIL_STYLES.footer}
                </div>
            `;

            
            await sendEmail({
                to: requestingAuthor.email,
                subject: `Update on your co-author request for "${paper.title}"`,
                html: action === 'accept' ? acceptedHtml : rejectedHtml,
                from: 'default'
            });
        }

        return { success: true };

    } catch (error: any) {
        console.error("Error managing co-author request:", error);
        return { success: false, error: error.message || 'Server error.' };
    }
}

    
