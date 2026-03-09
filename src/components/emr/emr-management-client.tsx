

// src/components/emr/emr-management-client.tsx
'use client';

import { useState, useMemo } from 'react';
import type { FundingCall, User, EmrInterest } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Download, Trash2, CalendarClock, Eye, MoreHorizontal, MessageSquare, Loader2, FileUp, FileText as ViewIcon, Edit, Upload, UserCheck, UserPlus, Search, Send, CalendarDays } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Textarea } from '../ui/textarea';
import { Form, FormControl, FormField, FormItem, FormMessage } from '../ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { deleteEmrInterest, updateEmrInterestDetails, updateEmrStatus, signAndUploadEndorsement, markEmrAttendance, registerEmrInterest, sendPptReminderEmails } from '@/app/emr-actions';
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
import { format, parseISO } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';


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

function RegisterUserDialog({ call, adminUser, isOpen, onOpenChange, onRegisterSuccess }: { call: FundingCall, adminUser: User, isOpen: boolean, onOpenChange: (open: boolean) => void, onRegisterSuccess: () => void }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [foundUsers, setFoundUsers] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = async () => {
        if (!searchTerm.trim()) return;
        setIsSearching(true);
        const result = await findUserByMisId(searchTerm);
        if (result.success && result.users) {
            setFoundUsers(result.users);
        } else {
            toast({ variant: 'destructive', title: 'Not Found', description: result.error });
            setFoundUsers([]);
        }
        setIsSearching(false);
    };

    const handleRegister = async (userToRegister: User) => {
        setIsSubmitting(true);
        try {
            const result = await registerEmrInterest(call.id, userToRegister, [], { adminUid: adminUser.uid, adminName: adminUser.name });
            if (result.success) {
                toast({ title: 'Success', description: `${userToRegister.name} has been registered for the call.` });
                onRegisterSuccess();
                onOpenChange(false);
            } else {
                toast({ variant: 'destructive', title: 'Registration Failed', description: result.error });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Register a User for: {call.title}</DialogTitle>
                    <DialogDescription>Search for a user by their MIS ID to register them for this funding call.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <div className="flex items-center gap-2">
                        <Input placeholder="Enter user's MIS ID" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        <Button onClick={handleSearch} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</Button>
                    </div>
                    {foundUsers.length > 0 && (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {foundUsers.map(user => (
                                <div key={user.uid || user.email} className="flex justify-between items-center p-2 border rounded-md">
                                    <div>
                                        <p className="font-semibold">{user.name}</p>
                                        <p className="text-xs text-muted-foreground">{user.email}</p>
                                    </div>
                                    <Button size="sm" onClick={() => handleRegister(user)} disabled={isSubmitting}>Register</Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
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
            absentEvaluatorUids: call.meetingDetails?.absentEvaluators || [],
        },
    });

    const scheduledApplicants = interests.filter(i => i.meetingSlot);
    const assignedEvaluators = allUsers.filter(u => call.meetingDetails?.assignedEvaluators?.includes(u.uid));

    const handleSubmit = async (values: z.infer<typeof attendanceSchema>) => {
        setIsSubmitting(true);
        try {
            const result = await markEmrAttendance(
                call.id,
                values.absentApplicantIds,
                values.absentEvaluatorUids
            );
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
            <DialogContent className="sm:max-w-md">
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

function EditBulkEmrDialog({ interest, isOpen, onOpenChange, onUpdate }: { interest: EmrInterest; isOpen: boolean; onOpenChange: (open: boolean) => void; onUpdate: (updatedInterest: EmrInterest) => void; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [title, setTitle] = useState(interest.callTitle || '');
    const [agency, setAgency] = useState(interest.agency || '');
    const [durationAmount, setDurationAmount] = useState(interest.durationAmount || '');
    const [sanctionDate, setSanctionDate] = useState<Date | undefined>(interest.sanctionDate ? parseISO(interest.sanctionDate) : undefined);
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [coPis, setCoPis] = useState<any[]>(interest.coPiDetails || []);
    const [coPiSearchTerm, setCoPiSearchTerm] = useState('');
    const [foundCoPis, setFoundCoPis] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isSelectionOpen, setIsSelectionOpen] = useState(false);

    const handleSearchCoPi = async () => {
        if (!coPiSearchTerm) return;
        setIsSearching(true);
        try {
            const result = await findUserByMisId(coPiSearchTerm);
            if (result.success && result.users && result.users.length > 0) {
                if (result.users.length === 1) {
                    handleAddCoPi(result.users[0]);
                } else {
                    setFoundCoPis(result.users);
                    setIsSelectionOpen(true);
                }
            } else {
                toast({ variant: 'destructive', title: 'User Not Found', description: result.error });
            }
        } finally { setIsSearching(false); }
    };

    const handleAddCoPi = (selectedUser: any) => {
        if (selectedUser && !coPis.some(c => c.email === selectedUser.email)) {
            setCoPis([...coPis, selectedUser]);
        }
        setCoPiSearchTerm('');
        setFoundCoPis([]);
        setIsSelectionOpen(false);
    };

    const handleRemoveCoPi = (email: string) => {
        setCoPis(coPis.filter(c => c.email !== email));
    };

    const handleSave = async () => {
        setIsSubmitting(true);
        try {
            let proofUrl = interest.proofUrl;
            if (proofFile) {
                const dataUrl = await fileToDataUrl(proofFile);
                const path = `emr-proofs/${interest.id}/${proofFile.name}`;
                const uploadResult = await uploadFileToServer(dataUrl, path);
                if (uploadResult.success && uploadResult.url) {
                    proofUrl = uploadResult.url;
                } else {
                    throw new Error(uploadResult.error || "Failed to upload proof.");
                }
            }

            const updates: Partial<EmrInterest> = {
                callTitle: title,
                agency: agency,
                durationAmount: durationAmount,
                sanctionDate: sanctionDate ? sanctionDate.toISOString() : undefined,
                coPiDetails: coPis,
                coPiUids: coPis.map(c => c.uid).filter(Boolean) as string[],
                coPiNames: coPis.map(c => c.name),
                proofUrl,
            };
            const result = await updateEmrInterestDetails(interest.id, updates);
            if (result.success) {
                toast({ title: 'Success', description: 'Project details updated.' });
                onUpdate({ ...interest, ...updates });
                onOpenChange(false);
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to save changes.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader><DialogTitle>Edit EMR Project Details</DialogTitle></DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                    <div><Label>Project Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
                    <div><Label>Funding Agency</Label><Input value={agency} onChange={e => setAgency(e.target.value)} /></div>
                    <div><Label>Amount & Duration</Label><Input value={durationAmount} onChange={e => setDurationAmount(e.target.value)} placeholder="e.g., Amount: 50,00,000 | Duration: 3 Years"/></div>
                    <div>
                        <Label>Date of Sanction</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-full justify-start text-left font-normal", !sanctionDate && "text-muted-foreground")}
                                >
                                    <CalendarDays className="mr-2 h-4 w-4" />
                                    {sanctionDate ? format(sanctionDate, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar 
                                    mode="single" 
                                    captionLayout="dropdown-buttons"
                                    fromYear={2010}
                                    toYear={new Date().getFullYear()}
                                    selected={sanctionDate} 
                                    onSelect={setSanctionDate} 
                                    initialFocus 
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                     <div>
                        <Label>Proof of Sanction (Below 5 MB)</Label>
                        {interest.proofUrl && <a href={interest.proofUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline block mb-2">View current proof</a>}
                        <Input type="file" accept=".pdf" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                    </div>

                    <div>
                        <Label>Co-PIs</Label>
                        <div className="flex gap-2 mt-1">
                            <Input placeholder="Search Co-PI by MIS ID" value={coPiSearchTerm} onChange={e => setCoPiSearchTerm(e.target.value)} />
                            <Button onClick={handleSearchCoPi} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin"/> : "Search"}</Button>
                        </div>
                        <div className="space-y-2 mt-2">
                            {coPis.map(c => <div key={c.email} className="flex justify-between items-center p-2 bg-muted rounded-md text-sm"><span>{c.name}</span><Button variant="ghost" size="sm" onClick={() => handleRemoveCoPi(c.email)}>Remove</Button></div>)}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleSave} disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save'}</Button>
                </DialogFooter>
                 <Dialog open={isSelectionOpen} onOpenChange={setIsSelectionOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Multiple Users Found</DialogTitle>
                            <DialogDescription>Please select the correct user to add as a Co-PI.</DialogDescription>
                        </DialogHeader>
                        <RadioGroup onValueChange={(value) => handleAddCoPi(JSON.parse(value))} className="py-4 space-y-2">
                            {foundCoPis.map((user, i) => (
                                <div key={i} className="flex items-center space-x-2 border rounded-md p-3">
                                    <RadioGroupItem value={JSON.stringify(user)} id={`user-${i}`} />
                                    <Label htmlFor={`user-${i}`} className="flex flex-col">
                                        <span className="font-semibold">{user.name}</span>
                                        <span className="text-muted-foreground text-xs">{user.email}</span>
                                        <span className="text-muted-foreground text-xs">{user.campus}</span>
                                    </Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
}


export function EmrManagementClient({ call, interests, allUsers, currentUser, onActionComplete }: EmrManagementClientProps) {
    const { toast } = useToast();
    const userMap = useMemo(() => new Map(allUsers.map(u => [u.uid, u])), [allUsers]);
    const [isDeleting, setIsDeleting] = useState(false);
    const [interestToUpdate, setInterestToUpdate] = useState<EmrInterest | null>(null);
    const [statusToUpdate, setStatusToUpdate] = useState<EmrInterest['status'] | null>(null);
    const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
    const [isRegisterUserDialogOpen, setIsRegisterUserDialogOpen] = useState(false);
    const [isRemarksDialogOpen, setIsRemarksDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false);
    const [isSignEndorsementDialogOpen, setIsSignEndorsementDialogOpen] = useState(false);
    const [interestForPptUpload, setInterestForPptUpload] = useState<EmrInterest | null>(null);
    const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSendingReminders, setIsSendingReminders] = useState(false);


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

    const handleOpenPptUpload = (interest: EmrInterest) => {
        setInterestForPptUpload(interest);
    };

    const handleSendPptReminders = async () => {
        setIsSendingReminders(true);
        const result = await sendPptReminderEmails(call.id);
        if (result.success) {
            toast({ title: "Reminders Sent", description: `Emails have been sent to ${result.sentCount} applicants.` });
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error });
        }
        setIsSendingReminders(false);
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
    
    const filteredInterests = useMemo(() => {
        if (!searchTerm) return interests;
        const lowerCaseSearch = searchTerm.toLowerCase();
        return interests.filter(interest => {
            const user = userMap.get(interest.userId);
            return interest.userName.toLowerCase().includes(lowerCaseSearch) ||
                   interest.userEmail.toLowerCase().includes(lowerCaseSearch) ||
                   (user?.misId && user.misId.toLowerCase().includes(lowerCaseSearch));
        });
    }, [interests, searchTerm, userMap]);
    
    const unscheduledApplicantsExist = interests.some(i => !i.meetingSlot && !i.wasAbsent);
    const meetingIsScheduled = !!call.meetingDetails?.date;
    
    const pendingPptUploads = useMemo(() => {
        return interests.filter(i => !i.pptUrl).length;
    }, [interests]);


    return (
        <>
        {meetingIsScheduled && (
            <Card className="mb-8 bg-primary/10 border-primary/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <CalendarClock className="h-5 w-5" />
                        Meeting Scheduled
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <p><strong>Date:</strong> {format(parseISO(call.meetingDetails!.date), 'PPP')}</p>
                        <p><strong>Time:</strong> {call.meetingDetails!.time}</p>
                        <p><strong>Venue:</strong> {call.meetingDetails!.venue}</p>
                    </div>
                </CardContent>
            </Card>
        )}
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle>Applicant Registrations ({interests.length})</CardTitle>
                        <CardDescription>Review and manage all applicants for this call.</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                         {unscheduledApplicantsExist && currentUser.designation !== 'Head of Goa Campus' && (
                            <Button onClick={() => setIsScheduleDialogOpen(true)}>
                                <CalendarClock className="mr-2 h-4 w-4" /> Schedule Meeting
                            </Button>
                         )}
                         <Button variant="secondary" onClick={() => setIsRegisterUserDialogOpen(true)}>
                            <UserPlus className="mr-2 h-4 w-4" /> Register User
                         </Button>
                        <Button variant="outline" onClick={handleSendPptReminders} disabled={isSendingReminders}>
                            {isSendingReminders ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4" />}
                            Remind ({pendingPptUploads})
                        </Button>
                         {meetingIsScheduled && (
                            <Button variant="outline" onClick={() => setIsAttendanceDialogOpen(true)}>
                                <UserCheck className="mr-2 h-4 w-4" /> Attendance
                            </Button>
                         )}
                        <Button variant="outline" onClick={handleExport} disabled={interests.length === 0}>
                            <Download className="mr-2 h-4 w-4" /> Export XLSX
                        </Button>
                    </div>
                </div>
                 <div className="mt-4">
                    <Input
                        placeholder="Search by PI Name, Email, or MIS ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="max-w-md"
                    />
                </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
                 {filteredInterests.length > 0 ? (
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
                            {filteredInterests.map(interest => {
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
                                                    const coPiUser = allUsers.find(u => u.uid === coPi.uid);
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
                                                    <DropdownMenuItem onSelect={() => handleOpenPptUpload(interest)}>
                                                        <Upload className="mr-2 h-4 w-4" /> 
                                                        {interest.pptUrl ? 'Upload Revised PPT' : 'Upload PPT'}
                                                    </DropdownMenuItem>
                                                    {interest.isBulkUploaded && (
                                                        <DropdownMenuItem onSelect={() => handleOpenBulkEditDialog(interest)}>
                                                            <Edit className="mr-2 h-4 w-4" /> Edit Bulk Data
                                                        </DropdownMenuItem>
                                                    )}
                                                    {isMeetingScheduled && (
                                                        <>
                                                            {interest.status === 'Endorsement Submitted' && (
                                                                <DropdownMenuItem onSelect={() => handleOpenSignDialog(interest)}>Mark as Endorsement Signed</DropdownMenuItem>
                                                            )}
                                                            
                                                            {!isPostDecision && (
                                                                <>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(interest.id, 'Recommended')}>Recommended</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleOpenRemarksDialog(interest, 'Revision Needed')}>Revision is Needed</DropdownMenuItem>
                                                                    <DropdownMenuItem onClick={() => handleStatusUpdate(interest.id, 'Not Recommended')}>Not Recommended</DropdownMenuItem>
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
                        <p>No registered applicants match your search criteria.</p>
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
                    <EditBulkEmrDialog 
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
                    user={userMap.get(interestForPptUpload.userId)!}
                    adminUser={currentUser}
                    onUploadSuccess={onActionComplete}
                    isRevision={!!interestForPptUpload.revisedPptUrl}
                />
            )}
        </Card>
        <RegisterUserDialog 
            call={call} 
            adminUser={currentUser} 
            isOpen={isRegisterUserDialogOpen} 
            onOpenChange={setIsRegisterUserDialogOpen} 
            onRegisterSuccess={onActionComplete} 
        />
        </>
    );
}
