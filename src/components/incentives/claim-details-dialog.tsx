
'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { User, IncentiveClaim, Author, ApprovalStage } from '@/types';
import { Loader2, Printer, Check, X, Download, Bot, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { generateOfficeNotingForClaim } from '@/app/document-actions';
import { isEligibleForFinancialDisbursement } from '@/lib/incentive-eligibility';


function getVerificationMark(approval: ApprovalStage | null | undefined, fieldId: string) {
    if (!approval) return null;
    const verifiedStatus = approval.verifiedFields?.[fieldId];
    if (verifiedStatus === true) return <Check className="h-4 w-4 text-green-600" />;
    if (verifiedStatus === false) return <X className="h-4 w-4 text-red-600" />;
    return null;
}

export function ClaimDetailsDialog({ claim, open, onOpenChange, currentUser, claimant, onTakeAction }: { claim: IncentiveClaim | null, open: boolean, onOpenChange: (open: boolean) => void, currentUser: User | null, claimant: User | null, onTakeAction?: () => void }) {
    const { toast } = useToast();
    const [isPrinting, setIsPrinting] = useState(false);

    // Check if amount hasn't been changed by any approver
    const isAmountUnchanged = useMemo(() => {
        if (claim && claim.claimType === 'Research Papers' && claim.calculatedIncentive && claim.finalApprovedAmount) {
            // If the amounts match, it means no approver has changed the amount
            return claim.calculatedIncentive === claim.finalApprovedAmount;
        }
        return false;
    }, [claim]);

    // Calculate incentive breakdown for research papers
    const calculateIncentiveBreakdown = () => {
        if (!claim || claim.claimType !== 'Research Papers') return null;
        
        try {
            const { journalClassification, publicationType, wasApcPaidByUniversity, isPuNameInPublication, authors = [] } = claim;
            const internalAuthors = authors.filter(a => !a.isExternal);
            const mainAuthors = internalAuthors.filter(a => ['First Author', 'Corresponding Author', 'First & Corresponding Author'].includes(a.role));
            const coAuthors = internalAuthors.filter(a => a.role === 'Co-Author');

            // Base incentive
            let baseAmount = 0;
            switch (journalClassification) {
                case 'Nature/Science/Lancet': baseAmount = 50000; break;
                case 'Top 1% Journals': baseAmount = 25000; break;
                case 'Q1': baseAmount = 15000; break;
                case 'Q2': baseAmount = 10000; break;
                case 'Q3': baseAmount = 6000; break;
                case 'Q4': baseAmount = 4000; break;
            }

            // Apply publication type adjustment
            let adjustedAmount = baseAmount;
            if (publicationType === 'Case Reports/Short Surveys') {
                adjustedAmount = baseAmount * 0.9;
            } else if (publicationType === 'Review Articles' && ['Q3', 'Q4'].includes(journalClassification || '')) {
                adjustedAmount = baseAmount * 0.8;
            } else if (publicationType === 'Letter to the Editor/Editorial') {
                adjustedAmount = 2500;
            }

            // Apply university-level deductions
            let deductedAmount = adjustedAmount;
            const deductions = [];
            
            if (wasApcPaidByUniversity) {
                deductedAmount /= 2;
                deductions.push('APC Paid by University (÷2)');
            }
            if (isPuNameInPublication === false) {
                deductedAmount /= 2;
                deductions.push('PU Name Not in Publication (÷2)');
            }

            // Calculate share based on author composition
            let finalAmount = 0;
            let authorShare = 'N/A';

            if (internalAuthors.length === 0) {
                finalAmount = 0;
                authorShare = 'No internal authors';
            } else if (internalAuthors.length === 1) {
                if (mainAuthors.length === 1) {
                    finalAmount = deductedAmount;
                    authorShare = 'Sole main author (100%)';
                } else if (coAuthors.length === 1) {
                    finalAmount = deductedAmount * 0.8;
                    authorShare = 'Sole co-author (80%)';
                }
            } else if (mainAuthors.length > 0 && coAuthors.length > 0) {
                const mainShare = (deductedAmount * 0.7) / mainAuthors.length;
                const coShare = (deductedAmount * 0.3) / coAuthors.length;
                finalAmount = mainAuthors.length > 0 ? mainShare : coShare;
                authorShare = `Mixed: Main (70% ÷ ${mainAuthors.length}), Co-Author (30% ÷ ${coAuthors.length})`;
            } else if (mainAuthors.length === 0 && coAuthors.length > 1) {
                finalAmount = (deductedAmount * 0.8) / coAuthors.length;
                authorShare = `Multiple co-authors (80% ÷ ${coAuthors.length})`;
            } else if (mainAuthors.length > 0) {
                finalAmount = deductedAmount / mainAuthors.length;
                authorShare = `Multiple main authors (÷ ${mainAuthors.length})`;
            }

            return {
                baseAmount,
                publicationTypeAdjustment: publicationType === 'Case Reports/Short Surveys' ? '0.9×' : publicationType === 'Review Articles' && ['Q3', 'Q4'].includes(journalClassification || '') ? '0.8×' : '1.0×',
                adjustedAmount: Math.round(adjustedAmount),
                deductions,
                deductedAmount: Math.round(deductedAmount),
                internalAuthorsCount: internalAuthors.length,
                mainAuthorsCount: mainAuthors.length,
                coAuthorsCount: coAuthors.length,
                authorShare,
                finalAmount: Math.round(finalAmount),
            };
        } catch (error) {
            return null;
        }
    };

    const breakdown = isAmountUnchanged ? calculateIncentiveBreakdown() : null;
    
    const handleDownloadNoting = async () => {
        if (!isEligibleForFinancialDisbursement(claim)) {
            toast({
                variant: 'destructive',
                title: 'Not Eligible for Office Noting',
                description: 'This claim is ARPS-only and excluded from office noting/payment processing.',
            });
            return;
        }

        setIsPrinting(true);
        try {
            const result = await generateOfficeNotingForClaim(claim.id);
            let fileName = result?.fileName || `Office_Noting_${claim.userName.replace(/\s/g, '_')}.docx`;

            if (result.success && result.fileData) {
                 const byteCharacters = atob(result.fileData);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                toast({ title: "Download Started" });
            } else {
                throw new Error(result.error || "Failed to generate form.");
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: "Download Failed", description: error.message });
        } finally {
            setIsPrinting(false);
        }
    };

    const renderDetail = (label: string, value?: string | number | boolean | string[] | Author[] | React.ReactNode, fieldId?: keyof IncentiveClaim) => {
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
        
        let displayValue: React.ReactNode = String(value);
        if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
        } else if (Array.isArray(value)) {
             if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null && 'name' in value[0]) {
                displayValue = (
                    <ul className="list-disc pl-5">
                        {(value as Author[]).map((author, idx) => (
                            <li key={idx}><strong>{author.name}</strong> ({author.role}) - {author.email}</li>
                        ))}
                    </ul>
                );
            } else {
                 displayValue = (value as string[]).join(', ');
            }
        } else if (typeof value === 'object' && value !== null && React.isValidElement(value)) {
            displayValue = value;
        }
        else if (typeof value !== 'object') {
            displayValue = String(value);
        }
        
        const isAutoFetched = fieldId && claim.autoFetchedFields?.includes(fieldId);

        return (
            <div className="grid grid-cols-3 gap-2 py-1">
                <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
                <dd className="col-span-2 flex items-center gap-2">
                    {displayValue}
                    {isAutoFetched && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Bot className="h-4 w-4 text-primary" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>This field was auto-fetched from Scopus/WoS.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </dd>
            </div>
        );
    };
    
    const renderLinkDetail = (label: string, value?: string | string[]) => {
      if (!value || value.length === 0) return null;
      const urls = Array.isArray(value) ? value : [value];
      return (
        <div className="grid grid-cols-3 gap-2 py-1">
          <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
          <dd className="col-span-2">
            <div className="flex flex-col gap-1">
                {urls.map((url, index) => (
                  <Button key={index} variant="link" asChild className="p-0 h-auto justify-start">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                        View Document {urls.length > 1 ? index + 1 : ''}
                    </a>
                  </Button>
                ))}
            </div>
          </dd>
        </div>
      );
    }

    if (!claim) {
        return null;
    }

    const isFullAdmin = currentUser?.role === 'Super-admin' || currentUser?.role === 'admin';
    const canTakeAction = currentUser?.allowedModules?.some(m => m.startsWith('incentive-approver-')) && onTakeAction;
    const isPendingForBank = ['Accepted', 'Submitted to Accounts'].includes(claim.status);
    const canGenerateNoting = isEligibleForFinancialDisbursement(claim);

    const profileLink = claimant?.campus === 'Goa' ? `/goa/${claimant.misId}` : `/profile/${claimant.misId}`;
    const hasProfileLink = claimant && claimant.misId;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Incentive Claim Details</DialogTitle>
                    {claim.claimId && (
                        <DialogDescription className="font-mono text-sm text-primary pt-1">
                            {claim.claimId}
                        </DialogDescription>
                    )}
                    <DialogDescription>Full submission details for claimant: {claim.userName}.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[70vh] overflow-y-auto pr-4 space-y-2 text-sm">
                    {renderDetail("Claimant Name", hasProfileLink ? <Link href={profileLink} target="_blank" className="text-primary hover:underline">{claim.userName}</Link> : claim.userName)}
                    {renderDetail("Email", claim.userEmail)}
                    {renderDetail("Designation", claimant?.designation)}
                    {renderDetail("Department", claimant?.department)}
                    {renderDetail("Institute", claimant?.institute)}
                    {renderDetail("Faculty", claimant?.faculty)}
                    {renderDetail("Campus", claimant?.campus)}
                    {renderDetail("MIS ID", claim.misId)}
                    {renderDetail("ORCID ID", claim.orcidId)}
                    {renderDetail("Claim Type", claim.claimType)}
                    {renderDetail("Status", claim.status)}
                    {renderDetail("Submission Date", new Date(claim.submissionDate).toLocaleString())}
                    
                    {claim.claimType === 'Research Papers' && (
                        <>
                           <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Research Paper Details</h4>
                            {renderDetail("Paper Title", claim.paperTitle, "paperTitle")}
                            {renderDetail("DOI", claim.doi, "doi")}
                            {renderLinkDetail("Scopus Link", claim.scopusLink)}
                            {renderLinkDetail("WoS Link", claim.wosLink)}
                            {renderDetail("Publication Type", claim.publicationType, "publicationType")}
                            {renderDetail("Index Type", claim.indexType?.toUpperCase(), "indexType")}
                            {renderDetail("WoS Type", claim.wosType, "wosType")}
                            {renderDetail("Journal Classification", claim.journalClassification, "journalClassification")}
                            {renderDetail("Journal Name", claim.journalName, "journalName")}
                            {renderLinkDetail("Journal Website", claim.journalWebsite)}
                            {renderDetail("Locale", claim.locale, "locale")}
                            {renderDetail("Print ISSN", claim.printIssn, "printIssn")}
                            {renderDetail("Electronic ISSN", claim.electronicIssn, "electronicIssn")}
                            {renderDetail("Publication Month", claim.publicationMonth, "publicationMonth")}
                            {renderDetail("Publication Year", claim.publicationYear, "publicationYear")}
                            {renderDetail("Author Position", claim.authorPosition)}
                            {renderDetail("Total Authors from PU", (claim.authors || []).filter(a => !a.isExternal).length)}
                            {renderDetail("PU Name in Publication", claim.isPuNameInPublication, "isPuNameInPublication")}
                            {renderDetail("APC Paid by University", claim.wasApcPaidByUniversity)}
                            {renderDetail("Authors", claim.authors)}
                            {renderDetail("Total PU Student Authors", claim.totalPuStudentAuthors)}
                            {renderDetail("PU Student Names", claim.puStudentNames)}
                            {renderDetail("SDGs", claim.sdgGoals)}
                            {renderLinkDetail("Publication Proofs", claim.publicationProofUrls)}
                        </>
                    )}


                    {claim.claimType === 'Patents' && (
                         <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Patent Details</h4>
                            {renderDetail("Patent Title", claim.patentTitle)}
                            {renderDetail("Application/Ref No.", claim.patentApplicationNumber)}
                            {renderDetail("Current Status", claim.currentStatus)}
                            {renderDetail("Domain", claim.patentDomain)}
                            {renderDetail("Locale", claim.patentLocale)}
                            {renderDetail("Country (if Intl.)", claim.patentCountry)}
                            {renderDetail("Filing Date", claim.filingDate ? new Date(claim.filingDate).toLocaleDateString() : 'N/A')}
                            {renderDetail("Publication Date", claim.publicationDate ? new Date(claim.publicationDate).toLocaleDateString() : 'N/A')}
                            {renderDetail("Grant Date", claim.grantDate ? new Date(claim.grantDate).toLocaleDateString() : 'N/A')}
                            {renderDetail("Inventors", claim.patentInventors?.map(i => `${i.name} (${i.misId})`).join(', '))}
                            {renderDetail("Co-Applicants", claim.patentCoApplicants?.map(i => `${i.name} (${i.misId})`).join(', '))}
                            {renderDetail("Collaboration", claim.isCollaboration)}
                            {renderDetail("Collaboration Details", claim.collaborationDetails)}
                            {renderDetail("Relates to SDGs", claim.isIprSdg)}
                            {renderDetail("Selected SDGs", claim.sdgGoals)}
                            {renderDetail("Disciplinary Type", claim.isIprDisciplinary)}
                            {renderDetail("Disciplinary Details", claim.disciplinaryType)}
                            {renderLinkDetail("Form 1 Proof", claim.patentForm1Url)}
                        </>
                    )}
                    
                    {claim.claimType === 'Conference Presentations' && (
                         <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Conference & Event Details</h4>
                            {renderDetail("Paper Title", claim.conferencePaperTitle)}
                            {renderDetail("Conference Name", claim.conferenceName)}
                            {renderDetail("Organizer", claim.organizerName)}
                            {renderLinkDetail("Event Website", claim.eventWebsite)}
                            {renderDetail("Conference Date", claim.conferenceDate ? new Date(claim.conferenceDate).toLocaleDateString() : '')}
                            {renderDetail("Presentation Date", claim.presentationDate ? new Date(claim.presentationDate).toLocaleDateString() : '')}
                            {renderDetail("Conference Type", claim.conferenceType)}
                            {renderDetail("Presentation Type", claim.presentationType)}
                            {renderDetail("Presentation Mode", claim.conferenceMode)}
                            {renderDetail("Online Presentation Order", claim.onlinePresentationOrder)}
                            
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Expense & Travel Details</h4>
                            {renderDetail("Registration Fee", claim.registrationFee?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                            {renderDetail("Venue/Location", claim.conferenceVenue)}
                            {claim.conferenceMode === 'Offline' && (
                                <>
                                {renderDetail("Place Visited", claim.travelPlaceVisited)}
                                {renderDetail("Travel Mode", claim.travelMode)}
                                {renderDetail("Travel Fare", claim.travelFare?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                                </>
                            )}
                            
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Declarations & Proofs</h4>
                            {renderDetail("Presenting Author?", claim.wasPresentingAuthor)}
                            {renderDetail("PU Name in Paper?", claim.isPuNamePresent)}
                            {renderDetail("Won a Prize?", claim.wonPrize)}
                            {renderDetail("Prize Details", claim.prizeDetails)}
                            {renderDetail("Attended Other Conference?", claim.attendedOtherConference)}
                            {renderDetail("Self-Declaration Agreed?", claim.conferenceSelfDeclaration)}

                             <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Uploaded Documents</h4>
                            {renderLinkDetail("Abstract", claim.abstractUrl)}
                            {renderLinkDetail("Registration Fee Proof", claim.registrationFeeProofUrl)}
                            {renderLinkDetail("Participation Certificate", claim.participationCertificateUrl)}
                            {renderLinkDetail("Prize Proof", claim.prizeProofUrl)}
                            {renderLinkDetail("Travel Receipts", claim.travelReceiptsUrl)}
                            {renderLinkDetail("Proof of Govt. Funding Request", claim.govtFundingRequestProofUrl)}
                        </>
                    )}

                    {claim.claimType === 'Books' && (
                        <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Book/Chapter Details</h4>
                            {renderDetail("Application Type", claim.bookApplicationType)}
                            {renderDetail("Title", claim.publicationTitle)}
                            {claim.bookApplicationType === 'Book Chapter' && renderDetail("Book Title", claim.bookTitleForChapter)}
                            {renderDetail("Author(s)", claim.authors)}
                            {claim.bookApplicationType === 'Book Chapter' && renderDetail("Editor(s)", claim.bookEditor)}
                            {renderDetail("Publisher", claim.publisherName)}
                            {renderDetail("Publisher Type", claim.publisherType)}
                            {renderLinkDetail("Publisher Website", claim.publisherWebsite)}
                            {claim.publicationMode === 'Print Only' && renderDetail("ISBN (Print)", claim.isbnPrint)}
                            {claim.publicationMode === 'Electronic Only' && renderDetail("ISBN (Electronic)", claim.isbnElectronic)}
                            {claim.publicationMode === 'Print & Electronic' && (
                                <>
                                {renderDetail("ISBN (Print)", claim.isbnPrint)}
                                {renderDetail("ISBN (Electronic)", claim.isbnElectronic)}
                                </>
                            )}
                            {renderDetail("Publication Order in Year", claim.publicationOrderInYear)}
                            {renderDetail("Total PU Authors", claim.authors?.filter(a => !a.isExternal).length)}
                            {renderDetail("Total PU Students", claim.totalPuStudents)}
                            {renderDetail("Student Names", claim.puStudentNames)}
                            {claim.bookApplicationType === 'Book Chapter' ? renderDetail("Chapter Pages", claim.bookChapterPages) : renderDetail("Total Book Pages", claim.bookTotalPages)}
                            {renderDetail("Scopus Indexed", claim.isScopusIndexed)}
                            {renderDetail("Author/Editor Role", claim.authorRole)}
                            {renderLinkDetail("Publication Proof", claim.bookProofUrl)}
                            {renderLinkDetail("Scopus Proof", claim.scopusProofUrl)}
                            {renderDetail("Self Declaration", claim.bookSelfDeclaration)}
                        </>
                    )}

                    {claim.claimType === 'Membership of Professional Bodies' && (
                        <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Professional Body Membership Details</h4>
                            {renderDetail("Professional Body Name", claim.professionalBodyName)}
                            {renderDetail("Membership Type", claim.membershipType)}
                            {renderDetail("Locale", claim.membershipLocale)}
                            {renderDetail("Membership Number", claim.membershipNumber)}
                            {renderDetail("Amount Paid (INR)", claim.membershipAmountPaid?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                            {renderDetail("Payment Date", claim.membershipPaymentDate ? new Date(claim.membershipPaymentDate).toLocaleDateString() : 'N/A')}
                            {renderLinkDetail("Proof", claim.membershipProofUrl)}
                            {renderDetail("Self Declaration", claim.membershipSelfDeclaration)}
                        </>
                    )}

                    {claim.claimType === 'Seed Money for APC' && (
                         <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">APC Claim Details</h4>
                            {renderDetail("Article Type", claim.apcTypeOfArticle === 'Other' ? claim.apcOtherArticleType : claim.apcTypeOfArticle)}
                            {renderDetail("Paper Title", claim.apcPaperTitle)}
                            {renderDetail("Authors", claim.authors)}
                            {renderDetail("Total Student Authors", claim.apcTotalStudentAuthors)}
                            {renderDetail("Student Names", claim.apcStudentNames)}
                            {renderDetail("Journal Details", claim.apcJournalDetails)}
                            {renderDetail("Journal Q-Rating", claim.apcQRating)}
                            {renderLinkDetail("Journal Website", claim.apcJournalWebsite)}
                            {renderDetail("ISSN", claim.apcIssnNo)}
                            {renderDetail("Indexing Status", claim.apcIndexingStatus)}
                            {claim.apcIndexingStatus?.includes('Other') && renderDetail("Other Indexing", claim.apcOtherIndexingStatus)}
                            {renderDetail("SCI Impact Factor", claim.apcSciImpactFactor)}
                            {renderDetail("APC Waiver Requested?", claim.apcApcWaiverRequested)}
                            {renderLinkDetail("Waiver Request Proof", claim.apcApcWaiverProofUrl)}
                            {renderDetail("PU Name in Publication?", claim.apcPuNameInPublication)}
                            {renderDetail("Total APC Amount", claim.apcTotalAmount?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                            {renderDetail("Amount Claimed", claim.apcAmountClaimed?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                            {renderDetail("Self Declaration", claim.apcSelfDeclaration)}
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Uploaded APC Documents</h4>
                            {renderLinkDetail("Publication Proof", claim.apcPublicationProofUrl)}
                            {renderLinkDetail("Invoice/Payment Proof", claim.apcInvoiceProofUrl)}
                        </>
                    )}

                    {isFullAdmin && (
                        <>
                            <hr className="my-2" />
                            <h4 className="font-semibold text-base mt-2">Benefit & Approval Details</h4>
                            {renderDetail("Benefit Mode", claim.benefitMode)}
                            {renderDetail("Calculated Incentive", claim.calculatedIncentive?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                            {renderDetail("Final Approved Amount", claim.finalApprovedAmount?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }))}
                            {renderDetail("Payment Sheet Ref No.", claim.paymentSheetRef)}
                            {renderDetail("Payment Remarks", claim.paymentSheetRemarks)}
                            
                            {breakdown && (
                                <div className="space-y-2 mt-4 bg-blue-50 dark:bg-blue-950 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                                    <h5 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Incentive Calculation Breakdown</h5>
                                    <div className="space-y-1.5 text-xs">
                                        <div className="grid grid-cols-2 gap-2">
                                            <span className="text-blue-700 dark:text-blue-300">1. Base Amount (Q-Rating):</span>
                                            <span className="font-medium text-right">₹{breakdown.baseAmount.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <span className="text-blue-700 dark:text-blue-300">2. Publication Type Adjustment:</span>
                                            <span className="font-medium text-right">×{breakdown.publicationTypeAdjustment}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <span className="text-blue-700 dark:text-blue-300">3. After Adjustment:</span>
                                            <span className="font-medium text-right">₹{breakdown.adjustedAmount.toLocaleString('en-IN')}</span>
                                        </div>
                                        {breakdown.deductions.length > 0 && (
                                            <>
                                                <div className="border-t border-blue-200 dark:border-blue-800 pt-1.5 mt-1.5">
                                                    <p className="text-blue-700 dark:text-blue-300 font-medium mb-1">University-level Deductions:</p>
                                                    {breakdown.deductions.map((deduction, i) => (
                                                        <div key={i} className="grid grid-cols-2 gap-2 ml-2">
                                                            <span className="text-blue-600 dark:text-blue-400">• {deduction}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 font-semibold border-t border-blue-200 dark:border-blue-800 pt-1.5 mt-1.5">
                                                    <span className="text-blue-900 dark:text-blue-100">After All Deductions:</span>
                                                    <span className="text-right text-blue-900 dark:text-blue-100">₹{breakdown.deductedAmount.toLocaleString('en-IN')}</span>
                                                </div>
                                            </>
                                        )}
                                        <div className="border-t border-blue-200 dark:border-blue-800 pt-1.5 mt-1.5">
                                            <p className="text-blue-700 dark:text-blue-300 font-medium mb-1">Author Distribution:</p>
                                            <div className="ml-2 space-y-0.5">
                                                <div className="text-blue-600 dark:text-blue-400">Internal Authors: {breakdown.internalAuthorsCount}</div>
                                                <div className="text-blue-600 dark:text-blue-400">Main Authors: {breakdown.mainAuthorsCount}, Co-Authors: {breakdown.coAuthorsCount}</div>
                                                <div className="text-blue-600 dark:text-blue-400 text-xs italic">{breakdown.authorShare}</div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 font-bold border-t border-blue-200 dark:border-blue-800 pt-1.5 mt-1.5 bg-blue-100 dark:bg-blue-900 p-2 rounded">
                                            <span className="text-blue-900 dark:text-blue-50">Final Incentive per Author:</span>
                                            <span className="text-right text-green-700 dark:text-green-400">₹{breakdown.finalAmount.toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {claim.approvals && claim.approvals.length > 0 && (
                                <div className="space-y-2 pt-2">
                                   <h4 className="font-semibold text-base">Approval History</h4>
                                   {claim.approvals.filter(a => a !== null).map(approval => (
                                       <div key={approval.stage} className="p-3 border rounded-md bg-muted/50">
                                           <p><strong>Stage {approval.stage}:</strong> {approval.status}</p>
                                           <p className="text-xs text-muted-foreground">by {approval.approverName} on {new Date(approval.timestamp).toLocaleString()}</p>
                                           <p className="mt-1"><strong>Comments:</strong> {approval.comments || 'N/A'}</p>
                                       </div>
                                   ))}
                                </div>
                            )}
                            
                            {claim.bankDetails && (
                                <>
                                    <hr className="my-2" />
                                    <h4 className="font-semibold text-base mt-2">Bank Account Details (Visible to Admins only)</h4>
                                    {renderDetail("Beneficiary Name", claim.bankDetails.beneficiaryName)}
                                    {renderDetail("Account Number", claim.bankDetails.accountNumber)}
                                    {renderDetail("Bank Name", claim.bankDetails.bankName)}
                                    {renderDetail("Branch Name", claim.bankDetails.branchName)}
                                    {renderDetail("City", claim.bankDetails.city)}
                                    {renderDetail("IFSC Code", claim.bankDetails.ifscCode)}
                                </>
                            )}
                        </>
                    )}
                </div>
                <DialogFooter className="gap-2">
                    {isPendingForBank && isFullAdmin && (
                         <Button onClick={handleDownloadNoting} disabled={isPrinting || !canGenerateNoting}>
                            {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            {canGenerateNoting ? 'Download Notings' : 'Notings Not Applicable'}
                        </Button>
                    )}
                    {canTakeAction && (
                        <Button onClick={onTakeAction}>Take Action</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
