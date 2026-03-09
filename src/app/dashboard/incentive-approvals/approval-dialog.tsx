
'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import type { User, IncentiveClaim, ApprovalStage } from '@/types';
import { processIncentiveClaimAction } from '@/app/incentive-approval-actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Check, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { isEligibleForFinancialDisbursement } from '@/lib/incentive-eligibility';

interface ApprovalDialogProps {
  claim: IncentiveClaim;
  approver: User;
  claimant: User | null; // Pass the full claimant user object
  stageIndex: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete: () => void;
}

const verifiedFieldsSchema = z.record(z.string(), z.boolean()).optional();

const createApprovalSchema = (stageIndex: number, isChecklistEnabled: boolean) => z.object({
  action: z.enum(['approve', 'reject', 'verify']),
  amount: z.coerce.number().optional(),
  comments: z.string().optional(),
  verifiedFields: verifiedFieldsSchema,
}).refine(data => {
    if (isChecklistEnabled) {
        return data.action === 'verify';
    }
    return data.action === 'approve' || data.action === 'reject';
}, {
    message: 'An action must be selected.',
    path: ['action'],
})
.refine(data => {
    // Amount is ALWAYS required when approving, at ANY stage.
    if (data.action === 'approve') {
        return data.amount !== undefined;
    }
    return true;
}, {
  message: 'Approved amount is required for this stage.',
  path: ['amount'],
}).refine(data => {
    if (data.action === 'reject') {
        return !!data.comments && data.comments.trim() !== '';
    }
    return true;
}, {
  message: 'Comments are required when rejecting a claim.',
  path: ['comments'],
});


type ApprovalFormData = z.infer<ReturnType<typeof createApprovalSchema>>;

const allPossibleResearchPaperFields: { id: keyof IncentiveClaim | 'name' | 'designation' | 'authorRoleAndPosition', label: string }[] = [
    { id: 'name', label: 'Name of the Applicant' },
    { id: 'designation', label: 'Designation and Dept.' },
    { id: 'publicationType', label: 'Type of publication' },
    { id: 'journalName', label: 'Name of Journal' },
    { id: 'locale', label: 'Whether National/International' },
    { id: 'indexType', label: 'Indexed In' },
    { id: 'wosType', label: 'WoS Type' },
    { id: 'journalClassification', label: 'Q Rating of the Journal' },
    { id: 'authorRoleAndPosition', label: 'Author Role / Position' },
    { id: 'totalPuAuthors', label: 'No. of Authors from PU' },
    { id: 'printIssn', label: 'ISSN' }, // Simplified for display
    { id: 'publicationProofUrls', label: 'PROOF OF PUBLICATION ATTACHED' },
    { id: 'isPuNameInPublication', label: 'Whether “PU” name exists' },
    { id: 'publicationMonth', label: 'Published Month & Year' }, // Simplified for display
];

function getVerificationMark(approval: ApprovalStage | null | undefined, fieldId: string) {
    if (!approval) return null;
    const verifiedStatus = approval.verifiedFields?.[fieldId];
    if (verifiedStatus === true) return <Check className="h-4 w-4 text-green-600" />;
    if (verifiedStatus === false) return <X className="h-4 w-4 text-red-600" />;
    return null;
}


function ResearchPaperClaimDetails({ 
    claim, 
    claimant, 
    form, 
    isChecklistEnabled, 
    stageIndex, 
    previousApprovals 
}: { 
    claim: IncentiveClaim, 
    claimant: User | null, 
    form: any, 
    isChecklistEnabled: boolean,
    stageIndex: number,
    previousApprovals: (ApprovalStage | null)[]
}) {
    const approval1 = previousApprovals[0];
    const approval2 = previousApprovals[1];

    const renderDetail = (fieldId: string, label: string, value?: string | number | null | boolean | string[]) => {
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
        let displayValue = String(value);
        if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
        }
        if (Array.isArray(value)) {
            displayValue = value.join(', ');
        }
        return (
            <div className="grid grid-cols-12 gap-2 text-sm items-center py-1">
                <span className="text-muted-foreground col-span-5">{label}</span>
                <span className="col-span-4">{displayValue}</span>
                <div className="col-span-3 flex justify-end gap-1">
                    {stageIndex > 0 && (
                        <div className="w-7 h-7 flex items-center justify-center">
                            <TooltipProvider><Tooltip><TooltipTrigger>{getVerificationMark(approval1, fieldId)}</TooltipTrigger><TooltipContent><p>Approver 1 Verification</p></TooltipContent></Tooltip></TooltipProvider>
                        </div>
                    )}
                     {stageIndex > 1 && (
                        <div className="w-7 h-7 flex items-center justify-center">
                             <TooltipProvider><Tooltip><TooltipTrigger>{getVerificationMark(approval2, fieldId)}</TooltipTrigger><TooltipContent><p>Approver 2 Verification</p></TooltipContent></Tooltip></TooltipProvider>
                        </div>
                    )}
                    {isChecklistEnabled && (
                        <FormField
                            control={form.control}
                            name={`verifiedFields.${fieldId}`}
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <div className="flex items-center gap-1">
                                            <Button type="button" size="icon" variant={field.value === true ? 'secondary' : 'ghost'} className="h-7 w-7" onClick={() => field.onChange(field.value === true ? undefined : true)}>
                                                <Check className="h-4 w-4" />
                                            </Button>
                                            <Button type="button" size="icon" variant={field.value === false ? 'destructive' : 'ghost'} className="h-7 w-7" onClick={() => field.onChange(field.value === false ? undefined : false)}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    )}
                </div>
            </div>
        );
    };

    // Calculate incentive breakdown
    const calculateIncentiveBreakdown = () => {
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

    const breakdown = calculateIncentiveBreakdown();

    return (
        <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
                <h4 className="font-semibold">Research Paper Details to Verify</h4>
                <div className="grid grid-cols-3 gap-1 text-xs font-semibold text-center">
                    {stageIndex > 0 && <span>Appr. 1</span>}
                    {stageIndex > 1 && <span>Appr. 2</span>}
                    {isChecklistEnabled && <span>Your Verify</span>}
                </div>
            </div>
            <div className="space-y-1">
                {renderDetail('name', 'Name of the Applicant', claimant?.name)}
                {renderDetail('designation', 'Designation and Dept.', `${claimant?.designation || 'N/A'}, ${claimant?.department || 'N/A'}`)}
                {renderDetail('publicationType', 'Type of publication', claim.publicationType)}
                {renderDetail('journalName', 'Name of Journal', claim.journalName)}
                {renderDetail('locale', 'Whether National/International', claim.locale)}
                {renderDetail('indexType', 'Indexed In', claim.indexType?.toUpperCase())}
                {renderDetail('wosType', 'WoS Type', claim.wosType)}
                {renderDetail('journalClassification', 'Q Rating of the Journal', claim.journalClassification)}
                {renderDetail('authorRoleAndPosition', 'Author Role / Position', `${claim.authorType || 'N/A'} / ${claim.authorPosition || 'N/A'}`)}
                {renderDetail('totalPuAuthors', 'No. of Authors from PU', claim.totalPuAuthors)}
                {renderDetail('printIssn', 'ISSN', `${claim.printIssn || 'N/A'} (Print), ${claim.electronicIssn || 'N/A'} (Electronic)`)}
                {renderDetail('publicationProofUrls', 'PROOF OF PUBLICATION ATTACHED', !!claim.publicationProofUrls && claim.publicationProofUrls.length > 0)}
                {renderDetail('isPuNameInPublication', 'Whether “PU” name exists', claim.isPuNameInPublication)}
                {renderDetail('publicationMonth', 'Published Month & Year', `${claim.publicationMonth}, ${claim.publicationYear}`)}
            </div>
            {breakdown && !isChecklistEnabled && (
                <>
                    <Separator />
                    <div className="space-y-2 bg-blue-50 dark:bg-blue-950 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
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
                </>
            )}
            {isChecklistEnabled && <FormMessage>{form.formState.errors.verifiedFields?.message}</FormMessage>}
        </div>
    );
}

function MembershipClaimDetails({ claim, claimant }: { claim: IncentiveClaim, claimant: User | null }) {
  const renderDetail = (label: string, value?: string | number | null) => {
    if (!value && value !== 0) return null;
    return (
      <div className="grid grid-cols-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span>{value}</span>
      </div>
    );
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
        <h4 className="font-semibold">Membership Details to Verify</h4>
        <div className="space-y-1">
            {renderDetail('Designation and Dept.', `${claimant?.designation || 'N/A'}, ${claimant?.department || 'N/A'}`)}
            {renderDetail('Department/Faculty', claimant?.faculty)}
            {renderDetail('Type of Membership', claim.membershipType)}
            {renderDetail('Professional Body', claim.professionalBodyName)}
            {renderDetail('Locale of Professional Body', claim.membershipLocale)}
            {renderDetail('Membership Number', claim.membershipNumber)}
            {renderDetail('Amount Paid', `₹${claim.membershipAmountPaid?.toLocaleString('en-IN')}`)}
            {renderDetail('Payment Date', claim.membershipPaymentDate ? new Date(claim.membershipPaymentDate).toLocaleDateString() : 'N/A')}
        </div>
    </div>
  );
}

function getCalculationLogic(claim: IncentiveClaim): string {
  if (claim.claimType === 'Research Papers') {
    const baseAmount = claim.calculatedIncentive || 0;
    let logic = `Base Amount: ₹${baseAmount.toLocaleString('en-IN')}`;
    
    if (claim.isPuNameInPublication === false) {
      logic += '\n• PU name not in publication: -50%';
    }
    if (claim.wasApcPaidByUniversity === true) {
      logic += '\n• APC paid by University: -50%';
    }
    if (!isEligibleForFinancialDisbursement(claim)) {
      logic += '\n• Co-Author beyond 5th position: ₹0 (ARPS only)';
    }
    
    return logic;
  }
  
  if (claim.claimType === 'Membership of Professional Bodies') {
    return `Amount Paid: ₹${claim.membershipAmountPaid?.toLocaleString('en-IN') || 0}\n(50% reimbursement by university)`;
  }
  
  return `Base Calculated Amount: ₹${claim.calculatedIncentive?.toLocaleString('en-IN') || 0}`;
}

export function ApprovalDialog({ claim, approver, claimant, stageIndex, isOpen, onOpenChange, onActionComplete }: ApprovalDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const isMembershipClaim = claim.claimType === 'Membership of Professional Bodies';
    const isResearchPaperClaim = claim.claimType === 'Research Papers';
    const isChecklistEnabled = (isResearchPaperClaim && (stageIndex === 0 || stageIndex === 1));
    
    const getFieldsToVerify = () => {
        if (!isResearchPaperClaim) return [];

        const claimWithUserData = {
            ...claim,
            name: claimant?.name,
            designation: `${claimant?.designation || 'N/A'}, ${claimant?.department || 'N/A'}`,
            authorRoleAndPosition: `${claim.authorType || 'N/A'} / ${claim.authorPosition || 'N/A'}`
        };

        return allPossibleResearchPaperFields
            .filter(field => {
                const value = (claimWithUserData as any)[field.id];
                return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);
            })
            .map(field => field.id);
    };
    const fieldsToVerify = getFieldsToVerify();
    
    const approvalSchema = createApprovalSchema(stageIndex, isChecklistEnabled);
    const formSchemaWithVerification = approvalSchema.refine(data => {
        if (!isChecklistEnabled) return true;
        return fieldsToVerify.every(fieldId => typeof data.verifiedFields?.[fieldId] === 'boolean');
    }, {
        message: 'You must verify all visible fields (mark as correct or incorrect).',
        path: ['verifiedFields'],
    });

    const { defaultAmount, isAutoCalculated } = (() => {
        if (stageIndex > 0 && claim.approvals) {
            const previousApprovals = claim.approvals
                .filter(a => a && a.stage < stageIndex + 1 && a.status === 'Approved')
                .sort((a, b) => b!.stage - a!.stage);

            if (previousApprovals.length > 0 && previousApprovals[0]!.approvedAmount > 0) {
                return { defaultAmount: previousApprovals[0]!.approvedAmount, isAutoCalculated: false };
            }
        }
        return { defaultAmount: claim.calculatedIncentive, isAutoCalculated: true };
    })();
    
    const getDefaultAction = () => {
        return isChecklistEnabled ? 'verify' : 'approve';
    };


    const form = useForm<ApprovalFormData>({
        resolver: zodResolver(formSchemaWithVerification),
        defaultValues: {
            amount: defaultAmount || 0,
            verifiedFields: {},
            action: getDefaultAction(),
        }
    });

    useEffect(() => {
        if (isOpen) {
            form.reset({
                amount: defaultAmount || 0,
                verifiedFields: {},
                action: getDefaultAction(),
                comments: '',
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, claim, stageIndex]);


    const action = form.watch('action');
    const approvedAmount = form.watch('amount');

    const handleSubmit = async (values: ApprovalFormData) => {
        setIsSubmitting(true);
        try {
            const actionToSubmit = values.action;

            const result = await processIncentiveClaimAction(claim.id, actionToSubmit, approver, stageIndex, values);
            if (result.success) {
                let successMessage = 'Action submitted successfully.';
                if (actionToSubmit === 'verify') successMessage = 'Checklist verified and claim forwarded.';
                else if (actionToSubmit === 'approve') successMessage = 'Claim has been approved.';
                else if (actionToSubmit === 'reject') successMessage = 'Claim has been rejected.';
                
                toast({ title: 'Success', description: successMessage });
                onActionComplete();
                onOpenChange(false);
                form.reset();
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Action Failed', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const previousApprovals = (claim.approvals || []).filter(a => a?.stage < stageIndex + 1);
    
    const profileLink = claimant?.campus === 'Goa' ? `/goa/${claimant.misId}` : `/profile/${claimant.misId}`;
    const hasProfileLink = claimant && claimant.misId;
    const isViewerAdminOrApprover =
  approver?.role === 'Super-admin' ||
  approver?.role === 'admin' ||
  approver?.allowedModules?.some(m => m.startsWith('incentive-approver-'));


    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Stage {stageIndex + 1} Approval</DialogTitle>
                    <DialogDescription>
                        Review and take action on the claim for {' '}
                        {hasProfileLink ? (
                            <Link href={profileLink} target="_blank" className="text-primary hover:underline">{claim.userName}</Link>
                        ) : (
                            claim.userName
                        )}.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="max-h-[60vh] overflow-y-auto pr-4 space-y-4">
                    {isViewerAdminOrApprover && previousApprovals.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="font-semibold text-sm">Previous Approval History</h4>
                            {previousApprovals.map((approval, index) => (
                                approval && (
                                <div key={index} className="p-4 border rounded-lg bg-muted/50 space-y-2 text-sm">
                                    <div className="flex justify-between items-center">
                                        <p className="font-semibold">Stage {approval.stage}: {approval.approverName}</p>
                                        <p className={`font-semibold ${approval.status === 'Approved' ? 'text-green-600' : 'text-red-600'}`}>{approval.status}</p>
                                    </div>
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                                          <p>
                                            <strong className="text-muted-foreground">Comments:</strong>{' '}
                                            {approval.comments || 'N/A'}
                                          </p>
                                          {approval.status === 'Approved' && (
                                            <p className="mt-1 sm:mt-0">
                                              <strong className="text-muted-foreground">Approved Amount:</strong>{' '}
                                              ₹{approval.approvedAmount.toLocaleString('en-IN')}
                                            </p>
                                          )}
                                      </div>
                                </div>
                                )
                            ))}
                            <Separator />
                        </div>
                    )}
                    
                     {stageIndex === 0 && claim.calculatedIncentive !== undefined && claim.calculatedIncentive !== null && (
                        <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-md text-center">
                            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Tentatively Eligible Incentive Amount:</p>
                            <p className="font-bold text-2xl text-blue-600 dark:text-blue-400 mt-1">₹{claim.calculatedIncentive.toLocaleString('en-IN')}</p>
                        </div>
                    )}

                    <Form {...form}>
                        {isMembershipClaim && <MembershipClaimDetails claim={claim} claimant={claimant} />}
                        {isResearchPaperClaim && <ResearchPaperClaimDetails claim={claim} claimant={claimant} form={form} isChecklistEnabled={isChecklistEnabled} stageIndex={stageIndex} previousApprovals={claim.approvals || []} />}


                        <form id="approval-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                             {!isChecklistEnabled && (
                                <FormField
                                    name="action"
                                    control={form.control}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Your Action</FormLabel>
                                            <FormControl>
                                                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4">
                                                    <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="approve" /></FormControl><FormLabel className="font-normal">Approve</FormLabel></FormItem>
                                                    <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="reject" /></FormControl><FormLabel className="font-normal">Reject</FormLabel></FormItem>
                                                </RadioGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                            {action === 'approve' && (
                                <FormField
                                    name="amount"
                                    control={form.control}
                                    render={({ field }) => (
                                        <FormItem>
                                            <div className="flex items-center gap-2">
                                                <FormLabel>Approved Amount (INR)</FormLabel>
                                                {isAutoCalculated && <span className="text-xs text-muted-foreground">(Tentative)</span>}
                                            </div>
                                            <FormControl><Input type="number" {...field} /></FormControl>
                                            {isAutoCalculated && approvedAmount === defaultAmount && (
                                                <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-200 dark:border-slate-800">
                                                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Calculation Logic:</p>
                                                    <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line">
                                                        {getCalculationLogic(claim)}
                                                    </p>
                                                </div>
                                            )}
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                             {action !== 'verify' && (
                                <FormField
                                    name="comments"
                                    control={form.control}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Your Comments {action === 'reject' && '(Required)'}</FormLabel>
                                            <FormControl><Textarea {...field} /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                             )}
                        </form>
                    </Form>
                </div>
                 <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" form="approval-form" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Submitting...</> : (
                            isChecklistEnabled ? 'Submit & Forward' : 'Submit Action'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
