
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/hooks/use-toast';
import type { User, IncentiveClaim, ApprovalStage, Author } from '@/types';
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
import { Loader2, Check, X, ExternalLink, Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

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
const suggestionsSchema = z.record(z.string(), z.string().optional()).optional();

const createApprovalSchema = (stageIndex: number, claimType?: string) => {
    const isChecklistEnabled = (claimType === 'Research Papers' && (stageIndex === 0 || stageIndex === 1)) || (claimType === 'Conference Presentations' && stageIndex === 0);

    return z.object({
        action: z.enum(['approve', 'reject', 'verify']),
        amount: z.coerce.number().nonnegative("Amount cannot be negative.").optional(),
        comments: z.string().optional(),
        verifiedFields: verifiedFieldsSchema,
        suggestions: suggestionsSchema,
    }).refine(data => {
        if (data.action !== 'reject') {
            return data.amount !== undefined && data.amount >= 0;
        }
        return true;
    }, {
        message: 'Approved amount is required for this action.',
        path: ['amount'],
    }).refine(data => {
        if (data.action === 'reject') {
            return !!data.comments && data.comments.trim() !== '';
        }
        return true;
    }, {
      message: 'Comments are required when rejecting a claim.',
      path: ['comments'],
    }).refine(data => {
        // Comments are mandatory for stages 2 and 3, unless rejecting (which has its own rule)
        if ((stageIndex === 1 || stageIndex === 2) && data.action !== 'reject') {
            return !!data.comments && data.comments.trim() !== '';
        }
        return true;
    }, {
        message: 'Comments are required for this approval stage.',
        path: ['comments'],
    });
}

type ApprovalFormData = z.infer<ReturnType<typeof createApprovalSchema>>;

const allPossibleResearchPaperFields: { id: keyof IncentiveClaim | 'name' | 'designation' | 'authorRoleAndPosition' | 'totalInternalAuthors', label: string }[] = [
    { id: 'designation', label: 'Designation and Dept.' },
    { id: 'publicationType', label: 'Type of publication' },
    { id: 'journalName', label: 'Name of Journal' },
    { id: 'locale', label: 'Whether National/International' },
    { id: 'indexType', label: 'Indexed In' },
    { id: 'wosType', label: 'WoS Type' },
    { id: 'journalClassification', label: 'Q Rating of the Journal' },
    { id: 'authorRoleAndPosition', label: 'Author Role / Position' },
    { id: 'totalInternalAuthors', label: 'No. of Authors from PU' },
    { id: 'printIssn', label: 'ISSN' },
    { id: 'publicationProofUrls', label: 'PROOF OF PUBLICATION ATTACHED' },
    { id: 'isPuNameInPublication', label: 'Whether “PU” name exists' },
    { id: 'publicationMonth', label: 'Published Month & Year' },
];

const conferenceChecklistFields: { id: keyof IncentiveClaim | 'name' | 'designation', label: string }[] = [
    { id: 'designation', label: 'Designation & Department' },
    { id: 'eventType', label: 'Type of Event' },
    { id: 'conferencePaperTitle', label: 'Title of Paper' },
    { id: 'authorType', label: 'First/Corresponding/Co-Author' },
    { id: 'totalAuthors', label: 'Total No. of Authors' },
    { id: 'conferenceName', label: 'Name of Conference' },
    { id: 'organizerName', label: 'Name of Organizer' },
    { id: 'conferenceType', label: 'National/International' },
    { id: 'presentationType', label: 'Oral/Poster' },
    { id: 'conferenceDate', label: 'Date of Conference' },
    { id: 'conferenceDuration', label: 'Duration of Event' },
    { id: 'travelPlaceVisited', label: 'Place Visited' },
    { id: 'registrationFee', label: 'Registration Fee' },
    { id: 'travelFare', label: 'Travelling Expenses' },
    { id: 'calculatedIncentive', label: 'Amount Claimed (Rs.)' },
];

function getVerificationMark(approval: ApprovalStage | null | undefined, fieldId: string) {
    if (!approval) return null;
    const verifiedStatus = approval.verifiedFields?.[fieldId];
    if (verifiedStatus === true) return <Check className="h-4 w-4 text-green-600" />;
    if (verifiedStatus === false) return <X className="h-4 w-4 text-red-600" />;
    return null;
}


function ConferenceClaimDetails({ 
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

    const renderDetail = (field: { id: string; label: string; }, value?: string | number | null | boolean | string[]) => {
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
        
        let displayValue: React.ReactNode = String(value);
        
        if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
        } else if (typeof value === 'number') {
            displayValue = `₹${value.toLocaleString('en-IN')}`;
        } else if (Array.isArray(value)) {
            displayValue = value.join(', ');
        }
        
        const suggestion = approval1?.suggestions?.[field.id];

        return (
            <div key={field.id} className="grid grid-cols-12 gap-2 text-sm items-center py-1">
                <span className="text-muted-foreground col-span-5">{field.label}</span>
                <div className="col-span-4 flex flex-col">
                  {suggestion ? (
                    <>
                      <span className="line-through text-muted-foreground">{displayValue}</span>
                      <span className="text-primary font-medium">{suggestion}</span>
                    </>
                  ) : (
                    <span>{displayValue}</span>
                  )}
                </div>
                <div className="col-span-3 flex justify-end gap-1">
                    {stageIndex > 0 && (
                        <div className="w-7 h-7 flex items-center justify-center">
                            <TooltipProvider><Tooltip><TooltipTrigger>{getVerificationMark(approval1, field.id)}</TooltipTrigger><TooltipContent><p>Approver 1 Verification</p></TooltipContent></Tooltip></TooltipProvider>
                        </div>
                    )}
                    {isChecklistEnabled && (
                        <FormField
                            control={form.control}
                            name={`verifiedFields.${field.id}`}
                            render={({ field: formField }) => (
                                <FormItem>
                                    <FormControl>
                                        <div className="flex items-center gap-1">
                                            <Button type="button" size="icon" variant={formField.value === true ? 'secondary' : 'ghost'} className="h-7 w-7" onClick={() => formField.onChange(formField.value === true ? undefined : true)}><Check className="h-4 w-4" /></Button>
                                            <Button type="button" size="icon" variant={formField.value === false ? 'destructive' : 'ghost'} className="h-7 w-7" onClick={() => formField.onChange(formField.value === false ? undefined : false)}><X className="h-4 w-4" /></Button>
                                        </div>
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    )}
                </div>
                 {isChecklistEnabled && form.watch(`verifiedFields.${field.id}`) === false && (
                    <div className="col-start-6 col-span-7">
                        <FormField
                            control={form.control}
                            name={`suggestions.${field.id}`}
                            render={({ field: suggestionField }) => (
                                <FormItem>
                                    <FormControl>
                                        <Input
                                            {...suggestionField}
                                            placeholder="Suggest a correction..."
                                            className="h-8 text-xs"
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </div>
                )}
            </div>
        );
    };

    const claimWithUserData = {
        ...claim,
        name: claimant?.name,
        designation: `${claimant?.designation || 'N/A'}, ${claimant?.department || 'N/A'}`,
        conferenceDuration: claim.conferenceDuration ? `${claim.conferenceDuration} Days` : 'N/A',
    };

    return (
        <div className="space-y-4 rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center justify-between">
                <h4 className="font-semibold">Conference Details to Verify</h4>
                 <div className="grid grid-cols-2 gap-1 text-xs font-semibold text-center">
                    {stageIndex > 0 && <span>Appr. 1</span>}
                    {isChecklistEnabled && <span>Your Verify</span>}
                </div>
            </div>
            <div className="space-y-1">
                {conferenceChecklistFields.map(field => renderDetail(field, (claimWithUserData as any)[field.id]))}
            </div>
        </div>
    );
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

    const renderDetail = (field: {id: string, label: string}, value?: string | number | null | boolean | string[]) => {
        if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return null;
        
        let displayValue: React.ReactNode = String(value);

        if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
        } else if (Array.isArray(value)) {
             if (value.every(item => typeof item === 'string' && item.startsWith('https://'))) {
                displayValue = (
                    <div className="flex flex-col gap-1">
                        {value.map((url, i) => (
                             <Button key={i} asChild variant="link" size="sm" className="p-0 h-auto justify-start">
                                <a href={url} target="_blank" rel="noopener noreferrer">View Document {value.length > 1 ? i + 1 : ''}</a>
                            </Button>
                        ))}
                    </div>
                );
            } else {
                displayValue = value.join(', ');
            }
        }
        
        const suggestion1 = approval1?.suggestions?.[field.id];
        const suggestion2 = approval2?.suggestions?.[field.id];
        
        const finalSuggestion = stageIndex === 0 ? undefined : stageIndex === 1 ? suggestion1 : suggestion2 || suggestion1;

        return (
            <div key={field.id} className="grid grid-cols-12 gap-2 text-sm items-center py-1">
                <span className="text-muted-foreground col-span-5">{field.label}</span>
                <div className="col-span-4 flex flex-col break-words">
                  {finalSuggestion ? (
                    <>
                      <span className="line-through text-muted-foreground">{displayValue}</span>
                      <span className="text-primary font-medium">{finalSuggestion}</span>
                    </>
                  ) : (
                    <span>{displayValue}</span>
                  )}
                </div>
                <div className="col-span-3 flex justify-end gap-1">
                    {stageIndex > 0 && (
                        <div className="w-7 h-7 flex items-center justify-center">
                            <TooltipProvider><Tooltip><TooltipTrigger>{getVerificationMark(approval1, field.id)}</TooltipTrigger><TooltipContent><p>Approver 1 Verification</p></TooltipContent></Tooltip></TooltipProvider>
                        </div>
                    )}
                     {stageIndex > 1 && (
                        <div className="w-7 h-7 flex items-center justify-center">
                             <TooltipProvider><Tooltip><TooltipTrigger>{getVerificationMark(approval2, field.id)}</TooltipTrigger><TooltipContent><p>Approver 2 Verification</p></TooltipContent></Tooltip></TooltipProvider>
                        </div>
                    )}
                    {isChecklistEnabled && (
                        <FormField
                            control={form.control}
                            name={`verifiedFields.${field.id}`}
                            render={({ field: formField }) => (
                                <FormItem>
                                    <FormControl>
                                        <div className="flex items-center gap-1">
                                            <Button type="button" size="icon" variant={formField.value === true ? 'secondary' : 'ghost'} className="h-7 w-7" onClick={() => formField.onChange(formField.value === true ? undefined : true)}>
                                                <Check className="h-4 w-4" />
                                            </Button>
                                            <Button type="button" size="icon" variant={formField.value === false ? 'destructive' : 'ghost'} className="h-7 w-7" onClick={() => formField.onChange(formField.value === false ? undefined : false)}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    )}
                </div>
                 {isChecklistEnabled && form.watch(`verifiedFields.${field.id}`) === false && (
                    <div className="col-start-6 col-span-7">
                        <FormField
                            control={form.control}
                            name={`suggestions.${field.id}`}
                            render={({ field: suggestionField }) => (
                                <FormItem>
                                    <FormControl>
                                        <Input
                                            {...suggestionField}
                                            placeholder="Suggest a correction..."
                                            className="h-8 text-xs"
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </div>
                )}
            </div>
        );
    };
    
    const claimWithUserData = {
        ...claim,
        name: claimant?.name,
        designation: `${claimant?.designation || 'N/A'}, ${claimant?.department || 'N/A'}`,
        authorRoleAndPosition: `${claim.authorType || 'N/A'} / ${claim.authorPosition || 'N/A'}`,
        totalInternalAuthors: (claim.authors || []).filter(a => !a.isExternal).length,
    };


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
                 {allPossibleResearchPaperFields.map(field => renderDetail(field, (claimWithUserData as any)[field.id]))}
            </div>
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

export function ApprovalDialog({ claim, approver, claimant, stageIndex, isOpen, onOpenChange, onActionComplete }: ApprovalDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const isConferenceClaim = claim.claimType === 'Conference Presentations';
    const isResearchPaperClaim = claim.claimType === 'Research Papers';
    const isChecklistEnabled = (isResearchPaperClaim && (stageIndex === 0 || stageIndex === 1)) || (isConferenceClaim && stageIndex === 0);
    const showActionButtons = !isChecklistEnabled;
    
    const approvalSchema = createApprovalSchema(stageIndex, claim.claimType);
    
    const fieldsToVerify = useMemo(() => {
        let fieldList;
        let claimData: Record<string, any>;

        if (isConferenceClaim) {
            fieldList = conferenceChecklistFields;
            claimData = { ...claim, name: claimant?.name, designation: `${claimant?.designation}, ${claimant?.department}` };
        } else if (isResearchPaperClaim) {
            fieldList = allPossibleResearchPaperFields;
            claimData = { ...claim, name: claimant?.name, designation: `${claimant?.designation}, ${claimant?.department}`, authorRoleAndPosition: `${claim.authorType} / ${claim.authorPosition}`, totalInternalAuthors: (claim.authors || []).filter(a => !a.isExternal).length };
        } else {
            return [];
        }
        
        return fieldList
            .filter(f => (claimData as any)[f.id] !== undefined && (claimData as any)[f.id] !== null && (claimData as any)[f.id] !== '')
            .map(f => f.id);
    }, [isConferenceClaim, isResearchPaperClaim, claim, claimant]);

    const formSchemaWithVerification = useMemo(() => approvalSchema.refine(data => {
        if (!isChecklistEnabled) return true;
        return fieldsToVerify.every(fieldId => typeof data.verifiedFields?.[fieldId] === 'boolean');
    }, {
        message: 'You must verify all visible fields (mark as correct or incorrect).',
        path: ['verifiedFields'],
    }), [approvalSchema, isChecklistEnabled, fieldsToVerify]);

    const { defaultAmount, isAutoCalculated } = useMemo(() => {
        if (stageIndex > 0 && claim.approvals) {
            const previousApprovals = claim.approvals
                .filter((a): a is ApprovalStage => a !== null && a.stage < stageIndex + 1 && a.status === 'Approved')
                .sort((a, b) => b.stage - a.stage);

            if (previousApprovals.length > 0 && previousApprovals[0].approvedAmount >= 0) {
                return { defaultAmount: previousApprovals[0].approvedAmount, isAutoCalculated: false };
            }
        }
        return { defaultAmount: claim.calculatedIncentive, isAutoCalculated: true };
    }, [stageIndex, claim]);
    
    const getDefaultAction = useCallback(() => {
        if (isChecklistEnabled) return 'verify';
        return 'approve';
    }, [isChecklistEnabled]);

    const form = useForm<ApprovalFormData>({
        resolver: zodResolver(formSchemaWithVerification),
        defaultValues: {
            amount: defaultAmount || 0,
            verifiedFields: {},
            suggestions: {},
            action: getDefaultAction(),
        }
    });

    useEffect(() => {
        if (isOpen) {
             const approval1 = claim.approvals?.find(a => a?.stage === 1);
             const suggestions: Record<string, string> = {};
             fieldsToVerify.forEach(fieldId => {
                suggestions[fieldId] = approval1?.suggestions?.[fieldId] || '';
             });
             
            form.reset({
                amount: defaultAmount || 0,
                verifiedFields: approval1?.verifiedFields || {},
                suggestions: suggestions,
                action: getDefaultAction(),
                comments: '',
            });
        }
    }, [isOpen, claim, defaultAmount, form.reset, getDefaultAction, fieldsToVerify]);


    const action = form.watch('action');
    const showAmountField = action !== 'reject';
    const showCommentsField = (showActionButtons && stageIndex < 2) || (stageIndex >= 1);


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
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Action Failed', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleInvalidSubmit = (errors: any) => {
        if (errors.verifiedFields) {
            toast({
                variant: 'destructive',
                title: 'Action Required',
                description: 'For each item in the checklist below, please click the check (✓) to confirm it is correct, or the cross (✗) to flag it. You must verify all items to proceed.',
                duration: 7000,
            });
        } else {
            console.log("Unhandled form validation errors", errors);
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
                    <div className="flex items-center justify-between">
                      <div>
                        <DialogTitle>Stage {stageIndex + 1} Approval</DialogTitle>
                        <DialogDescription>
                            Review and take action on the claim for {' '}
                            {hasProfileLink ? (
                                <Link href={profileLink} target="_blank" className="text-primary hover:underline">{claim.userName}</Link>
                            ) : (
                                claim.userName
                            )}.
                        </DialogDescription>
                      </div>
                      {claim.doi && (
                        <Button asChild variant="outline">
                            <a href={`https://doi.org/${claim.doi}`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-2 h-4 w-4"/> View Paper
                            </a>
                        </Button>
                      )}
                    </div>
                </DialogHeader>
                
                <div className="max-h-[70vh] overflow-y-auto pr-4 space-y-4">
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
                        {claim.claimType === 'Membership of Professional Bodies' && <MembershipClaimDetails claim={claim} claimant={claimant} />}
                        {isResearchPaperClaim && <ResearchPaperClaimDetails claim={claim} claimant={claimant} form={form} isChecklistEnabled={isChecklistEnabled} stageIndex={stageIndex} previousApprovals={claim.approvals || []} />}
                        {isConferenceClaim && <ConferenceClaimDetails claim={claim} claimant={claimant} form={form} isChecklistEnabled={isChecklistEnabled} stageIndex={stageIndex} previousApprovals={claim.approvals || []} />}


                        <form id="approval-form" onSubmit={form.handleSubmit(handleSubmit, handleInvalidSubmit)} className="space-y-4">
                            {showActionButtons && (
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
                            {showAmountField && (
                                <FormField
                                    name="amount"
                                    control={form.control}
                                    render={({ field }) => (
                                        <FormItem>
                                            <div className="flex items-center gap-2">
                                                <FormLabel>Approved Amount (INR)</FormLabel>
                                                {isAutoCalculated && stageIndex === 0 && <span className="text-xs text-muted-foreground">(Tentative)</span>}
                                            </div>
                                            <FormControl><Input 
                                                type="number" 
                                                min="0"
                                                onWheel={(e) => (e.target as HTMLElement).blur()}
                                                {...field} 
                                            /></FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}
                             {showCommentsField && (
                                <FormField
                                    name="comments"
                                    control={form.control}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Your Comments {action === 'reject' || stageIndex === 1 || stageIndex === 2 ? '(Required)' : ''}</FormLabel>
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
                            showActionButtons ? 'Submit Action' : 'Submit & Forward'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

    