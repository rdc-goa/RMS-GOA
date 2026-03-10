
'use server';

import { adminDb } from '@/lib/admin';
import type { IncentiveClaim, SystemSettings, ApprovalStage, User, ResearchPaper, Author } from '@/types';
import { getSystemSettings } from './server-actions';
import { sendEmail } from '@/lib/email';
import { FieldValue } from 'firebase-admin/firestore';

const EMAIL_STYLES = {
    background: `
    style="
      background-color:#0f2027;
      background-image:
        radial-gradient(at 5% 95%, hsla(0,70%,40%,0.25) 0px, transparent 50%),
        radial-gradient(at 95% 95%, hsla(0,80%,50%,0.25) 0px, transparent 50%),
        linear-gradient(135deg, #0f2027, #203a43);
      background-attachment:fixed;
      color:#ffffff;
      font-family:Arial, sans-serif;
      padding:20px;
      border-radius:8px;
    "
  `,
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

export async function submitIncentiveClaim(claimData: Omit<IncentiveClaim, 'id' | 'claimId'>): Promise<{ success: boolean; error?: string, claimId?: string }> {
    try {
        const newClaimRef = adminDb.collection('incentiveClaims').doc();
        const claimId = newClaimRef.id;

        const acronym = getClaimTypeAcronym(claimData.claimType);
        const counterRef = adminDb.collection('counters').doc(`incentiveClaim_${acronym}`);
        
        const { current } = await adminDb.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            const newCount = (counterDoc.data()?.current || 0) + 1;
            transaction.set(counterRef, { current: newCount }, { merge: true });
            return { current: newCount };
        });

        const standardizedClaimId = `RDC/IC/${acronym}/${String(current).padStart(4, '0')}`;
        
        const settings = await getSystemSettings();
        const workflow = settings.incentiveApprovalWorkflows?.[claimData.claimType] || [1, 2, 3, 4, 5];
        
        let initialStatus: IncentiveClaim['status'];
        const firstStage = workflow.length > 0 ? Math.min(...workflow) : 1;

        if (firstStage === 1) {
            initialStatus = 'Pending Principal Approval';
        } else {
            initialStatus = `Pending Stage ${firstStage} Approval`;
        }
        
        const claimantUserSnap = await adminDb.collection('users').doc(claimData.uid).get();
        const claimantUser = claimantUserSnap.data() as User;
        
        let initialApprovals: ApprovalStage[] = [];
        let approverUids: string[] = [];

        const configuredPrincipalEmail = settings.principalEmailsByInstitute?.[claimData.institute];
        const isClaimantDesignatedPrincipal = claimantUser.designation === 'Principal';
        const isClaimantConfiguredPrincipal = configuredPrincipalEmail && claimantUser.email?.toLowerCase() === configuredPrincipalEmail.toLowerCase();

        if ((isClaimantDesignatedPrincipal || isClaimantConfiguredPrincipal) && firstStage === 1) {
             const autoApproval: ApprovalStage = {
                approverUid: claimantUser.uid,
                approverName: `${claimantUser.name} (Auto-approved)`,
                status: 'Approved',
                timestamp: new Date().toISOString(),
                comments: 'Auto-approved as claimant is the Principal.',
                approvedAmount: claimData.calculatedIncentive || 0,
                stage: 1,
            };
            initialApprovals.push(autoApproval);
            approverUids.push(claimantUser.uid);
            
            const nextStageInWorkflow = workflow.find(stage => stage > 1);
            if (nextStageInWorkflow) {
                initialStatus = `Pending Stage ${nextStageInWorkflow} Approval`;
            } else {
                initialStatus = 'Accepted';
            }
        }


        const finalClaimData: Omit<IncentiveClaim, 'id'> = {
            ...claimData,
            claimId: standardizedClaimId,
            status: claimData.status === 'Draft' ? 'Draft' : initialStatus,
            approvals: initialApprovals,
            approverUids: approverUids,
            authors: claimData.authors || [],
            authorUids: (claimData.authors || []).map(a => a.uid).filter(Boolean) as string[],
        };

        if (claimData.claimType === 'Research Papers' && claimData.paperTitle && claimData.relevantLink) {
            const papersRef = adminDb.collection('papers');
            const q = papersRef.where('url', '==', claimData.relevantLink).limit(1);
            const paperSnap = await q.get();
            if (!paperSnap.empty) {
                finalClaimData.paperId = paperSnap.docs[0].id;
            }
        }

        await newClaimRef.set(finalClaimData);

        // Notify the principal if the claim is pending their approval (Stage 1)
        if (finalClaimData.status === 'Pending Principal Approval') {
            try {
                // First, check if there's a configured principal email for this institute
                const principalEmail = settings.principalEmailsByInstitute?.[claimData.institute];
                
                if (principalEmail) {
                    // Use the configured principal email
                    const claimTitle = getClaimTitle(finalClaimData);
                    
                    const emailHtml = `
                        <div ${EMAIL_STYLES.background}>
                            ${EMAIL_STYLES.logo}
                            <p style="color:#ffffff;">Dear Principal,</p>
                            <p style="color:#e0e0e0;">
                                An incentive claim has been submitted by ${claimData.userName} (${claimData.faculty}) and is awaiting your institutional approval for the work titled "<strong style="color:#ffffff;">${claimTitle}</strong>".
                            </p>
                            <p style="color:#e0e0e0;">
                                <strong>Claim Type:</strong> ${claimData.claimType}<br/>
                                <strong>Claimed Incentive Amount:</strong> ₹${(claimData.calculatedIncentive || 0).toLocaleString('en-IN')}
                            </p>
                            <p style="text-align:center; margin-top:25px;">
                                <a href="${process.env.BASE_URL}/dashboard/incentive-approvals" style="background-color: #64B5F6; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                    Review Claim
                                </a>
                            </p>
                            <p style="color:#e0e0e0;">
                                Please review and approve/reject this claim at your earliest convenience.
                            </p>
                            ${EMAIL_STYLES.footer}
                        </div>
                    `;

                    await sendEmail({
                        to: principalEmail,
                        subject: `New Incentive Claim Awaiting Your Approval - ${claimTitle}`,
                        from: 'default',
                        html: emailHtml
                    });
                } else {
                    // Fallback: Query for Principal user if no configured email
                    const principalQuery = adminDb.collection('users').where('designation', '==', 'Principal').where('institute', '==', claimData.institute);
                    const principalSnap = await principalQuery.get();
                    
                    if (!principalSnap.empty) {
                        const principal = principalSnap.docs[0].data() as User;
                        const claimTitle = getClaimTitle(finalClaimData);
                        
                        if (principal.email) {
                            const emailHtml = `
                                <div ${EMAIL_STYLES.background}>
                                    ${EMAIL_STYLES.logo}
                                    <p style="color:#ffffff;">Dear ${principal.name},</p>
                                    <p style="color:#e0e0e0;">
                                        An incentive claim has been submitted by ${claimData.userName} (${claimData.faculty}) and is awaiting your institutional approval for the work titled "<strong style="color:#ffffff;">${claimTitle}</strong>".
                                    </p>
                                    <p style="color:#e0e0e0;">
                                        <strong>Claim Type:</strong> ${claimData.claimType}<br/>
                                        <strong>Claimed Incentive Amount:</strong> ₹${(claimData.calculatedIncentive || 0).toLocaleString('en-IN')}
                                    </p>
                                    <p style="text-align:center; margin-top:25px;">
                                        <a href="${process.env.BASE_URL}/dashboard/incentive-approvals" style="background-color: #64B5F6; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                            Review Claim
                                        </a>
                                    </p>
                                    <p style="color:#e0e0e0;">
                                        Please review and approve/reject this claim at your earliest convenience.
                                    </p>
                                    ${EMAIL_STYLES.footer}
                                </div>
                            `;

                            await sendEmail({
                                to: principal.email,
                                subject: `New Incentive Claim Awaiting Your Approval - ${claimTitle}`,
                                from: 'default',
                                html: emailHtml
                            });
                        }
                    }
                }
            } catch (error) {
                console.error('Error notifying principal:', error);
                await logActivity('WARNING', 'Failed to notify principal of new claim', { claimId: standardizedClaimId, error: error instanceof Error ? error.message : 'Unknown error' });
            }
        }

        if (finalClaimData.status !== 'Draft' && finalClaimData.authors) {
            const coAuthorsToNotify = finalClaimData.authors.filter(a => a.uid && a.uid !== claimData.uid);
            for (const coAuthor of coAuthorsToNotify) {
                const isConferenceProceeding = finalClaimData.publicationType === 'Scopus Indexed Conference Proceedings';
                const canApply = !isConferenceProceeding || (coAuthor.role === 'Presenting Author' || coAuthor.role === 'First & Presenting Author');

                const notification = {
                    uid: coAuthor.uid,
                    title: `${claimData.userName} has listed you as a co-author on an incentive claim.`,
                    createdAt: new Date().toISOString(),
                    isRead: false,
                    type: 'default',
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
                                    <a href="${process.env.BASE_URL}/dashboard/incentive-claim?tab=co-author" style="background-color: #64B5F6; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
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
                        subject: `You've been added as a co-author on an incentive claim`,
                        from: 'default',
                        html: emailHtml
                    });
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
  stageIndex: number, // 0-indexed (0=Principal, 1=Stage2, etc.)
  data: { amount?: number; comments?: string, verifiedFields?: { [key: string]: boolean }, suggestions?: { [key: string]: string } }
): Promise<{ success: boolean; error?: string }> {
  try {
    const claimRef = adminDb.collection('incentiveClaims').doc(claimId);
    const claimSnap = await claimRef.get();

    if (!claimSnap.exists) {
      return { success: false, error: 'Incentive claim not found.' };
    }
    const claim = { id: claimSnap.id, ...claimSnap.data() } as IncentiveClaim;
    const settings = await getSystemSettings();
    const currentStage = stageIndex + 1; // 1-indexed

    // Authorization check
    if (currentStage === 1) { // Principal's stage
        const configuredPrincipalEmail = settings.principalEmailsByInstitute?.[claim.institute];
        const isPrincipalDesignation = approver.designation === 'Principal' && approver.institute === claim.institute;
        const isConfiguredPrincipalEmail = configuredPrincipalEmail && approver.email?.toLowerCase() === configuredPrincipalEmail.toLowerCase();
        
        if (!isPrincipalDesignation && !isConfiguredPrincipalEmail) {
             return { success: false, error: 'You are not the authorized Principal for this claim.' };
        }
    } else { // System approvers for stages 2-5
        const currentStageApprover = settings.incentiveApprovers?.find(a => a.stage === currentStage);
        if (!currentStageApprover || approver.email?.toLowerCase() !== currentStageApprover.email.toLowerCase()) {
            return { success: false, error: `You are not authorized for Stage ${currentStage} approval.` };
        }
    }

    const newApproval: ApprovalStage = {
      approverUid: approver.uid,
      approverName: approver.name,
      status: action === 'reject' ? 'Rejected' : 'Approved',
      approvedAmount: data.amount || 0,
      comments: data.comments || '',
      timestamp: new Date().toISOString(),
      stage: currentStage,
      verifiedFields: data.verifiedFields || {},
      suggestions: data.suggestions || {},
    };
    
    const approvals = claim.approvals || [];
    const existingApprovalIndex = approvals.findIndex(a => a?.stage === currentStage);
    if (existingApprovalIndex > -1) {
        approvals[existingApprovalIndex] = newApproval;
    } else {
        approvals.push(newApproval);
    }
    approvals.sort((a,b) => a!.stage - b!.stage);


    let newStatus: IncentiveClaim['status'];
    const workflow = settings.incentiveApprovalWorkflows?.[claim.claimType] || [1, 2, 3, 4, 5];

    if (action === 'reject') {
        newStatus = 'Rejected';
    } else {
        const nextStageInWorkflow = workflow.find(stage => stage > currentStage);

        if (nextStageInWorkflow) {
            newStatus = `Pending Stage ${nextStageInWorkflow} Approval` as IncentiveClaim['status'];
        } else {
            newStatus = 'Accepted'; // Final approval
        }
    }

    const updateData: { [key: string]: any } = {
        approvals,
        status: newStatus,
        approverUids: FieldValue.arrayUnion(approver.uid),
    };
    
    // For stages 2 onwards, the approver finalizes the amount
    if (action === 'approve' || action === 'verify') {
        updateData.finalApprovedAmount = data.amount;
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

    // Notify the next stage approver when claim is approved and moves to next stage
    if (action === 'approve' && newStatus !== 'Accepted' && newStatus !== 'Rejected') {
        try {
            const nextStageMatch = newStatus.match(/Pending Stage (\d+) Approval/);
            if (nextStageMatch) {
                const nextStage = parseInt(nextStageMatch[1]);
                const nextStageApprover = settings.incentiveApprovers?.find(a => a.stage === nextStage);
                
                if (nextStageApprover && nextStageApprover.email) {
                    // Find the approver user to get their name
                    const approverUsersQuery = adminDb.collection('users').where('email', '==', nextStageApprover.email.toLowerCase());
                    const approverSnapshot = await approverUsersQuery.get();
                    const approverName = !approverSnapshot.empty ? (approverSnapshot.docs[0].data() as User).name : 'Approver';

                    const emailHtml = `
                        <div ${EMAIL_STYLES.background}>
                            ${EMAIL_STYLES.logo}
                            <p style="color:#ffffff;">Dear ${approverName},</p>
                            <p style="color:#e0e0e0;">
                                An incentive claim has been approved by the previous stage and is now awaiting your review for stage ${nextStage} approval.
                            </p>
                            <p style="color:#e0e0e0;">
                                <strong>Claim Type:</strong> ${claim.claimType}<br/>
                                <strong>Claimant:</strong> ${claim.userName} (${claim.faculty})<br/>
                                <strong>Work Title:</strong> ${claimTitle}<br/>
                                <strong>Current Approved Amount:</strong> ₹${(data.amount || claim.calculatedIncentive || 0).toLocaleString('en-IN')}
                            </p>
                            <p style="text-align:center; margin-top:25px;">
                                <a href="${process.env.BASE_URL}/dashboard/incentive-approvals" style="background-color: #64B5F6; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                    Review Claim
                                </a>
                            </p>
                            <p style="color:#e0e0e0;">
                                Please review and approve/reject this claim at your earliest convenience.
                            </p>
                            ${EMAIL_STYLES.footer}
                        </div>
                    `;

                    await sendEmail({
                        to: nextStageApprover.email,
                        subject: `Incentive Claim Awaiting Stage ${nextStage} Approval - ${claimTitle}`,
                        from: 'default',
                        html: emailHtml
                    });
                }
            }
        } catch (error) {
            console.error('Error notifying next stage approver:', error);
            await logActivity('WARNING', 'Failed to notify next stage approver', { claimId, error: error instanceof Error ? error.message : 'Unknown error' });
        }
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
                            The final approved incentive amount is <strong style="color:#ffffff;">₹${(data.amount || 0).toLocaleString('en-IN')}</strong>. The amount will be processed by the accounts department shortly.
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
    
    await logActivity('INFO', `Incentive claim action processed`, { claimId, action, stage: currentStage, approver: approver.name });
    return { success: true };
  } catch (error: any) {
    console.error('Error processing incentive claim action:', error);
    await logActivity('ERROR', 'Failed to process incentive claim action', { claimId, error: error.message });
    return { success: false, error: error.message || 'An unexpected error occurred.' };
  }
}

    