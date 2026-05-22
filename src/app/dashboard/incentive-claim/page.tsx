

'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import type { User, IncentiveClaim, Author, SystemSettings } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy, doc, arrayUnion, or } from 'firebase/firestore';
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
import { getSystemSettings, deleteIncentiveClaim } from '@/app/actions';
import { useIncentiveClaims } from '@/hooks/use-staff-data';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ClaimDetailsDialog } from '@/components/incentives/claim-details-dialog';
import { submitIncentiveClaimViaApi } from '@/lib/incentive-claim-client';
import { differenceInDays, parseISO, addYears, format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { calculateBookIncentive, calculateApcIncentive, calculateResearchPaperIncentive, calculateConferenceIncentive, calculateEmrSanctionIncentive } from '@/app/incentive-calculation';
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
        return claim.paperTitle || claim.publicationTitle || claim.patentTitle || claim.conferencePaperTitle || claim.workshopName || claim.professionalBodyName || claim.apcPaperTitle || claim.awardTitle || claim.emrProjectName || 'Untitled Claim';
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
            'EMR Sanction Project': 'emr-sanction',
            'Workshop/FDP/Training': 'conference',
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

            case 'Award': {
                steps.push({ label: 'Base Amount', value: '₹5,000 (Award Recognition)' });
                if (claim.awardTitle) {
                    steps.push({ label: 'Award', value: claim.awardTitle });
                }
                break;
            }

            case 'EMR Sanction Project': {
                steps.push({ label: 'Base Amount', value: `₹${(claim.sanctionAmount || 0).toLocaleString('en-IN')} (Sanction Amount)` });
                steps.push({ label: 'Incentive Rate', value: '1% of Sanction Amount' });
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
                                                <Edit className="mr-2 h-4 w-4" />
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
    authorPosition: z.string().min(1, "Author position is required"),
});

type CoAuthorApplyValues = z.infer<typeof coAuthorApplySchema>;

function CoAuthorClaimsList({ claims, currentUser, onClaimApplied }: { claims: IncentiveClaim[], currentUser: User | null, onClaimApplied: () => void }) {
    const { toast } = useToast();
    const [claimToApply, setClaimToApply] = useState<IncentiveClaim | null>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [calculatedAmount, setCalculatedAmount] = useState<number | undefined>(undefined);
    const [calculationBreakdown, setCalculationBreakdown] = useState<any>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('pending');

    const form = useForm<CoAuthorApplyValues>({
        resolver: zodResolver(coAuthorApplySchema),
    });



    const handleOpenDialog = useCallback((claim: IncentiveClaim) => {
        if (!currentUser) return;
        setClaimToApply(claim);
        setCalculatedAmount(undefined);
        setCalculationBreakdown(null);

        form.reset({
            authorPosition: '',
        });
    }, [currentUser, form]);

    // Handle recalculation when author position changes
    const watchedPosition = form.watch('authorPosition');

    useEffect(() => {
        if (!claimToApply || !currentUser || !watchedPosition) return;

        const calculate = async () => {
            setIsCalculating(true);
            try {
                let result;
                const myAuthorDetails = claimToApply.authors?.find(
                    a => a.email.toLowerCase() === currentUser.email.toLowerCase()
                );

                if (!myAuthorDetails) return;

                const SPECIAL_POLICY_FACULTIES = [
                    "Faculty of Applied Sciences", "Faculty of Medicine", "Faculty of Homoeopathy",
                    "Faculty of Ayurved", "Faculty of Nursing", "Faculty of Pharmacy",
                    "Faculty of Physiotherapy", "Faculty of Public Health", "Faculty of Engineering & Technology"
                ];
                const isSpecialFaculty = SPECIAL_POLICY_FACULTIES.includes(currentUser.faculty || '');

                const claimDataForCalc: Partial<IncentiveClaim> = {
                    ...claimToApply,
                    authors: claimToApply.authors?.map(author => {
                        if (author.email.toLowerCase() === currentUser.email.toLowerCase()) {
                            return { ...author, role: myAuthorDetails.role };
                        }
                        return author;
                    }),
                    userEmail: currentUser.email,
                    authorType: myAuthorDetails.role,
                    authorPosition: watchedPosition as any,
                    publicationOrderInYear: 'First' // Default to 1st paper of the year for co-authors
                };

                if (claimToApply.claimType === 'Research Papers') {
                    result = await calculateResearchPaperIncentive(claimDataForCalc, currentUser.faculty || '', currentUser.designation);
                } else if (claimToApply.claimType === 'Books') {
                    result = await calculateBookIncentive(claimDataForCalc);
                } else if (claimToApply.claimType === 'Seed Money for APC') {
                    result = await calculateApcIncentive(claimDataForCalc, isSpecialFaculty);
                } else if (claimToApply.claimType === 'EMR Sanction Project') {
                    result = await calculateEmrSanctionIncentive(claimDataForCalc);
                } else if (claimToApply.claimType === 'Conference Presentations') {
                    result = await calculateConferenceIncentive(claimDataForCalc);
                } else {
                    result = { success: true, amount: 0 };
                }

                if (result.success) {
                    setCalculatedAmount(result.amount ?? 0);
                    setCalculationBreakdown(result.breakdown);
                }
            } catch (e) {
                console.error('Calculation error:', e);
            } finally {
                setIsCalculating(false);
            }
        };

        calculate();
    }, [watchedPosition, claimToApply?.id, currentUser?.uid]);


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
            const { id, claimId, uid, userName, userEmail, status, submissionDate, publicationOrderInYear, approvals, finalApprovedAmount, paymentSheetRef, paymentSheetRemarks, ...originalClaimData } = claimToApply;

            const newClaim: Omit<IncentiveClaim, 'id' | 'claimId'> = {
                ...originalClaimData,
                publicationOrderInYear: 'First', // Default to 1st paper of the year
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
                authorPosition: (values.authorPosition as any) || originalClaimData.authorPosition,
            };

            await submitIncentiveClaimViaApi(newClaim as Omit<IncentiveClaim, 'id' | 'claimId'>);

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

    const claimsToShow = useMemo(() => {
        return claims.filter(claim => {
            if (!currentUser) return false;
            const myDetails = getMyCoAuthorDetails(claim);
            if (!myDetails) return false;

            if (statusFilter === 'all') return true;
            return myDetails.status.toLowerCase() === statusFilter.toLowerCase();
        });
    }, [claims, currentUser, statusFilter]);

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
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Your Co-Author Publications</h3>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap px-1">Filter by:</span>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="Applied">Applied</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

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
                    )
                })}
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
                                        {claimToApply.publicationMonth && <p className="text-sm"><strong>Month of Publication:</strong> {claimToApply.publicationMonth}</p>}
                                        {claimToApply.publicationYear && <p className="text-sm"><strong>Year of Publication:</strong> {claimToApply.publicationYear}</p>}
                                        {(claimToApply.printIssn || claimToApply.electronicIssn) && (
                                            <p className="text-sm"><strong>ISSN:</strong> {claimToApply.printIssn || 'N/A'} (Print) / {claimToApply.electronicIssn || 'N/A'} (Online)</p>
                                        )}
                                        {claimToApply.doi && <p className="text-sm"><strong>DOI:</strong> {claimToApply.doi}</p>}
                                        {claimToApply.relevantLink && (
                                            <p className="text-sm"><strong>Link:</strong> <a href={claimToApply.relevantLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View Publication</a></p>
                                        )}
                                        {claimToApply.authors && claimToApply.authors.length > 0 && (
                                            <div className="pt-2">
                                                <p className="text-sm font-semibold mb-1 uppercase text-xs text-muted-foreground">List of Authors</p>
                                                <div className="rounded-md border overflow-hidden">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-muted/60">
                                                            <tr>
                                                                <th className="text-left font-medium p-2">Author Name</th>
                                                                <th className="text-left font-medium p-2">Role</th>
                                                                <th className="text-left font-medium p-2">Type</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {claimToApply.authors.map((author, index) => (
                                                                <tr key={`${author.email || author.name}-${index}`} className="border-t">
                                                                    <td className="p-2">{author.name}</td>
                                                                    <td className="p-2">{author.role}</td>
                                                                    <td className="p-2">
                                                                        <Badge variant={(author.isExternal && author.email.toLowerCase() !== currentUser?.email?.toLowerCase()) ? "secondary" : "outline"} className="text-[10px] h-4">
                                                                            {(author.isExternal && author.email.toLowerCase() !== currentUser?.email?.toLowerCase()) ? 'External' : 'Internal'}
                                                                        </Badge>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
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
                                        {claimToApply.filingDate && <p className="text-sm"><strong>Filing Date:</strong> {new Date(claimToApply.filingDate).toLocaleDateString('en-IN')}</p>}
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
                                        {claimToApply.conferenceVenue && <p className="text-sm"><strong>Venue/Location:</strong> {claimToApply.conferenceVenue}</p>}
                                        {claimToApply.conferenceDate && <p className="text-sm"><strong>Conference Date:</strong> {new Date(claimToApply.conferenceDate).toLocaleDateString('en-IN')}</p>}
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
                            <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
                                <div className="flex justify-between items-center">
                                    <p className="text-sm font-semibold">Estimated Incentive Amount</p>
                                    {isCalculating && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                </div>

                                {calculatedAmount !== undefined ? (
                                    <div className="space-y-1 text-sm pt-2">
                                        <div className="flex justify-between items-center py-1">
                                            <span className="text-muted-foreground font-medium">Calculated Share:</span>
                                            <span className="text-lg font-bold text-primary">₹{calculatedAmount.toLocaleString('en-IN')}</span>
                                        </div>
                                        {calculationBreakdown?.baseAmount && (
                                            <div className="flex justify-between text-[10px] text-muted-foreground pt-1 border-t border-slate-200 dark:border-slate-800">
                                                <span>Base: ₹{calculationBreakdown.baseAmount.toLocaleString('en-IN')}</span>
                                                <span>Role Factor: ×{calculationBreakdown.publicationTypeAdjustment || '1.0'}</span>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="py-4 text-center">
                                        <p className="text-xs text-muted-foreground italic">
                                            {watchedPosition ? 'Calculating your share...' : 'Please select your author position to see estimated incentive.'}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Author Distribution */}
                            {claimToApply.authors && claimToApply.authors.length > 0 && (
                                <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-md">
                                    <p className="text-sm font-semibold">Author Distribution:</p>
                                    <div className="space-y-1 text-sm">
                                        <p><strong>Internal Authors:</strong> {calculationBreakdown?.internalAuthorsCount || claimToApply.authors.length}</p>
                                        <p><strong>Main Authors:</strong> {calculationBreakdown?.mainAuthorsCount || '---'}, <strong>Co-Authors:</strong> {calculationBreakdown?.coAuthorsCount || '---'}</p>
                                        <p><strong>Sharing Policy:</strong> {calculationBreakdown?.authorShare || 'Standard Distribution'}</p>
                                        <p className="font-semibold mt-2"><strong>Final Incentive per Author:</strong></p>
                                        <p className="text-lg">₹{calculatedAmount?.toLocaleString('en-IN') ?? 'Calculating...'}</p>
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
                                <div className="grid grid-cols-1 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="authorPosition"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Your Author Position</FormLabel>
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select position" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'].map(pos => (
                                                            <SelectItem key={pos} value={pos}>{pos} Author</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </form>
                        </Form>
                        <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                            <p className="text-xs text-blue-900 dark:text-blue-100">This action will create a new incentive claim under your name using the publication details from the original author's submission.</p>
                        </div>
                        <DialogFooter className="flex gap-2">
                            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                            <Button type="submit" form="co-author-apply-form" disabled={isApplying || isCalculating}>
                                {isApplying ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting...</> : 'Confirm & Apply'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}


function IncentiveClaimContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [user, setUser] = useState<User | null>(null);
    const { claims: allClaims, isLoading: claimsLoading, mutate } = useIncentiveClaims(user?.uid);
    const { toast } = useToast();
    const [selectedClaim, setSelectedClaim] = useState<IncentiveClaim | null>(null);
    const [claimToDelete, setClaimToDelete] = useState<IncentiveClaim | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'apply');
    const [searchQuery, setSearchQuery] = useState('');
    const [myClaimsStatusFilter, setMyClaimsStatusFilter] = useState('all');
    const isMobile = useIsMobile();

    const userClaims = useMemo(() => {
        if (!user || !allClaims) return [];
        return allClaims.filter(c => c.uid === user.uid);
    }, [allClaims, user]);

    const coAuthorClaims = useMemo(() => {
        if (!user || !allClaims) return [];
        return allClaims.filter(c =>
            c.uid !== user.uid &&
            !c.originalClaimId &&
            (c.authorUids?.includes(user.uid) || (c.authorEmails?.includes(user.email.toLowerCase())))
        );
    }, [allClaims, user]);

    const membershipClaimInfo = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const claimInCurrentYear = userClaims.find(c =>
            c.claimType === 'Membership of Professional Bodies' &&
            c.status !== 'Draft' &&
            c.status !== 'Rejected' &&
            new Date(c.submissionDate).getFullYear() === currentYear
        );

        if (claimInCurrentYear) {
            const nextYear = currentYear + 1;
            const nextDate = new Date(nextYear, 0, 1);
            return { canClaim: false, nextAvailableDate: format(nextDate, 'PPP') };
        }
        return { canClaim: true };
    }, [userClaims]);

    const [settingsLoading, setSettingsLoading] = useState(false);
    const fetchSettings = useCallback(async () => {
        setSettingsLoading(true);
        try {
            const settings = await getSystemSettings();
            setSystemSettings(settings);
        } catch (e) {} finally {
            setSettingsLoading(false);
        }
    }, []);

    const loading = claimsLoading || settingsLoading;

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
            fetchSettings();
        } else {
            setSettingsLoading(false);
        }
    }, [fetchSettings]);

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
                mutate();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not delete draft.' });
        } finally {
            setIsDeleting(false);
            setClaimToDelete(null);
        }
    };


    const draftClaims = userClaims.filter(c => c.status === 'Draft');

    // Filtered "My Claims" based on status selection
    const filteredOtherClaims = useMemo(() => {
        const other = userClaims.filter(c => c.status !== 'Draft');
        if (myClaimsStatusFilter === 'all') return other;

        return other.filter(claim => {
            if (myClaimsStatusFilter === 'pending') {
                return claim.status === 'Pending' || claim.status.startsWith('Pending Stage');
            }
            if (myClaimsStatusFilter === 'approved') {
                return claim.status === 'Accepted' || claim.status === 'Submitted to Accounts';
            }
            return claim.status === myClaimsStatusFilter;
        });
    }, [userClaims, myClaimsStatusFilter]);

    // Search function to filter across all claims
    const searchClaims = (query: string): IncentiveClaim[] => {
        if (!query.trim()) return [];
        const lowerQuery = query.toLowerCase();
        const other = userClaims.filter(c => c.status !== 'Draft');
        const allClaims = [...other, ...coAuthorClaims, ...draftClaims];

        return allClaims.filter(claim => {
            const titleText = (claim.paperTitle || claim.publicationTitle || claim.patentTitle || claim.conferencePaperTitle || claim.professionalBodyName || claim.apcPaperTitle || claim.awardTitle || claim.emrProjectName || '').toLowerCase();
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
            title: 'Event Participation',
            description: 'Claim incentives for participation in Seminars, Conferences, etc.',
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
        {
            title: 'EMR Sanction Project',
            description: 'Principal Investigators can claim 1% incentive for sanctioned projects.',
            href: '/dashboard/incentive-claim/emr-sanction',
            icon: Banknote,
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
        { value: 'my-claims', label: `My Claims (${userClaims.filter(c => c.status !== 'Draft').length})` },
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
                                        <Card className={`flex flex-col w-full h-full transition-colors ${claim.disabled ? 'bg-muted/50' : 'hover:bg-accent/50 dark:hover:bg-accent/20'}`}>
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
                                        <div key={claim.href} className="flex">
                                            {claim.disabled ? (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild><div className="flex w-full h-full cursor-not-allowed">{cardContent}</div></TooltipTrigger>
                                                        <TooltipContent><p>{claim.tooltip}</p></TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            ) : (
                                                <Link href={claim.href} className="flex w-full h-full">{cardContent}</Link>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </TabsContent>
                        <TabsContent value="my-claims" className="mt-4 space-y-4">
                            {!loading && (
                                <div className="flex justify-end items-center gap-2">
                                    <span className="text-sm text-muted-foreground whitespace-nowrap">Filter by Status:</span>
                                    <Select value={myClaimsStatusFilter} onValueChange={setMyClaimsStatusFilter}>
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue placeholder="All Statuses" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Statuses</SelectItem>
                                            <SelectItem value="pending">Pending Approval</SelectItem>
                                            <SelectItem value="approved">Approved</SelectItem>
                                            <SelectItem value="Payment Completed">Payment Completed</SelectItem>
                                            <SelectItem value="Rejected">Rejected</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            {loading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={filteredOtherClaims} claimType="other" onViewDetails={handleViewDetails} onDeleteClaim={() => { }} />}
                        </TabsContent>
                        <TabsContent value="co-author" className="mt-4">
                            {loading ? <Skeleton className="h-40 w-full" /> : <CoAuthorClaimsList claims={coAuthorClaims} currentUser={user} onClaimApplied={() => mutate()} />}
                        </TabsContent>
                        <TabsContent value="draft" className="mt-4">
                            {loading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={draftClaims} claimType="draft" onViewDetails={handleViewDetails} onDeleteClaim={(id) => setClaimToDelete(userClaims.find(c => c.id === id) || null)} />}
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
                            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

export default function IncentiveClaimPage() {
    return (
        <Suspense fallback={
            <div className="container mx-auto max-w-5xl py-10">
                <Skeleton className="h-10 w-48 mb-4 animate-pulse" />
                <Skeleton className="h-4 w-96 mb-8 animate-pulse" />
                <Skeleton className="h-12 w-full mb-6 animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Skeleton className="h-40 w-full animate-pulse" />
                    <Skeleton className="h-40 w-full animate-pulse" />
                    <Skeleton className="h-40 w-full animate-pulse" />
                </div>
            </div>
        }>
            <IncentiveClaimContent />
        </Suspense>
    );
}

