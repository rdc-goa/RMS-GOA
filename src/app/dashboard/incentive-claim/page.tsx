

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import type { User, IncentiveClaim, Author, SystemSettings } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy, addDoc, updateDoc, doc, arrayUnion, or } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Book, Award, Presentation, FileText, UserPlus, Banknote, Users, CheckSquare, Loader2, Edit, Eye, Info, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ClaimDetailsDialog } from '@/components/incentives/claim-details-dialog';
import { getSystemSettings } from '@/app/actions';
import { deleteIncentiveClaim } from '@/app/incentive-approval-actions';
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client';
import { differenceInDays, parseISO, addYears, format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { calculateBookIncentive,calculateApcIncentive, calculateResearchPaperIncentive, calculateConferenceIncentive } from '@/app/incentive-calculation';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';


function UserClaimsList({ 
    claims, 
    claimType,
    onViewDetails,
    onDeleteClaim
}: { 
    claims: IncentiveClaim[], 
    claimType: 'draft' | 'other',
    onViewDetails: (claim: IncentiveClaim) => void,
    onDeleteClaim: (claimId: string) => void
}) {
    if (claims.length === 0) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">You have no claims with this status.</p>
                </CardContent>
            </Card>
        );
    }
    
    const getClaimTitle = (claim: IncentiveClaim): string => {
        return claim.paperTitle || claim.publicationTitle || claim.patentTitle || claim.conferencePaperTitle || claim.professionalBodyName || claim.apcPaperTitle || claim.awardTitle || 'Untitled Claim';
    };

    const getClaimEditHref = (claim: IncentiveClaim): string => {
        const typeMap: { [key: string]: string } = {
            'Research Papers': 'research-paper',
            'Patents': 'patent',
            'Conference Presentations': 'conference',
            'Books': 'book',
            'Membership of Professional Bodies': 'membership',
            'Seed Money for APC': 'apc',
            'Honoring the Award Winner': 'award',
            'Award': 'award',
        };
        const slug = typeMap[claim.claimType] || '';
        return `/dashboard/incentive-claim/${slug}?claimId=${claim.id}`;
    }

    const getCalculationDetailsContent = (claim: IncentiveClaim) => {
        const steps: { label: string; value: string }[] = [];

        switch (claim.claimType) {
            case 'Research Papers': {
                // Base amount based on journal classification
                const baseAmounts: { [key: string]: number } = {
                    'Nature/Science/Lancet': 50000,
                    'Top 1% Journals': 25000,
                    'Q1': 15000,
                    'Q2': 10000,
                    'Q3': 6000,
                    'Q4': 4000,
                };
                const baseAmount = baseAmounts[claim.journalClassification || ''] || 0;
                if (baseAmount > 0) {
                    steps.push({ label: 'Base Amount', value: `₹${baseAmount.toLocaleString('en-IN')} (${claim.journalClassification} journal)` });
                }

                // Author calculation
                if (claim.authors && claim.authors.length > 0) {
                    const claimantAuthor = claim.authors.find(a => a.email?.toLowerCase() === claim.userEmail?.toLowerCase());
                    const internalAuthors = claim.authors.filter(a => !a.isExternal);
                    const mainAuthors = internalAuthors.filter(a => a.role === 'First Author' || a.role === 'Corresponding Author' || a.role === 'First & Corresponding Author');
                    const coAuthors = internalAuthors.filter(a => a.role === 'Co-Author');

                    steps.push({ label: 'Total Authors', value: claim.authors.length.toString() });
                    steps.push({ label: 'Your Role', value: claimantAuthor?.role || 'Unknown' });

                    // Show distribution logic
                    if (mainAuthors.length > 0 && coAuthors.length > 0) {
                        if (claimantAuthor?.role === 'Co-Author') {
                            const sharePercentage = 30;
                            const coAuthorCount = coAuthors.length;
                            steps.push({ 
                                label: 'Distribution', 
                                value: `Co-authors get ${sharePercentage}% (₹${(baseAmount * sharePercentage / 100).toLocaleString('en-IN')})` 
                            });
                            steps.push({ 
                                label: 'Per Co-Author', 
                                value: `₹${(baseAmount * sharePercentage / 100 / coAuthorCount).toLocaleString('en-IN')} ÷ ${coAuthorCount} co-author(s)` 
                            });
                        } else {
                            const sharePercentage = 70;
                            const mainAuthorCount = mainAuthors.length;
                            steps.push({ 
                                label: 'Distribution', 
                                value: `Main authors get ${sharePercentage}% (₹${(baseAmount * sharePercentage / 100).toLocaleString('en-IN')})` 
                            });
                            steps.push({ 
                                label: 'Per Main Author', 
                                value: `₹${(baseAmount * sharePercentage / 100 / mainAuthorCount).toLocaleString('en-IN')} ÷ ${mainAuthorCount} main author(s)` 
                            });
                        }
                    } else if (coAuthors.length > 1) {
                        const sharePercentage = 80;
                        steps.push({ 
                            label: 'Distribution', 
                            value: `Co-authors get ${sharePercentage}% (₹${(baseAmount * sharePercentage / 100).toLocaleString('en-IN')})` 
                        });
                        steps.push({ 
                            label: 'Per Co-Author', 
                            value: `₹${(baseAmount * sharePercentage / 100 / coAuthors.length).toLocaleString('en-IN')} ÷ ${coAuthors.length} co-authors` 
                        });
                    } else if (mainAuthors.length > 0) {
                        steps.push({ 
                            label: 'Distribution', 
                            value: `₹${baseAmount.toLocaleString('en-IN')} ÷ ${mainAuthors.length} main author(s)` 
                        });
                    }
                }
                break;
            }

            case 'Patents': {
                const baseAmounts: { [key: string]: number } = {
                    'Filed': 5000,
                    'Published': 10000,
                    'Granted': 25000,
                };
                const baseAmount = baseAmounts[claim.currentStatus || ''] || 0;
                if (baseAmount > 0) {
                    steps.push({ label: 'Base Amount', value: `₹${baseAmount.toLocaleString('en-IN')} (${claim.currentStatus} status)` });
                }
                if (claim.isPuSoleApplicant !== undefined) {
                    const multiplier = claim.isPuSoleApplicant ? 1.0 : 0.5;
                    steps.push({ label: 'PU Role Multiplier', value: `${multiplier === 1.0 ? 'Sole Applicant (×1.0)' : 'Joint Applicant (×0.5)'}` });
                    steps.push({ label: 'Final Amount', value: `₹${(baseAmount * multiplier).toLocaleString('en-IN')}` });
                }
                break;
            }

            case 'Books': {
                if (claim.bookApplicationType === 'Book Chapter') {
                    const baseAmounts: { [key: string]: number } = {
                        'Scopus': 6000,
                        'International': 3000,
                        'National': 2500,
                    };
                    const baseAmount = claim.isScopusIndexed ? 6000 : (claim.publisherType === 'International' ? 3000 : 2500);
                    steps.push({ label: 'Base Amount', value: `₹${baseAmount.toLocaleString('en-IN')} (Book Chapter)` });
                    if (claim.authorRole === 'Editor') {
                        steps.push({ label: 'Editor Multiplier', value: '×0.5 (as Editor)' });
                        steps.push({ label: 'After Adjustment', value: `₹${(baseAmount * 0.5).toLocaleString('en-IN')}` });
                    }
                } else {
                    const baseAmounts: { [key: string]: number } = {
                        'Scopus': 18000,
                        'International': 6000,
                        'National': 3000,
                    };
                    const baseAmount = claim.isScopusIndexed ? 18000 : (claim.publisherType === 'International' ? 6000 : 3000);
                    steps.push({ label: 'Base Amount', value: `₹${baseAmount.toLocaleString('en-IN')} (Full Book)` });
                }
                if (claim.authors && claim.authors.length > 1) {
                    steps.push({ label: 'Internal Authors', value: claim.authors.length.toString() });
                    steps.push({ label: 'Divided By', value: `₹ / ${claim.authors.length} authors` });
                }
                break;
            }

            case 'Conference Presentations': {
                steps.push({ label: 'Base Amount', value: '₹3,000 (Standard Conference Assistance)' });
                if (claim.conferenceName) {
                    steps.push({ label: 'Conference', value: claim.conferenceName });
                }
                break;
            }

            case 'Seed Money for APC': {
                const maxLimits: { [key: string]: number } = {
                    'Q1': 40000,
                    'Q2': 30000,
                    'Q3': 20000,
                    'Q4': 15000,
                };
                const limit = maxLimits[claim.apcQRating || ''] || 0;
                if (limit > 0) {
                    steps.push({ label: 'Max Reimbursement Limit', value: `₹${limit.toLocaleString('en-IN')} (${claim.apcQRating} journal)` });
                }
                if (claim.apcTotalAmount) {
                    const amountStr = String(claim.apcTotalAmount).replace(/[^0-9.]/g, '');
                    steps.push({ label: 'Actual APC Paid', value: `₹${amountStr}` });
                    steps.push({ label: 'Reimbursement', value: `Min(Actual, Limit) = ₹${Math.min(parseFloat(amountStr) || 0, limit).toLocaleString('en-IN')}` });
                }
                break;
            }

            case 'Membership of Professional Bodies': {
                steps.push({ label: 'Reimbursement', value: '50% of membership fee' });
                if (claim.professionalBodyName) {
                    steps.push({ label: 'Organization', value: claim.professionalBodyName });
                }
                break;
            }

            case 'Honoring the Award Winner':
            case 'Award': {
                steps.push({ label: 'Base Amount', value: '₹5,000 (Award Recognition)' });
                if (claim.awardTitle) {
                    steps.push({ label: 'Award', value: claim.awardTitle });
                }
                break;
            }
        }

        // Add calculated amount at the end
        if (claim.calculatedIncentive !== undefined) {
            steps.push({ 
                label: 'Final Calculated Amount', 
                value: `₹${claim.calculatedIncentive.toLocaleString('en-IN')}` 
            });
        }

        return steps;
    };

    const getSimplifiedStatus = (claim: IncentiveClaim) => {
        if (claim.status === 'Submitted to Accounts') {
            return (
                <div className="flex flex-col items-end">
                    <Badge variant="default">Approved</Badge>
                </div>
            );
        }

        const highestApprovalStage = claim.approvals?.filter(a => a?.status === 'Approved').length || 0;
        if (highestApprovalStage > 0 && claim.status.startsWith('Pending Stage')) {
             return <Badge variant="secondary">Stage {highestApprovalStage} Approved</Badge>;
        }
        
        return <Badge variant={claim.status === 'Accepted' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>;
    };

    return (
        <div className="space-y-4">
            {claims.map(claim => {
                const calculationDetails = getCalculationDetailsContent(claim);
                const hasCalculatedAmount = claim.calculatedIncentive !== undefined && claim.calculatedIncentive !== null;
                
                return (
                    <Card key={claim.id}>
                        <CardContent className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                            <div className="flex-1 space-y-1">
                                <Badge variant="outline">{claim.claimType}</Badge>
                                <p className="font-semibold">
                                  {getClaimTitle(claim)}
                                </p>
                                {claim.journalName && <p className="text-sm text-muted-foreground">Journal: {claim.journalName}</p>}
                                {claim.conferenceName && <p className="text-sm text-muted-foreground">Conference: {claim.conferenceName}</p>}
                                <p className="text-sm text-muted-foreground pt-1">Submitted: {new Date(claim.submissionDate).toLocaleDateString()}</p>
                                
                                {hasCalculatedAmount && (
                                    <div className="pt-2">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="inline-flex items-center gap-2 cursor-help">
                                                        <p className="text-sm font-semibold text-primary">
                                                            Calculated Amount: ₹{claim.calculatedIncentive?.toLocaleString('en-IN')}
                                                        </p>
                                                        <Info className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="w-80 p-4 backdrop-blur-md bg-black/70 border-white/20 shadow-2xl">
                                                    <div className="space-y-3">
                                                        {calculationDetails.length > 0 ? (
                                                            <div className="space-y-2 text-xs">
                                                                {calculationDetails.map((detail, idx) => (
                                                                    <div key={idx} className="flex justify-between gap-3 py-1">
                                                                        <span className="text-gray-300 font-medium">{detail.label}:</span>
                                                                        <span className="text-white text-right flex-1">{detail.value}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-gray-300">Based on claim details and policy guidelines.</p>
                                                        )}
                                                        </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 self-end sm:self-center">
                                {claimType === 'draft' ? (
                                    <>
                                        <Button asChild variant="outline" size="sm">
                                            <Link href={getClaimEditHref(claim)}>
                                                <Edit className="mr-2 h-4 w-4"/>
                                                Continue
                                            </Link>
                                        </Button>
                                        <Button variant="destructive" size="icon" onClick={() => onDeleteClaim(claim.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button variant="outline" size="sm" onClick={() => onViewDetails(claim)}>
                                            <Eye className="mr-2 h-4 w-4" />
                                            View Details
                                        </Button>
                                        {getSimplifiedStatus(claim)}
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

const coAuthorApplySchema = z.object({
    publicationOrderInYear: z.enum(['First', 'Second', 'Third']).optional(),
});

type CoAuthorApplyValues = z.infer<typeof coAuthorApplySchema>;

function CoAuthorClaimsList({ claims, currentUser, onClaimApplied }: { claims: IncentiveClaim[], currentUser: User | null, onClaimApplied: () => void }) {
    const { toast } = useToast();
    const [claimToApply, setClaimToApply] = useState<IncentiveClaim | null>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [calculatedAmount, setCalculatedAmount] = useState<number | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);

    const form = useForm<CoAuthorApplyValues>({
        resolver: zodResolver(coAuthorApplySchema),
    });

    const toAuthorPositionLabel = (position: number): IncentiveClaim['authorPosition'] | undefined => {
        const labels: Record<number, IncentiveClaim['authorPosition']> = {
            1: '1st',
            2: '2nd',
            3: '3rd',
            4: '4th',
            5: '5th',
            6: '6th',
            7: '7th',
            8: '8th',
            9: '9th',
            10: '10th',
        };
        return labels[position];
    };
    
const handleOpenDialog = useCallback(async (claim: IncentiveClaim) => {
    if (!currentUser) return;
    setClaimToApply(claim);
    setIsCalculating(true);
    setCalculatedAmount(null);
    
    try {
        let result;
        const myAuthorDetails = claim.authors?.find(
            a => a.email.toLowerCase() === currentUser.email.toLowerCase()
        );

        if (!myAuthorDetails) {
            toast({ 
                variant: 'destructive', 
                title: 'Error', 
                description: 'Your details not found in the author list.' 
            });
            setIsCalculating(false);
            return;
        }

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
        const isSpecialFaculty = SPECIAL_POLICY_FACULTIES.includes(currentUser.faculty || '');

        const claimDataForCalc: Partial<IncentiveClaim> = { 
            ...claim, 
            authors: claim.authors?.map(author => {
                // For calculation, treat the current applicant as the primary one for role-based logic
                if (author.email.toLowerCase() === currentUser.email.toLowerCase()) {
                    return { ...author, role: myAuthorDetails.role }; 
                }
                return author;
            }),
            userEmail: currentUser.email,
            authorType: myAuthorDetails.role,
            authorPosition: toAuthorPositionLabel((claim.authors || []).findIndex(a => a.email.toLowerCase() === currentUser.email.toLowerCase()) + 1),
        };

        if (claim.claimType === 'Research Papers') {
            result = await calculateResearchPaperIncentive(claimDataForCalc, currentUser.faculty || '', currentUser.designation);
        } else if (claim.claimType === 'Books') {
            result = await calculateBookIncentive(claimDataForCalc);
        } else if (claim.claimType === 'Seed Money for APC') {
            result = await calculateApcIncentive(claimDataForCalc, isSpecialFaculty);
        } else if (claim.claimType === 'Conference Presentations') {
             result = await calculateConferenceIncentive(claimDataForCalc);
        }
        else {
            result = { success: true, amount: 0 };
        }
        
        if (result.success) {
            setCalculatedAmount(result.amount ?? 0);
        } else {
            toast({ 
                variant: 'destructive', 
                title: 'Calculation Error', 
                description: result.error 
            });
        }
    } catch (e: any) {
        console.error('Calculation error:', e);
        toast({ 
            variant: 'destructive', 
            title: 'Error', 
            description: e.message || 'Could not calculate incentive amount.' 
        });
    } finally {
        setIsCalculating(false);
    }
}, [currentUser, toast]);

    const handleApply = async (values: CoAuthorApplyValues) => {
        if (!claimToApply || !currentUser) {
            toast({ variant: 'destructive', title: 'Action Required', description: 'Cannot process claim application.' });
            return;
        }
        if (!currentUser.bankDetails) {
            toast({ variant: 'destructive', title: 'Action Required', description: 'Please complete your bank details in settings before applying.' });
            return;
        }
        setIsApplying(true);
        try {
            const { id, claimId, uid, userName, userEmail, status, submissionDate, publicationOrderInYear, ...originalClaimData } = claimToApply;

            const newClaim: Omit<IncentiveClaim, 'id' | 'claimId'> = {
                ...originalClaimData,
                publicationOrderInYear: values.publicationOrderInYear,
                originalClaimId: id,
                uid: currentUser.uid,
                userName: currentUser.name,
                userEmail: currentUser.email,
                status: 'Pending',
                submissionDate: new Date().toISOString(),
                bankDetails: currentUser.bankDetails,
                misId: currentUser.misId,
                orcidId: currentUser.orcidId,
                faculty: currentUser.faculty || '',
                calculatedIncentive: calculatedAmount, // Store the calculated amount
                authorType: claimToApply.authors?.find(a => a.email.toLowerCase() === currentUser.email.toLowerCase())?.role || originalClaimData.authorType,
                authorPosition: toAuthorPositionLabel((claimToApply.authors || []).findIndex(a => a.email.toLowerCase() === currentUser.email.toLowerCase()) + 1) || originalClaimData.authorPosition,
            };
            
            await submitIncentiveClaimViaApi(newClaim as Omit<IncentiveClaim, 'id' | 'claimId'>);

            // Update the status on the original claim for this co-author
            const originalClaimRef = doc(db, 'incentiveClaims', claimToApply.id);
            const updatedCoAuthors = claimToApply.authors?.map(author => 
                author.uid === currentUser.uid ? { ...author, status: 'Applied' } : author
            );
            await updateDoc(originalClaimRef, { authors: updatedCoAuthors });
            
            toast({ title: 'Success', description: 'Your claim has been submitted based on the original publication details.' });
            setClaimToApply(null);
            onClaimApplied();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Could not submit your claim.' });
        } finally {
            setIsApplying(false);
        }
    };
    
    const getMyCoAuthorDetails = (claim: IncentiveClaim) => {
        if (!currentUser) return undefined;
        return claim.authors?.find(a => 
            (a.uid && a.uid === currentUser.uid) || 
            (a.email && a.email.toLowerCase() === currentUser.email.toLowerCase())
        );
    };

    const claimsToShow = claims.filter(claim => {
        if (!currentUser) return false;
        const myDetails = getMyCoAuthorDetails(claim);
        return !!myDetails;
    });
    
    const getClaimTitle = (claim: IncentiveClaim): string => {
        return claim.paperTitle || claim.publicationTitle || claim.patentTitle || claim.conferencePaperTitle || claim.professionalBodyName || claim.apcPaperTitle || 'Untitled Claim';
    };

    const myDetailsInDialog = claimToApply ? getMyCoAuthorDetails(claimToApply) : null;
    const myRole = myDetailsInDialog?.role;

    const getDisabledReason = (myDetails: Author | undefined, currentUser: User | null, isScopusConference: boolean, isPresentingAuthor: boolean): string => {
        if (myDetails?.status !== 'pending') {
            return `You have already applied for this claim.`;
        }
        if (!currentUser?.bankDetails || !currentUser?.orcidId) {
            const missing = [];
            if (!currentUser?.bankDetails) missing.push('bank details');
            if (!currentUser?.orcidId) missing.push('ORCID ID');
            return `Please add your ${missing.join(' and ')} in Settings to apply.`;
        }
        if (isScopusConference && !isPresentingAuthor) {
            return 'Only Presenting Authors can apply for this type of conference proceeding.';
        }
        return 'This action is currently unavailable.';
    };

    return (
      <>
        <div className="space-y-4">
            {claimsToShow.map(claim => {
                 const myDetails = getMyCoAuthorDetails(claim);
                 const isScopusConference = claim.publicationType === 'Scopus Indexed Conference Proceedings';
                 const isPresentingAuthor = myDetails?.role === 'Presenting Author' || myDetails?.role === 'First & Presenting Author';
                 const canApplyForConference = isScopusConference ? isPresentingAuthor : true;
                 const canApply = myDetails?.status === 'pending' && !!currentUser?.bankDetails && !!currentUser?.orcidId && canApplyForConference;

                return (
                 <div key={claim.id}>
                    <Card>
                        <CardContent className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                             <div className="flex-1 space-y-2">
                                <p className="font-semibold">
                                    {getClaimTitle(claim)}
                                </p>
                                <p className="text-sm text-muted-foreground">Primary Author: <span className="font-medium text-foreground">{claim.userName}</span></p>
                                 <div className="flex items-center gap-2">
                                    <Badge variant="outline">{claim.claimType}</Badge>
                                    {isScopusConference && !isPresentingAuthor && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger>
                                                    <Badge variant="destructive">Not Eligible</Badge>
                                                </TooltipTrigger>
                                                <TooltipContent className="backdrop-blur-md bg-black/70 border-white/20 shadow-2xl">
                                                    <p className="text-white font-medium">Only Presenting Authors can claim for this publication type.</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}
                                 </div>
                            </div>
                            <Button onClick={() => handleOpenDialog(claim)} disabled={!canApply}>
                                {myDetails?.status === 'Applied' ? 'Applied' : 'View & Apply'}
                            </Button>
                        </CardContent>
                    </Card>
                    {!canApply && (
                        <div className="mt-2 p-3 backdrop-blur-md bg-black/70 dark:bg-black/70 border border-white/20 dark:border-white/20 rounded-md shadow-lg">
                            <div className="flex items-start gap-2">
                                <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-gray-100 dark:text-gray-100">
                                    {getDisabledReason(myDetails, currentUser, isScopusConference, isPresentingAuthor)}
                                </p>
                            </div>
                        </div>
                    )}
                 </div>
            )})}
        </div>
        {claimToApply && (
            <Dialog open={!!claimToApply} onOpenChange={() => setClaimToApply(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Apply for Co-Author Incentive</DialogTitle>
                    </DialogHeader>

                     <div className="space-y-4 py-4 max-h-96 overflow-y-auto">
                        {myRole && (
                             <p className="text-sm"><strong>Your Role:</strong> <Badge variant="secondary">{myRole}</Badge></p>
                        )}
                        
                        {/* Research Paper Details */}
                        {claimToApply.claimType === 'Research Papers' && (
                            <>
                                <div className="border-l-2 border-primary pl-3 space-y-2">
                                    <p className="text-sm"><strong>Paper Title:</strong> {claimToApply.paperTitle}</p>
                                    <p className="text-sm"><strong>Journal:</strong> {claimToApply.journalName}</p>
                                    <p className="text-sm"><strong>Indexing:</strong> {claimToApply.indexType?.toUpperCase()}</p>
                                    <p className="text-sm"><strong>Q-Rating:</strong> {claimToApply.journalClassification}</p>
                                    {claimToApply.publicationType && <p className="text-sm"><strong>Publication Type:</strong> {claimToApply.publicationType}</p>}
                                    {claimToApply.publicationYear && <p className="text-sm"><strong>Year of Publication:</strong> {claimToApply.publicationYear}</p>}
                                    {claimToApply.doi && <p className="text-sm"><strong>DOI:</strong> {claimToApply.doi}</p>}
                                    {claimToApply.relevantLink && (
                                        <p className="text-sm"><strong>Link:</strong> <a href={claimToApply.relevantLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Publication</a></p>
                                    )}
                                    {claimToApply.authors && claimToApply.authors.length > 0 && (
                                        <p className="text-sm"><strong>Total Authors:</strong> {claimToApply.authors.length}</p>
                                    )}
                                </div>
                            </>
                        )}
                        
                        {/* Patent Details */}
                        {claimToApply.claimType === 'Patents' && (
                            <>
                                <div className="border-l-2 border-primary pl-3 space-y-2">
                                    <p className="text-sm"><strong>Patent Title:</strong> {claimToApply.patentTitle}</p>
                                    <p className="text-sm"><strong>Status:</strong> {claimToApply.currentStatus}</p>
                                    {claimToApply.patentLocale && <p className="text-sm"><strong>Locale:</strong> {claimToApply.patentLocale}</p>}
                                    {claimToApply.patentApplicationNumber && <p className="text-sm"><strong>Application Number:</strong> {claimToApply.patentApplicationNumber}</p>}
                                    {claimToApply.patentFilingDate && <p className="text-sm"><strong>Filing Date:</strong> {new Date(claimToApply.patentFilingDate).toLocaleDateString('en-IN')}</p>}
                                </div>
                            </>
                        )}
                        
                        {/* Book Details */}
                        {claimToApply.claimType === 'Books' && (
                            <>
                                <div className="border-l-2 border-primary pl-3 space-y-2">
                                    <p className="text-sm"><strong>Book Title:</strong> {claimToApply.publicationTitle || claimToApply.bookTitleForChapter}</p>
                                    <p className="text-sm"><strong>Publisher:</strong> {claimToApply.publisherName}</p>
                                    <p className="text-sm"><strong>Book Type:</strong> {claimToApply.bookApplicationType}</p>
                                    {claimToApply.publisherType && <p className="text-sm"><strong>Publisher Type:</strong> {claimToApply.publisherType}</p>}
                                    {claimToApply.publicationYear && <p className="text-sm"><strong>Year of Publication:</strong> {claimToApply.publicationYear}</p>}
                                    {claimToApply.bookTotalPages && <p className="text-sm"><strong>Total Pages:</strong> {claimToApply.bookTotalPages}</p>}
                                    {claimToApply.isScopusIndexed && <p className="text-sm"><strong>Scopus Indexed:</strong> {claimToApply.isScopusIndexed ? 'Yes' : 'No'}</p>}
                                </div>
                            </>
                        )}
                        
                        {/* Conference Details */}
                        {claimToApply.claimType === 'Conference Presentations' && (
                            <>
                                <div className="border-l-2 border-primary pl-3 space-y-2">
                                    <p className="text-sm"><strong>Paper Title:</strong> {claimToApply.conferencePaperTitle}</p>
                                    <p className="text-sm"><strong>Conference Name:</strong> {claimToApply.conferenceName}</p>
                                    {claimToApply.conferenceCity && <p className="text-sm"><strong>Location:</strong> {claimToApply.conferenceCity}</p>}
                                    {claimToApply.conferenceCountry && <p className="text-sm"><strong>Country:</strong> {claimToApply.conferenceCountry}</p>}
                                    {claimToApply.conferenceStartDate && <p className="text-sm"><strong>Conference Dates:</strong> {new Date(claimToApply.conferenceStartDate).toLocaleDateString('en-IN')} - {claimToApply.conferenceEndDate ? new Date(claimToApply.conferenceEndDate).toLocaleDateString('en-IN') : 'TBD'}</p>}
                                    {claimToApply.publicationType && <p className="text-sm"><strong>Publication Type:</strong> {claimToApply.publicationType}</p>}
                                </div>
                            </>
                        )}
                        
                        <Separator />
                        
                        {/* Publication Proofs Section */}
                        {claimToApply.claimType === 'Research Papers' && (
                            <div className="space-y-2">
                                <p className="text-sm font-semibold">Publication Proofs</p>
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => {
                                        const url = claimToApply.publicationProofUrls?.[0];
                                        if (url) window.open(url, '_blank');
                                    }}
                                    disabled={!claimToApply.publicationProofUrls || claimToApply.publicationProofUrls.length === 0}
                                >
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Document
                                </Button>
                            </div>
                        )}
                        
                        {/* Incentive Calculation Breakdown */}
                        <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-md">
                            <p className="text-sm font-semibold">Incentive Calculation Breakdown</p>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                    <span><strong>1. Base Amount (Q-Rating):</strong></span>
                                    <span>
                                        {claimToApply.claimType === 'Research Papers' ? (
                                            <>
                                                {claimToApply.journalClassification === 'Nature/Science/Lancet' && '₹50,000'}
                                                {claimToApply.journalClassification === 'Top 1% Journals' && '₹25,000'}
                                                {claimToApply.journalClassification === 'Q1' && '₹15,000'}
                                                {claimToApply.journalClassification === 'Q2' && '₹10,000'}
                                                {claimToApply.journalClassification === 'Q3' && '₹6,000'}
                                                {claimToApply.journalClassification === 'Q4' && '₹4,000'}
                                            </>
                                        ) : 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span><strong>2. Publication Type Adjustment:</strong></span>
                                    <span>×1.0×</span>
                                </div>
                                <div className="flex justify-between">
                                    <span><strong>3. After Adjustment:</strong></span>
                                    <span>
                                        {claimToApply.claimType === 'Research Papers' ? (
                                            <>
                                                {claimToApply.journalClassification === 'Nature/Science/Lancet' && '₹50,000'}
                                                {claimToApply.journalClassification === 'Top 1% Journals' && '₹25,000'}
                                                {claimToApply.journalClassification === 'Q1' && '₹15,000'}
                                                {claimToApply.journalClassification === 'Q2' && '₹10,000'}
                                                {claimToApply.journalClassification === 'Q3' && '₹6,000'}
                                                {claimToApply.journalClassification === 'Q4' && '₹4,000'}
                                            </>
                                        ) : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        {/* Author Distribution */}
                        {claimToApply.authors && claimToApply.authors.length > 0 && (
                            <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-md">
                                <p className="text-sm font-semibold">Author Distribution:</p>
                                <div className="space-y-1 text-sm">
                                    {(() => {
                                        const mainAuthors = claimToApply.authors.filter(a => a.role === 'Main Author');
                                        const coAuthors = claimToApply.authors.filter(a => a.role === 'Co-Author');
                                        const internalCount = claimToApply.authors.length;
                                        
                                        return (
                                            <>
                                                <p><strong>Internal Authors:</strong> {internalCount}</p>
                                                <p><strong>Main Authors:</strong> {mainAuthors.length}, <strong>Co-Authors:</strong> {coAuthors.length}</p>
                                                {mainAuthors.length > 0 && coAuthors.length > 0 ? (
                                                    <p><strong>Mixed:</strong> Main (70% ÷ {mainAuthors.length}), Co-Author (30% ÷ {coAuthors.length})</p>
                                                ) : null}
                                                <p className="font-semibold mt-2"><strong>Final Incentive per Author:</strong></p>
                                                <p className="text-lg">₹{calculatedAmount?.toLocaleString('en-IN') ?? 'Calculating...'}</p>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                        
                        <Separator />
                        <div className="p-4 bg-secondary rounded-md text-center">
                            {isCalculating ? (
                                <div className="flex items-center justify-center">
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                    <span>Calculating your incentive...</span>
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm font-medium">Your Tentative Eligible Incentive Amount:</p>
                                    <p className="font-bold text-2xl text-primary mt-1">₹{calculatedAmount?.toLocaleString('en-IN') ?? 'N/A'}</p>
                                </>
                            )}
                        </div>
                        
                        {/* Scopus and WoS Links */}
                        {claimToApply.claimType === 'Research Papers' && (
                            <div className="flex gap-2">
                                {claimToApply.scopusLink && (
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => window.open(claimToApply.scopusLink, '_blank')}
                                        className="flex-1"
                                    >
                                        <Eye className="h-4 w-4 mr-2" />
                                        Scopus Link
                                    </Button>
                                )}
                                {claimToApply.wosLink && (
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => window.open(claimToApply.wosLink, '_blank')}
                                        className="flex-1"
                                    >
                                        <Eye className="h-4 w-4 mr-2" />
                                        WoS Link
                                    </Button>
                                )}
                            </div>
                        )}
                     </div>

                    <Form {...form}>
                         <form id="co-author-apply-form" onSubmit={form.handleSubmit(handleApply)} className="space-y-4">
                             {claimToApply.claimType === 'Books' && (
                                <FormField
                                    control={form.control}
                                    name="publicationOrderInYear"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Is this your First/Second/Third Chapter/Book in the calendar year?</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select publication order" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="First">First</SelectItem>
                                                    <SelectItem value="Second">Second</SelectItem>
                                                    <SelectItem value="Third">Third</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                             )}
                         </form>
                    </Form>
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-blue-900 dark:text-blue-100">This action will create a new incentive claim under your name using the publication details from the original author's submission.</p>
                    </div>
                    <DialogFooter className="flex gap-2">
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" form="co-author-apply-form" disabled={isApplying || isCalculating}>
                           {isApplying ? <><Loader2 className="h-4 w-4 animate-spin mr-2"/> Submitting...</> : 'Confirm & Apply'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}
      </>
    );
}


export default function IncentiveClaimPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userClaims, setUserClaims] = useState<IncentiveClaim[]>([]);
  const [coAuthorClaims, setCoAuthorClaims] = useState<IncentiveClaim[]>([]);
  const { toast } = useToast();
  const [selectedClaim, setSelectedClaim] = useState<IncentiveClaim | null>(null);
  const [claimToDelete, setClaimToDelete] = useState<IncentiveClaim | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [membershipClaimInfo, setMembershipClaimInfo] = useState<{ canClaim: boolean; nextAvailableDate?: string }>({ canClaim: true });
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'apply');
  const [searchQuery, setSearchQuery] = useState('');
  const isMobile = useIsMobile();

  const fetchAllData = useCallback(async (uid: string, email: string) => {
      setLoading(true);
      try {
          const claimsCollection = collection(db, 'incentiveClaims');
          
          const userClaimsQuery = query(claimsCollection, where('uid', '==', uid), orderBy('submissionDate', 'desc'));
          const userClaimSnapshot = await getDocs(userClaimsQuery);
          const userClaimList = userClaimSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim));
          setUserClaims(userClaimList);

          const lastMembershipClaim = userClaimList
            .filter(c => c.claimType === 'Membership of Professional Bodies' && c.status !== 'Draft' && c.status !== 'Rejected')
            .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())[0];

          if (lastMembershipClaim) {
            const lastClaimDate = parseISO(lastMembershipClaim.submissionDate);
            const daysSinceClaim = differenceInDays(new Date(), lastClaimDate);
            if (daysSinceClaim < 365) {
                const nextDate = addYears(lastClaimDate, 1);
                setMembershipClaimInfo({
                    canClaim: false,
                    nextAvailableDate: format(nextDate, 'PPP')
                });
            }
          }
          
          // Query by authorUids and authorEmails arrays (for newer claims)
          const coAuthorByUidQuery = query(claimsCollection, where('authorUids', 'array-contains', uid));
          const coAuthorByEmailQuery = query(claimsCollection, where('authorEmails', 'array-contains', email.toLowerCase()));

          const [coAuthorByUidSnap, coAuthorByEmailSnap] = await Promise.all([
              getDocs(coAuthorByUidQuery),
              getDocs(coAuthorByEmailQuery),
          ]);
          
          const allCoAuthorClaims = new Map<string, IncentiveClaim>();
          
          coAuthorByUidSnap.forEach(doc => {
              allCoAuthorClaims.set(doc.id, { ...doc.data(), id: doc.id } as IncentiveClaim);
          });
          coAuthorByEmailSnap.forEach(doc => {
              if (!allCoAuthorClaims.has(doc.id)) {
                  allCoAuthorClaims.set(doc.id, { ...doc.data(), id: doc.id } as IncentiveClaim);
              }
          });

          // Fallback: Also check the authors array directly for older claims that might not have authorUids/authorEmails
          const allClaimsSnapshot = await getDocs(claimsCollection);
          allClaimsSnapshot.forEach(doc => {
              const claim = { ...doc.data(), id: doc.id } as IncentiveClaim;
              // Check if user is in the authors array
              if (claim.authors && claim.authors.some(author => 
                  (author.uid === uid || author.email.toLowerCase() === email.toLowerCase())
              )) {
                  if (!allCoAuthorClaims.has(doc.id)) {
                      allCoAuthorClaims.set(doc.id, claim);
                  }
              }
          });

          // Filter out claims where the current user is the primary author (uid)
          // and exclude co-author-derived claims to avoid duplicate listings and re-application.
          // Also filter out claims where the user has already applied (status is not 'pending')
          const coAuthorClaimList = Array.from(allCoAuthorClaims.values())
              .filter(claim => {
                  if (claim.uid === uid || claim.originalClaimId) return false;
                  // Check if user has already applied for this claim
                  const userAuthor = claim.authors?.find(a => 
                      (a.uid === uid || a.email.toLowerCase() === email.toLowerCase())
                  );
                  // Only show if user's status is still 'pending' (hasn't applied yet)
                  return userAuthor?.status === 'pending';
              });
          
          setCoAuthorClaims(coAuthorClaimList);

          const settings = await getSystemSettings();
          setSystemSettings(settings);

      } catch (error: any) {
          console.error("Error fetching data:", error);
          toast({ variant: 'destructive', title: "Error", description: "Could not fetch your data: " + error.message });
      } finally {
          setLoading(false);
      }
  }, [toast]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
        fetchAllData(user.uid, user.email);
    }
  }, [user, fetchAllData]);

  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab) {
      setActiveTab(currentTab);
    }
  }, [searchParams]);

  useEffect(() => {
    const currentTabInUrl = searchParams.get('tab');
    if (activeTab && activeTab !== currentTabInUrl) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', activeTab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [activeTab, pathname, router, searchParams]);

  const handleViewDetails = (claim: IncentiveClaim) => {
    setSelectedClaim(claim);
    setIsDetailsOpen(true);
  };
  
  const handleDeleteDraft = async () => {
    if (!claimToDelete || !user) return;
    setIsDeleting(true);
    try {
        const result = await deleteIncentiveClaim(claimToDelete.id, user.uid);
        if (result.success) {
            toast({ title: "Draft Deleted" });
            fetchAllData(user.uid, user.email);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
    } catch(e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not delete draft.' });
    } finally {
        setIsDeleting(false);
        setClaimToDelete(null);
    }
  };


  const draftClaims = userClaims.filter(c => c.status === 'Draft');
  const otherClaims = userClaims.filter(c => c.status !== 'Draft');

  // Search function to filter across all claims
  const searchClaims = (query: string): IncentiveClaim[] => {
    if (!query.trim()) return [];
    const lowerQuery = query.toLowerCase();
    const allClaims = [...otherClaims, ...coAuthorClaims, ...draftClaims];
    
    return allClaims.filter(claim => {
      const titleText = (claim.paperTitle || claim.publicationTitle || claim.patentTitle || claim.conferencePaperTitle || claim.professionalBodyName || claim.apcPaperTitle || claim.awardTitle || '').toLowerCase();
      const claimTypeText = (claim.claimType || '').toLowerCase();
      const journalText = (claim.journalName || '').toLowerCase();
      const conferenceText = (claim.conferenceName || '').toLowerCase();
      const claimIdText = (claim.claimId || '').toLowerCase();
      const statusText = (claim.status || '').toLowerCase();
      
      return (
        titleText.includes(lowerQuery) ||
        claimTypeText.includes(lowerQuery) ||
        journalText.includes(lowerQuery) ||
        conferenceText.includes(lowerQuery) ||
        claimIdText.includes(lowerQuery) ||
        statusText.includes(lowerQuery)
      );
    });
  };

  const searchResults = searchClaims(searchQuery);
  const hasSearchQuery = searchQuery.trim().length > 0;

  const claimTypes = useMemo(() => [
    {
      title: 'Research Papers',
      description: 'Claim incentives for papers published in WoS/Scopus indexed journals.',
      href: '/dashboard/incentive-claim/research-paper',
      icon: FileText,
    },
    {
      title: 'Patents',
      description: 'Claim incentives for filed, published, or granted patents.',
      href: '/dashboard/incentive-claim/patent',
      icon: Award,
    },
    {
      title: 'Conference Presentations',
      description: 'Get assistance for presenting papers at events.',
      href: '/dashboard/incentive-claim/conference',
      icon: Presentation,
    },
    {
      title: 'Books',
      description: 'Claim incentives for publishing books or book chapters.',
      href: '/dashboard/incentive-claim/book',
      icon: Book,
    },
    {
      title: 'Membership of Professional Bodies',
      description: 'Claim 50% of the fee for one membership per year.',
      href: '/dashboard/incentive-claim/membership',
      icon: UserPlus,
      disabled: !membershipClaimInfo.canClaim,
      tooltip: !membershipClaimInfo.canClaim ? `You can apply again on ${membershipClaimInfo.nextAvailableDate}.` : undefined,
    },
    {
      title: 'Seed Money for APC',
      description: 'Claim reimbursement for Article Processing Charges after publication.',
      href: '/dashboard/incentive-claim/apc',
      icon: Banknote,
    },
    {
      title: 'Honoring the Award Winner',
      description: 'Claim incentives for receiving awards and recognitions.',
      href: '/dashboard/incentive-claim/award',
      icon: Award,
    },
  ], [membershipClaimInfo]);
  
  const enabledClaimTypes = useMemo(() => {
    let filteredTypes = claimTypes;

    if (user?.designation === 'Ph.D Scholar') {
        return filteredTypes.filter(type => type.title === 'Research Papers');
    }

    if (systemSettings?.enabledIncentiveTypes) {
        filteredTypes = filteredTypes.filter(type => systemSettings.enabledIncentiveTypes![type.title] !== false);
    }
    
    return filteredTypes;
  }, [systemSettings, claimTypes, user]);
  
  const tabs = [
    { value: 'apply', label: 'Apply' },
    { value: 'my-claims', label: `My Claims (${otherClaims.length})` },
    { value: 'co-author', label: `Co-Author Claims (${coAuthorClaims.filter(c => c.authors?.find(a => a.email.toLowerCase() === user?.email.toLowerCase())?.status === 'pending').length})` },
    { value: 'draft', label: `Drafts (${draftClaims.length})` },];

  return (
    <>
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader
        title="Incentive Claim Portal"
        description="Select a category to apply for an incentive, or view your existing claims below."
        showBackButton={false}
      />
      
      {/* Search Bar */}
      <div className="mt-6 mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by title, claim type, journal name, claim ID, or status..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value.trim().length > 0) {
                setActiveTab('search');
              } else {
                setActiveTab('apply');
              }
            }}
            className="w-full px-4 py-2.5 pl-10 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="mt-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {isMobile ? (
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a view" />
              </SelectTrigger>
              <SelectContent>
                {tabs.map(tab => (
                  <SelectItem key={tab.value} value={tab.value}>{tab.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <TabsList className="grid w-full grid-cols-4">
              {tabs.map(tab => (
                  <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
              ))}
            </TabsList>
          )}

          <TabsContent value="apply" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {enabledClaimTypes.map(claim => {
                  const cardContent = (
                    <Card className={`flex flex-col w-full transition-colors ${claim.disabled ? 'bg-muted/50' : 'hover:bg-accent/50 dark:hover:bg-accent/20'}`}>
                      <CardHeader>
                        <claim.icon className={`h-7 w-7 mb-2 ${claim.disabled ? 'text-muted-foreground' : 'text-primary'}`} />
                        <CardTitle>{claim.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-grow">
                        <p className="text-sm text-muted-foreground">{claim.description}</p>
                      </CardContent>
                      <CardFooter>
                        <div className={`text-sm font-semibold ${claim.disabled ? 'text-muted-foreground' : 'text-primary'}`}>
                           {claim.disabled ? 'Unavailable' : <>Apply Now <ArrowRight className="inline-block ml-1 h-4 w-4" /></>}
                        </div>
                      </CardFooter>
                    </Card>
                  );

                  return (
                    <div key={claim.href}>
                        {claim.disabled ? (
                             <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild><div className="flex cursor-not-allowed">{cardContent}</div></TooltipTrigger>
                                    <TooltipContent><p>{claim.tooltip}</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ) : (
                            <Link href={claim.href} className="flex">{cardContent}</Link>
                        )}
                    </div>
                  );
              })}
            </div>
          </TabsContent>
           <TabsContent value="my-claims" className="mt-4">
             {loading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={otherClaims} claimType="other" onViewDetails={handleViewDetails} onDeleteClaim={() => {}}/>}
          </TabsContent>
           <TabsContent value="co-author" className="mt-4">
            {loading ? <Skeleton className="h-40 w-full" /> : <CoAuthorClaimsList claims={coAuthorClaims} currentUser={user} onClaimApplied={() => fetchAllData(user!.uid, user!.email)} />}
          </TabsContent>
          <TabsContent value="draft" className="mt-4">
             {loading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={draftClaims} claimType="draft" onViewDetails={handleViewDetails} onDeleteClaim={(id) => setClaimToDelete(userClaims.find(c => c.id === id) || null)}/>}
          </TabsContent>
          {hasSearchQuery && (
            <TabsContent value="search" className="mt-4">
              {searchResults.length > 0 ? (
                <UserClaimsList 
                  claims={searchResults} 
                  claimType="other" 
                  onViewDetails={handleViewDetails} 
                  onDeleteClaim={(id) => setClaimToDelete(userClaims.find(c => c.id === id) || null)}
                />
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">No claims found matching "{searchQuery}"</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
    <ClaimDetailsDialog 
        claim={selectedClaim}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        currentUser={user}
        claimant={user} // On this page, the claimant is always the current user
        onTakeAction={undefined}
    />
     <AlertDialog open={!!claimToDelete} onOpenChange={() => setClaimToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>This action will permanently delete this draft claim. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteDraft} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Delete
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

