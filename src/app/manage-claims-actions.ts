

'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, User } from '@/types';
import { sendEmail as sendEmailUtility } from "@/lib/email";
import ExcelJS from 'exceljs';
import { getSystemSettings } from './server-actions';
import { format } from 'date-fns';
import { FieldPath } from 'firebase-admin/firestore';

// --- Centralized Logging Service ---
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

const EMAIL_STYLES = {
  background:
    'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
  logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/RDC-PU-LOGO-WHITE.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
  footer: ` 
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`,
};


export async function markPaymentsCompleted(claimIds: string[]): Promise<{ success: boolean; error?: string }> {
  if (!claimIds || claimIds.length === 0) {
    return { success: false, error: 'No claim IDs provided.' };
  }

  try {
    const claimsRef = adminDb.collection('incentiveClaims');
    const batch = adminDb.batch();
    
    const claimsQuery = await claimsRef.where(FieldPath.documentId(), 'in', claimIds).get();
    
    for (const doc of claimsQuery.docs) {
      const claim = { id: doc.id, ...doc.data() } as IncentiveClaim;
      
      if(claim.status !== 'Submitted to Accounts') {
          console.warn(`Skipping claim ${claim.id} for payment completion as its status is not 'Submitted to Accounts'.`);
          continue;
      }
      
      // Update status in the batch
      batch.update(doc.ref, { status: 'Payment Completed' });
      
      // Prepare notification and email
      const claimTitle = claim.paperTitle || claim.publicationTitle || claim.patentTitle || 'your recent incentive claim';

      const notification = {
        uid: claim.uid,
        title: `Payment for your claim "${claimTitle}" has been processed.`,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      const notificationRef = adminDb.collection('notifications').doc();
      batch.set(notificationRef, notification);

      if (claim.userEmail) {
        const emailHtml = `
            <div ${EMAIL_STYLES.background}>
                ${EMAIL_STYLES.logo}
                <p style="color:#ffffff;">Dear ${claim.userName},</p>
                <p style="color:#e0e0e0;">
                    We are pleased to inform you that the payment for your incentive claim for "<strong style="color:#ffffff;">${claimTitle}</strong>" has been successfully processed.
                </p>
                <p style="color:#e0e0e0;">
                    The approved amount of <strong style="color:#ffffff;">₹${claim.finalApprovedAmount?.toLocaleString('en-IN') || 'N/A'}</strong> has been disbursed to your registered bank account.
                </p>
                <p style="color:#e0e0e0;">Thank you for your contribution to research at Parul University.</p>
                ${EMAIL_STYLES.footer}
            </div>
        `;
        
        await sendEmailUtility({
            to: claim.userEmail,
            subject: `Payment Processed for Your Incentive Claim`,
            html: emailHtml,
            from: 'default'
        });
      }
    }

    await batch.commit();
    await logActivity('INFO', 'Marked incentive payments as completed', { claimIds, count: claimIds.length });

    return { success: true };
  } catch (error: any) {
    console.error('Error marking payments as completed:', error);
    await logActivity('ERROR', 'Failed to mark payments as completed', { claimIds, error: error.message });
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}

export async function submitToAccounts(claimIds: string[]): Promise<{ success: boolean; error?: string }> {
  if (!claimIds || claimIds.length === 0) {
    return { success: false, error: 'No claim IDs provided.' };
  }
  
  try {
    const claimsRef = adminDb.collection('incentiveClaims');
    const batch = adminDb.batch();
    
    const claimsQuery = await claimsRef.where(FieldPath.documentId(), 'in', claimIds).get();
    
    for (const doc of claimsQuery.docs) {
        const claim = doc.data() as IncentiveClaim;
        if(claim.status !== 'Accepted') {
            console.warn(`Skipping claim ${doc.id} for submission to accounts as its status is not 'Accepted'.`);
            continue;
        }
        batch.update(doc.ref, { status: 'Submitted to Accounts' });
    }

    await batch.commit();
    await logActivity('INFO', 'Submitted claims to accounts', { claimIds, count: claimIds.length });

    return { success: true };
  } catch (error: any) {
    console.error('Error submitting claims to accounts:', error);
    await logActivity('ERROR', 'Failed to submit claims to accounts', { claimIds, error: error.message });
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}


function getInstituteAcronym(name?: string): string {
    if (!name) return '';

    const acronymMap: { [key: string]: string } = {
        'Parul Institute of Ayurved and Research': 'PIAR (Ayu.)',
        'Parul Institute of Architecture & Research': 'PIAR (Arc.)',
        'Parul Institute of Ayurved': 'PIA (Ayu.)',
        'Parul Institute of Arts': 'PIA (Art.)',
        'Parul Institute of Pharmacy': 'PIP (Pharma)',
        'Parul Institute of Physiotherapy': 'PIP (Physio)',
    };

    if (acronymMap[name]) {
        return acronymMap[name];
    }

    const ignoreWords = ['of', 'and', '&', 'the', 'in'];
    return name
        .split(' ')
        .filter(word => !ignoreWords.includes(word.toLowerCase()))
        .map(word => word.charAt(0))
        .join('')
        .toUpperCase();
}


export async function generateIncentivePaymentSheet(
  claimIds: string[],
  remarks: Record<string, string>,
  referenceNumber: string
): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const { toWords } = await import('number-to-words');
    
    const claimsRef = adminDb.collection('incentiveClaims');
    const q = claimsRef.where(FieldPath.documentId(), 'in', claimIds);
    const claimsSnapshot = await q.get();
    const claims = claimsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncentiveClaim));

    if (claims.length === 0) {
        return { success: false, error: "No valid claims found for the provided IDs." };
    }

    const userIds = [...new Set(claims.map(c => c.uid))];
    const usersRef = adminDb.collection('users');
    const usersQuery = usersRef.where(FieldPath.documentId(), 'in', userIds);
    const usersSnapshot = await usersQuery.get();
    const usersMap = new Map(usersSnapshot.docs.map(doc => [doc.id, doc.data()]));

    const settings = await getSystemSettings();
    const templateUrl = settings.templateUrls?.INCENTIVE_PAYMENT_SHEET;

    if (!templateUrl) {
      return { success: false, error: 'Incentive Payment Sheet template URL is not configured.' };
    }
    
    const { getTemplateContentFromUrl } = await import('@/lib/template-manager');
    const templateContent = await getTemplateContentFromUrl(templateUrl);
    if (!templateContent) {
      return { success: false, error: 'Payment sheet template not found or could not be loaded.' };
    }
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateContent);
    const worksheet = workbook.worksheets[0]; // Get the first worksheet by index

    if (!worksheet) {
      return { success: false, error: 'Could not find a worksheet in the template file.' };
    }
    
    const batch = adminDb.batch();
    let totalAmount = 0;

    const paymentData = claims.map((claim, index) => {
      const user = usersMap.get(claim.uid);
      const amount = claim.finalApprovedAmount || 0;
      totalAmount += amount;
      
      const claimRef = adminDb.collection('incentiveClaims').doc(claim.id);
      batch.update(claimRef, { paymentSheetRef: referenceNumber, paymentSheetRemarks: remarks[claim.id] || '' });
      
      return {
        [`beneficiary_${index + 1}`]: user?.bankDetails?.beneficiaryName || user?.name || '',
        [`account_${index + 1}`]: user?.bankDetails?.accountNumber || '',
        [`ifsc_${index + 1}`]: user?.bankDetails?.ifscCode || '',
        [`branch_${index + 1}`]: user?.bankDetails?.branchName || '',
        [`amount_${index + 1}`]: amount,
        [`college_${index + 1}`]: getInstituteAcronym(user?.institute),
        [`mis_${index + 1}`]: user?.misId || '',
        [`remarks_${index + 1}`]: remarks[claim.id] || '',
      };
    });

    const flatData: { [key: string]: any } = paymentData.reduce((acc, item) => ({ ...acc, ...item }), {});
    
    flatData.date = format(new Date(), 'dd/MM/yyyy');
    flatData.reference_number = referenceNumber;
    flatData.total_amount = totalAmount;
    flatData.amount_in_words = toWords(totalAmount).replace(/\b\w/g, (l: string) => l.toUpperCase()) + ' Only';

    worksheet.eachRow((row) => {
        row.eachCell((cell) => {
            if (cell.value && typeof cell.value === 'string') {
                const templateVarMatch = cell.value.match(/\{(.*?)\}/);
                if (templateVarMatch && templateVarMatch[1]) {
                    const key = templateVarMatch[1];
                    const newValue = flatData[key] !== undefined ? flatData[key] : '';
                    
                    cell.value = newValue;
                }
            }
        });
    });

    await batch.commit();
    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    
    await logActivity('INFO', 'Generated incentive payment sheet', { referenceNumber, claimCount: claims.length });
    return { success: true, fileData: base64 };
  } catch (error: any) {
    console.error('Error generating payment sheet:', error);
    await logActivity('ERROR', 'Failed to generate payment sheet', { error: error.message });
    return { success: false, error: error.message || 'Failed to generate the sheet.' };
  }
}
