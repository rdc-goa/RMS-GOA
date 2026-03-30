

'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, User } from '@/types';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { getTemplateContentFromUrl } from '@/lib/template-manager';
import { format } from 'date-fns';
import { getSystemSettings } from './actions';

export async function generateBookIncentiveForm(claimId: string): Promise<{ success: boolean; fileData?: string; error?: string }> {
  try {
    const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) {
      return { success: false, error: 'Incentive claim not found.' };
    }
    const claim = { id: claimSnap.id, ...claimSnap.data() } as IncentiveClaim;

    let userRef;
    let userSnap;
    // If it's a co-author claim, fetch the current applicant's details. Otherwise, fetch the original claimant's.
    if (claim.originalClaimId) {
        userRef = adminDb.collection('users').doc(claim.uid);
    } else {
        userRef = adminDb.collection('users').doc(claim.uid);
    }
    
    userSnap = await userRef.get();

    if (!userSnap.exists) {
        return { success: false, error: 'Claimant user profile not found.' };
    }
    const user = userSnap.data() as User;
    
    const settings = await getSystemSettings();
    const templateName = claim.bookApplicationType === 'Book Chapter' 
        ? 'INCENTIVE_BOOK_CHAPTER' 
        : 'INCENTIVE_BOOK_PUBLICATION';
    
    const templateUrl = settings.templateUrls?.[templateName];

    if (!templateUrl) {
        return { success: false, error: `Template URL for ${templateName} not configured.` };
    }
    
    const content = await getTemplateContentFromUrl(templateUrl);
    if (!content) {
        return { success: false, error: `Template file ${templateName} not found or couldn't be loaded.` };
    }

    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    const coAuthors = claim.bookCoAuthors?.filter(a => a.email !== user.email).map(a => a.name) || [];
    const coAuthorData: { [key: string]: string } = {};
    for (let i = 0; i < 6; i++) {
        coAuthorData[`coauthor${i + 1}`] = coAuthors[i] || '';
    }
    
    const internalAuthorsCount = claim.bookCoAuthors?.filter(a => !a.isExternal).length || 0;

    const data = {
        name: user.name, // Use the current applicant's name
        designation: user.designation || 'N/A',
        department: user.department || 'N/A',
        institute: user.institute || 'N/A',
        booktitle: claim.publicationTitle || claim.bookTitleForChapter,
        ...coAuthorData,
        authors_pu: internalAuthorsCount,
        applicant_type: claim.authorRole || 'N/A',
        total_chapters: claim.bookApplicationType === 'Book Chapter' ? 1 : (claim.bookTotalChapters || 'N/A'),
        total_pages: claim.bookTotalPages || claim.bookChapterPages || 'N/A',
        publication_year: claim.publicationYear,
        publisher_name: claim.publisherName,
        publisher_city: claim.publisherCity || 'N/A',
        publisher_country: claim.publisherCountry || 'N/A',
        publisher_type: claim.publisherType,
        print_isbn: claim.isbnPrint || 'N/A',
        electronic_isbn: claim.isbnElectronic || 'N/A',
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
    console.error('Error generating book incentive form:', error);
    return { success: false, error: error.message || 'Failed to generate the form.' };
  }
}
