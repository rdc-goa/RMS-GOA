import { IncentiveClaim, Author } from '@/types';

export interface IncentiveBreakdown {
    baseAmount: number;
    publicationTypeAdjustment?: string;
    adjustedAmount: number;
    deductions: string[];
    deductedAmount: number;
    internalAuthorsCount: number;
    mainAuthorsCount: number;
    coAuthorsCount: number;
    authorShare: string;
    finalAmount: number;
    // Award specific fields
    isAward?: boolean;
    category?: string;
    isPaid?: boolean;
    honorsAmount?: number;
}

/**
 * Calculates the incentive breakdown for a given claim.
 * Centralized logic for Research Papers, Awards, and other claim types.
 */
export function calculateIncentiveBreakdown(claim: IncentiveClaim): IncentiveBreakdown | null {
    if (!claim) return null;

    try {
        // --- Awards Logic ---
        if (claim.claimType === 'Award') {
            let baseAmount = 0;
            if (claim.awardCategory === 'International Award') baseAmount = 15000;
            else if (claim.awardCategory === 'National Award') baseAmount = 5000;
            else if (claim.awardCategory === 'Best Research Paper Award') baseAmount = 2000;
            
            const isPaid = !!claim.isPaidAward;
            const finalAmount = isPaid ? 0 : baseAmount;
            
            return {
                isAward: true,
                category: claim.awardCategory,
                isPaid: isPaid,
                baseAmount,
                finalAmount,
                honorsAmount: finalAmount,
                // Fill with defaults for the return type
                adjustedAmount: baseAmount,
                deductions: isPaid ? ['Paid Award (Disqualified)'] : [],
                deductedAmount: finalAmount,
                internalAuthorsCount: 0,
                mainAuthorsCount: 0,
                coAuthorsCount: 0,
                authorShare: isPaid ? 'Ineligible (Paid Award)' : 'Sole Awardee'
            };
        }

        // --- Research Papers Logic ---
        if (claim.claimType === 'Research Papers') {
            const { journalClassification, publicationType, wasApcPaidByUniversity, isPuNameInPublication, authors = [] } = claim;
            
            // Normalize internal authors
            const internalAuthors = authors.map(a => ({
                ...a,
                isExternal: a.email?.toLowerCase() === claim.userEmail?.toLowerCase() ? false : a.isExternal
            })).filter(a => !a.isExternal);
            
            // Categorize authors
            const mainRoles = ['First Author', 'Corresponding Author', 'First & Corresponding Author', 'First & Presenting Author'];
            const mainAuthors = internalAuthors.filter(a => mainRoles.includes(a.role));
            const coAuthors = internalAuthors.filter(a => a.role === 'Co-Author' || a.role === 'Presenting Author');
            
            const isMainAuthor = mainRoles.includes(claim.authorType || '');

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

            const isSpecialFaculty = SPECIAL_POLICY_FACULTIES.includes(claim.faculty || '');
            const isScopus = claim.indexType === 'scopus' || claim.indexType === 'both';
            const isWos = claim.indexType === 'wos' || claim.indexType === 'both';
            const isWosValid = isWos && (claim.indexType as string) !== 'esci'; // ESCI is deleted/excluded

            // 1. Base incentive
            let baseAmount = 0;
            if (publicationType === 'Letter to the Editor/Editorial') {
                baseAmount = 2500;
            } else if (publicationType === 'Scopus Indexed Conference Proceedings') {
                baseAmount = isScopus ? 2000 : 0;
            } else {
                if (isSpecialFaculty) {
                    // Category A: SCOPUS Q1-Q4 only
                    if (isScopus && journalClassification) {
                        switch (journalClassification) {
                            case 'Nature/Science/Lancet': baseAmount = 60000; break;
                            case 'Top 1% Journals': baseAmount = 30000; break;
                            case 'Q1': baseAmount = 16000; break;
                            case 'Q2': baseAmount = 10000; break;
                            case 'Q3': baseAmount = 6000; break;
                            case 'Q4': baseAmount = 4000; break;
                        }
                    }
                } else {
                    // Non-Category A: Scopus Q1-Q4 or Web of Science / ABDC / DOAJ
                    if (isScopus && journalClassification && ['Nature/Science/Lancet', 'Top 1% Journals', 'Q1', 'Q2', 'Q3', 'Q4'].includes(journalClassification)) {
                        switch (journalClassification) {
                            case 'Nature/Science/Lancet': baseAmount = 60000; break;
                            case 'Top 1% Journals': baseAmount = 30000; break;
                            case 'Q1': baseAmount = 16000; break;
                            case 'Q2': baseAmount = 10000; break;
                            case 'Q3': baseAmount = 6000; break;
                            case 'Q4': baseAmount = 4000; break;
                        }
                    } else if (isWosValid || claim.iqacClaimType?.toLowerCase().includes('abdc') || claim.iqacClaimType?.toLowerCase().includes('doaj')) {
                        baseAmount = 2000;
                    } else if (publicationType === 'UGC listed journals (Journals found qualified through UGC-CARE Protocol, Group-I)') {
                        baseAmount = 1000;
                    }
                }
            }

            // 2. Apply publication type adjustment
            let adjustedAmount = baseAmount;
            let publicationTypeAdjustment = '1.0×';
            if (publicationType === 'Case Reports/Short Surveys') {
                adjustedAmount = baseAmount * 0.9;
                publicationTypeAdjustment = '0.9×';
            } else if (publicationType === 'Review Articles' && ['Q3', 'Q4'].includes(journalClassification || '')) {
                adjustedAmount = baseAmount * 0.8;
                publicationTypeAdjustment = '0.8×';
            } else if (publicationType === 'Letter to the Editor/Editorial') {
                adjustedAmount = 2500;
                publicationTypeAdjustment = 'Fixed';
            }

            // 3. Apply university-level deductions
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

            // 4. Calculate share based on author composition
            let finalAmount = 0;
            let authorShare = 'N/A';

            if (publicationType === 'Letter to the Editor/Editorial') {
                const totalAuthorsCount = authors.length || 1;
                finalAmount = deductedAmount / totalAuthorsCount;
                authorShare = `Equally divided among all authors (÷ ${totalAuthorsCount})`;
            } else if (publicationType === 'Scopus Indexed Conference Proceedings') {
                finalAmount = deductedAmount / internalAuthors.length;
                authorShare = `Equally divided among all internal authors (÷ ${internalAuthors.length})`;
            } else if (internalAuthors.length === 0) {
                finalAmount = 0;
                authorShare = 'No internal authors';
            } else if (internalAuthors.length === 1) {
                if (mainAuthors.length === 1) {
                    finalAmount = isMainAuthor ? deductedAmount : 0;
                    authorShare = 'Sole main author (100%)';
                } else if (coAuthors.length === 1) {
                    const multiplier = publicationType === 'Scopus Indexed Conference Proceedings' ? 1.0 : 0.8;
                    finalAmount = !isMainAuthor ? deductedAmount * multiplier : 0;
                    authorShare = `Sole co-author (${multiplier * 100}%)`;
                }
            }
            else if (mainAuthors.length > 0 && coAuthors.length > 0) {
                if (isMainAuthor) {
                    finalAmount = (deductedAmount * 0.7) / mainAuthors.length;
                } else {
                    finalAmount = (deductedAmount * 0.3) / coAuthors.length;
                }
                authorShare = `Mixed: Main (70% ÷ ${mainAuthors.length}), Co-Author (30% ÷ ${coAuthors.length})`;
            }
            else if (mainAuthors.length === 0 && coAuthors.length > 0) {
                const multiplier = publicationType === 'Scopus Indexed Conference Proceedings' ? 1.0 : 0.8;
                finalAmount = !isMainAuthor ? (deductedAmount * multiplier) / coAuthors.length : 0;
                authorShare = `Multiple co-authors (${multiplier * 100}% ÷ ${coAuthors.length})`;
            }
            else if (mainAuthors.length > 0) {
                if (isMainAuthor) finalAmount = deductedAmount / mainAuthors.length;
                authorShare = `Multiple main authors (÷ ${mainAuthors.length})`;
            }

            // 5. Post-Calculation Policy Enforcement
            const position = parseInt(claim.authorPosition || '0', 10);
            const isSinglePuCoAuthor = internalAuthors.length === 1 && coAuthors.length === 1;
            const maxPosition = isSinglePuCoAuthor ? 8 : 5;
            
            if (publicationType !== 'Scopus Indexed Conference Proceedings' && publicationType !== 'Letter to the Editor/Editorial' && !isMainAuthor && position > maxPosition) {
                finalAmount = 0;
                authorShare = `Ineligible: Co-author at position ${position} (Max position is ${maxPosition}th)`;
            }

            if (claim.numberOfAffiliations && claim.numberOfAffiliations > 1) {
                finalAmount = finalAmount / claim.numberOfAffiliations;
                authorShare += ` (Divided by ${claim.numberOfAffiliations} affiliation(s))`;
            }

            return {
                baseAmount,
                publicationTypeAdjustment,
                adjustedAmount: Math.round(adjustedAmount),
                deductions,
                deductedAmount: Math.round(deductedAmount),
                internalAuthorsCount: internalAuthors.length,
                mainAuthorsCount: mainAuthors.length,
                coAuthorsCount: coAuthors.length,
                authorShare,
                finalAmount: Math.round(finalAmount),
            };
        }

        return null;
    } catch (error) {
        console.error('Error calculating incentive breakdown:', error);
        return null;
    }
}
