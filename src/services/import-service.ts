'use server';

import { adminDb, adminStorage, adminAuth } from "@/lib/admin"
import { User, Project, GrantDetails, EmrInterest, ResearchPaper, Author, Notification } from "@/types"
import { logEvent } from "@/lib/logger"
import { FieldValue } from "firebase-admin/firestore"
import { GovernanceLogger } from "@/lib/governance-logger"
import { logActivity, EMAIL_STYLES } from "./utils"
import { sendEmail as sendEmailUtility } from "@/lib/email"
import { getStaffDataAction } from "@/lib/staff-service"
import { checkAuth } from "@/lib/check-auth"

type ProjectData = {
  pi_email: string;
  project_title: string;
  status: string;
  grant_amount: number;
  sanction_date: string;
  Name_of_staff: string;
  Faculty: string;
  Institute: string;
  sanction_number: string;
  Department?: string;
};

function excelDateToJSDate(serial: number) {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  const seconds = total_seconds % 60;
  total_seconds -= seconds;
  const hours = Math.floor(total_seconds / (60 * 60));
  const minutes = Math.floor(total_seconds / 60) % 60;
  return date_info;
}

export async function bulkUploadProjects(
  projectsData: ProjectData[]
): Promise<{
  success: boolean;
  data: {
    successfulCount: number;
    failures: { projectTitle: string; piName: string; error: string }[];
  };
  error?: string;
}> {
  let successfulCount = 0;
  const failures: { projectTitle: string; piName: string; error: string }[] = [];

  for (const row of projectsData) {
    try {
      const {
        pi_email,
        project_title,
        status,
        grant_amount,
        sanction_date,
        Name_of_staff,
        Faculty,
        Institute,
        sanction_number,
        Department,
      } = row;

      if (!pi_email || !project_title || !status) {
        failures.push({ projectTitle: project_title || 'Unknown', piName: Name_of_staff || 'Unknown', error: 'Missing required data.' });
        continue;
      }

      let submissionDate: Date;
      const sancDate = sanction_date as any;
      if (sancDate instanceof Date) {
        submissionDate = sancDate;
      } else if (typeof sancDate === 'number') {
        submissionDate = excelDateToJSDate(sancDate);
      } else {
        submissionDate = new Date();
      }

      const grant: GrantDetails = {
        totalAmount: grant_amount || 0,
        sanctionNumber: sanction_number || '',
        status: grant_amount > 0 ? 'Awarded' : 'In Progress',
        phases: grant_amount > 0 ? [{
          id: new Date().toISOString(),
          name: "Phase 1",
          amount: grant_amount,
          status: "Disbursed",
          disbursementDate: submissionDate.toISOString(),
          transactions: []
        }] : []
      };

      const project: Omit<Project, 'id'> = {
        title: project_title,
        pi: Name_of_staff,
        pi_email: pi_email,
        faculty: Faculty,
        institute: Institute,
        departmentName: Department || '',
        submissionDate: submissionDate.toISOString(),
        sanctionDate: status === 'Sanctioned' || status === 'In Progress' || status === 'Completed' ? submissionDate.toISOString() : undefined,
        seedMoneyReceivedDate: grant_amount > 0 ? submissionDate.toISOString() : undefined,
        status: status as Project['status'],
        type: 'Unidisciplinary',
        abstract: 'Historical project data uploaded via bulk process.',
        timelineAndOutcomes: 'Historically uploaded data.',
        pi_uid: '',
        isBulkUploaded: true,
        grant: status !== 'Not Recommended' ? grant : undefined,
        teamInfo: JSON.stringify({ coPi: [], subInv: [] })
      };

      await adminDb.collection('projects').add(project);
      successfulCount++;
    } catch (error: any) {
      failures.push({ projectTitle: row.project_title, piName: row.Name_of_staff, error: error.message || 'An unknown error occurred.' });
    }
  }

  await logActivity('INFO', 'Bulk project upload completed', { successfulCount, failureCount: failures.length });
  
  await GovernanceLogger.logPolicyTrace({
      policyName: 'BULK_PROJECT_IMPORT',
      entityId: `BATCH-${new Date().getTime()}`,
      inputs: { rowCount: projectsData.length },
      outputs: { successfulCount, failureCount: failures.length },
      logicVersion: '1.0.1'
  });

  await logEvent('MIGRATION', 'Bulk project upload operated', {
    metadata: { successfulCount, failureCount: failures.length },
    status: failures.length === 0 ? 'success' : 'warning',
    user: { uid: 'system', email: 'system@rdc', role: 'Super-admin' }
  });

  return { success: true, data: { successfulCount, failures } };
}

export async function linkHistoricalData(
  userData: Partial<User> & { uid: string; email: string },
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { uid, email, institute, department, phoneNumber } = userData
    if (!uid || !email) return { success: false, count: 0, error: "User UID and Email are required." }

    const projectsRef = adminDb.collection("projects")
    const q = projectsRef.where("pi_email", "==", email).where("pi_uid", "in", ["", null])

    const projectsSnapshot = await q.get()
    if (projectsSnapshot.empty) return { success: true, count: 0 }

    const batch = adminDb.batch()
    projectsSnapshot.forEach((projectDoc) => {
      const updateData: { [key: string]: any } = { pi_uid: uid }
      if (institute) updateData.institute = institute
      if (department) updateData.departmentName = department
      if (phoneNumber) updateData.pi_phoneNumber = phoneNumber
      batch.update(projectDoc.ref, updateData)
    })

    await batch.commit()
    await logActivity("INFO", "Linked historical data for new user", { uid, email, count: projectsSnapshot.size })
    return { success: true, count: projectsSnapshot.size }
  } catch (error: any) {
    console.error("Error linking historical project data:", error)
    return { success: false, count: 0, error: error.message }
  }
}

export async function linkEmrInterestsToNewUser(
  uid: string,
  email: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!uid || !email) return { success: false, count: 0, error: "IDs required." }
    const lowercasedEmail = email.toLowerCase()
    const interestsRef = adminDb.collection("emrInterests")
    const q = interestsRef.where("userEmail", "==", lowercasedEmail).where("userId", "in", ["", null])
    const snapshot = await q.get()
    if (snapshot.empty) return { success: true, count: 0 }

    const batch = adminDb.batch()
    snapshot.forEach((doc) => batch.update(doc.ref, { userId: uid }))
    await batch.commit()
    return { success: true, count: snapshot.size }
  } catch (error: any) {
    return { success: false, count: 0, error: "Failed to link EMR interests." }
  }
}

export async function linkEmrCoPiInterestsToNewUser(
  uid: string,
  email: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const lowercasedEmail = email.toLowerCase()
    const interestsRef = adminDb.collection("emrInterests")
    const q = interestsRef.where("coPiEmails", "array-contains", lowercasedEmail)
    const snapshot = await q.get()
    if (snapshot.empty) return { success: true, count: 0 }

    const batch = adminDb.batch()
    let updatedCount = 0
    snapshot.forEach((doc) => {
      const interest = doc.data() as EmrInterest
      let needsUpdate = false
      const updatedCoPiDetails = (interest.coPiDetails || []).map((coPi) => {
        if (coPi.email.toLowerCase() === lowercasedEmail && !coPi.uid) {
          needsUpdate = true
          return { ...coPi, uid: uid }
        }
        return coPi
      })
      if (needsUpdate) {
        const updatedCoPiUids = [...new Set([...(interest.coPiUids || []), uid])]
        batch.update(doc.ref, { coPiDetails: updatedCoPiDetails, coPiUids: updatedCoPiUids })
        updatedCount++
      }
    })
    if (updatedCount > 0) await batch.commit()
    return { success: true, count: updatedCount }
  } catch (error: any) {
    return { success: false, count: 0, error: "Failed to link EMR Co-PI interests." }
  }
}

export async function linkEmrInterestsByMisId(
  uid: string,
  misId: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const interestsRef = adminDb.collection("emrInterests")
    const snapshot = await interestsRef.get()
    if (snapshot.empty) return { success: true, count: 0 }

    const batch = adminDb.batch()
    let updatedCount = 0
    snapshot.forEach((doc) => {
      const interest = doc.data() as EmrInterest
      let needsUpdate = false
      const updatedCoPiDetails = (interest.coPiDetails || []).map((coPi) => {
        if (coPi.misId === misId && !coPi.uid) {
          needsUpdate = true
          return { ...coPi, uid: uid }
        }
        return coPi
      })
      if (needsUpdate) {
        const updatedCoPiUids = [...new Set([...(interest.coPiUids || []), uid])]
        batch.update(doc.ref, { coPiDetails: updatedCoPiDetails, coPiUids: updatedCoPiUids })
        updatedCount++
      }
    })
    if (updatedCount > 0) await batch.commit()
    return { success: true, count: updatedCount }
  } catch (error: any) {
    return { success: false, count: 0, error: "Failed to link EMR Co-PI interests by MIS ID." }
  }
}

export async function linkPapersToNewUser(
  uid: string,
  email: string,
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    if (!uid || !email) return { success: false, count: 0, error: "IDs required." }
    const lowercasedEmail = email.toLowerCase()
    const snapshot = await adminDb.collection("papers").where("authorEmails", "array-contains", lowercasedEmail).get()
    
    if (snapshot.empty) return { success: true, count: 0 }

    const batch = adminDb.batch()
    let updatedCount = 0
    snapshot.forEach((doc) => {
      const paper = doc.data() as ResearchPaper
      let needsUpdate = false
      const updatedAuthors = (paper.authors || []).map((author) => {
        if (author.email.toLowerCase() === lowercasedEmail && !author.uid) {
          needsUpdate = true
          return { ...author, uid, isExternal: false }
        }
        return author
      })
      if (needsUpdate) {
        const updatedAuthorUids = [...new Set([...(paper.authorUids || []), uid])]
        batch.update(doc.ref, { authors: updatedAuthors, authorUids: updatedAuthorUids })
        updatedCount++
      }
    })
    if (updatedCount > 0) await batch.commit()
    return { success: true, count: updatedCount }
  } catch (error: any) {
    console.error("Error linking papers:", error)
    return { success: false, count: 0, error: "Failed to link papers." }
  }
}

// --- Migrated Logic from bulkpapers.ts ---

export async function checkUserOrStaff(email: string): Promise<{ success: boolean; name: string | null; uid: string | null }> {
  try {
    const lowercasedEmail = email.toLowerCase();
    const usersRef = adminDb.collection('users');
    const userSnapshot = await usersRef.where('email', '==', lowercasedEmail).get();
    if (!userSnapshot.empty) {
      const userDoc = userSnapshot.docs[0];
      return { success: true, name: userDoc.data().name, uid: userDoc.id };
    }
    const staffResults = await getStaffDataAction({ email: lowercasedEmail });
    if (staffResults.length > 0) return { success: true, name: staffResults[0].name, uid: null }; 
    return { success: true, name: null, uid: null };
  } catch (error) {
    return { success: false, name: null, uid: null };
  }
}

export async function addResearchPaper(paperData: Pick<ResearchPaper, 'title' | 'url' | 'mainAuthorUid' | 'authors' | 'journalName' | 'journalWebsite' | 'qRating' | 'impactFactor'>): Promise<{ success: boolean; paper?: ResearchPaper; error?: string }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: 'Unauthorized.' };
    const isAdmin = session.role === 'admin' || session.role === 'Super-admin';

    const firstAuthor = paperData.authors.find(a => a.role === 'First Author' || a.role === 'First & Corresponding Author');
    const mainAuthorUid = firstAuthor?.uid || paperData.mainAuthorUid;
    if (!mainAuthorUid) return { success: false, error: "A main author is required." };
    
    // Ensure the caller is creating a paper for themselves unless they are an admin
    if (!isAdmin && !paperData.authors.some(a => a.uid === session.uid)) {
        return { success: false, error: 'Unauthorized. You must be an author of this paper.' };
    }

    const paperRef = adminDb.collection('papers').doc();
    const now = new Date().toISOString();

    const newPaperData: Omit<ResearchPaper, 'id'> = {
      ...paperData, mainAuthorUid, authorUids: paperData.authors.map(a => a.uid).filter(Boolean) as string[],
      authorEmails: paperData.authors.map(a => a.email.toLowerCase()), createdAt: now, updatedAt: now,
    };
    await paperRef.set(newPaperData);

    const mainAuthorDoc = await adminDb.collection('users').doc(mainAuthorUid!).get();
    const mainAuthorName = mainAuthorDoc.exists ? (mainAuthorDoc.data() as User).name : 'A colleague';
    const mainAuthorMisId = mainAuthorDoc.exists ? (mainAuthorDoc.data() as User).misId : null;
    const profileLink = (mainAuthorDoc.data() as User)?.campus === 'Goa' ? `/goa/${mainAuthorMisId}` : `/profile/${mainAuthorMisId}`;

    const batch = adminDb.batch();
    paperData.authors.forEach((author) => {
      if (author.uid && author.uid !== mainAuthorUid) {
        batch.set(adminDb.collection('notifications').doc(), {
          uid: author.uid, title: `${mainAuthorName} added you as a co-author on paper: "${paperData.title}"`,
          createdAt: now, isRead: false, projectId: mainAuthorMisId ? profileLink : `/dashboard/my-projects`,
        });
      }
    });
    await batch.commit();
    return { success: true, paper: { id: paperRef.id, ...newPaperData } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateResearchPaper(
  paperId: string,
  userId: string,
  paperData: Partial<ResearchPaper>
): Promise<{ success: boolean; paper?: ResearchPaper; error?: string }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: 'Unauthorized.' };
    const isAdmin = session.role === 'admin' || session.role === 'Super-admin';

    if (!isAdmin && session.uid !== userId) {
        return { success: false, error: 'Unauthorized.' };
    }

    const paperRef = adminDb.collection("papers").doc(paperId)
    const paperSnap = await paperRef.get()
    if (!paperSnap.exists) return { success: false, error: "Paper not found." }
    
    const existingPaper = paperSnap.data() as ResearchPaper
    // Check if user is main author or has admin role (admin check usually handled in caller)
    if (existingPaper.mainAuthorUid !== userId) {
        const isAuthorizedAuthor = existingPaper.authors?.some(a => a.uid === userId && a.status === 'approved');
        if (!isAuthorizedAuthor) return { success: false, error: "Unauthorized to update this paper." }
    }

    const updateData: any = {
      ...paperData,
      updatedAt: new Date().toISOString(),
    }

    if (paperData.authors) {
      updateData.authorUids = paperData.authors.map(a => a.uid).filter(Boolean) as string[]
      updateData.authorEmails = paperData.authors.map(a => a.email.toLowerCase())
    }

    await paperRef.update(updateData)
    await logActivity("INFO", "Research paper updated", { paperId, title: existingPaper.title, userId })
    
    const updatedSnap = await paperRef.get();
    return { success: true, paper: { id: updatedSnap.id, ...updatedSnap.data() } as ResearchPaper };
  } catch (error: any) {
    console.error("Error updating research paper:", error)
    return { success: false, error: error.message || "Failed to update research paper." }
  }
}

export async function deleteResearchPaper(paperId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await checkAuth();
    if (!session.authenticated) return { success: false, error: 'Unauthorized.' };
    const isAdmin = session.role === 'admin' || session.role === 'Super-admin';

    if (!isAdmin && session.uid !== userId) {
        return { success: false, error: 'Unauthorized.' };
    }

    const paperRef = adminDb.collection('papers').doc(paperId);
    const paperSnap = await paperRef.get();
    if (!paperSnap.exists) return { success: false, error: "Not found." };
    if ((paperSnap.data() as ResearchPaper).mainAuthorUid !== userId) return { success: false, error: "Unauthorized." };
    
    const claimsSnapshot = await adminDb.collection('incentiveClaims').where('paperId', '==', paperId).limit(1).get();
    if (!claimsSnapshot.empty) return { success: false, error: "Linked to incentive claim." };

    await paperRef.delete();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendCoAuthorRequest(existingPaper: ResearchPaper, requestingUser: User, requesterRole: Author['role']): Promise<{ success: boolean; error?: string }> {
  try {
      const session = await checkAuth();
      if (!session.authenticated) return { success: false, error: 'Unauthorized.' };
      if (session.uid !== requestingUser.uid) return { success: false, error: 'Unauthorized request.' };

      const paperRef = adminDb.collection('papers').doc(existingPaper.id);
      if (existingPaper.authors?.some(a => a.uid === requestingUser.uid && a.status === 'approved')) return { success: false, error: 'Already an author.' };
      const newRequest: Author = { uid: requestingUser.uid, email: requestingUser.email, name: requestingUser.name, role: requesterRole, isExternal: false, status: 'pending' };
      await paperRef.update({ coAuthorRequests: FieldValue.arrayUnion(newRequest) });

      if (existingPaper.mainAuthorUid) {
          await adminDb.collection('notifications').add({
              uid: existingPaper.mainAuthorUid,
              title: `${requestingUser.name} requested to be a ${requesterRole} on "${existingPaper.title}"`,
              createdAt: new Date().toISOString(), isRead: false, type: 'coAuthorRequest', 
              paperId: existingPaper.id, requester: newRequest, projectId: `/dashboard/notifications`
          });
      }
      return { success: true };
  } catch (error: any) {
      return { success: false, error: error.message };
  }
}

export async function bulkUploadPapers(papersData: any[], user: User, roles: Author['role'][]): Promise<{ success: boolean; data: any }> {
  const session = await checkAuth();
  if (!session.authenticated || session.uid !== user.uid) {
      return { success: false, data: { newPapers: [], linkedPapers: [], errors: [{ title: 'All', reason: 'Unauthorized upload' }] } };
  }

  const newPapers: any[] = [];
  const linkedPapers: any[] = [];
  const errors: any[] = [];

  for (const [index, row] of papersData.entries()) {
    const title = row.PublicationTitle?.trim();
    const url = row.PublicationURL?.trim();
    const role = roles[index];
    if (!title || !url || !role) { errors.push({ title: title || 'Untitled', reason: 'Missing info.' }); continue; }

    try {
      const existingSnap = await adminDb.collection('papers').where('url', '==', url).limit(1).get();
      if (!existingSnap.empty) {
        linkedPapers.push({ paper: { id: existingSnap.docs[0].id, ...existingSnap.docs[0].data() }, role });
      } else {
        await addResearchPaper({ title, url, mainAuthorUid: user.uid, authors: [{ uid: user.uid, email: user.email, name: user.name, role, isExternal: false, status: 'approved' }] });
        newPapers.push({ title });
      }
    } catch (error: any) {
      errors.push({ title, reason: error.message });
    }
  }
  return { success: true, data: { newPapers, linkedPapers, errors } };
}

export async function manageCoAuthorRequest(paperId: string, requestingAuthor: Author, action: 'accept' | 'reject', assignedRole?: Author['role'], mainAuthorNewRole?: Author['role']): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await checkAuth();
        if (!session.authenticated) return { success: false, error: 'Unauthorized.' };
        
        const paperRef = adminDb.collection('papers').doc(paperId);
        await adminDb.runTransaction(async (transaction) => {
            const paperSnap = await transaction.get(paperRef);
            if (!paperSnap.exists) throw new Error('Not found.');
            const paperData = paperSnap.data() as ResearchPaper;
            
            const isAdmin = session.role === 'admin' || session.role === 'Super-admin';
            if (!isAdmin && paperData.mainAuthorUid !== session.uid) throw new Error('Unauthorized to manage requests for this paper.');

            const requestToRemove = (paperData.coAuthorRequests || []).find(req => req.uid === requestingAuthor.uid);
            if (!requestToRemove) throw new Error('Request not found.');

            transaction.update(paperRef, { coAuthorRequests: FieldValue.arrayRemove(requestToRemove) });
            if (action === 'accept' && assignedRole) {
                let updatedAuthors = [...(paperData.authors || [])];
                const newAuthor: Author = { ...requestingAuthor, role: assignedRole, status: 'approved' };
                updatedAuthors.push(newAuthor);
                transaction.update(paperRef, { authors: updatedAuthors, authorUids: FieldValue.arrayUnion(newAuthor.uid), authorEmails: FieldValue.arrayUnion(newAuthor.email.toLowerCase()) });
            }
        });
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
