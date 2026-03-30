

'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, SystemSettings, ApprovalStage, User, ResearchPaper, Author } from '@/types';
import { getSystemSettings } from './actions';
import { isEligibleForFinancialDisbursement } from '@/lib/incentive-eligibility';
import { sendEmail } from '@/lib/email';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getDefaultModulesForRole } from '@/lib/modules';

const EMAIL_STYLES = {
    background: 'style="background: linear-gradient(135deg, #0f2027, #203a43, #2c5364); color:#ffffff; font-family:Arial, sans-serif; padding:20px; border-radius:8px;"',
    logo: '<div style="text-align:center; margin-bottom:20px;"><img src="https://lhdlkrfbkon55i6u.public.blob.vercel-storage.com/Pu%20Goa%20White.png" alt="RDC Logo" style="max-width:300px; height:auto;" /></div>',
    footer: ` 
    <p style="color:#b0bec5; margin-top: 30px;">Best Regards,</p>
    <p style="color:#b0bec5;">Research & Development Cell Team,</p>
    <p style="color:#b0bec5;">Parul University Goa</p>
    <hr style="border-top: 1px solid #4f5b62; margin-top: 20px;">
    <p style="font-size:10px; color:#999999; text-align:center; margin-top:10px;">
        This is a system generated automatic email. If you feel this is an error, please report at the earliest.
    </p>`
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

const getClaimTypeAcronym = (claimType: string): string => {
    switch (claimType) {
        case 'Research Papers': return 'PAPER';
        case 'Patents': return 'PATENT';
        case 'Conference Presentations': return 'CONFERENCE';
        case 'Books': return 'BOOK';
        case 'Membership of Professional Bodies': return 'MEMBERSHIP';
        case 'Seed Money for APC': return 'APC';
        default: return 'GENERAL';
    }
};

const getClaimTitle = (claimData: Partial<IncentiveClaim>): string => {
    return claimData.paperTitle
        || claimData.publicationTitle
        || claimData.patentTitle
        || claimData.conferencePaperTitle
        || claimData.professionalBodyName
        || claimData.apcPaperTitle
        || 'your recent incentive claim';
};

export async function submitIncentiveClaim(claimData: Omit<IncentiveClaim, 'id' | 'claimId'>, claimIdToUpdate?: string): Promise<{ success: boolean; error?: string, claimId?: string }> {
    try {
        const claimsRef = adminDb.collection('incentiveClaims');

        // --- Uniqueness Check on Final Submission ---
        if (claimData.status !== 'Draft') {
            let uniquenessQuery;
            const uid = claimData.uid;
            let fieldToCheck: keyof IncentiveClaim | null = null;
            let valueToCheck: string | undefined = undefined;
            let claimTypeName = claimData.claimType;

            switch (claimData.claimType) {
                case 'Research Papers':
                    if (claimData.doi) {
                        fieldToCheck = 'doi';
                        valueToCheck = claimData.doi;
                    }
                    break;
                case 'Books':
                    fieldToCheck = 'publicationTitle';
                    valueToCheck = claimData.publicationTitle;
                    break;
                case 'Patents':
                    fieldToCheck = 'patentTitle';
                    valueToCheck = claimData.patentTitle;
                    break;
                case 'Membership of Professional Bodies':
                    fieldToCheck = 'membershipNumber';
                    valueToCheck = claimData.membershipNumber;
                    break;
            }

            if (fieldToCheck && valueToCheck) {
                uniquenessQuery = claimsRef.where(fieldToCheck, '==', valueToCheck).where('uid', '==', uid);
                const existingClaimsSnap = await uniquenessQuery.get();
                // Filter out the current draft being updated
                const duplicateClaim = existingClaimsSnap.docs.find(doc => doc.id !== claimIdToUpdate && doc.data().status !== 'Draft');
                if (duplicateClaim) {
                    return { success: false, error: `You have already submitted an incentive claim for this ${claimTypeName}.` };
                }
            }
        }

        const newClaimRef = claimIdToUpdate ? claimsRef.doc(claimIdToUpdate) : claimsRef.doc();
        const claimId = newClaimRef.id;

        let standardizedClaimId = claimData.claimId;
        if (!standardizedClaimId && !claimIdToUpdate) {
            const acronym = getClaimTypeAcronym(claimData.claimType);
            const counterRef = adminDb.collection('counters').doc(`incentiveClaim_${acronym}`);

            const { current } = await adminDb.runTransaction(async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                const newCount = (counterDoc.data()?.current || 0) + 1;
                transaction.set(counterRef, { current: newCount }, { merge: true });
                return { current: newCount };
            });
            standardizedClaimId = `RDC/IC/${acronym}/${String(current).padStart(4, '0')}`;
        }

        const settings = await getSystemSettings();
        const workflow = settings.incentiveApprovalWorkflows?.[claimData.claimType];

        let initialStatus: IncentiveClaim['status'] = 'Accepted'; // Default if no workflow
        if (workflow && workflow.length > 0) {
            const firstStage = Math.min(...workflow);
            initialStatus = `Pending Stage ${firstStage} Approval`;
        }

        const finalClaimData: Omit<IncentiveClaim, 'id'> = {
            ...claimData,
            claimId: standardizedClaimId || claimData.claimId,
            status: claimData.status === 'Draft' ? 'Draft' : initialStatus,
            authors: claimData.authors || [],
            authorUids: (claimData.authors || []).map(a => a.uid).filter(Boolean) as string[],
            authorEmails: (claimData.authors || []).map(a => a.email.toLowerCase()),
        };

        if (claimData.claimType === 'Research Papers' && claimData.paperTitle && claimData.relevantLink) {
            const papersRef = adminDb.collection('papers');
            const q = papersRef.where('url', '==', claimData.relevantLink).limit(1);
            const paperSnap = await q.get();
            if (!paperSnap.empty) {
                finalClaimData.paperId = paperSnap.docs[0].id;
            }
        }

        await newClaimRef.set(finalClaimData, { merge: true });

        // Only send notifications to co-authors if this is the original author's claim.
        // If this is a co-author claim (has originalClaimId), skip notifications as the original author already added them.
        const isCoAuthorClaim = !!claimData.originalClaimId;

        if (!isCoAuthorClaim && finalClaimData.status !== 'Draft' && finalClaimData.authors) {
            const coAuthorUidsToNotify = finalClaimData.authors
                .map(a => a.uid)
                .filter((uid): uid is string => !!uid && uid !== claimData.uid);

            if (coAuthorUidsToNotify.length > 0) {
                const usersRef = adminDb.collection('users');
                const userChunks: string[][] = [];
                for (let i = 0; i < coAuthorUidsToNotify.length; i += 30) {
                    userChunks.push(coAuthorUidsToNotify.slice(i, i + 30));
                }

                for (const chunk of userChunks) {
                    if (chunk.length === 0) continue;
                    const coAuthorUsersSnapshot = await usersRef.where(FieldPath.documentId(), 'in', chunk).get();

                    for (const userDoc of coAuthorUsersSnapshot.docs) {
                        const coAuthorUser = { uid: userDoc.id, ...userDoc.data() } as User;

                        const userModules = coAuthorUser.allowedModules || getDefaultModulesForRole(coAuthorUser.role, coAuthorUser.designation);
                        if (!userModules.includes('incentive-claim')) {
                            continue; // Skip users who don't have access to the incentive claim module
                        }

                        const coAuthor = finalClaimData.authors.find(a => a.uid === coAuthorUser.uid);
                        if (!coAuthor) continue;

                        const isConferenceProceeding = finalClaimData.publicationType === 'Scopus Indexed Conference Proceedings';
                        const canApply = !isConferenceProceeding || (coAuthor.role === 'Presenting Author' || coAuthor.role === 'First & Presenting Author');

                        const notification = {
                            uid: coAuthor.uid,
                            title: `${claimData.userName} has listed you as a co-author on an incentive claim.`,
                            createdAt: new Date().toISOString(),
                            isRead: false,
                            type: 'default' as const,
                            projectId: '/dashboard/incentive-claim?tab=co-author'
                        };
                        await adminDb.collection('notifications').add(notification);

                        if (coAuthor.email) {
                            const claimTitle = getClaimTitle(finalClaimData);
                            const emailHtml = `
                                <div ${EMAIL_STYLES.background}>
                                    ${EMAIL_STYLES.logo}
                                    <p style="color:#ffffff;">Dear ${coAuthor.name},</p>
                                    <p style="color:#e0e0e0;">
                                        This is to inform you that ${claimData.userName} has submitted an incentive claim for the publication/work titled "<strong style="color:#ffffff;">${claimTitle}</strong>" and has listed you as a co-author.
                                    </p>
                                    ${canApply
                                    ? `<p style="color:#e0e0e0;">
                                            If you wish to claim your share of the incentive, please log in to the portal and visit the "Co-Author Claims" tab on the Incentive Claim page to submit your application.
                                        </p>
                                        <p style="text-align:center; margin-top:25px;">
                                            <a href="${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/incentive-claim?tab=co-author" style="background-color: #64B5F6; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                                Apply for Claim
                                            </a>
                                        </p>`
                                    : `<p style="color:#e0e0e0;">
                                            As per university policy, only presenting authors are eligible for an incentive for this type of publication. This notification is for your records.
                                        </p>`
                                }
                                    ${EMAIL_STYLES.footer}
                                </div>
                            `;

                            await sendEmail({
                                to: coAuthor.email,
                                subject: `[${standardizedClaimId}] You've been added as a co-author on an incentive claim`,
                                from: 'default',
                                html: emailHtml
                            });
                        }
                    }
                }
            }
        }

        await logActivity('INFO', 'Incentive claim submitted', { claimId: standardizedClaimId, userId: claimData.uid });
        return { success: true, claimId: claimId };
    } catch (error: any) {
        console.error('Error submitting incentive claim:', error);
        await logActivity('ERROR', 'Failed to submit incentive claim', { error: error.message });
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}

export async function deleteIncentiveClaim(claimId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
        const claimSnap = await claimRef.get();

        if (!claimSnap.exists) {
            return { success: false, error: "Claim not found." };
        }

        const claim = claimSnap.data() as IncentiveClaim;

        if (claim.uid !== userId) {
            return { success: false, error: "You do not have permission to delete this claim." };
        }

        if (claim.status !== 'Draft') {
            return { success: false, error: "Only draft claims can be deleted." };
        }

        await claimRef.delete();
        await logActivity('INFO', 'Incentive claim draft deleted', { claimId, userId });
        return { success: true };

    } catch (error: any) {
        console.error('Error deleting incentive claim draft:', error);
        await logActivity('ERROR', 'Failed to delete incentive claim draft', { claimId, userId, error: error.message });
        return { success: false, error: error.message || 'An unexpected server error occurred.' };
    }
}


async function addPaperFromApprovedClaim(claim: IncentiveClaim): Promise<void> {
    if (claim.claimType !== 'Research Papers' || !claim.paperTitle || !claim.relevantLink) {
        await logActivity('WARNING', 'Skipped paper creation from claim: not a research paper or missing title/link.', { claimId: claim.id });
        return;
    }

    try {
        const paperRef = adminDb.collection('papers').doc(); // Create a new document reference
        const now = new Date().toISOString();

        // Convert CoAuthor[] to Author[]
        const authors: Author[] = (claim.authors || []).map(bca => ({
            uid: bca.uid,
            email: bca.email,
            name: bca.name,
            role: bca.role,
            isExternal: bca.isExternal,
            status: 'approved', // Automatically approved since it comes from a sanctioned claim
        }));

        if (!authors.some(a => a.uid === claim.uid)) {
            authors.push({
                uid: claim.uid,
                email: claim.userEmail,
                name: claim.userName,
                role: 'Co-Author', // Default role, can be adjusted if more info is available
                status: 'approved',
            });
        }

        const firstAuthor = authors.find(a => a.role === 'First Author' || a.role === 'First & Corresponding Author');
        const mainAuthorUid = firstAuthor?.uid || claim.uid;

        const newPaperData: Omit<ResearchPaper, 'id'> = {
            title: claim.paperTitle,
            url: claim.relevantLink,
            mainAuthorUid,
            authors,
            authorUids: authors.map(a => a.uid).filter(Boolean) as string[],
            authorEmails: authors.map(a => a.email.toLowerCase()),
            journalName: claim.journalName || null,
            journalWebsite: claim.journalWebsite || null,
            qRating: claim.journalClassification || null,
            createdAt: now,
            updatedAt: now,
        };

        await paperRef.set(newPaperData);
        await logActivity('INFO', 'Research paper automatically created from approved incentive claim.', { claimId: claim.id, paperId: paperRef.id, title: claim.paperTitle });

    } catch (error: any) {
        console.error('Error creating paper from claim:', error);
        await logActivity('ERROR', 'Failed to create paper from approved claim', { claimId: claim.id, error: error.message });
    }
}


export async function processIncentiveClaimAction(
    claimId: string,
    action: 'approve' | 'reject' | 'verify',
    approver: User,
    stageIndex: number, // 0, 1, 2, or 3
    data: { amount?: number; comments?: string, verifiedFields?: { [key: string]: boolean }, suggestions?: { [key: string]: string } }
): Promise<{ success: boolean; error?: string }> {
    try {
        const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
        const claimSnap = await claimRef.get();

        if (!claimSnap.exists) {
            return { success: false, error: 'Incentive claim not found.' };
        }
        const claim = { id: claimSnap.id, ...claimSnap.data() } as IncentiveClaim;
        const isDisbursementEligible = isEligibleForFinancialDisbursement(claim);
        const effectiveApprovedAmount = isDisbursementEligible ? (data.amount || 0) : 0;
        const settings = await getSystemSettings();

        if (!settings.incentiveApprovers || settings.incentiveApprovers.length <= stageIndex) {
            return { success: false, error: 'Approval workflow is not configured correctly.' };
        }
        const currentStageApprover = settings.incentiveApprovers.find(a => a.stage === stageIndex + 1);
        if (!currentStageApprover || approver.email?.toLowerCase() !== currentStageApprover.email.toLowerCase()) {
            return { success: false, error: 'You are not authorized to perform this action for this stage.' };
        }


        const newApproval: ApprovalStage = {
            approverUid: approver.uid,
            approverName: approver.name,
            status: action === 'reject' ? 'Rejected' : 'Approved',
            approvedAmount: effectiveApprovedAmount,
            comments: data.comments || '',
            timestamp: new Date().toISOString(),
            stage: stageIndex + 1,
            verifiedFields: data.verifiedFields || {},
            suggestions: data.suggestions || {},
        };

        const approvals = claim.approvals || [];
        while (approvals.length <= stageIndex) {
            approvals.push(null as any);
        }
        approvals[stageIndex] = newApproval;


        let newStatus: IncentiveClaim['status'];
        const workflow = settings.incentiveApprovalWorkflows?.[claim.claimType] || [1, 2, 3, 4]; // Default to all stages

        if (action === 'reject') {
            newStatus = 'Rejected';
        } else {
            const currentStage = stageIndex + 1;
            const nextStage = workflow.find(stage => stage > currentStage);

            if (nextStage) {
                newStatus = `Pending Stage ${nextStage} Approval`;
            } else {
                newStatus = 'Accepted'; // No more stages in the workflow
            }
        }

        const updateData: { [key: string]: any } = {
            approvals,
            status: newStatus,
        };

        if (action === 'approve' || action === 'verify') {
            // For stages 2, 3, 4 (stageIndex 1, 2, 3), the approver finalizes the amount
            if (stageIndex >= 1) {
                updateData.finalApprovedAmount = effectiveApprovedAmount;
            }
        }

        await claimRef.update(updateData);

        const claimTitle = getClaimTitle(claim);

        if (action === 'reject' && claim.userEmail) {
            await sendEmail({
                to: claim.userEmail,
                subject: `Update on Your Incentive Claim: ${claimTitle}`,
                from: 'default',
                html: `
                <div ${EMAIL_STYLES.background}>
                    ${EMAIL_STYLES.logo}
                    <p style="color:#ffffff;">Dear ${claim.userName},</p>
                    <p style="color:#e0e0e0;">
                        This email is to inform you about a decision on your recent incentive claim for "<strong style="color:#ffffff;">${claimTitle}</strong>".
                    </p>
                    <p style="color:#e0e0e0;">
                        After careful review, your application has been <strong style="color:#ff5252;">rejected</strong>.
                    </p>
                    <p style="color:#e0e0e0;">For more information, please visit the portal or contact the RDC office.</p>
                    ${EMAIL_STYLES.footer}
                </div>
            `
            });
        }

        if (newStatus === 'Accepted' && claim.userEmail) {
            if (claim.userEmail) {
                await sendEmail({
                    to: claim.userEmail,
                    subject: `Congratulations! Your Incentive Claim for "${claimTitle}" has been Approved`,
                    from: 'default',
                    html: `
                    <div ${EMAIL_STYLES.background}>
                        ${EMAIL_STYLES.logo}
                        <p style="color:#ffffff;">Dear ${claim.userName},</p>
                        <p style="color:#e0e0e0;">
                            We are pleased to inform you that your incentive claim for "<strong style="color:#ffffff;">${claimTitle}</strong>" has been successfully approved by all committees.
                        </p>
                        <p style="color:#e0e0e0;">
                            The final approved incentive amount is <strong style="color:#ffffff;">₹${effectiveApprovedAmount.toLocaleString('en-IN')}</strong>. The amount will be processed by the accounts department shortly.
                        </p>
                        <p style="color:#e0e0e0;">Congratulations on your achievement!</p>
                        ${EMAIL_STYLES.footer}
                    </div>
                `
                });
            }

            if (claim.claimType === 'Research Papers') {
                await addPaperFromApprovedClaim(claim);
            }
        }

        await logActivity('INFO', `Incentive claim action processed`, { claimId, action, stage: stageIndex + 1, approver: approver.name });
        return { success: true };
    } catch (error: any) {
        console.error('Error processing incentive claim action:', error);
        await logActivity('ERROR', 'Failed to process incentive claim action', { claimId, error: error.message });
        return { success: false, error: error.message || 'An unexpected error occurred.' };
    }
}
