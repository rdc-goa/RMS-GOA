
// This file contains calculation logic that can run on both client and server.
// Removed 'use server' to prevent Next.js from logging every call as a server action in dev mode.


import type { IncentiveClaim, Author } from '@/types';
import { getClaimantAuthorPosition, getClaimantRole } from '@/lib/incentive-eligibility';

// --- Research Paper Calculation ---

const SPECIAL_POLICY_FACULTIES = [
    "Faculty of Applied Sciences",
    "Faculty of Medicine",
    "Faculty of Homoeopathy",
    "Faculty of Ayurved",
    "Faculty of Nursing",
    "Faculty of Pharmacy",
    "Faculty of Physiotherapy",
    "Faculty of Public Health",
    "Faculty of Engineering & Technology"
];

function getBaseIncentiveForPaper(claimData: Partial<IncentiveClaim>, faculty: string, designation?: string): number {
    const { journalClassification, indexType, wosType, publicationType } = claimData;

    if (publicationType === 'Letter to the Editor/Editorial') {
        return 2500;
    }

    if (designation === 'Ph.D Scholar') {
        switch (journalClassification) {
            case 'Q1': return 6000;
            case 'Q2': return 4000;
            default: return 0; // PhD Scholars only get incentive for Q1/Q2
        }
    }

    const isSpecialFaculty = SPECIAL_POLICY_FACULTIES.includes(faculty);
    const isScopus = indexType === 'scopus' || indexType === 'both';
    const isWos = indexType === 'wos' || indexType === 'both';
    const isWosValid = isWos && (indexType as string) !== 'esci'; // ESCI is deleted

    if (publicationType === 'Scopus Indexed Conference Proceedings') {
        return isScopus ? 2000 : 0;
    }

    if (isSpecialFaculty) {
        // Category A: SCOPUS Q1-Q4 only
        if (isScopus && journalClassification) {
            switch (journalClassification) {
                case 'Nature/Science/Lancet': return 60000;
                case 'Top 1% Journals': return 30000;
                case 'Q1': return 16000;
                case 'Q2': return 10000;
                case 'Q3': return 6000;
                case 'Q4': return 4000;
                default: return 0;
            }
        }
        return 0;
    } else {
        // Non-Category A: Scopus Q1-Q4 or Web of Science / ABDC / DOAJ
        if (isScopus && journalClassification && ['Nature/Science/Lancet', 'Top 1% Journals', 'Q1', 'Q2', 'Q3', 'Q4'].includes(journalClassification)) {
            switch (journalClassification) {
                case 'Nature/Science/Lancet': return 60000;
                case 'Top 1% Journals': return 30000;
                case 'Q1': return 16000;
                case 'Q2': return 10000;
                case 'Q3': return 6000;
                case 'Q4': return 4000;
                default: return 0;
            }
        } else if (isWosValid || claimData.iqacClaimType?.toLowerCase().includes('abdc') || claimData.iqacClaimType?.toLowerCase().includes('doaj')) {
            return 2000;
        }
        if (publicationType === 'UGC listed journals (Journals found qualified through UGC-CARE Protocol, Group-I)') {
            return 1000;
        }

        return 0;
    }
}

function adjustForPublicationType(baseAmount: number, publicationType: string | undefined, journalClassification: string | undefined): number {
    if (!publicationType) return baseAmount;
    switch (publicationType) {
        case 'Research Articles/Short Communications':
        case 'Scopus Indexed Conference Proceedings':
            return baseAmount;
        case 'Case Reports/Short Surveys':
            return baseAmount * 0.9;
        case 'Review Articles':
            if (journalClassification === 'Q3' || journalClassification === 'Q4') {
                return baseAmount * 0.8;
            }
            return baseAmount;
        case 'Letter to the Editor/Editorial':
            return 2500; // Total amount to be distributed
        default:
            return baseAmount;
    }
}

export type ResearchIncentiveBreakdown = {
    baseAmount: number;
    publicationTypeAdjustment: string;
    adjustedAmount: number;
    deductions: string[];
    deductedAmount: number;
    internalAuthorsCount: number;
    mainAuthorsCount: number;
    coAuthorsCount: number;
    authorShare: string;
    finalAmount: number;
    poolAmount?: number;
    poolPercentage?: number;
    sharingAuthorsCount?: number;
};

export async function calculateResearchPaperIncentive(
    claimData: Partial<IncentiveClaim>,
    faculty: string,
    designation?: string,
): Promise<{ success: boolean; amount?: number; breakdown?: ResearchIncentiveBreakdown; error?: string }> {
    try {
        const { authors = [], userEmail, publicationType, journalClassification, wasApcPaidByUniversity, isPuNameInPublication } = claimData;

        // Find the claimant in the author list
        const claimant = authors.find(a => a.email?.toLowerCase() === userEmail?.toLowerCase()) || authors[0] || {
            name: claimData.userName || 'Claimant',
            email: userEmail || '',
            role: 'First Author',
            isExternal: false,
            status: 'approved'
        };

        const baseIncentive = getBaseIncentiveForPaper(claimData, faculty, designation);
        let adjustedAmount = adjustForPublicationType(baseIncentive, publicationType, journalClassification);

        // Apply university-level deductions before author distribution
        let deductedAmount = adjustedAmount;
        const deductions = [];
        if (wasApcPaidByUniversity) {
            deductedAmount = 0;
            deductions.push('APC Paid by University (Disqualified)');
        }
        if (isPuNameInPublication === false) {
            deductedAmount = 0;
            deductions.push('Incorrect/Missing PU Affiliation (Disqualified)');
        }

        const totalAuthors = authors.length || 1;

        // Special case for Letter to Editor/Editorial - shared equally among all authors
        if (publicationType === 'Letter to the Editor/Editorial') {
            const amountPerAuthor = deductedAmount / totalAuthors;
            return {
                success: true,
                amount: Math.round(amountPerAuthor),
                breakdown: {
                    baseAmount: 2500,
                    publicationTypeAdjustment: 'Fixed ₹2,500',
                    adjustedAmount: 2500,
                    deductions,
                    deductedAmount: Math.round(deductedAmount),
                    internalAuthorsCount: totalAuthors,
                    mainAuthorsCount: totalAuthors,
                    coAuthorsCount: 0,
                    authorShare: `Equally divided among all authors (÷ ${totalAuthors})`,
                    finalAmount: Math.round(amountPerAuthor)
                }
            };
        }

        // Identify internal authors. 
        // We always treat the claimant as internal, even if the primary author marked them as external.
        const internalAuthors = authors.map(a => ({
            ...a,
            isExternal: a.email?.toLowerCase() === userEmail?.toLowerCase() ? false : a.isExternal
        })).filter(a => !a.isExternal);

        if (internalAuthors.length === 0) {
            return { success: true, amount: 0 };
        }



        // Categorize internal authors for standard research papers
        const mainRoles = ['First Author', 'Corresponding Author', 'First & Corresponding Author', 'First & Presenting Author'];
        const mainAuthors = internalAuthors.filter(a => mainRoles.includes(a.role));
        const coAuthors = internalAuthors.filter(a => a.role === 'Co-Author' || a.role === 'Presenting Author');

        // Check claimant's role based on the updated internalAuthors list to ensure consistency
        const claimantInList = internalAuthors.find(a => a.email?.toLowerCase() === userEmail?.toLowerCase());
        const isMainAuthor = claimantInList ? mainRoles.includes(claimantInList.role) : mainRoles.includes(claimant.role);
        let finalAmount = 0;
        let authorShareText = '';

        let poolAmount = 0;
        let poolPercentage = 0;
        let sharingAuthorsCount = 0;

        if (publicationType === 'Scopus Indexed Conference Proceedings') {
            finalAmount = deductedAmount / internalAuthors.length;
            authorShareText = `Equally divided among all internal authors (÷ ${internalAuthors.length})`;
            poolAmount = deductedAmount;
            poolPercentage = 100;
            sharingAuthorsCount = internalAuthors.length;
        } else if (internalAuthors.length === 1) {
            // Sole author (as First or Corresponding)
            if (mainAuthors.length === 1) {
                finalAmount = deductedAmount;
                authorShareText = 'Sole main author (100%)';
                poolAmount = deductedAmount;
                poolPercentage = 100;
                sharingAuthorsCount = 1;
            }
            // Sole author from PU among external authors (as Co-Author)
            else if (coAuthors.length === 1) {
                const multiplier = publicationType === 'Scopus Indexed Conference Proceedings' ? 1.0 : 0.8;
                finalAmount = deductedAmount * multiplier;
                authorShareText = `Sole co-author (${multiplier * 100}%)`;
                poolAmount = deductedAmount * multiplier;
                poolPercentage = multiplier * 100;
                sharingAuthorsCount = 1;
            }
        }
        // Mixed roles (Internal Main Authors AND Internal Co-Authors)
        else if (mainAuthors.length > 0 && coAuthors.length > 0) {
            if (isMainAuthor) {
                poolPercentage = 70;
                sharingAuthorsCount = mainAuthors.length;
                poolAmount = deductedAmount * 0.7;
                finalAmount = poolAmount / mainAuthors.length;
            } else {
                poolPercentage = 30;
                sharingAuthorsCount = coAuthors.length;
                poolAmount = deductedAmount * 0.3;
                finalAmount = poolAmount / coAuthors.length;
            }
            authorShareText = `Mixed: Main (70% ÷ ${mainAuthors.length}), Co-Author (30% ÷ ${coAuthors.length})`;
        }
        // Multiple Co-Authors only (no internal Main Authors)
        else if (mainAuthors.length === 0 && coAuthors.length > 0) {
            const multiplier = publicationType === 'Scopus Indexed Conference Proceedings' ? 1.0 : 0.8;
            poolPercentage = multiplier * 100;
            sharingAuthorsCount = coAuthors.length;
            poolAmount = deductedAmount * multiplier;
            finalAmount = poolAmount / coAuthors.length;
            authorShareText = `Multiple co-authors (${multiplier * 100}% ÷ ${coAuthors.length})`;
        }
        // Multiple main authors only
        else if (mainAuthors.length > 0) {
            poolPercentage = 100;
            sharingAuthorsCount = mainAuthors.length;
            poolAmount = deductedAmount;
            finalAmount = poolAmount / mainAuthors.length;
            authorShareText = `Multiple main authors (÷ ${mainAuthors.length})`;
        }

        // --- Post-Calculation Policy Enforcement ---

        // Policy: Co-Authors beyond 5th author position (or 8th if sole internal co-author) are not eligible for monetary incentive.
        const position = getClaimantAuthorPosition(claimData);
        const isSinglePuCoAuthor = internalAuthors.length === 1 && coAuthors.length === 1;
        const maxPosition = isSinglePuCoAuthor ? 8 : 5;
        if (publicationType !== 'Scopus Indexed Conference Proceedings' && !isMainAuthor && position > maxPosition) {
            finalAmount = 0;
            authorShareText = `Ineligible: Co-author at position ${position} (Max position is ${maxPosition}th)`;
        }

        if (claimData.numberOfAffiliations && claimData.numberOfAffiliations > 1) {
            finalAmount = finalAmount / claimData.numberOfAffiliations;
            authorShareText += ` (Divided by ${claimData.numberOfAffiliations} affiliation(s))`;
        }

        const breakdown: ResearchIncentiveBreakdown = {
            baseAmount: baseIncentive,
            publicationTypeAdjustment: publicationType === 'Case Reports/Short Surveys' ? '0.9×' : (publicationType === 'Review Articles' && ['Q3', 'Q4'].includes(journalClassification || '') ? '0.8×' : '1.0×'),
            adjustedAmount: Math.round(adjustedAmount),
            deductions,
            deductedAmount: Math.round(deductedAmount),
            internalAuthorsCount: internalAuthors.length,
            mainAuthorsCount: mainAuthors.length,
            coAuthorsCount: coAuthors.length,
            authorShare: authorShareText,
            finalAmount: Math.round(finalAmount),
            poolAmount: Math.round(poolAmount),
            poolPercentage,
            sharingAuthorsCount
        };

        return { success: true, amount: Math.round(finalAmount), breakdown };

    } catch (error: any) {
        console.error("Error calculating incentive:", error);
        return { success: false, error: "Calculation failed: " + error.message };
    }
}



// --- Book/Chapter Calculation ---

function getBaseIncentiveForBook(claimData: Partial<IncentiveClaim>, isChapter: boolean): number {
    const isScopus = claimData.isScopusIndexed === true;
    const pubType = claimData.publisherType;
    const pages = isChapter ? (claimData.bookChapterPages || 0) : (claimData.bookTotalPages || 0);

    if (isChapter) {
        if (isScopus) return 5000;
        if (pubType === 'National') {
            return 0; // Deleted under R&D Policy revision August 2026
        } else if (pubType === 'International') {
            if (pages > 20) return 3000;
            if (pages >= 10) return 2000;
            if (pages >= 5) return 1000;
        }
    } else { // Full Book
        if (isScopus) return 20000;
        if (pubType === 'National') {
            return 0; // Deleted under R&D Policy revision August 2026
        } else if (pubType === 'International') {
            if (pages > 350) return 6000;
            if (pages >= 201) return 3500;
            if (pages >= 100 && pages <= 200) return 2000;
            return 0; // under 100 pages is 0
        }
    }
    return 0;
}


export async function calculateBookIncentive(claimData: Partial<IncentiveClaim>): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        const isChapter = claimData.bookApplicationType === 'Book Chapter';
        let baseIncentive = getBaseIncentiveForBook(claimData, isChapter);

        if (claimData.authorRole === 'Editor') {
            baseIncentive *= 0.5;
        }

        let totalIncentive = baseIncentive;

        // Rule for multiple chapters in the same book
        if (isChapter && claimData.chaptersInSameBook && claimData.chaptersInSameBook > 1) {
            const n = claimData.chaptersInSameBook;
            // To get the book limit, we create a temporary object with enough pages to qualify for a full book incentive
            const fullBookData = { ...claimData, bookTotalPages: 999 };
            const baseBookIncentive = getBaseIncentiveForBook(fullBookData, false);

            let sum = 0;
            for (let k = 1; k <= n; k++) {
                sum += baseIncentive / k;
            }
            totalIncentive = Math.min(sum, baseBookIncentive);
        }

        const internalAuthorsCount = claimData.authors?.filter(a => !a.isExternal).length || 1;
        if (internalAuthorsCount > 1) {
            totalIncentive /= internalAuthorsCount;
        }

        return { success: true, amount: Math.round(totalIncentive) };
    } catch (error: any) {
        console.error("Error calculating book incentive:", error);
        return { success: false, error: error.message || "An unknown error occurred during calculation." };
    }
}


// --- APC Calculation ---

export async function calculateApcIncentive(
    claimData: Partial<IncentiveClaim>,
    isSpecialFaculty: boolean
): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        const { apcIndexingStatus, apcQRating, authors, apcTotalAmount } = claimData;

        if (!authors || authors.length === 0) {
            return { success: false, error: "Author list is empty." };
        }

        const internalAuthors = authors.filter(a => !a.isExternal);
        const internalAuthorCount = internalAuthors.length;
        if (internalAuthorCount === 0) {
            return { success: true, amount: 0 };
        }

        let actualAmountPaid = 0;
        if (apcTotalAmount !== undefined && apcTotalAmount !== null) {
            const cleanAmount = String(apcTotalAmount).replace(/[^0-9.]/g, '');
            actualAmountPaid = parseFloat(cleanAmount) || 0;
        }

        let maxReimbursementLimit = 0;

        const hasScopusOrWoS = apcIndexingStatus?.some(status =>
            status.toLowerCase().includes('scopus') ||
            status.toLowerCase().includes('web of science') ||
            status.toLowerCase().includes('sci')
        );

        if (hasScopusOrWoS && apcQRating) {
            switch (apcQRating) {
                case 'Q1': maxReimbursementLimit = 40000; break;
                case 'Q2': maxReimbursementLimit = 30000; break;
                case 'Q3': maxReimbursementLimit = 20000; break;
                case 'Q4': maxReimbursementLimit = 15000; break;
            }
        } else if (!isSpecialFaculty && apcIndexingStatus) {
            if (apcIndexingStatus.some(status => status.includes('Web of Science indexed journals (ESCI)'))) {
                maxReimbursementLimit = 8000;
            } else if (apcIndexingStatus.some(status => status.includes('UGC-CARE Group-I'))) {
                maxReimbursementLimit = 5000;
            }
        }

        const admissibleAmount = Math.min(actualAmountPaid, maxReimbursementLimit);

        // Split equally among all PU (internal) authors (as per SOP)
        const individualShare = admissibleAmount / (internalAuthorCount || 1);

        let finalAmount = individualShare;
        const paperIncentivePaid = (claimData as any).paperIncentivePaid || 0;
        if (paperIncentivePaid > 0) {
            finalAmount = Math.max(0, individualShare - (paperIncentivePaid * 0.5));
        }

        return { 
            success: true, 
            amount: Math.round(finalAmount),
            individualShare: Math.round(individualShare),
            paperIncentiveDeduction: Math.round(paperIncentivePaid * 0.5)
        } as any;

    } catch (error: any) {
        console.error("Error calculating APC incentive:", error);
        return { success: false, error: error.message || "An unknown error occurred during calculation." };
    }
}
// --- Conference Calculation ---
export async function calculateConferenceIncentive(
    claimData: Partial<IncentiveClaim>
): Promise<{ success: boolean; amount?: number; eligibleExpenses?: number; maxReimbursement?: number; error?: string }> {
    try {
        const {
            conferenceType,
            conferenceVenue,
            presentationType,
            conferenceMode,
            registrationFee,
            travelFare,
            accommodationExpense,
            organizerName,
            conferenceName,
        } = claimData;

        // ensure numeric values (defensive)
        const regFeeNum = Number(registrationFee || 0);
        const travelFareNum = Number(travelFare || 0);
        const accommodationExpenseNum = Number(accommodationExpense || 0);

        const mode = (conferenceMode || "").toString().trim().toLowerCase();
        let maxReimbursement = 0;

        const isPuConference =
            (organizerName || "").toLowerCase().includes("parul university") ||
            (conferenceName || "").toLowerCase().includes("picet");

        if (isPuConference) {
            // PU conferences: 75% of registration fee (cap = 75% of reg fee)
            maxReimbursement = Math.round(regFeeNum * 0.75);
        } else if (mode === "online") {
            const regFee = regFeeNum;
            const prevOnlineCount = Number(claimData.previousOfflinePresentationsCount || 0); // we will check online limits
            const prevOnlineReal = Number((claimData as any).previousOnlinePresentationsCount || 0);
            const totalOnline = prevOnlineCount + prevOnlineReal;
            if (totalOnline >= 1) {
                maxReimbursement = 0;
            } else {
                maxReimbursement = Math.min(regFee * 0.75, 6000);
            }
        } else if (mode === "offline") {
            const prevOfflineCount = Number(claimData.previousOfflinePresentationsCount || 0);
            if (prevOfflineCount >= 2) {
                maxReimbursement = 0;
            } else {
                let regionalCap = 0;
                if (conferenceType === "International") {
                    switch (conferenceVenue as string) {
                        case "Indian Subcontinent":
                            regionalCap = 30000;
                            break;
                        case "South Korea, Japan, Australia and Middle East":
                        case "South Korea, Japan and Middle East":
                            regionalCap = 45000;
                            break;
                        case "Europe":
                        case "Europe and Australia":
                            regionalCap = 60000;
                            break;
                        case "African/South American/North American":
                            regionalCap = 75000;
                            break;
                        case "India":
                            regionalCap = presentationType === "Oral" ? 20000 : 15000;
                            break;
                        case "Other":
                            regionalCap = 75000;
                            break;
                        default:
                            regionalCap = 0;
                    }
                } else if (conferenceType === "National") {
                    regionalCap = presentationType === "Oral" ? 12000 : 10000;
                } else if (conferenceType === "Regional/State") {
                    regionalCap = 7500;
                }

                if (prevOfflineCount === 1) {
                    maxReimbursement = Math.min(regionalCap, 5000);
                } else {
                    maxReimbursement = regionalCap;
                }
            }
        }

        // eligibleExpenses = registration + travel for offline, else registration only
        // if outside India and offline, add accommodationExpense too.
        const eligibleExpenses =
            mode === "offline"
                ? (conferenceVenue !== "India" ? regFeeNum + travelFareNum + accommodationExpenseNum : regFeeNum + travelFareNum)
                : regFeeNum;

        // final reimbursable amount is min(eligibleExpenses, maxReimbursement) but
        // if maxReimbursement is 0 (policy not determined), treat it as "no cap" and return eligibleExpenses.
        const reimbursableAmount =
            maxReimbursement > 0 ? Math.min(eligibleExpenses, maxReimbursement) : eligibleExpenses;

        // round to nearest integer
        let finalAmount = Math.round(reimbursableAmount);

        // Apply author sharing logic for Conference Presentations
        // Amount divided equally among all eligible authors (up to 5th position, plus corresponding author regardless of position)
        const { authors = [] } = claimData;
        if (authors && authors.length > 0) {
            // Filter authors: include up to 5th position OR corresponding author role
            const eligibleAuthors = authors.filter((author) => {
                const position = parseInt(author.position || '0', 10);
                const isCorresponding = author.role === 'Corresponding Author' || author.role === 'First & Corresponding Author';
                return (position > 0 && position <= 5) || isCorresponding;
            });

            if (eligibleAuthors.length > 0) {
                finalAmount = Math.round(finalAmount / eligibleAuthors.length);
            }
        }

        return {
            success: true,
            amount: finalAmount,
            eligibleExpenses: Math.round(eligibleExpenses),
            maxReimbursement: Math.round(maxReimbursement),
        };
    } catch (error: any) {
        console.error("Error calculating conference incentive:", error);
        return {
            success: false,
            error: error.message || "An unknown error occurred during calculation.",
        };
    }
}



export async function calculateMembershipIncentive(claimData: Partial<IncentiveClaim>): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        const paymentDateStr = claimData.membershipPaymentDate;
        if (paymentDateStr) {
            const paymentDate = new Date(paymentDateStr);
            const cutoffDate = new Date('2026-09-10T23:59:59');
            if (paymentDate > cutoffDate) {
                return { success: true, amount: 0 };
            }
        }
        const amountPaid = claimData.membershipAmountPaid || 0;
        if (amountPaid > 0) {
            const incentive = Math.min(amountPaid * 0.5, 10000);
            return { success: true, amount: incentive };
        }
        return { success: true, amount: 0 };
    } catch (error: any) {
        console.error("Error calculating membership incentive:", error);
        return { success: false, error: error.message || "An unknown error occurred during calculation." };
    }
}

// --- Patent Calculation ---

export async function calculatePatentIncentive(claimData: Partial<IncentiveClaim>): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        const { currentStatus, patentFiledInPuName, isPuSoleApplicant, patentInventors, patentCoApplicants, patentRoutedViaSsip } = claimData;

        const inventorCount = (patentInventors?.length || 0) + (patentCoApplicants?.length || 0) || 1;
        if (inventorCount === 0) {
            return { success: true, amount: 0 };
        }

        let baseAmount = 0;
        // Check both patentStatus and currentStatus to be robust
        const status = claimData.patentStatus || claimData.currentStatus;

        if (status === 'Published') {
            baseAmount = 3000;
        } else if (status === 'Granted' || status === 'Awarded') {
            baseAmount = 18000;
        } else {
            return { success: true, amount: 0 };
        }

        let totalIncentive = 0;
        if (patentRoutedViaSsip) {
            totalIncentive = 3000;
        } else if (patentFiledInPuName) {
            if (isPuSoleApplicant) {
                totalIncentive = baseAmount; // 100% for sole applicant
            } else {
                totalIncentive = baseAmount * 0.8; // 80% for joint applicant
            }
        }

        const individualShare = totalIncentive > 0 ? totalIncentive / inventorCount : 0;

        return { success: true, amount: Math.round(individualShare) };
    } catch (error: any) {
        console.error("Error calculating patent incentive:", error);
        return { success: false, error: error.message || "An unknown error occurred during calculation." };
    }
}

// --- Journal Publication Points Calculation (Section 5.2) ---

/**
 * Calculate points for journal publications based on:
 * - Journal Quartile (Q1: 15pts, Q2: 10pts, Q3: 6pts, Q4: 4pts)
 * - Article Type multiplier
 * - Author Position multiplier
 */
export async function calculateJournalPublicationPoints(
    claimData: Partial<IncentiveClaim>
): Promise<{ success: boolean; points?: number; breakdown?: { basePoints: number; articleTypeMultiplier: number; authorPositionMultiplier: number }; error?: string }> {
    try {
        const { journalClassification, publicationType, authorPosition, authors = [], userEmail } = claimData;

        // Validate journal quartile
        const validQuartiles = ['Q1', 'Q2', 'Q3', 'Q4'];
        if (!journalClassification || !validQuartiles.includes(journalClassification)) {
            return { success: false, error: "Valid journal quartile (Q1-Q4) is required." };
        }

        // Base points by journal quartile
        const basePointsMap: { [key: string]: number } = {
            'Q1': 30,
            'Q2': 20,
            'Q3': 15,
            'Q4': 10
        };
        const basePoints = basePointsMap[journalClassification] || 0;

        // Article type multiplier (Section 5.2.2)
        let articleTypeMultiplier = 1;
        switch (publicationType) {
            case 'Research Articles/Short Communications':
            case 'Original Research Article':
            case 'Short Communication':
                articleTypeMultiplier = 1;
                break;
            case 'Review Articles':
            case 'Review Article':
                // Q1/Q2 gets 1x, Q3/Q4 gets 0.8x
                articleTypeMultiplier = (journalClassification === 'Q1' || journalClassification === 'Q2') ? 1 : 0.8;
                break;
            case 'Case Reports/Short Surveys':
            case 'Case Report':
            case 'Case Study':
                articleTypeMultiplier = 0.9;
                break;
            default:
                articleTypeMultiplier = 1;
        }

        // Find claimant in author list and get author position
        const claimant = authors?.find(a => a.email?.toLowerCase() === userEmail?.toLowerCase()) || authors[0] || {
            name: claimData.userName || 'Claimant',
            email: userEmail || '',
            role: 'First Author',
            isExternal: false,
            status: 'approved'
        };

        // Author position multiplier (Section 5.2.3)
        let authorPositionMultiplier = 0.3; // Default: Co-Author
        const internalAuthors = authors?.filter(a => !a.isExternal) || [];
        const internalAuthorCount = internalAuthors.length;

        if (internalAuthorCount === 1) {
            // Single Author: 1x
            authorPositionMultiplier = 1;
        } else if (claimant.role === 'First Author' || claimant.role === 'Corresponding Author' || claimant.role === 'First & Corresponding Author') {
            // First or Corresponding Author: 0.7x
            authorPositionMultiplier = 0.7;
        } else if (claimant.role === 'Co-Author') {
            // Determine author order position
            const authorOrder = authors?.findIndex(a => a.email?.toLowerCase() === userEmail?.toLowerCase()) ?? -1;

            if (authorOrder === -1) {
                return { success: false, error: "Could not determine author position." };
            }

            // Check if single co-author from PU & multiple authors from other institutions
            if (internalAuthorCount === 1) {
                // This is the single co-author from PU with multiple external authors: 0.8x
                authorPositionMultiplier = 0.8;
            } else if (authorOrder < 5) {
                // Co-Author (Author Order up to 5): 0.3x
                authorPositionMultiplier = 0.3;
            } else {
                // Co-Author (Author Order 6 Onwards): 0.1x
                authorPositionMultiplier = 0.1;
            }
        }

        // Calculate final points
        const totalPoints = basePoints * articleTypeMultiplier * authorPositionMultiplier;

        return {
            success: true,
            points: Number(totalPoints.toFixed(2)),
            breakdown: {
                basePoints,
                articleTypeMultiplier,
                authorPositionMultiplier
            }
        };

    } catch (error: any) {
        console.error("Error calculating journal publication points:", error);
        return { success: false, error: error.message || "An unknown error occurred during calculation." };
    }
}

// --- EMR Sanction Project Calculation ---

export async function calculateEmrSanctionIncentive(claimData: Partial<IncentiveClaim>): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        const sanctionAmount = claimData.sanctionAmount || 0;
        const incentive = sanctionAmount * 0.01; // 1% as per user request
        return { success: true, amount: Math.round(incentive) };
    } catch (error: any) {
        console.error("Error calculating EMR sanction incentive:", error);
        return { success: false, error: error.message || "An unknown error occurred during calculation." };
    }
}
