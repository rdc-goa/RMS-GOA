
'use server';

import type { IncentiveClaim, CoAuthor, Author } from '@/types';

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
    
    if (designation === 'Ph.D Scholar') {
        switch (journalClassification) {
            case 'Q1': return 6000;
            case 'Q2': return 4000;
            default: return 0; // PhD Scholars only get incentive for Q1/Q2
        }
    }

    const isSpecialFaculty = SPECIAL_POLICY_FACULTIES.includes(faculty);

    if (publicationType === 'Scopus Indexed Conference Proceedings') {
        return 3000;
    }

    // Common rules for Scopus (Q1-Q4) and high-tier WoS (Q1-Q2) for ALL faculties
    if (journalClassification && ['Q1', 'Q2', 'Q3', 'Q4', 'Top 1% Journals', 'Nature/Science/Lancet'].includes(journalClassification)) {
        switch (journalClassification) {
           case 'Nature/Science/Lancet': return 50000;
           case 'Top 1% Journals': return 25000;
           case 'Q1': return 15000;
           case 'Q2': return 10000;
           case 'Q3': return 6000; 
           case 'Q4': return 4000;
           default: return 0;
       }
   }

    if (isSpecialFaculty) {
        // For Category A, only the Quartile-based incentives apply, which are handled above.
        // No other incentives like UGC are applicable for them.
        return 0;
    } else {
        // Rules for faculties NOT in Category A
        if (wosType === 'SCIE' || wosType === 'SSCI' || wosType === 'A&HCI') {
             // Assuming Q3/Q4 might be derived elsewhere, but based on text it's a flat rate
             return 3000;
        }
        if (publicationType === 'UGC listed journals (Journals found qualified through UGC-CARE Protocol, Group-I)') return 1000;

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

export async function calculateResearchPaperIncentive(
    claimData: Partial<IncentiveClaim>,
    faculty: string,
    designation?: string,
): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
        const { authors = [], userEmail, publicationType, journalClassification, wasApcPaidByUniversity } = claimData;
        
        // Find the claimant in the author list
        const claimant = authors.find(a => a.email.toLowerCase() === userEmail?.toLowerCase());
        if (!claimant) {
            return { success: false, error: "Claimant not found in the author list." };
        }
        
        const baseIncentive = getBaseIncentiveForPaper(claimData, faculty, designation);
        let totalSpecifiedIncentive = adjustForPublicationType(baseIncentive, publicationType, journalClassification);
        
        // Apply university-level deductions before author distribution
        if (wasApcPaidByUniversity) {
            totalSpecifiedIncentive /= 2;
        }
        if (claimData.isPuNameInPublication === false) {
            totalSpecifiedIncentive /= 2;
        }
        
        const totalAuthors = authors.length || 1;

        // Special case for Letter to Editor/Editorial
        if (publicationType === 'Letter to the Editor/Editorial') {
            const amountPerAuthor = totalSpecifiedIncentive / totalAuthors;
            return { success: true, amount: Math.round(amountPerAuthor) };
        }

        const internalAuthors = authors.filter(a => !a.isExternal);
        if (internalAuthors.length === 0) {
            return { success: true, amount: 0 }; // No PU authors
        }
        
        // Rule for Scopus Conference Proceedings: Only Presenting authors are eligible
        if (publicationType === 'Scopus Indexed Conference Proceedings') {
            const presentingAuthors = internalAuthors.filter(a => a.role === 'Presenting Author' || a.role === 'First & Presenting Author');
            const isClaimantPresenting = presentingAuthors.some(a => a.email.toLowerCase() === claimant.email.toLowerCase());
            
            if (!isClaimantPresenting) {
                return { success: true, amount: 0, error: 'Only Presenting Authors can claim for this publication type.' };
            }
            
            const amountPerPresentingAuthor = totalSpecifiedIncentive / (presentingAuthors.length || 1);
            return { success: true, amount: Math.round(amountPerPresentingAuthor) };
        }
        
        const mainAuthors = internalAuthors.filter(a => a.role === 'First Author' || a.role === 'Corresponding Author' || a.role === 'First & Corresponding Author');
        const coAuthors = internalAuthors.filter(a => a.role === 'Co-Author');

        let finalAmount = 0;

        if (internalAuthors.length === 1) {
            // Rule 1: Sole author (as First or Corresponding)
            if (mainAuthors.length === 1) {
                finalAmount = totalSpecifiedIncentive;
            }
            // Rule 2: Sole author (as Co-Author)
            else if (coAuthors.length === 1) {
                finalAmount = totalSpecifiedIncentive * 0.8;
            }
        }
        // Rule 4: Mixed roles (First/Corresponding AND Co-Authors)
        else if (mainAuthors.length > 0 && coAuthors.length > 0) {
            if (claimant.role === 'Co-Author') {
                finalAmount = (totalSpecifiedIncentive * 0.3) / (coAuthors.length || 1);
            } else { // Claimant is a main author
                finalAmount = (totalSpecifiedIncentive * 0.7) / (mainAuthors.length || 1);
            }
        }
        // Rule 3: Multiple Co-Authors only (no internal Main Authors)
        else if (mainAuthors.length === 0 && coAuthors.length > 1) {
            finalAmount = (totalSpecifiedIncentive * 0.8) / (coAuthors.length || 1);
        }
        // Fallback for cases like multiple main authors from PU but no co-authors
        else if (mainAuthors.length > 0 && coAuthors.length === 0) {
            finalAmount = totalSpecifiedIncentive / mainAuthors.length;
        }

        return { success: true, amount: Math.round(finalAmount) };

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
        if (isScopus) return 6000;
        if (pubType === 'National') { // Indian Publisher
            if (pages > 20) return 2500;
            if (pages >= 10) return 1500;
            if (pages >= 5) return 500;
        } else if (pubType === 'International') {
            if (pages > 20) return 3000;
            if (pages >= 10) return 2000;
            if (pages >= 5) return 1000;
        }
    } else { // Full Book
        if (isScopus) return 18000;
        if (pubType === 'National') { // Indian Publisher
            if (pages > 350) return 3000;
            if (pages >= 200) return 2500;
            if (pages >= 100) return 2000;
            return 1000; // < 100 pages
        } else if (pubType === 'International') {
            if (pages > 350) return 6000;
            if (pages >= 200) return 3500;
            return 2000; // < 200 pages
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

        const internalAuthorsCount = (claimData.authors?.filter(a => !a.isExternal).length || 0) + (claimData.totalPuAuthors || 0);
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
        
        const finalIncentive = admissibleAmount / internalAuthorCount;
        
        return { success: true, amount: Math.round(finalIncentive) };
        
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
        onlinePresentationOrder,
        organizerName,
        conferenceName,
      } = claimData;
  
      // ensure numeric values (defensive)
      const regFeeNum = Number(registrationFee || 0);
      const travelFareNum = Number(travelFare || 0);
  
      const mode = (conferenceMode || "").toString().trim().toLowerCase();
      let maxReimbursement = 0;
  
      const isPuConference =
        (organizerName || "").toLowerCase().includes("parul university goa") ||
        (conferenceName || "").toLowerCase().includes("picet");
  
      if (isPuConference) {
        // PU conferences: 75% of registration fee (cap = 75% of reg fee)
        maxReimbursement = Math.round(regFeeNum * 0.75);
      } else if (mode === "online") {
        const regFee = regFeeNum;
        switch (onlinePresentationOrder) {
          case "First":
            maxReimbursement = Math.min(regFee * 0.75, 15000);
            break;
          case "Second":
            maxReimbursement = Math.min(regFee * 0.6, 10000);
            break;
          case "Third":
            maxReimbursement = Math.min(regFee * 0.5, 7000);
            break;
          case "Additional":
            maxReimbursement = Math.min(regFee * 0.3, 2000);
            break;
          default:
            maxReimbursement = Math.min(regFee * 0.3, 2000);
        }
      } else if (mode === "offline") {
        if (conferenceType === "International") {
          switch (conferenceVenue) {
            case "Indian Subcontinent":
              maxReimbursement = 30000;
              break;
            case "South Korea, Japan, Australia and Middle East":
              maxReimbursement = 45000;
              break;
            case "Europe":
              maxReimbursement = 60000;
              break;
            case "African/South American/North American":
              maxReimbursement = 75000;
              break;
            case "India":
              maxReimbursement =
                presentationType === "Oral" ? 20000 : 15000;
              break;
            case "Other":
              maxReimbursement = 75000;
              break;
            default:
              // if venue missing, keep maxReimbursement = 0 so we don't accidentally give a cap
              maxReimbursement = 0;
          }
        } else if (conferenceType === "National") {
          maxReimbursement =
            presentationType === "Oral" ? 12000 : 10000;
        } else if (conferenceType === "Regional/State") {
          maxReimbursement = 7500;
        }
      }
  
      // eligibleExpenses = registration + travel for offline, else registration only
      const eligibleExpenses =
        mode === "offline" ? regFeeNum + travelFareNum : regFeeNum;
  
      // final reimbursable amount is min(eligibleExpenses, maxReimbursement) but
      // if maxReimbursement is 0 (policy not determined), treat it as "no cap" and return eligibleExpenses.
      const reimbursableAmount =
        maxReimbursement > 0 ? Math.min(eligibleExpenses, maxReimbursement) : eligibleExpenses;
  
      // round to nearest integer
      const finalAmount = Math.round(reimbursableAmount);
  
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
  


// --- Membership Calculation ---

export async function calculateMembershipIncentive(claimData: Partial<IncentiveClaim>): Promise<{ success: boolean; amount?: number; error?: string }> {
    try {
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
        const { currentStatus, patentFiledInPuName, isPuSoleApplicant, patentInventors } = claimData;
        
        const inventorCount = patentInventors?.length || 1;
        if (inventorCount === 0) {
            return { success: true, amount: 0 };
        }
        
        let baseAmount = 0;
        if (currentStatus === 'Published') {
            baseAmount = 3000;
        } else if (currentStatus === 'Granted') {
            baseAmount = 15000;
        } else {
             return { success: true, amount: 0 };
        }

        let totalIncentive = 0;
        if (patentFiledInPuName) {
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
