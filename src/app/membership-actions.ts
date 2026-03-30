
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, User } from '@/types';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { format } from 'date-fns';
import { getSystemSettings } from './actions';
import { getTemplateContentFromUrl } from '@/lib/template-manager';


export async function generateMembershipIncentiveForm(claimId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      return { success: false, error: 'Incentive claim not found.' };
    }
    const claim = { id: claimSnap.id, ...claimSnap.data() } as IncentiveClaim;

    const userRef = adminDb.collection('users').doc(claim.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        return { success: false, error: 'Claimant user profile not found.' };
    }
    const user = userSnap.data() as User;
    
    const settings = await getSystemSettings();
    const templateUrl = settings.templateUrls?.['INCENTIVE_MEMBERSHIP'];

    if (!templateUrl) {
      return { success: false, error: 'Membership incentive template URL is not configured in system settings.' };
    }

    const content = await getTemplateContentFromUrl(templateUrl);
    
    if (!content) {
        return { success: false, error: `Template file could not be loaded from the URL.` };
    }

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    const approval1 = claim.approvals?.find(a => a.stage === 1);
    const approval2 = claim.approvals?.find(a => a.stage === 2);
    const approval3 = claim.approvals?.find(a => a.stage === 3);

    const data = {
        name: user.name,
        designation: user.designation || 'N/A',
        department: user.department || 'N/A',
        institute: user.institute || 'N/A',
        faculty: user.faculty || 'N/A',
        type_of_membership: claim.membershipType || 'N/A',
        name_of_professional_body: claim.professionalBodyName || 'N/A',
        locale: claim.membershipLocale || 'N/A',
        membership_number: claim.membershipNumber || 'N/A',
        amount_paid: claim.membershipAmountPaid?.toLocaleString('en-IN') || 'N/A',
        payment_date: claim.membershipPaymentDate ? new Date(claim.membershipPaymentDate).toLocaleDateString('en-GB') : 'N/A',
        approver_1: approval1?.status === 'Approved' ? '✓' : '',
        approver_2: approval2?.status === 'Approved' ? '✓' : '',
        approver1_comments: approval1?.comments || '',
        approver1_amount: approval1?.approvedAmount?.toLocaleString('en-IN') || '',
        approver2_comments: approval2?.comments || '',
        approver2_amount: approval2?.approvedAmount?.toLocaleString('en-IN') || '',
        approver3_comments: approval3?.comments || '',
        approver3_amount: approval3?.approvedAmount?.toLocaleString('en-IN') || '',
        date: format(new Date(), 'dd/MM/yyyy'),
    };
    
    doc.setData(data);

    try {
      doc.render();
    } catch (error: any) {
      console.error('Docxtemplater render error:', error);
      return { success: false, error: 'Failed to render the document template.' };
    }

    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    const base64 = buf.toString('base64');

    return { success: true, fileData: base64 };
  } catch (error: any) {
    console.error('Error generating membership incentive form:', error);
    return { success: false, error: error.message || 'Failed to generate the form.' };
  }
}
