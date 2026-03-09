
'use client';

import { useState } from 'react';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { CheckCircle, Loader2, Replace, Trash2, Upload, Eye, MessageSquareWarning, Pencil, CalendarClock, FileUp, FileText as ViewIcon, Send, Search } from 'lucide-react';
import type { FundingCall, User, EmrInterest, CoPiDetails } from '@/types';
import { registerEmrInterest, withdrawEmrInterest, uploadEndorsementForm, submitToAgency, updateEmrFinalStatus } from '@/app/emr-actions';
import { uploadFileToServer } from '@/app/actions';
import { findUserByMisId } from '@/app/userfinding';
import { isAfter, parseISO, addDays, setHours, setMinutes, setSeconds, subDays } from 'date-fns';
import { Label } from '../ui/label';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { UploadPptDialog } from './upload-ppt-dialog';
import { format } from 'date-fns';
import { Badge } from '../ui/badge';
import Link from 'next/link';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';


interface EmrActionsProps {
  user: User;
  call: FundingCall;
  interestDetails: EmrInterest | undefined;
  onActionComplete: () => void;
  isDashboardView?: boolean;
}

const registerInterestSchema = z.object({
  coPis: z.array(z.object({ uid: z.string(), name: z.string() })).optional(),
});

const submitToAgencySchema = z.object({
    referenceNumber: z.string().min(1, "Reference number is required."),
    acknowledgement: z.any().optional(),
});

const finalStatusSchema = z.object({
    status: z.enum(['Sanctioned', 'Not Sanctioned'], { required_error: 'Please select a final status.' }),
    finalProof: z.any().refine(files => files?.length > 0, "A proof document is required."),
});

function FinalStatusDialog({ interest, onActionComplete, isOpen, onOpenChange }: { interest: EmrInterest; onActionComplete: () => void; isOpen: boolean; onOpenChange: (open: boolean) => void; }) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const form = useForm<z.infer<typeof finalStatusSchema>>({
        resolver: zodResolver(finalStatusSchema),
    });

    const handleSubmit = async (values: z.infer<typeof finalStatusSchema>) => {
        setIsSubmitting(true);
        try {
            const proofFile = values.finalProof?.[0];
            const dataUrl = `data:${proofFile.type};base64,${Buffer.from(await proofFile.arrayBuffer()).toString('base64')}`;
            
            const result = await updateEmrFinalStatus(interest.id, values.status, dataUrl, proofFile.name);
            if (result.success) {
                toast({ title: 'Success', description: 'Final project status has been recorded.' });
                onActionComplete();
                onOpenChange(false);
            } else {
                throw new Error(result.error);
            }

        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Update Final Status</DialogTitle>
                    <DialogDescription>
                        Update the final outcome of the application from the funding agency and upload the final proof document (e.g., sanction letter or rejection email).
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="final-status-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                        <FormField
                            name="status"
                            control={form.control}
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                <FormLabel>Outcome</FormLabel>
                                <FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex space-x-4"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="Sanctioned" /></FormControl><FormLabel className="font-normal">Sanctioned</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="Not Sanctioned" /></FormControl><FormLabel className="font-normal">Not Sanctioned</FormLabel></FormItem></RadioGroup></FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            name="finalProof"
                            control={form.control}
                            render={({ field: { onChange, value, ...rest }}) => (
                                <FormItem>
                                    <FormLabel>Proof Document (PDF)</FormLabel>
                                    <FormControl><Input type="file" accept=".pdf" onChange={(e) => onChange(e.target.files)} {...rest} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="final-status-form" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Submitting...</> : 'Submit Final Status'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


function SubmitToAgencyDialog({ interest, onActionComplete, isOpen, onOpenChange }: { interest: EmrInterest; onActionComplete: () => void; isOpen: boolean; onOpenChange: (open: boolean) => void; }) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const form = useForm<z.infer<typeof submitToAgencySchema>>({
        resolver: zodResolver(submitToAgencySchema),
    });

    const handleSubmit = async (values: z.infer<typeof submitToAgencySchema>) => {
        setIsSubmitting(true);
        try {
            let acknowledgementUrl: string | undefined;
            const acknowledgementFile = values.acknowledgement?.[0];

            if (acknowledgementFile) {
                const dataUrl = `data:${acknowledgementFile.type};base64,${Buffer.from(await acknowledgementFile.arrayBuffer()).toString('base64')}`;
                const path = `emr-acknowledgements/${interest.callId}/${interest.userId}/${acknowledgementFile.name}`;
                const result = await uploadFileToServer(dataUrl, path);
                if (result.success && result.url) {
                    acknowledgementUrl = result.url;
                } else {
                    throw new Error(result.error || "Failed to upload acknowledgement.");
                }
            }

            const submissionResult = await submitToAgency(interest.id, values.referenceNumber, acknowledgementUrl);

            if (submissionResult.success) {
                toast({ title: 'Success', description: 'Submission details have been recorded.' });
                onActionComplete();
                onOpenChange(false);
            } else {
                throw new Error(submissionResult.error);
            }

        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Submission Failed', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Submit to Funding Agency</DialogTitle>
                    <DialogDescription>
                        Please provide the reference number and acknowledgement from the funding agency's portal.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="submit-to-agency-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                        <FormField
                            name="referenceNumber"
                            control={form.control}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Agency Reference Number</FormLabel>
                                    <FormControl><Input {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            name="acknowledgement"
                            control={form.control}
                            render={({ field: { onChange, value, ...rest }}) => (
                                <FormItem>
                                    <FormLabel>Acknowledgement (PDF, optional)</FormLabel>
                                    <FormControl><Input type="file" accept=".pdf" onChange={(e) => onChange(e.target.files)} {...rest} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="submit-to-agency-form" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Submitting...</> : 'Submit'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EndorsementUploadDialog({ interest, onUploadSuccess, isOpen, onOpenChange }: { interest: EmrInterest; onUploadSuccess: () => void; isOpen: boolean; onOpenChange: (open: boolean) => void; }) {
    const [endorsementFile, setEndorsementFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const { toast } = useToast();

    const handleUpload = async () => {
        if (!endorsementFile) return;
        setIsUploading(true);
        try {
            const dataUrl = `data:${endorsementFile.type};base64,${Buffer.from(await endorsementFile.arrayBuffer()).toString('base64')}`;
            
            const path = `emr-endorsements/${interest.callId}/${interest.userId}/${endorsementFile.name}`;
            const result = await uploadFileToServer(dataUrl, path);

            if (!result.success || !result.url) {
                throw new Error(result.error || "Endorsement form upload failed.");
            }

            const updateResult = await uploadEndorsementForm(interest.id, result.url);
            
            if (updateResult.success) {
                toast({ title: 'Success', description: 'Endorsement form submitted.' });
                onUploadSuccess();
                onOpenChange(false);
            } else {
                throw new Error(updateResult.error);
            }
        } catch (error: any) {
             toast({ variant: 'destructive', title: 'Upload Failed', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsUploading(false);
        }
    };
    
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Upload Endorsement Form</DialogTitle>
                    <DialogDescription>Please upload the signed endorsement form in Word format (.doc, .docx). Below 5 MB.</DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Input type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setEndorsementFile(e.target.files?.[0] || null)} />
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleUpload} disabled={isUploading || !endorsementFile}>
                        {isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Uploading...</> : 'Upload Form'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function RegisterInterestDialog({ call, user, isOpen, onOpenChange, onRegisterSuccess }: { call: FundingCall; user: User; isOpen: boolean; onOpenChange: (open: boolean) => void; onRegisterSuccess: () => void; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [coPiSearchTerm, setCoPiSearchTerm] = useState('');
    const [foundCoPi, setFoundCoPi] = useState<{ uid: string; name: string; email: string; misId: string; } | null>(null);
    const [coPiList, setCoPiList] = useState<CoPiDetails[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const form = useForm<z.infer<typeof registerInterestSchema>>({
        resolver: zodResolver(registerInterestSchema),
    });

    const handleRegister = async () => {
        setIsSubmitting(true);
        try {
            const result = await registerEmrInterest(call.id, user, coPiList);
            if (result.success) {
                toast({ title: 'Interest Registered!', description: 'Your interest has been successfully recorded.' });
                onRegisterSuccess();
                onOpenChange(false);
            } else {
                toast({ variant: 'destructive', title: 'Registration Failed', description: result.error });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSearchCoPi = async () => {
        if (!coPiSearchTerm) return;
        setIsSearching(true);
        setFoundCoPi(null);
        try {
            const result = await findUserByMisId(coPiSearchTerm);
            if (result.success && result.users && result.users.length > 0) {
                setFoundCoPi(result.users[0]);
            } else {
                toast({ variant: 'destructive', title: 'User Not Found', description: result.error });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Search Failed', description: error.message || 'An error occurred while searching.' });
        } finally {
            setIsSearching(false);
        }
    };

    const handleAddCoPi = () => {
        if (foundCoPi && !coPiList.some(coPi => coPi.uid === foundCoPi.uid)) {
            if (user && foundCoPi.uid === user.uid) {
                toast({ variant: 'destructive', title: 'Cannot Add Self', description: 'You cannot add yourself as a Co-PI.' });
                return;
            }
            setCoPiList([...coPiList, {
                uid: foundCoPi.uid,
                name: foundCoPi.name,
                email: foundCoPi.email,
                misId: foundCoPi.misId,
            }]);
        }
        setFoundCoPi(null);
        setCoPiSearchTerm('');
    };

    const handleRemoveCoPi = (uidToRemove: string) => {
        setCoPiList(coPiList.filter(coPi => coPi.uid !== uidToRemove));
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Register Interest for: {call.title}</DialogTitle>
                    <DialogDescription>Confirm your interest and add any Co-Principal Investigators (Co-PIs) to your team.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Search & Add Co-PI by MIS ID (Optional)</Label>
                        <div className="flex items-center gap-2">
                            <Input placeholder="Search by Co-PI's MIS ID" value={coPiSearchTerm} onChange={(e) => setCoPiSearchTerm(e.target.value)} />
                            <Button type="button" onClick={handleSearchCoPi} disabled={isSearching}>
                                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            </Button>
                        </div>
                        {foundCoPi && (
                            <div className="flex items-center justify-between p-2 border rounded-md">
                                <p>{foundCoPi.name}</p>
                                <Button type="button" size="sm" onClick={handleAddCoPi}>Add</Button>
                            </div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label>Current Co-PI(s)</Label>
                        {coPiList.length > 0 ? (
                            coPiList.map((coPi) => (
                                <div key={coPi.uid} className="flex items-center justify-between p-2 bg-secondary rounded-md">
                                    <p className="text-sm font-medium">{coPi.name}</p>
                                    <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveCoPi(coPi.uid!)}>Remove</Button>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground">No Co-PIs added.</p>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleRegister} disabled={isSubmitting}>
                        {isSubmitting ? 'Registering...' : 'Confirm Registration'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function EmrActions({ user, call, interestDetails, onActionComplete, isDashboardView = false }: EmrActionsProps) {
    const [isRegisterInterestOpen, setIsRegisterInterestOpen] = useState(false);
    const [isUploadPptOpen, setIsUploadPptOpen] = useState(false);
    const [isRevisionUploadOpen, setIsRevisionUploadOpen] = useState(false);
    const [isWithdrawConfirmationOpen, setIsWithdrawConfirmationOpen] = useState(false);
    const [isEndorsementUploadOpen, setIsEndorsementUploadOpen] = useState(false);
    const [isSubmitToAgencyOpen, setIsSubmitToAgencyOpen] = useState(false);
    const [isFinalStatusOpen, setIsFinalStatusOpen] = useState(false);
    const { toast } = useToast();

    if (!user) return null;
    
    const handleWithdrawInterest = async () => {
        if (!interestDetails) return;
        const result = await withdrawEmrInterest(interestDetails.id);
        if (result.success) {
            toast({ title: 'Interest Withdrawn' });
            onActionComplete();
        } else {
            toast({ variant: 'destructive', title: 'Withdrawal Failed', description: result.error });
        }
        setIsWithdrawConfirmationOpen(false);
    };


    const isSuperAdmin = user.role === 'Super-admin';
    const isInterestDeadlinePast = isAfter(new Date(), parseISO(call.interestDeadline));
    
    const showEndorsementActions = interestDetails && ['Recommended', 'Endorsement Submitted'].includes(interestDetails.status);
    const showSubmitToAgencyAction = interestDetails?.status === 'Endorsement Signed';
    const showFinalStatusAction = interestDetails?.status === 'Submitted to Agency';
    
    if (interestDetails) {
        if (isDashboardView) {
            return (
                <div className="flex flex-col items-start gap-2">
                    <div className="w-full flex justify-between items-center mb-2">
                        <Badge variant={interestDetails.status === 'Recommended' || interestDetails.status === 'Sanctioned' ? 'default' : interestDetails.status === 'Not Recommended' ? 'destructive' : 'secondary'}>
                            Status: {interestDetails.status}
                        </Badge>
                    </div>

                    {interestDetails.status === 'Sanctioned' || interestDetails.status === 'Not Sanctioned' ? (
                        <div className={`w-full p-3 rounded-lg border-l-4 ${interestDetails.status === 'Sanctioned' ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'} mb-2`}>
                            <div className="flex items-center gap-2 font-semibold">
                                <CheckCircle className="h-5 w-5"/>
                                <span>Agency Decision: {interestDetails.status}</span>
                            </div>
                            {interestDetails.finalProofUrl && (
                                <div className="text-sm mt-2 pl-7 space-y-1">
                                    <p><strong>Proof:</strong> <Button asChild variant="link" className="p-0 h-auto text-sm"><a href={interestDetails.finalProofUrl} target="_blank" rel="noopener noreferrer">View Document</a></Button></p>
                                </div>
                            )}
                        </div>
                    ) : interestDetails.status === 'Submitted to Agency' ? (
                        <div className="w-full p-3 rounded-lg border-l-4 border-blue-500 bg-blue-500/10 mb-2">
                            <div className="flex items-center gap-2 font-semibold">
                                <CheckCircle className="h-5 w-5"/>
                                <span>Submitted to Agency</span>
                            </div>
                            <div className="text-sm mt-2 pl-7 space-y-1">
                                <p><strong>Reference No:</strong> {interestDetails.agencyReferenceNumber || 'N/A'}</p>
                                {interestDetails.agencyAcknowledgementUrl && (
                                     <p><strong>Acknowledgement:</strong> <Button asChild variant="link" className="p-0 h-auto text-sm"><a href={interestDetails.agencyAcknowledgementUrl} target="_blank" rel="noopener noreferrer">View Document</a></Button></p>
                                )}
                            </div>
                        </div>
                    ) : interestDetails.meetingSlot ? (
                        <div className="w-full p-3 rounded-lg border-l-4 border-primary bg-primary/10 mb-2">
                            <div className="flex items-center gap-2 font-semibold">
                                <CalendarClock className="h-5 w-5"/>
                                <span>Presentation Scheduled</span>
                            </div>
                            <div className="text-sm mt-2 pl-7 space-y-1">
                                <p><strong>Date:</strong> {format(parseISO(interestDetails.meetingSlot.date), 'MMMM d, yyyy')}</p>
                                <p><strong>Time:</strong> {interestDetails.meetingSlot.time}</p>
                                <p><strong>Venue:</strong> {call.meetingDetails?.venue || 'TBD'}</p>
                                {interestDetails.meetingSlot.pptDeadline && <p><strong>PPT Deadline:</strong> {format(parseISO(interestDetails.meetingSlot.pptDeadline), 'PPpp')}</p>}
                            </div>
                        </div>
                    ) : null}

                    {interestDetails.status === 'Revision Needed' ? (
                        <Alert variant="destructive">
                            <MessageSquareWarning className="h-4 w-4" />
                            <AlertTitle>Revision Required</AlertTitle>
                            <AlertDescription>
                                The committee has requested a revision. Please review the comments and submit an updated presentation.
                                {interestDetails.adminRemarks && <p className="font-semibold mt-2">Admin Remarks: {interestDetails.adminRemarks}</p>}
                                <Button size="sm" className="mt-2" onClick={() => setIsRevisionUploadOpen(true)}>
                                    <Pencil className="h-4 w-4 mr-2"/> Submit Revised PPT
                                </Button>
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            {interestDetails.status === 'Registered' && (
                                <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md text-green-600 dark:text-green-300 text-sm font-semibold">
                                    <CheckCircle className="h-4 w-4"/>
                                    <span>Interest Registered</span>
                                </div>
                            )}

                            {call.status === 'Open' && interestDetails.status === 'Registered' && <Button variant="destructive" size="sm" onClick={() => setIsWithdrawConfirmationOpen(true)}>Withdraw</Button>}
                            
                            {!showEndorsementActions && !showSubmitToAgencyAction && !showFinalStatusAction && (
                                <Button size="sm" variant="outline" onClick={() => setIsUploadPptOpen(true)}>
                                    {interestDetails?.pptUrl ? <><Eye className="h-4 w-4 mr-2" /> Manage PPT</> : <><Upload className="h-4 w-4 mr-2" /> Upload PPT</>}
                                </Button>
                            )}
                            
                            {showEndorsementActions && (
                                <>
                                {interestDetails.endorsementFormUrl ? (
                                    <Button asChild size="sm" variant="outline">
                                        <a href={interestDetails.endorsementFormUrl} target="_blank" rel="noopener noreferrer"><ViewIcon className="h-4 w-4 mr-2"/> View Endorsement Form</a>
                                    </Button>
                                ) : (
                                    <Button size="sm" onClick={() => setIsEndorsementUploadOpen(true)}>
                                        <FileUp className="h-4 w-4 mr-2" /> Upload Endorsement Form
                                    </Button>
                                )}
                                </>
                            )}
                            
                            {interestDetails.signedEndorsementUrl && (
                                <Button asChild size="sm" variant="outline">
                                    <a href={interestDetails.signedEndorsementUrl} target="_blank" rel="noopener noreferrer"><ViewIcon className="h-4 w-4 mr-2"/> View Signed Endorsement</a>
                                </Button>
                            )}
                            
                            {showSubmitToAgencyAction && (
                                 <Button size="sm" onClick={() => setIsSubmitToAgencyOpen(true)}>
                                    <Send className="h-4 w-4 mr-2"/> Submit to Agency
                                </Button>
                            )}

                            {showFinalStatusAction && (
                                <Button size="sm" onClick={() => setIsFinalStatusOpen(true)}>
                                    Update Final Status
                                </Button>
                            )}
                        </div>
                    )}
                    {isUploadPptOpen && <UploadPptDialog isOpen={isUploadPptOpen} onOpenChange={setIsUploadPptOpen} interest={interestDetails} call={call} user={user} onUploadSuccess={onActionComplete} />}
                    {isRevisionUploadOpen && <UploadPptDialog isOpen={isRevisionUploadOpen} onOpenChange={setIsRevisionUploadOpen} interest={interestDetails} call={call} user={user} onUploadSuccess={onActionComplete} isRevision={true} />}
                    {isEndorsementUploadOpen && <EndorsementUploadDialog isOpen={isEndorsementUploadOpen} onOpenChange={setIsEndorsementUploadOpen} interest={interestDetails} onUploadSuccess={onActionComplete} />}
                    {isSubmitToAgencyOpen && <SubmitToAgencyDialog isOpen={isSubmitToAgencyOpen} onOpenChange={setIsSubmitToAgencyOpen} interest={interestDetails} onActionComplete={onActionComplete} />}
                    {isFinalStatusOpen && <FinalStatusDialog isOpen={isFinalStatusOpen} onOpenChange={setIsFinalStatusOpen} interest={interestDetails} onActionComplete={onActionComplete} />}
                    <AlertDialog open={isWithdrawConfirmationOpen} onOpenChange={setIsWithdrawConfirmationOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>This will withdraw your interest from the call. Any uploaded presentation will also be deleted. This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleWithdrawInterest} className="bg-destructive hover:bg-destructive/90">Confirm Withdrawal</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            );
        }

        // Default view for calendar
        return (
             <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md text-green-600 dark:text-green-300 font-semibold">
                <CheckCircle className="h-5 w-5"/>
                <span>Interest Registered</span>
            </div>
        );
    }

    if (isSuperAdmin || isInterestDeadlinePast) return null;

    return (
        <div>
            <Button onClick={() => setIsRegisterInterestOpen(true)}>
                Register Interest
            </Button>
            {isRegisterInterestOpen && <RegisterInterestDialog isOpen={isRegisterInterestOpen} onOpenChange={setIsRegisterInterestOpen} call={call} user={user} onRegisterSuccess={onActionComplete} />}
        </div>
    )
}
