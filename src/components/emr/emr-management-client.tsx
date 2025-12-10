

// src/components/emr/emr-management-client.tsx
'use client';

import { useState } from 'react';
import type { FundingCall, User, EmrInterest } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Download, Trash2, CalendarClock, Eye, MoreHorizontal, MessageSquare, Loader2, FileUp, FileText as ViewIcon, Edit, Upload, UserCheck, PlusCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Textarea } from '../ui/textarea';
import { Form, FormControl, FormField, FormItem, FormMessage } from '../ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { deleteEmrInterest, updateEmrStatus, signAndUploadEndorsement, markEmrAttendance, registerEmrInterestByAdmin } from '@/app/emr-actions';
import { updateEmrInterestDetails } from '@/app/server-actions';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { ScheduleMeetingDialog } from './schedule-meeting-dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { UploadPptDialog } from './upload-ppt-dialog';
import { Checkbox } from '../ui/checkbox';
import { findUserByMisId } from '@/app/userfinding';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';


interface EmrManagementClientProps {
    call: FundingCall;
    interests: EmrInterest[];
    allUsers: User[];
    currentUser: User;
    onActionComplete: () => void;
}

const deleteRegistrationSchema = z.object({
    remarks: z.string().min(10, "Please provide a reason for deleting the registration."),
});

const adminRemarksSchema = z.object({
    remarks: z.string().min(10, "Please provide remarks for the applicant."),
});

const bulkEditSchema = z.object({
    durationAmount: z.string().optional(),
    isOpenToPi: z.boolean().default(false),
});

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const signEndorsementSchema = z.object({
    signedEndorsement: z.any()
    .refine(files => files?.length > 0, "A signed PDF is required.")
    .refine(files => files?.[0]?.size <= MAX_FILE_SIZE, `File size must be less than 5MB.`)
    .refine(files => files?.[0]?.type === 'application/pdf', "Only PDF files are accepted."),
});

const attendanceSchema = z.object({
  absentApplicantIds: z.array(z.string()),
  absentEvaluatorUids: z.array(z.string()),
});

function ManualRegistrationDialog({ call, isOpen, onOpenChange, onActionComplete, currentUser }: { call: FundingCall; isOpen: boolean; onOpenChange: (open: boolean) => void; onActionComplete: () => void; currentUser: User; }) {
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [foundUser, setFoundUser] = useState<User | null>(null);

    const handleSearch = async () => {
        if (!searchTerm) return;
        setIsSearching(true);
        setFoundUser(null);
        try {
            const result = await findUserByMisId(searchTerm);
            if (result.success && result.users && result.users.length > 0) {
                // To simplify, we'll take the first result.
                // A more robust implementation might handle multiple matches.
                const userToRegister = allUsers.find(u => u.uid === result.users![0].uid);
                if (userToRegister) {
                    setFoundUser(userToRegister);
                } else {
                    toast({ variant: 'destructive', title: 'User Not Fully Registered', description: "This user was found but hasn't completed their portal profile." });
                }
            } else {
                toast({ variant: 'destructive', title: 'User Not Found', description: result.error || "No user found with this MIS ID." });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Search Failed', description: error.message });
        } finally {
            setIsSearching(false);
        }
    };
    
    const handleRegister = async () => {
        if (!foundUser) return;
        setIsRegistering(true);
        try {
            const result = await registerEmrInterestByAdmin(call.id, foundUser, currentUser);
            if(result.success) {
                toast({title: 'Success', description: `${foundUser.name} has been registered.`});
                onActionComplete();
                onOpenChange(false);
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Registration Failed', description: error.message });
        } finally {
            setIsRegistering(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Applicant Manually</DialogTitle>
                    <DialogDescription>Register a faculty member for this call by entering their MIS ID.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="flex items-center gap-2">
                        <Input placeholder="Enter MIS ID..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        <Button onClick={handleSearch} disabled={isSearching || !searchTerm}>
                            {isSearching ? <Loader2 className="h-4 w-4 animate-spin"/> : "Search"}
                        </Button>
                    </div>
                    {foundUser && (
                        <div className="p-4 border rounded-md bg-muted/50">
                            <p><strong>Name:</strong> {foundUser.name}</p>
                            <p><strong>Email:</strong> {foundUser.email}</p>
                            <p><strong>Institute:</strong> {foundUser.institute}</p>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleRegister} disabled={!foundUser || isRegistering}>
                         {isRegistering ? 'Registering...' : 'Confirm Registration'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AttendanceDialog({ call, interests, allUsers, isOpen, onOpenChange, onUpdate }: { call: FundingCall; interests: EmrInterest[]; allUsers: User[]; isOpen: boolean; onOpenChange: (open: boolean) => void; onUpdate: () => void; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const form = useForm<z.infer<typeof attendanceSchema>>({
        resolver: zodResolver(attendanceSchema),
        defaultValues: {
            absentApplicantIds: [],
            absentEvaluatorUids: [],
        },
    });

    const scheduledApplicants = interests.filter(i => i.meetingSlot);
    const assignedEvaluators = allUsers.filter(u => call.meetingDetails?.assignedEvaluators?.includes(u.uid));

    const handleSubmit = async (values: z.infer<typeof attendanceSchema>) => {
        setIsSubmitting(true);
        try {
            const result = await markEmrAttendance(call.id, values.absentApplicantIds, values.absentEvaluatorUids);
            if (result.success) {
                toast({ title: 'Success', description: 'Attendance has been marked.' });
                onUpdate();
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
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Mark Meeting Attendance</DialogTitle>
                    <DialogDescription>Select any applicants or evaluators who were absent from the meeting.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="attendance-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 py-4 max-h-[60vh] overflow-y-auto pr-4">
                        <div>
                            <h4 className="font-semibold mb-2">Applicants ({scheduledApplicants.length})</h4>
                            <div className="space-y-2">
                                {scheduledApplicants.map(interest => (
                                    <FormField
                                        key={interest.id}
                                        control={form.control}
                                        name="absentApplicantIds"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center space-x-3 space-y-0 p-2 border rounded-md">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value?.includes(interest.id)}
                                                        onCheckedChange={(checked) => {
                                                            return checked
                                                                ? field.onChange([...field.value, interest.id])
                                                                : field.onChange(field.value?.filter(id => id !== interest.id));
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal">{interest.userName}</FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold mb-2">Evaluators ({assignedEvaluators.length})</h4>
                            <div className="space-y-2">
                                {assignedEvaluators.map(evaluator => (
                                     <FormField
                                        key={evaluator.uid}
                                        control={form.control}
                                        name="absentEvaluatorUids"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center space-x-3 space-y-0 p-2 border rounded-md">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value?.includes(evaluator.uid)}
                                                        onCheckedChange={(checked) => {
                                                            return checked
                                                                ? field.onChange([...(field.value || []), evaluator.uid])
                                                                : field.onChange(field.value?.filter(id => id !== evaluator.uid));
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal">{evaluator.name}</FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="attendance-form" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save Attendance'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SignEndorsementDialog({ interest, isOpen, onOpenChange, onUpdate }: { interest: EmrInterest; isOpen: boolean; onOpenChange: (open: boolean) => void; onUpdate: () => void; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const form = useForm<z.infer<typeof signEndorsementSchema>>({
        resolver: zodResolver(signEndorsementSchema),
    });

    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    };

    const handleSubmit = async (values: z.infer<typeof signEndorsementSchema>) => {
        setIsSubmitting(true);
        try {
            const file = values.signedEndorsement[0];
            const dataUrl = await fileToDataUrl(file);
            const result = await signAndUploadEndorsement(interest.id, dataUrl, file.name);

            if (result.success) {
                toast({ title: 'Success', description: 'Endorsement has been signed and uploaded.' });
                onUpdate();
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
                    <DialogTitle>Upload Signed Endorsement</DialogTitle>
                    <DialogDescription>
                        Please upload the scanned, signed endorsement form. This will mark the status as "Endorsement Signed" and notify the PI.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="sign-endorsement-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                        <FormField
                            control={form.control}
                            name="signedEndorsement"
                            render={({ field: { onChange, value, ...rest } }) => (
                                <FormItem>
                                    <Label>Signed Endorsement Form (PDF)</Label>
                                    <Input type="file" accept=".pdf" onChange={(e) => onChange(e.target.files)} {...rest} />
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="sign-endorsement-form" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : 'Confirm & Upload'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function BulkEditDialog({ interest, isOpen, onOpenChange, onUpdate }: { interest: EmrInterest; isOpen: boolean; onOpenChange: (open: boolean) => void; onUpdate: () => void; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const form = useForm<z.infer<typeof bulkEditSchema>>({
        resolver: zodResolver(bulkEditSchema),
        defaultValues: {
            durationAmount: interest.durationAmount || '',
            isOpenToPi: interest.isOpenToPi || false,
        },
    });

    const handleSubmit = async (values: z.infer<typeof bulkEditSchema>) => {
        setIsSubmitting(true);
        try {
            const result = await updateEmrInterestDetails(interest.id, values);
            if (result.success) {
                toast({ title: 'Success', description: 'Project details updated.' });
                onUpdate();
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
                    <DialogTitle>Edit Bulk Uploaded Project</DialogTitle>
                    <DialogDescription>{interest.callTitle}</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="bulk-edit-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
                        <FormField control={form.control} name="durationAmount" render={({ field }) => (
                            <FormItem>
                                <Label>Duration & Amount</Label>
                                <Input {...field} placeholder="e.g., Amount: 50,00,000 | Duration: 3 Years" />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="isOpenToPi" render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                <div className="space-y-0.5">
                                    <FormLabel>Open for PI to Edit</FormLabel>
                                    <p className="text-[0.8rem] text-muted-foreground">Allows the PI to edit title, co-pis and upload proof.</p>
                                </div>
                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                        )} />
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="bulk-edit-form" disabled={isSubmitting}>
                        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Saving...</> : 'Save Changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export function EmrManagementClient({ call, interests, allUsers, currentUser, onActionComplete }: EmrManagementClientProps) {
    const { toast } = useToast();
    const userMap = new Map(allUsers.map(u => [u.uid, u]));
    const [isDeleting, setIsDeleting] = useState(false);
    const [interestToUpdate, setInterestToUpdate] = useState<EmrInterest | null>(null);
    const [statusToUpdate, setStatusToUpdate] = useState<EmrInterest['status'] | null>(null);
    const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
    const [isRemarksDialogOpen, setIsRemarksDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false);
    const [isSignEndorsementDialogOpen, setIsSignEndorsementDialogOpen] = useState(false);
    const [isRevisionUploadOpen, setIsRevisionUploadOpen] = useState(false);
    const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] = useState(false);
    const [isManualRegisterOpen, setIsManualRegisterOpen] = useState(false);
    const [interestForPptUpload, setInterestForPptUpload] = useState<EmrInterest | null>(null);


    const deleteForm = useForm<z.infer<typeof deleteRegistrationSchema>>({
        resolver: zodResolver(deleteRegistrationSchema),
        defaultValues: { remarks: '' },
    });
    
    const remarksForm = useForm<z.infer<typeof adminRemarksSchema>>({
        resolver: zodResolver(adminRemarksSchema),
    });

    const handleDeleteInterest = async (values: z.infer<typeof deleteRegistrationSchema>) => {
        if (!interestToUpdate) return;
        setIsDeleting(true);
        try {
            const result = await deleteEmrInterest(interestToUpdate.id, values.remarks, currentUser.name);
            if (result.success) {
                toast({ title: "Registration Deleted", description: "The user has been notified." });
                setIsDeleteDialogOpen(false);
                setInterestToUpdate(null);
                onActionComplete();
            } else {
                toast({ variant: 'destructive', title: "Error", description: result.error });
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const handleOpenDeleteDialog = (interest: EmrInterest) => {
        setInterestToUpdate(interest);
        deleteForm.reset({ remarks: '' });
        setIsDeleteDialogOpen(true);
    };
    
    const handleStatusUpdate = async (interestId: string, newStatus: EmrInterest['status'], remarks?: string) => {
        const result = await updateEmrStatus(interestId, newStatus, remarks);
         if (result.success) {
            toast({ title: "Status Updated", description: "The applicant has been notified." });
            onActionComplete();
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.error });
        }
    };

    const handleRemarksSubmit = (values: z.infer<typeof adminRemarksSchema>) => {
        if (interestToUpdate && statusToUpdate) {
            handleStatusUpdate(interestToUpdate.id, statusToUpdate, values.remarks);
        }
        setIsRemarksDialogOpen(false);
    };
    
    const handleOpenRemarksDialog = (interest: EmrInterest, status: EmrInterest['status']) => {
        setInterestToUpdate(interest);
        setStatusToUpdate(status);
        remarksForm.reset({ remarks: '' });
        setIsRemarksDialogOpen(true);
    };
    
    const handleOpenBulkEditDialog = (interest: EmrInterest) => {
        setInterestToUpdate(interest);
        setIsBulkEditDialogOpen(true);
    };
    
    const handleOpenSignDialog = (interest: EmrInterest) => {
        setInterestToUpdate(interest);
        setIsSignEndorsementDialogOpen(true);
    };

    const handleOpenRevisionUpload = (interest: EmrInterest) => {
        setInterestToUpdate(interest);
        setIsRevisionUploadOpen(true);
    };


    const handleExport = () => {
        const dataToExport = interests.map(interest => {
            const interestedUser = userMap.get(interest.userId);
            return {
                'Interest ID': interest.interestId || 'N/A',
                'PI Name': interest.userName,
                'PI Email': interest.userEmail,
                'PI Department': interestedUser?.department || interest.department,
                'Co-PIs': interest.coPiNames?.join(', ') || 'None',
                'Status': interest.status,
                'Presentation URL': interest.pptUrl || 'Not Submitted'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrations');
        XLSX.writeFile(workbook, `registrations_${call.title.replace(/\s+/g, '_')}.xlsx`);
    };
    
    
    const unscheduledApplicantsExist = interests.some(i => !i.meetingSlot && !i.wasAbsent);
    const meetingIsScheduled = !!call.meetingDetails?.date;


    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <CardTitle>Applicant Registrations ({interests.length})</CardTitle>
                    <div className="flex items-center gap-2">
                         {unscheduledApplicantsExist && currentUser.designation !== 'Head of Goa Campus' && (
                            <Button onClick={() => setIsScheduleDialogOpen(true)}>
                                <CalendarClock className="mr-2 h-4 w-4" /> Schedule Meeting
                            </Button>
                         )}
                         {meetingIsScheduled && (
                            <Button variant="outline" onClick={() => setIsAttendanceDialogOpen(true)}>
                                <UserCheck className="mr-2 h-4 w-4" /> Attendance
                            </Button>
                         )}
                        <Button variant="secondary" onClick={() => setIsManualRegisterOpen(true)}>
                            <PlusCircle className="mr-2 h-4 w-4" /> Add Applicant Manually
                        </Button>
                        <Button variant="outline" onClick={handleExport} disabled={interests.length === 0}>
                            <Download className="mr-2 h-4 w-4" /> Export XLSX
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
                 {interests.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>PI</TableHead>
                                <TableHead>Co-PIs</TableHead>
                                <TableHead className="hidden sm:table-cell">Status</TableHead>
                                <TableHead>Docs</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {interests.map(interest => {
                                const interestedUser = userMap.get(interest.userId);
                                const isMeetingScheduled = !!interest.meetingSlot;
                                const isPostDecision = ['Recommended', 'Not Recommended', 'Revision Needed', 'Endorsement Submitted', 'Endorsement Signed', 'Submitted to Agency'].includes(interest.status);
                                
                                return (
                                    <TableRow key={interest.id}>
                                        <TableCell className="font-medium whitespace-nowrap">
                                            {interestedUser?.misId ? (
                                                <Link href={`/profile/${interestedUser.misId}`} target="_blank" className="text-primary hover:underline">
                                                    {interest.userName}
                                                </Link>
                                            ) : (
                                                interest.userName
                                            )}
                                            <div className="text-xs text-muted-foreground">{interestedUser?.department}, {interestedUser?.institute}</div>
                                            <div className="text-xs text-muted-foreground">{interest.interestId}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col text-xs text-muted-foreground">
                                                {(interest.coPiDetails || []).map(coPi => {
                                                    const coPiUser = userMap.get(coPi.uid!);
                                                    return (
                                                        <div key={coPi.email} className="mb-1">
                                                            {coPiUser?.misId ? (
                                                                <Link href={`/profile/${coPiUser.misId}`} target="_blank" className="text-primary hover:underline">
                                                                    {coPi.name}
                                                                </Link>
                                                            ) : (
                                                                coPi.name
                                                            )}
                                                            <div className="text-xs text-muted-foreground/80">{coPiUser?.department}, {coPiUser?.institute}</div>
                                                        </div>
                                                    );
                                                })}
                                                {interest.coPiDetails?.length === 0 && 'None'}
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            <Badge variant={interest.status === 'Recommended' ? 'default' : 'secondary'}>{interest.status}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                {interest.pptUrl && <Button asChild size="icon" variant="ghost"><a href={interest.pptUrl} target="_blank" rel="noopener noreferrer" title="View Presentation"><ViewIcon className="h-4 w-4" /></a></Button>}
                                                {interest.revisedPptUrl && <Button asChild size="icon" variant="ghost"><a href={interest.revisedPptUrl} target="_blank" rel="noopener noreferrer" title="View Revised Presentation"><FileUp className="h-4 w-4" /></a></Button>}
                                                {interest.endorsementFormUrl && <Button asChild size="icon" variant="ghost"><a href={interest.endorsementFormUrl} target="_blank" rel="noopener noreferrer" title="View Endorsement Form"><FileUp className="h-4 w-4" /></a></Button>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Actions</span></Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    <DropdownMenuSeparator />
                                                    {interest.isBulkUploaded && (
                                                        <DropdownMenuItem onSelect={() => handleOpenBulkEditDialog(interest)}>
                                                            <Edit className="mr-2 h-4 w-4" /> Edit Bulk Data
                                                        </DropdownMenuItem>
                                                    )}
                                                     <DropdownMenuItem onSelect={() => setInterestForPptUpload(interest)}>
                                                        <Upload className="mr-2 h-4 w-4" /> Upload PPT
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => handleOpenRevisionUpload(interest)}>
                                                        <Upload className="mr-2 h-4 w-4" /> Upload Revised PPT
                                                    </DropdownMenuItem>
                                                    {isMeetingScheduled && (
                                                        <>
                                                            {interest.status === 'Endorsement Submitted' && (
                                                                <DropdownMenuItem onSelect={() => handleOpenSignDialog(interest)}>Mark as Endorsement Signed</DropdownMenuItem>
                                                            )}
                                                            
                                                            {!isPostDecision && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(interest.id, 'Recommended')}>Recommended</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(interest.id, 'Not Recommended')}>Not Recommended</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleOpenRemarksDialog(interest, 'Revision Needed')}>Revision is Needed</DropdownMenuItem>
                                                                </>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                        </>
                                                    )}
                                                    <DropdownMenuItem className="text-destructive" onSelect={() => handleOpenDeleteDialog(interest)}>
                                                        <Trash2 className="mr-2 h-4 w-4" /> Delete Registration
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                ) : (
                    <div className="text-center p-8 text-muted-foreground">
                        No users have registered for this call yet.
                    </div>
                )}
            </CardContent>

             <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Registration for {interestToUpdate?.userName}?</AlertDialogTitle>
                        <AlertDialogDescription>Please provide a reason for this deletion. The user will be notified.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <Form {...deleteForm}>
                        <form id="delete-interest-form" onSubmit={deleteForm.handleSubmit(handleDeleteInterest)}>
                            <FormField
                                control={deleteForm.control}
                                name="remarks"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl><Textarea {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </form>
                    </Form>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction type="submit" form="delete-interest-form" disabled={isDeleting}>
                            {isDeleting ? "Deleting..." : "Confirm & Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <Dialog open={isRemarksDialogOpen} onOpenChange={setIsRemarksDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Provide Remarks for {statusToUpdate}</DialogTitle>
                        <DialogDescription>These comments will be sent to the applicant.</DialogDescription>
                    </DialogHeader>
                     <Form {...remarksForm}>
                        <form id="remarks-form" onSubmit={remarksForm.handleSubmit(handleRemarksSubmit)} className="py-4">
                            <FormField
                                control={remarksForm.control}
                                name="remarks"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl><Textarea rows={4} {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </form>
                    </Form>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" form="remarks-form">Submit Remarks</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ScheduleMeetingDialog
                isOpen={isScheduleDialogOpen}
                onOpenChange={setIsScheduleDialogOpen}
                onActionComplete={onActionComplete}
                call={call}
                interests={interests}
                allUsers={allUsers}
                currentUser={currentUser}
             />
             <AttendanceDialog
                isOpen={isAttendanceDialogOpen}
                onOpenChange={setIsAttendanceDialogOpen}
                onUpdate={onActionComplete}
                call={call}
                interests={interests}
                allUsers={allUsers}
             />
             {interestToUpdate && (
                 <>
                    <BulkEditDialog 
                        interest={interestToUpdate} 
                        isOpen={isBulkEditDialogOpen} 
                        onOpenChange={setIsBulkEditDialogOpen}
                        onUpdate={onActionComplete}
                    />
                    <SignEndorsementDialog
                        interest={interestToUpdate}
                        isOpen={isSignEndorsementDialogOpen}
                        onOpenChange={setIsSignEndorsementDialogOpen}
                        onUpdate={onActionComplete}
                    />
                 </>
             )}
             {interestForPptUpload && (
                <UploadPptDialog
                    isOpen={!!interestForPptUpload}
                    onOpenChange={() => setInterestForPptUpload(null)}
                    interest={interestForPptUpload}
                    call={call}
                    user={currentUser}
                    onUploadSuccess={onActionComplete}
                    isAdminUpload={true}
                />
             )}
             <ManualRegistrationDialog 
                call={call}
                isOpen={isManualRegisterOpen}
                onOpenChange={setIsManualRegisterOpen}
                onActionComplete={onActionComplete}
                currentUser={currentUser}
             />
        </Card>
    );
}
