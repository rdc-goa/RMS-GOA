
'use server';

import { adminDb, adminRtdb } from '@/lib/admin';
import type { IncentiveClaim, Author } from '@/types';

type ResearchPaperUploadData = {
  'Title of Paper': string;
  'Email': string;
  'Journal': string;
  'Amount': number;
  'Index': 'Scopus' | 'WOS' | 'Scopus & WOS' | 'ESCI';
  'Date of proof': string | number | Date;
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

  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
}


export async function bulkUploadIncentiveClaims(
  records: any[],
  claimType: string,
  uploadedByUid: string,
): Promise<{ 
    success: boolean; 
    data: {
        successfulClaims: { title: string; userEmail: string; linked: boolean }[];
        totalRecords: number;
        errors: { title: string; reason: string }[];
    };
    error?: string 
}> {
  const errors: { title: string; reason: string }[] = [];
  
  if (claimType !== 'Research Papers') {
      return { 
          success: false, 
          error: 'Bulk upload is currently only supported for Research Papers.',
          data: { successfulClaims: [], totalRecords: records.length, errors: [{ title: 'System', reason: 'Unsupported claim type' }] }
      };
  }

  const paperRecords = records as ResearchPaperUploadData[];
  const rtdbSyncTasks: { id: string, data: any }[] = [];

  const claimsByTitle = paperRecords.reduce((acc, record) => {
    // ... (rest of the reduce logic stays the same)
    const title = record['Title of Paper']?.trim();
    if (!title) {
        errors.push({ title: 'Unknown Title', reason: 'Row missing "Title of Paper".' });
        return acc;
    }
    if (!acc[title]) {
      acc[title] = [];
    }
    acc[title].push(record);
    return acc;
  }, {} as Record<string, ResearchPaperUploadData[]>);

  const successfulClaims: { title: string; userEmail: string; linked: boolean }[] = [];
  const batch = adminDb.batch();
  const usersRef = adminDb.collection('users');
  const claimsRef = adminDb.collection('incentiveClaims');

  for (const title in claimsByTitle) {
    try {
      // ... (rest of the loop logic stays the same)
      const authorRecords = claimsByTitle[title];
      const mainAuthorRecord = authorRecords[0];

      const allAuthorDetails: Author[] = [];
      const authorUids: string[] = [];

      for (const record of authorRecords) {
        const email = record['Email'].toLowerCase();
        let userUid: string | null = null;
        let userName: string = email.split('@')[0];

        const userQuery = await usersRef.where('email', '==', email).limit(1).get();
        if (!userQuery.empty) {
          const userDoc = userQuery.docs[0];
          userUid = userDoc.id;
          userName = userDoc.data().name;
        }

        allAuthorDetails.push({
          uid: userUid,
          email: email,
          name: userName,
          role: 'Co-Author',
          isExternal: false,
          status: 'approved'
        });

        if (userUid) {
            authorUids.push(userUid);
        }
      }

      const mainAuthorDetails = allAuthorDetails[0];
      if (mainAuthorDetails) {
          mainAuthorDetails.role = 'First Author';
      }

      let submissionDate: Date;
      if (mainAuthorRecord['Date of proof'] instanceof Date) {
          submissionDate = mainAuthorRecord['Date of proof'];
      } else if (typeof mainAuthorRecord['Date of proof'] === 'number') {
          submissionDate = excelDateToJSDate(mainAuthorRecord['Date of proof']);
      } else {
          submissionDate = new Date();
      }
      
      const claimData: Omit<IncentiveClaim, 'id' | 'claimId'> = {
        uid: mainAuthorDetails.uid || 'historical_import',
        userName: mainAuthorDetails.name,
        userEmail: mainAuthorDetails.email,
        claimType,
        paperTitle: title,
        journalName: mainAuthorRecord['Journal'],
        indexType: mainAuthorRecord['Index'].toLowerCase().includes('scopus') ? 'scopus' : 'wos',
        status: 'Payment Completed',
        submissionDate: submissionDate.toISOString(),
        benefitMode: 'incentives',
        faculty: 'N/A',
        isPuNameInPublication: true,
        finalApprovedAmount: mainAuthorRecord['Amount'],
        authors: allAuthorDetails,
        authorUids: authorUids
      };
      
      const newClaimRef = claimsRef.doc();
      // We skip batch.set to avoid writing to Firestore
      
      rtdbSyncTasks.push({ id: newClaimRef.id, data: claimData });

      // Add to successful claims list for reporting
      allAuthorDetails.forEach(author => {
          successfulClaims.push({
              title: title,
              userEmail: author.email,
              linked: !!author.uid
          });
      });

    } catch (error: any) {
        errors.push({ title, reason: error.message || 'An unknown error occurred.' });
    }
  }

  try {
      // Sync to Realtime Database
      try {
          const { sanitizeForRtdb } = await import('@/lib/rtdb-utils');
          const syncPromises = rtdbSyncTasks.map(task => {
              const sanitizedData = sanitizeForRtdb({
                  id: task.id,
                  ...task.data,
                  lastSyncedAt: new Date().toISOString()
              });
              return adminRtdb.ref(`incentiveClaims/${task.id}`).set(sanitizedData);
          });
          await Promise.all(syncPromises);
      } catch (rtdbError) {
          console.error("RTDB Bulk Sync Error:", rtdbError);
      }


      await logActivity('INFO', 'Bulk incentive claims processed', { successfulClaimsCount: successfulClaims.length, errors });
      return { 
          success: true, 
          data: {
              successfulClaims,
              totalRecords: records.length,
              errors,
          }
      };
  } catch (error: any) {
      await logActivity('ERROR', 'Failed to commit bulk incentive claims', { error: error.message });
      return { 
          success: false, 
          error: 'Failed to save claims to the database.',
          data: { successfulClaims: [], totalRecords: records.length, errors: [{ title: 'System', reason: error.message }] }
      };
  }

}
