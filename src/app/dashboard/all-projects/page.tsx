
'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import ExcelJS from 'exceljs';
import { format, isAfter, isBefore, startOfToday, parseISO, differenceInMonths, addDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from '@/components/projects/project-list';
import { db } from '@/lib/config';
import { collection, getDocs, query, where, orderBy, or } from 'firebase/firestore';
import type { Project, User, EmrInterest, FundingCall, SpecialCfp, CfpSubmission, CoPiDetails } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Calendar as CalendarIcon, Eye, Upload, Loader2, Edit, Search, ChevronDown, Plus, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import * as z from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { updateEmrFinalStatus, updateEmrInterestCoPis, updateEmrInterestDetails, addSanctionedEmrProject } from '@/app/emr-actions';
import { findUserByMisId } from '@/app/userfinding';
import { reportSystemError } from '@/lib/error-reporting';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';


function parseAnyDate(rawDate: any): Date | null {
    if (!rawDate) return null;
    if (rawDate instanceof Date) return isNaN(rawDate.getTime()) ? null : rawDate;
    if (typeof rawDate === 'object' && 'seconds' in rawDate) {
        return new Date(rawDate.seconds * 1000);
    }
    if (typeof rawDate === 'number') {
        const d = new Date(rawDate);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof rawDate === 'string') {
        const trimmed = rawDate.trim();
        if (!trimmed) return null;

        try {
            const isoParsed = parseISO(trimmed);
            if (!isNaN(isoParsed.getTime())) return isoParsed;
        } catch (e) {}

        const parsed = new Date(trimmed);
        return isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

const STATUSES: Project['status'][] = ['Submitted', 'Under Review', 'Revision Needed', 'Revision Submitted', 'Recommended', 'Not Recommended', 'In Progress', 'Completed', 'Pending Completion Approval', 'Sanctioned'];
const CAMPUSES = ['Goa'];

const IMR_EXPORT_COLUMNS = [
    { id: 'title', label: 'Title of the Project' },
    { id: 'type', label: 'Domain of the Project' },
    { id: 'associatedCallTitle', label: 'Associated Call Title' },
    { id: 'callPostedMonth', label: 'Call Posted Month' },
    { id: 'callPostedByAdmin', label: 'Call Posted By Admin' },
    { id: 'callApplicantsCount', label: 'Total Applications Received for Call' },
    { id: 'sdgRelated', label: 'Is project related to Sustainable Development Goals?' },
    { id: 'sdgGoals', label: 'Select Sustainable Development Goal, if applicable' },
    { id: 'interdisciplinary', label: 'Is project related to Interdisciplinary / Multidisciplinary / Transdisciplinary?' },
    { id: 'interdisciplinaryType', label: 'Select Interdisciplinary / Multidisciplinary / Transdisciplinary, if applicable' },
    { id: 'pi', label: 'Name of the Principal Investigator working in the project receiving seed money' },
    { id: 'piEmail', label: 'Email of Principal Investigator' },
    { id: 'piContact', label: 'Contact of Principal Investigator' },
    { id: 'misId', label: 'MIS ID of Principal Investigator' },
    { id: 'institute', label: 'Institute of Principal Investigator' },
    { id: 'faculty', label: 'Faculty of Principal Investigator' },
    { id: 'teamMembers', label: 'Name(s) of the teacher(s) / Student(s) working in the project receiving seed money other than Principal Investigator' },
    { id: 'submissionDate', label: 'Date of Application for Seed Money to RDC' },
    { id: 'sanctionDate', label: 'Date of Receiving approval of seed money grant from RDC' },
    { id: 'sanctionNumber', label: 'Sanction Order Number' },
    { id: 'projectDuration', label: 'Duration of the project in Months' },
    { id: 'seedMoney', label: 'The amount of seed money (INR in lakhs)' },
    { id: 'seedMoneyMonth', label: 'Month of Receiving Seed Money Grant' },
    { id: 'seedMoneyYear', label: 'Year of Receiving Seed Money Grant' },
    { id: 'currentPhase', label: 'Current Phase of the Project' },
    { id: 'phaseBreakdown', label: 'Phase-wise Sanctioned Amount Breakdown' },
    { id: 'phase1Amount', label: 'Phase 1 Sanctioned Amount (INR)' },
    { id: 'phase2Amount', label: 'Phase 2 Sanctioned Amount (INR)' },
    { id: 'phase3Amount', label: 'Phase 3 Sanctioned Amount (INR)' },
    { id: 'phase4Amount', label: 'Phase 4 Sanctioned Amount (INR)' },
    { id: 'phase5Amount', label: 'Phase 5 Sanctioned Amount (INR)' },
    { id: 'presentationCount', label: 'Number of Presentations Done' },
    { id: 'presentationDetails', label: 'Presentation Details / History' },
    { id: 'meetingsDoneForSpecifiedCalls', label: 'Number of Meetings Done for Specified Calls' },
    { id: 'remarks', label: 'Remarks' },
];

const EMR_EXPORT_COLUMNS = [
    { id: 'callTitle', label: 'Project Title / Call Title' },
    { id: 'agency', label: 'Funding Agency' },
    { id: 'associatedCallTitle', label: 'Associated Call Title' },
    { id: 'callPostedMonth', label: 'Call Posted Month' },
    { id: 'callPostedByAdmin', label: 'Call Posted By Admin' },
    { id: 'callApplicantsCount', label: 'Total Applications Received for Call' },
    { id: 'piName', label: 'Name of Principal Investigator' },
    { id: 'piEmail', label: 'Email of Principal Investigator' },
    { id: 'piContact', label: 'Contact of Principal Investigator' },
    { id: 'misId', label: 'MIS ID of Principal Investigator' },
    { id: 'piInstitute', label: 'Institute of Principal Investigator' },
    { id: 'piDepartment', label: 'Faculty / Department of Principal Investigator' },
    { id: 'campus', label: 'Campus' },
    { id: 'coPiNames', label: 'Co-PI Names / Team Members' },
    { id: 'registrationDate', label: 'Date of Application / Registration' },
    { id: 'sanctionDate', label: 'Sanction Date' },
    { id: 'projectDuration', label: 'Duration of Project (Months)' },
    { id: 'grantAmount', label: 'Sanctioned Amount (INR in lakhs)' },
    { id: 'durationAmount', label: 'Duration & Amount Summary' },
    { id: 'sdgRelated', label: 'Is project related to Sustainable Development Goals?' },
    { id: 'sdgGoals', label: 'Sustainable Development Goals, if applicable' },
    { id: 'interdisciplinary', label: 'Is project Interdisciplinary / Multidisciplinary?' },
    { id: 'presentationCount', label: 'Number of Presentations Done' },
    { id: 'presentationDetails', label: 'Presentation Details / History' },
    { id: 'meetingsDoneForSpecifiedCalls', label: 'Number of Meetings Done for Specified Calls' },
    { id: 'status', label: 'Status / Remarks' },
];

const addEmrSchema = z.object({
    title: z.string().min(5, 'Project title is required.'),
    agency: z.string().min(2, 'Funding agency is required.'),
    sanctionDate: z.date().optional(),
    amount: z.coerce.number().min(0, 'Amount cannot be negative.').optional(),
    duration: z.coerce.number().min(0, 'Duration cannot be negative.').optional(),
});

function AddSanctionedEmrDialog({ isOpen, onOpenChange, onActionComplete }: { isOpen: boolean; onOpenChange: (open: boolean) => void; onActionComplete: () => void; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pi, setPi] = useState<any>(null);
    const [coPis, setCoPis] = useState<CoPiDetails[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [foundUsers, setFoundUsers] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchFor, setSearchFor] = useState<'pi' | 'copi'>('pi');
    const [isSelectionOpen, setIsSelectionOpen] = useState(false);

    const form = useForm<z.infer<typeof addEmrSchema>>({
        resolver: zodResolver(addEmrSchema),
    });

    const handleSearch = async () => {
        if (!searchTerm) return;
        setIsSearching(true);
        try {
            const result = await findUserByMisId(searchTerm);
            if (result.success && result.users) {
                if (result.users.length === 1) {
                    handleUserSelect(result.users[0]);
                } else {
                    setFoundUsers(result.users);
                    setIsSelectionOpen(true);
                }
            } else {
                toast({ variant: 'destructive', title: 'User Not Found', description: result.error });
            }
        } finally { setIsSearching(false); }
    };

    const handleUserSelect = (user: any) => {
        if (searchFor === 'pi') {
            setPi(user);
        } else {
            if (!coPis.some(c => c.email === user.email)) {
                setCoPis(prev => [...prev, user]);
            }
        }
        setSearchTerm('');
        setFoundUsers([]);
        setIsSelectionOpen(false);
    };

    const handleSave = async (values: z.infer<typeof addEmrSchema>) => {
        if (!pi) {
            toast({ variant: 'destructive', title: 'PI Required', description: 'Please select a Principal Investigator.' });
            return;
        }
        setIsSubmitting(true);
        try {
            // Construct durationAmount from separate fields
            let durationAmount = '';
            if (values.amount !== undefined && values.amount > 0) {
                durationAmount += `Amount: ₹${values.amount.toLocaleString('en-IN')}`;
            }
            if (values.duration !== undefined && values.duration > 0) {
                if (durationAmount) durationAmount += ' | ';
                durationAmount += `Duration: ${values.duration} Years`;
            }
            if (!durationAmount) {
                durationAmount = 'Not specified';
            }

            const result = await addSanctionedEmrProject({
                title: values.title,
                agency: values.agency,
                sanctionDate: values.sanctionDate,
                durationAmount,
                pi: { uid: pi.uid, name: pi.name, email: pi.email },
                coPis,
            });
            if (result.success) {
                toast({ title: 'Success', description: 'EMR project added and PI notified.' });
                onActionComplete();
                onOpenChange(false);
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Save Failed', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Add Sanctioned EMR Project</DialogTitle>
                    <DialogDescription>Manually add a historical or newly sanctioned EMR project.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="add-emr-form" onSubmit={form.handleSubmit(handleSave)} className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                        <div className="space-y-2">
                            <Label>Principal Investigator (PI) *</Label>
                            {pi ? (
                                <div className="flex justify-between items-center p-2 bg-muted rounded-md text-sm">
                                    <span>{pi.name} ({pi.misId})</span>
                                    <Button variant="ghost" size="sm" onClick={() => setPi(null)}>Change</Button>
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <Input placeholder="Search PI by MIS ID or Name..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setSearchFor('pi'); }} />
                                    <Button onClick={handleSearch} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</Button>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Co-Principal Investigators (Co-PIs)</Label>
                            <div className="flex gap-2">
                                <Input placeholder="Search Co-PI by MIS ID or Name..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setSearchFor('copi'); }} />
                                <Button onClick={handleSearch} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}</Button>
                            </div>
                            <div className="space-y-2 mt-2">
                                {coPis.map(c => <div key={c.email} className="flex justify-between items-center p-2 bg-muted rounded-md text-sm"><span>{c.name}</span><Button variant="ghost" size="sm" onClick={() => setCoPis(coPis.filter(cp => cp.email !== c.email))}>Remove</Button></div>)}
                            </div>
                        </div>

                        <FormField name="title" control={form.control} render={({ field }) => (<FormItem><FormLabel>Project Title *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField name="agency" control={form.control} render={({ field }) => (<FormItem><FormLabel>Funding Agency *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField name="sanctionDate" control={form.control} render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Date of Sanction</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal w-full", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar captionLayout="dropdown-buttons" fromYear={2015} toYear={new Date().getFullYear() + 5} mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
                        <FormField name="amount" control={form.control} render={({ field }) => (<FormItem><FormLabel>Amount (₹)</FormLabel><FormControl><Input type="number" min="0" placeholder="e.g., 5000000" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField name="duration" control={form.control} render={({ field }) => (<FormItem><FormLabel>Duration (Years)</FormLabel><FormControl><Input type="number" min="0" step="0.5" placeholder="e.g., 3" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="add-emr-form" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Add Project'}</Button>
                </DialogFooter>

                <Dialog open={isSelectionOpen} onOpenChange={setIsSelectionOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Multiple Users Found</DialogTitle>
                            <DialogDescription>Please select the correct user.</DialogDescription>
                        </DialogHeader>
                        <RadioGroup onValueChange={(value) => handleUserSelect(JSON.parse(value))} className="py-4 space-y-2">
                            {foundUsers.map((user, i) => (
                                <div key={i} className="flex items-center space-x-2 border rounded-md p-3">
                                    <RadioGroupItem value={JSON.stringify(user)} id={`user-${i}`} />
                                    <Label htmlFor={`user-${i}`} className="flex flex-col">
                                        <span className="font-semibold">{user.name}</span>
                                        <span className="text-muted-foreground text-xs">{user.email} ({user.campus})</span>
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

const editEmrSchema = z.object({
    status: z.enum(['Sanctioned', 'Not Sanctioned'], { required_error: 'Please select a final status.' }),
    finalProof: z.any().optional(),
    sanctionDate: z.date().optional(),
});

function EditEmrProjectDialog({ interest, isOpen, onOpenChange, onActionComplete }: { interest: EmrInterest; isOpen: boolean; onOpenChange: (open: boolean) => void; onActionComplete: () => void; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [coPiSearchTerm, setCoPiSearchTerm] = useState('');
    const [foundCoPis, setFoundCoPis] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [coPiList, setCoPiList] = useState<CoPiDetails[]>(interest.coPiDetails || []);
    const [isSelectionOpen, setIsSelectionOpen] = useState(false);

    const form = useForm<z.infer<typeof editEmrSchema>>({
        resolver: zodResolver(editEmrSchema),
        defaultValues: {
            status: interest.status === 'Sanctioned' || interest.status === 'Not Sanctioned' ? interest.status : undefined,
            sanctionDate: interest.sanctionDate ? parseISO(interest.sanctionDate) : undefined,
        }
    });

    const fileToDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    };

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
        if (selectedUser && !coPiList.some(c => c.email === selectedUser.email)) {
            setCoPiList(prev => [...prev, selectedUser]);
        }
        setCoPiSearchTerm('');
        setFoundCoPis([]);
        setIsSelectionOpen(false);
    };

    const handleRemoveCoPi = (email: string) => {
        setCoPiList(prev => prev.filter(c => c.email !== email));
    };

    const handleSave = async (values: z.infer<typeof editEmrSchema>) => {
        setIsSubmitting(true);
        try {
            // First, update Co-PIs
            const coPiResult = await updateEmrInterestCoPis(interest.id, coPiList);
            if (!coPiResult.success) throw new Error(coPiResult.error);

            // Then, update status, proof, and sanction date
            const proofFile = values.finalProof?.[0];
            let proofDataUrl: string | undefined = interest.finalProofUrl;
            let fileName: string = 'existing_proof.pdf';

            if (proofFile) {
                proofDataUrl = await fileToDataUrl(proofFile);
                fileName = proofFile.name;
            }

            if (proofDataUrl) {
                const statusResult = await updateEmrFinalStatus(interest.id, values.status, proofDataUrl, fileName);
                if (!statusResult.success) throw new Error(statusResult.error);
            }

            // Finally, update other details like sanction date
            if (values.sanctionDate) {
                const detailsResult = await updateEmrInterestDetails(interest.id, { sanctionDate: values.sanctionDate.toISOString() });
                if (!detailsResult.success) throw new Error(detailsResult.error);
            }

            toast({ title: 'Success', description: 'EMR project details updated.' });
            onActionComplete();
            onOpenChange(false);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Edit EMR Project: {interest.callTitle}</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto pr-4">
                    <div>
                        <Label>Manage Co-PIs</Label>
                        <div className="flex gap-2 mt-1">
                            <Input placeholder="Search & Add Co-PI by MIS ID..." value={coPiSearchTerm} onChange={e => setCoPiSearchTerm(e.target.value)} />
                            <Button onClick={handleSearchCoPi} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}</Button>
                        </div>
                        <div className="space-y-2 mt-2">
                            {coPiList.map(coPi => (
                                <div key={coPi.email} className="flex justify-between items-center p-2 bg-muted rounded-md text-sm">
                                    <span>{coPi.name}</span>
                                    <Button variant="ghost" size="sm" onClick={() => handleRemoveCoPi(coPi.email)}>Remove</Button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <Form {...form}>
                        <form id="edit-emr-form" onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
                            <FormField
                                name="status"
                                control={form.control}
                                render={({ field }) => (
                                    <FormItem className="space-y-3">
                                        <FormLabel>Final Status</FormLabel>
                                        <FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex space-x-4"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="Sanctioned" /></FormControl><FormLabel className="font-normal">Sanctioned</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="Not Sanctioned" /></FormControl><FormLabel className="font-normal">Not Sanctioned</FormLabel></FormItem></RadioGroup></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                name="sanctionDate"
                                control={form.control}
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel>Date of Sanction</FormLabel>
                                        <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal w-full", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar captionLayout="dropdown-buttons" fromYear={2015} toYear={new Date().getFullYear() + 5} mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            <FormField
                                name="finalProof"
                                control={form.control}
                                render={({ field: { onChange, value, ...rest } }) => (
                                    <FormItem>
                                        <FormLabel>Upload/Replace Proof Document (PDF)</FormLabel>
                                        <FormControl><Input type="file" accept=".pdf" onChange={(e) => onChange(e.target.files)} {...rest} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </form>
                    </Form>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="edit-emr-form" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</Button>
                </DialogFooter>
                <Dialog open={isSelectionOpen} onOpenChange={setIsSelectionOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Multiple Users Found</DialogTitle>
                            <DialogDescription>Please select the correct user to add.</DialogDescription>
                        </DialogHeader>
                        <RadioGroup onValueChange={(value) => handleAddCoPi(JSON.parse(value))} className="py-4 space-y-2">
                            {foundCoPis.map((user, i) => (
                                <div key={i} className="flex items-center space-x-2 border rounded-md p-3">
                                    <RadioGroupItem value={JSON.stringify(user)} id={`user-${i}`} />
                                    <Label htmlFor={`user-${i}`} className="flex flex-col">
                                        <span className="font-semibold">{user.name}</span>
                                        <span className="text-muted-foreground text-xs">{user.email} ({user.campus})</span>
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

function AllProjectsContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [allImrProjects, setAllImrProjects] = useState<Project[]>([]);
    const [allEmrProjects, setAllEmrProjects] = useState<EmrInterest[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const { toast } = useToast();

    const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
    const [statusFilter, setStatusFilter] = useState<string[]>(searchParams.get('status')?.split(',').filter(Boolean) || []);
    const [facultyFilter, setFacultyFilter] = useState<string[]>(searchParams.get('faculty')?.split(',').filter(Boolean) || []);
    const [campusFilter, setCampusFilter] = useState<string[]>(searchParams.get('campus')?.split(',').filter(Boolean) || []);
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'imr');
    const [isAddEmrDialogOpen, setIsAddEmrDialogOpen] = useState(false);
    const [currentPageImr, setCurrentPageImr] = useState(1);
    const [currentPageEmr, setCurrentPageEmr] = useState(1);
    const itemsPerPage = 30;

    const isMobile = useIsMobile();

    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [exportDateRange, setExportDateRange] = useState<DateRange | undefined>(undefined);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [selectedExportColumns, setSelectedExportColumns] = useState<string[]>(IMR_EXPORT_COLUMNS.map(c => c.id));
    const [projectToEdit, setProjectToEdit] = useState<EmrInterest | null>(null);

    const [emrSortConfig, setEmrSortConfig] = useState<{
        key: 'callTitle' | 'userName' | 'agency' | 'sanctionDate' | 'amount';
        direction: 'asc' | 'desc';
    } | null>(null);

    const handleEmrSort = (key: 'callTitle' | 'userName' | 'agency' | 'sanctionDate' | 'amount') => {
        setEmrSortConfig(prev => {
            if (!prev || prev.key !== key) {
                return { key, direction: 'asc' };
            }
            if (prev.direction === 'asc') {
                return { key, direction: 'desc' };
            }
            return null; // Reset sort
        });
    };

    const getSortIcon = (key: 'callTitle' | 'userName' | 'agency' | 'sanctionDate' | 'amount') => {
        if (!emrSortConfig || emrSortConfig.key !== key) {
            return <ArrowUpDown className="h-4 w-4 ml-1 text-muted-foreground/50" />;
        }
        return emrSortConfig.direction === 'asc' 
            ? <ArrowUp className="h-4 w-4 ml-1 text-primary" /> 
            : <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
    };

    const updateUrlParams = useCallback((newValues: { q?: string; status?: string; faculty?: string, campus?: string, tab?: string }) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(newValues).forEach(([key, value]) => {
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
        });
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, [pathname, router, searchParams]);

    const fetchAllData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        try {
            const usersCol = collection(db, 'users');
            const userSnapshot = await getDocs(usersCol);
            const userList = userSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
            setUsers(userList);

            const projectsCol = collection(db, 'projects');
            const emrInterestsCol = collection(db, 'emrInterests');
            const isSuperAdmin = user?.role === 'Super-admin';
            const isAdmin = user?.role === 'admin';
            const isIqac = user?.role === 'IQAC';
            const isCro = user?.role === 'CRO';
            const isPrincipal = user?.designation === 'Principal';
            const isHod = user?.designation === 'HOD';
            const isGoaHead = user?.designation === 'Head of Goa Campus';

            let imrConstraints: any[] = [orderBy('submissionDate', 'desc')];
            let emrConstraints: any[] = [where('isBulkUploaded', '==', true)];

            if (isCro && user.faculties && user.faculties.length > 0) {
                imrConstraints.unshift(where('faculty', 'in', user.faculties));
                emrConstraints.unshift(where('faculty', 'in', user.faculties));
            } else if (isGoaHead) {
                imrConstraints.unshift(where('campus', '==', 'Goa'));
                emrConstraints.unshift(where('campus', '==', 'Goa'));
            } else if (isPrincipal && user.institute) {
                imrConstraints.unshift(where('institute', '==', user.institute));
                emrConstraints.unshift(where('faculty', '==', user.faculty));
            } else if (isHod && user.department && user.institute) {
                imrConstraints.unshift(where('departmentName', '==', user.department), where('institute', '==', user.institute));
                emrConstraints.unshift(where('department', '==', user.department));
            }

            const imrQuery = query(projectsCol, ...imrConstraints);
            const emrQuery = query(emrInterestsCol, ...emrConstraints);

            const [imrSnapshot, emrSnapshot] = await Promise.all([
                getDocs(imrQuery),
                getDocs(emrQuery)
            ]);

            let imrProjects = imrSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            let emrProjects = emrSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as EmrInterest));

            const isAuthority = 
              (user.authorityFaculties && user.authorityFaculties.length > 0) ||
              (user.authorityInstitutes && user.authorityInstitutes.length > 0) ||
              (user.authorityDepartments && user.authorityDepartments.length > 0);

            if (isAuthority && !isSuperAdmin && !isAdmin && !isIqac) {
                imrProjects = imrProjects.filter(p => {
                    const isOwn = p.pi_uid === user.uid || p.pi_email?.trim().toLowerCase() === user.email?.trim().toLowerCase();
                    const inFaculty = p.faculty && user.authorityFaculties?.includes(p.faculty);
                    const inInstitute = p.institute && user.authorityInstitutes?.includes(p.institute);
                    const inDepartment = p.departmentName && user.authorityDepartments?.includes(p.departmentName);
                    return isOwn || inFaculty || inInstitute || inDepartment;
                });

                emrProjects = emrProjects.filter(p => {
                    const isOwn = p.userEmail?.trim().toLowerCase() === user.email?.trim().toLowerCase();
                    const inFaculty = p.faculty && user.authorityFaculties?.includes(p.faculty);
                    const inInstitute = p.institute && user.authorityInstitutes?.includes(p.institute);
                    const inDepartment = p.department && user.authorityDepartments?.includes(p.department);
                    return isOwn || inFaculty || inInstitute || inDepartment;
                });
            }

            setAllImrProjects(imrProjects);
            setAllEmrProjects(emrProjects);

        } catch (error) {
            console.error("Error fetching projects: ", error);
            reportSystemError(error, user, "Fetching all projects and users for admin/CRO dashboard");
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch project data.' });
        } finally {
            setLoading(false);
        }
    }, [user, toast]);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            if (!parsedUser.allowedModules?.includes('all-projects')) {
                toast({
                    title: 'Access Denied',
                    description: "You don't have permission to view this page.",
                    variant: 'destructive',
                });
                router.replace('/dashboard');
                return;
            }
            setUser(parsedUser);
            if (parsedUser.role === 'CRO' || parsedUser.role === 'Super-admin' || parsedUser.role === 'admin') {
                setFacultyFilter(searchParams.get('faculty')?.split(',').filter(Boolean) || []);
            }
        } else {
            router.replace('/login');
        }
    }, [router, searchParams, toast]);

    useEffect(() => {
        setSelectedExportColumns(activeTab === 'imr' ? IMR_EXPORT_COLUMNS.map(c => c.id) : EMR_EXPORT_COLUMNS.map(c => c.id));
        setExportDateRange(undefined);
        updateUrlParams({ tab: activeTab });
        setCurrentPageImr(1);
        setCurrentPageEmr(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    useEffect(() => {
        if (user) {
            fetchAllData();
        }
    }, [user, fetchAllData]);

    const hasAdminView = ['Super-admin', 'admin', 'CRO', 'IQAC'].includes(user?.role || '') || user?.designation === 'Principal' || user?.designation === 'HOD' || user?.designation === 'Head of Goa Campus';
    const isSuperAdmin = user?.role === 'Super-admin';

    const allFaculties = useMemo(() => {
        const facultySet = new Set<string>();
        allImrProjects.forEach(p => p.faculty && facultySet.add(p.faculty));
        allEmrProjects.forEach(p => p.faculty && facultySet.add(p.faculty));
        return Array.from(facultySet).sort();
    }, [allImrProjects, allEmrProjects]);

    const filteredImrProjects = useMemo(() => {
        return allImrProjects.filter(project => {
            if (statusFilter.length > 0) {
                const isMatch = statusFilter.some(sf => {
                    const currentStatus = (project.status || '').trim();
                    if (sf === 'Recommended') return ['Recommended', 'Sanctioned', 'SANCTIONED'].some(s => s.toLowerCase() === currentStatus.toLowerCase());
                    return currentStatus.toLowerCase() === sf.toLowerCase();
                });
                if (!isMatch) return false;
            }
            if (campusFilter.length > 0 && (!project.campus || !campusFilter.includes(project.campus))) return false;
            if (facultyFilter.length > 0 && !facultyFilter.includes(project.faculty)) return false;
            if (dateRange?.from) {
                const subDate = parseISO(project.submissionDate);
                if (isBefore(subDate, dateRange.from)) return false;
            }
            if (dateRange?.to) {
                const subDate = parseISO(project.submissionDate);
                if (isAfter(subDate, dateRange.to)) return false;
            }

            if (!searchTerm) return true;

            const lowerCaseSearch = searchTerm.toLowerCase();
            const sanctionNumber = project.grant?.sanctionNumber || '';
            const installmentRefNumbers = project.grant?.phases?.map(p => p.installmentRefNumber || '').join(' ') || '';

            return (
                project.title.toLowerCase().includes(lowerCaseSearch) ||
                project.pi.toLowerCase().includes(lowerCaseSearch) ||
                (project.pi_email && project.pi_email.toLowerCase().includes(lowerCaseSearch)) ||
                (sanctionNumber && sanctionNumber.toLowerCase().includes(lowerCaseSearch)) ||
                (installmentRefNumbers && installmentRefNumbers.toLowerCase().includes(lowerCaseSearch))
            );
        });
    }, [allImrProjects, searchTerm, statusFilter, facultyFilter, campusFilter, dateRange]);

    const totalPagesImr = Math.ceil(filteredImrProjects.length / itemsPerPage);

    const paginatedImrProjects = filteredImrProjects.slice(
        (currentPageImr - 1) * itemsPerPage,
        currentPageImr * itemsPerPage
    );

    const filteredEmrProjects = useMemo(() => {
        const filtered = allEmrProjects.filter(project => {
            if (campusFilter.length > 0 && project.campus && !campusFilter.includes(project.campus)) return false;
            if (facultyFilter.length > 0 && project.faculty && !facultyFilter.includes(project.faculty)) return false;
            if (dateRange?.from) {
                const pDate = parseAnyDate(project.sanctionDate || project.registeredAt || project.proposalSubmissionDate);
                if (pDate) {
                    const targetStr = format(pDate, 'yyyy-MM-dd');
                    const fromStr = format(dateRange.from, 'yyyy-MM-dd');
                    const toStr = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : fromStr;
                    if (targetStr < fromStr || targetStr > toStr) return false;
                }
            }

            if (!searchTerm) return true;

            const lowerCaseSearch = searchTerm.toLowerCase();
            const title = project.callTitle || '';
            return title.toLowerCase().includes(lowerCaseSearch) || project.userName.toLowerCase().includes(lowerCaseSearch) || (project.agency || '').toLowerCase().includes(lowerCaseSearch);
        });

        if (!emrSortConfig) return filtered;

        const parseAmount = (durationAmountStr: string | undefined) => {
            if (!durationAmountStr) return 0;
            const match = durationAmountStr.match(/₹([\d,]+)/);
            if (match) {
                return parseFloat(match[1].replace(/,/g, ''));
            }
            const numbers = durationAmountStr.replace(/,/g, '').match(/\d+/);
            return numbers ? parseFloat(numbers[0]) : 0;
        };

        return [...filtered].sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch (emrSortConfig.key) {
                case 'callTitle':
                    valA = a.callTitle || '';
                    valB = b.callTitle || '';
                    break;
                case 'userName':
                    valA = a.userName || '';
                    valB = b.userName || '';
                    break;
                case 'agency':
                    valA = a.agency || '';
                    valB = b.agency || '';
                    break;
                case 'sanctionDate':
                    valA = a.sanctionDate ? new Date(a.sanctionDate).getTime() : 0;
                    valB = b.sanctionDate ? new Date(b.sanctionDate).getTime() : 0;
                    break;
                case 'amount':
                    valA = parseAmount(a.durationAmount);
                    valB = parseAmount(b.durationAmount);
                    break;
                default:
                    return 0;
            }

            if (valA < valB) {
                return emrSortConfig.direction === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return emrSortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [allEmrProjects, searchTerm, facultyFilter, campusFilter, dateRange, emrSortConfig]);

    const totalPagesEmr = Math.ceil(filteredEmrProjects.length / itemsPerPage);

    const paginatedEmrProjects = filteredEmrProjects.slice(
        (currentPageEmr - 1) * itemsPerPage,
        currentPageEmr * itemsPerPage
    );

    let pageTitle = "All Projects";
    let pageDescription = "Browse and manage all projects in the system.";

    if (user?.designation === 'Principal' && user?.institute) pageTitle = `Projects from ${user.institute}`;
    if (user?.designation === 'HOD' && user?.department) pageTitle = `Projects from ${user.department}`;
    if (user?.designation === 'Head of Goa Campus') pageTitle = `Projects from Goa Campus`;
    if (user?.role === 'CRO' && facultyFilter.length === 1) pageTitle = `Projects from ${facultyFilter[0]}`;
    if (user?.role === 'CRO' && facultyFilter.length > 1) pageTitle = `Projects from multiple faculties`;


    const EXPORT_COLUMNS = activeTab === 'imr' ? IMR_EXPORT_COLUMNS : EMR_EXPORT_COLUMNS;

    const handleConfirmExport = () => {
        if (activeTab === 'imr') {
            exportImrProjects();
        } else {
            exportEmrProjects();
        }
        setIsExportDialogOpen(false);
    };

    const exportImrProjects = async () => {
        let projectsToExport = [...filteredImrProjects];
        if (exportDateRange?.from) {
            const fromStr = format(exportDateRange.from, 'yyyy-MM-dd');
            const toStr = exportDateRange.to ? format(exportDateRange.to, 'yyyy-MM-dd') : null;
            projectsToExport = projectsToExport.filter(p => {
                const dateStr = p.submissionDate || p.sanctionDate || p.seedMoneyReceivedDate;
                const pDate = parseAnyDate(dateStr);
                if (!pDate) return true;
                const targetStr = format(pDate, 'yyyy-MM-dd');
                return toStr ? (targetStr >= fromStr && targetStr <= toStr) : (targetStr >= fromStr);
            });
        }
        if (projectsToExport.length === 0) {
            toast({ title: "No Data Found", description: "No IMR projects match the selected date range or filters." }); return;
        }

        // Fetch calls and applications data to enrich export with Admin Calls & Applicant Counts
        let fundingCallsList: FundingCall[] = [];
        let specialCfpsList: SpecialCfp[] = [];
        let emrInterestsList: EmrInterest[] = [];
        let cfpSubmissionsList: CfpSubmission[] = [];

        try {
            const [fundingSnap, specialSnap, interestSnap, cfpSubSnap] = await Promise.all([
                getDocs(collection(db, 'fundingCalls')),
                getDocs(collection(db, 'specialCfps')),
                getDocs(collection(db, 'emrInterests')),
                getDocs(collection(db, 'cfpSubmissions'))
            ]);
            fundingCallsList = fundingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));
            specialCfpsList = specialSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpecialCfp));
            emrInterestsList = interestSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
            cfpSubmissionsList = cfpSubSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CfpSubmission));
        } catch (e) {
            console.error("Error fetching call data for export:", e);
        }

        const usersMap = new Map(users.map(u => [u.uid, u]));

        // Helper map to find calls and calculate applications count
        const callDetailsMap = new Map<string, {
            title: string;
            postedDate: string;
            postedMonth: string;
            postedBy: string;
            applicantsCount: number;
            applicantNames: string[];
            category: string;
            departmentOrAgency: string;
            deadline: string;
            status: string;
            identifier: string;
            rawDate: Date | null;
        }>();

        // Process Funding Calls
        fundingCallsList.forEach(call => {
            const interests = emrInterestsList.filter(i => i.callId === call.id || (i.callTitle && i.callTitle.toLowerCase() === call.title.toLowerCase()));
            const linkedImr = allImrProjects.filter(p => p.associatedCallId === call.id || (p.associatedCallTitle && p.associatedCallTitle.toLowerCase() === call.title.toLowerCase()));
            
            const applicantNamesSet = new Set<string>();
            interests.forEach(i => applicantNamesSet.add(i.userName || i.userEmail));
            linkedImr.forEach(p => applicantNamesSet.add(p.pi));
            
            const postedDateObj = parseAnyDate(call.createdAt || (call as any).postedDate);
            const postedDateFormatted = postedDateObj ? format(postedDateObj, 'dd-MMM-yyyy') : 'NA';
            const postedMonthFormatted = postedDateObj ? format(postedDateObj, 'MMMM yyyy') : 'NA';

            const creatorUser = usersMap.get(call.createdBy);
            const postedByName = creatorUser ? `${creatorUser.name} (${creatorUser.email})` : (call.createdBy || 'Admin');

            const info = {
                title: call.title,
                postedDate: postedDateFormatted,
                postedMonth: postedMonthFormatted,
                postedBy: postedByName,
                applicantsCount: applicantNamesSet.size || (interests.length + linkedImr.length),
                applicantNames: Array.from(applicantNamesSet),
                category: `Funding Call (${call.callType || 'General'})`,
                departmentOrAgency: call.agency || 'RDC',
                deadline: call.applyDeadline ? format(parseISO(call.applyDeadline), 'dd-MMM-yyyy') : 'NA',
                status: call.status || 'Open',
                identifier: call.callIdentifier || call.id,
                rawDate: postedDateObj
            };

            callDetailsMap.set(call.id, info);
            callDetailsMap.set(call.title.toLowerCase(), info);
        });

        // Process Special CFPs
        specialCfpsList.forEach(call => {
            const subs = cfpSubmissionsList.filter(s => s.cfpId === call.id || (s.cfpTitle && s.cfpTitle.toLowerCase() === call.title.toLowerCase()));
            const applicantNamesSet = new Set<string>();
            subs.forEach(s => applicantNamesSet.add(s.piName));

            const postedDateObj = parseAnyDate(call.createdAt);
            const postedDateFormatted = postedDateObj ? format(postedDateObj, 'dd-MMM-yyyy') : 'NA';
            const postedMonthFormatted = postedDateObj ? format(postedDateObj, 'MMMM yyyy') : 'NA';

            const creatorUser = usersMap.get(call.createdBy);
            const postedByName = call.announcedBy || (creatorUser ? `${creatorUser.name} (${creatorUser.email})` : 'Admin');

            const info = {
                title: call.title,
                postedDate: postedDateFormatted,
                postedMonth: postedMonthFormatted,
                postedBy: postedByName,
                applicantsCount: subs.length,
                applicantNames: Array.from(applicantNamesSet),
                category: 'Special Call For Proposals (CFP)',
                departmentOrAgency: call.department || 'RDC',
                deadline: call.applyDeadline ? format(parseISO(call.applyDeadline), 'dd-MMM-yyyy') : 'NA',
                status: call.status || 'Open',
                identifier: call.callIdentifier || call.id,
                rawDate: postedDateObj
            };

            callDetailsMap.set(call.id, info);
            callDetailsMap.set(call.title.toLowerCase(), info);
        });

        const dataToExport = projectsToExport.map(p => {
            const userDetails = usersMap.get(p.pi_uid);
            const coPiNames = (p.coPiDetails || []).map(c => c.name).join(', ');
            const teamMembers = coPiNames || (p.teamInfo ? p.teamInfo.split(',').filter(t => t.trim()).join(', ') : 'NA');

            const sdgRelated = (p.sdgGoals && p.sdgGoals.length > 0) ? 'Yes' : 'NA';
            const sdgGoalsDisplay = (p.sdgGoals && p.sdgGoals.length > 0) ? p.sdgGoals.join(', ') : 'NA';

            const interdisciplinary = (p.type === 'Multi-Disciplinary' || p.type === 'Inter-Disciplinary') ? 'Yes' : (p.type === 'Unidisciplinary' ? 'No' : 'NA');
            const interdisciplinaryType = (p.type === 'Multi-Disciplinary' || p.type === 'Inter-Disciplinary') ? p.type : 'NA';

            const seedMoney = p.grant?.totalAmount ? (p.grant.totalAmount / 100000).toFixed(2) : 'NA';

            let seedMoneyReceivedDate = null;
            if (p.seedMoneyReceivedDate) {
                seedMoneyReceivedDate = parseISO(p.seedMoneyReceivedDate);
            } else if (p.grant?.phases?.[0]?.disbursementDate) {
                seedMoneyReceivedDate = parseISO(p.grant.phases[0].disbursementDate);
            }

            const seedMoneyMonth = seedMoneyReceivedDate ? format(seedMoneyReceivedDate, 'MMMM') : 'NA';
            const seedMoneyYear = seedMoneyReceivedDate ? format(seedMoneyReceivedDate, 'yyyy') : 'NA';

            let sanctionDateFormatted = 'NA';
            if (p.sanctionDate) {
                sanctionDateFormatted = format(parseISO(p.sanctionDate), 'dd-MMM-yyyy');
            } else if (seedMoneyReceivedDate) {
                sanctionDateFormatted = format(seedMoneyReceivedDate, 'dd-MMM-yyyy');
            }

            let submissionDateFormatted = 'NA';
            if (p.submissionDate) {
                try {
                    submissionDateFormatted = format(parseISO(p.submissionDate), 'dd-MMM-yyyy');
                } catch (e) {
                    submissionDateFormatted = 'NA';
                }
            }

            const remarks = p.status || 'NA';

            let durationInMonths = p.projectDuration || 'NA';
            if (p.projectStartDate && p.projectEndDate) {
                try {
                    const startDate = parseISO(p.projectStartDate);
                    const endDate = parseISO(p.projectEndDate);
                    const months = differenceInMonths(addDays(endDate, 1), startDate);
                    durationInMonths = months.toString();
                } catch (e) {
                    console.error("Error calculating duration:", e);
                }
            }

            let currentPhase = 'NA';
            if (p.grant?.phases && p.grant.phases.length > 0) {
                const activeGrantPhase = [...p.grant.phases].reverse().find(ph => ph.status === 'Disbursed' || ph.status === 'Utilization Submitted' || ph.status === 'Pending Disbursement') || p.grant.phases[p.grant.phases.length - 1];
                currentPhase = activeGrantPhase.name ? `${activeGrantPhase.name}${activeGrantPhase.status ? ` (${activeGrantPhase.status})` : ''}` : 'NA';
            } else if (p.phases && p.phases.length > 0) {
                currentPhase = p.phases[0].name || 'Phase 1';
            } else if (['Sanctioned', 'In Progress', 'Completed'].includes(p.status)) {
                currentPhase = 'Phase 1';
            } else {
                currentPhase = 'Not Sanctioned';
            }

            const phasesList = p.grant?.phases || p.phases || [];
            let phaseBreakdown = 'NA';
            let phase1Amount = 'NA';
            let phase2Amount = 'NA';
            let phase3Amount = 'NA';
            let phase4Amount = 'NA';
            let phase5Amount = 'NA';

            if (phasesList.length > 0) {
                phaseBreakdown = phasesList.map((ph: any, idx: number) => {
                    const phaseName = ph.name || `Phase ${idx + 1}`;
                    const phaseAmt = Number(ph.amount || 0);
                    return `${phaseName}: ₹${phaseAmt.toLocaleString('en-IN')}`;
                }).join(', ');

                phasesList.forEach((ph: any, idx: number) => {
                    const phaseAmt = Number(ph.amount || 0);
                    const val = `₹${phaseAmt.toLocaleString('en-IN')}`;
                    if (idx === 0) phase1Amount = val;
                    if (idx === 1) phase2Amount = val;
                    if (idx === 2) phase3Amount = val;
                    if (idx === 3) phase4Amount = val;
                    if (idx === 4) phase5Amount = val;
                });
            } else if (p.grant?.totalAmount) {
                phaseBreakdown = `Phase 1: ₹${Number(p.grant.totalAmount).toLocaleString('en-IN')}`;
                phase1Amount = `₹${Number(p.grant.totalAmount).toLocaleString('en-IN')}`;
            }

            let presentationCount = 0;
            const presentationList: string[] = [];

            if (p.pastMeetings && Array.isArray(p.pastMeetings) && p.pastMeetings.length > 0) {
                p.pastMeetings.forEach((m: any, idx: number) => {
                    presentationCount++;
                    let dateStr = 'Date N/A';
                    if (m.date) {
                        try { dateStr = format(parseISO(m.date), 'dd-MMM-yyyy'); } catch (e) { dateStr = m.date; }
                    }
                    const modeStr = m.mode ? ` (${m.mode})` : '';
                    const statusStr = m.status ? ` [${m.status}]` : '';
                    presentationList.push(`Presentation ${idx + 1}: ${dateStr}${modeStr}${statusStr}`);
                });
            }

            if (p.meetingDetails?.date) {
                let meetingDateStr = p.meetingDetails.date;
                try { meetingDateStr = format(parseISO(p.meetingDetails.date), 'dd-MMM-yyyy'); } catch (e) {}
                const isAlreadyInPast = p.pastMeetings?.some((m: any) => m.date === p.meetingDetails?.date);
                if (!isAlreadyInPast) {
                    presentationCount++;
                    const modeStr = p.meetingDetails.mode ? ` (${p.meetingDetails.mode})` : '';
                    presentationList.push(`Presentation ${presentationCount}: ${meetingDateStr}${modeStr}`);
                }
            } else if (presentationCount === 0 && (p.hasHadMidTermReview || (p.evaluatedBy && p.evaluatedBy.length > 0) || ['Recommended', 'Not Recommended', 'Sanctioned', 'In Progress', 'Completed', 'Revision Needed', 'Revision Submitted'].includes(p.status))) {
                presentationCount = 1;
                presentationList.push(`Presentation 1: Completed`);
            }

            const presentationCountDisplay = presentationCount.toString();
            const presentationDetailsDisplay = presentationList.length > 0 ? presentationList.join('; ') : 'No Presentations Done';

            // Extract Associated Call details
            const matchedCall = (p.associatedCallId ? callDetailsMap.get(p.associatedCallId) : null) || 
                                (p.associatedCallTitle ? callDetailsMap.get(p.associatedCallTitle.toLowerCase()) : null);

            const associatedCallTitleDisplay = matchedCall?.title || p.associatedCallTitle || 'General Submission';
            const callPostedMonthDisplay = matchedCall?.postedMonth || 'NA';
            const callPostedByAdminDisplay = matchedCall?.postedBy || 'NA';
            const callApplicantsCountDisplay = matchedCall ? matchedCall.applicantsCount.toString() : 'NA';

            const row: { [key: string]: any } = {};
            selectedExportColumns.forEach(colId => {
                const column = IMR_EXPORT_COLUMNS.find(c => c.id === colId);
                if (column) {
                    const dataMap: { [key: string]: any } = {
                        title: p.title,
                        type: p.type,
                        associatedCallTitle: associatedCallTitleDisplay,
                        callPostedMonth: callPostedMonthDisplay,
                        callPostedByAdmin: callPostedByAdminDisplay,
                        callApplicantsCount: callApplicantsCountDisplay,
                        sdgRelated: sdgRelated,
                        sdgGoals: sdgGoalsDisplay,
                        interdisciplinary: interdisciplinary,
                        interdisciplinaryType: interdisciplinaryType,
                        pi: p.pi,
                        piEmail: p.pi_email || userDetails?.email || 'NA',
                        piContact: p.pi_phoneNumber || userDetails?.phoneNumber || 'NA',
                        misId: userDetails?.misId || 'NA',
                        institute: p.institute,
                        faculty: p.faculty,
                        teamMembers: teamMembers,
                        submissionDate: submissionDateFormatted,
                        sanctionDate: sanctionDateFormatted,
                        sanctionNumber: p.grant?.sanctionNumber || 'NA',
                        projectDuration: durationInMonths,
                        seedMoney: seedMoney,
                        seedMoneyMonth: seedMoneyMonth,
                        seedMoneyYear: seedMoneyYear,
                        currentPhase: currentPhase,
                        phaseBreakdown: phaseBreakdown,
                        phase1Amount: phase1Amount,
                        phase2Amount: phase2Amount,
                        phase3Amount: phase3Amount,
                        phase4Amount: phase4Amount,
                        phase5Amount: phase5Amount,
                        presentationCount: presentationCountDisplay,
                        presentationDetails: presentationDetailsDisplay,
                        meetingsDoneForSpecifiedCalls: presentationCountDisplay,
                        remarks: remarks,
                    };
                    row[column.label] = dataMap[colId];
                }
            });
            return row;
        });

        const workbook = new ExcelJS.Workbook();

        // Sheet 1: IMR Projects
        const worksheet1 = workbook.addWorksheet("IMR_Projects");
        if (dataToExport.length > 0) {
            const headers = Object.keys(dataToExport[0]);
            worksheet1.addRow(headers);
            dataToExport.forEach(item => {
                worksheet1.addRow(Object.values(item));
            });
        }

        // Sheet 2: Admin Calls Summary
        const worksheet2 = workbook.addWorksheet("Admin_Calls_Summary");
        const headers2 = [
            "Call Identifier",
            "Call Title",
            "Category / Call Type",
            "Department / Agency",
            "Date Posted",
            "Month Posted",
            "Posted By Admin",
            "Application Deadline",
            "Total Applications Applied",
            "Applicant Names",
            "Status"
        ];
        worksheet2.addRow(headers2);

        // Deduplicate unique calls from callDetailsMap
        const uniqueCalls = Array.from(new Set(callDetailsMap.values()));

        let filteredCallsToExport = uniqueCalls;
        if (exportDateRange?.from) {
            const fromStr = format(exportDateRange.from, 'yyyy-MM-dd');
            const toStr = exportDateRange.to ? format(exportDateRange.to, 'yyyy-MM-dd') : null;
            filteredCallsToExport = uniqueCalls.filter(c => {
                if (!c.rawDate) return true;
                const targetStr = format(c.rawDate, 'yyyy-MM-dd');
                return toStr ? (targetStr >= fromStr && targetStr <= toStr) : (targetStr >= fromStr);
            });
        }

        filteredCallsToExport.forEach(c => {
            worksheet2.addRow([
                c.identifier,
                c.title,
                c.category,
                c.departmentOrAgency,
                c.postedDate,
                c.postedMonth,
                c.postedBy,
                c.deadline,
                c.applicantsCount,
                c.applicantNames.join(', ') || 'None',
                c.status
            ]);
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `IMR_Projects_and_Admin_Calls_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);

        toast({ title: "Export Completed", description: `Exported ${projectsToExport.length} IMR projects and ${filteredCallsToExport.length} Admin calls.` });
    };

    const exportEmrProjects = async () => {
        let projectsToExport = [...filteredEmrProjects];
        if (exportDateRange?.from) {
            const fromStr = format(exportDateRange.from, 'yyyy-MM-dd');
            const toStr = exportDateRange.to ? format(exportDateRange.to, 'yyyy-MM-dd') : null;
            projectsToExport = projectsToExport.filter(p => {
                const rawDate = p.sanctionDate || p.registeredAt || p.proposalSubmissionDate || p.pptSubmissionDate || (p as any).createdAt;
                const pDate = parseAnyDate(rawDate);
                if (!pDate) return true;
                const targetStr = format(pDate, 'yyyy-MM-dd');
                return toStr ? (targetStr >= fromStr && targetStr <= toStr) : (targetStr >= fromStr);
            });
        }
        if (projectsToExport.length === 0) {
            toast({ title: "No Data Found", description: "No EMR projects match the selected date range or filters." }); return;
        }

        // Fetch calls and applications data to enrich export with Admin Calls & Applicant Counts
        let fundingCallsList: FundingCall[] = [];
        let specialCfpsList: SpecialCfp[] = [];
        let emrInterestsList: EmrInterest[] = [];
        let cfpSubmissionsList: CfpSubmission[] = [];

        try {
            const [fundingSnap, specialSnap, interestSnap, cfpSubSnap] = await Promise.all([
                getDocs(collection(db, 'fundingCalls')),
                getDocs(collection(db, 'specialCfps')),
                getDocs(collection(db, 'emrInterests')),
                getDocs(collection(db, 'cfpSubmissions'))
            ]);
            fundingCallsList = fundingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));
            specialCfpsList = specialSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpecialCfp));
            emrInterestsList = interestSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
            cfpSubmissionsList = cfpSubSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CfpSubmission));
        } catch (e) {
            console.error("Error fetching call data for EMR export:", e);
        }

        const usersMap = new Map(users.map(u => [u.uid, u]));

        // Helper map to find calls and calculate applications count
        const callDetailsMap = new Map<string, {
            title: string;
            postedDate: string;
            postedMonth: string;
            postedBy: string;
            applicantsCount: number;
            applicantNames: string[];
            category: string;
            departmentOrAgency: string;
            deadline: string;
            status: string;
            identifier: string;
            rawDate: Date | null;
        }>();

        // Process Funding Calls
        fundingCallsList.forEach(call => {
            const interests = emrInterestsList.filter(i => i.callId === call.id || (i.callTitle && i.callTitle.toLowerCase() === call.title.toLowerCase()));
            const linkedImr = allImrProjects.filter(p => p.associatedCallId === call.id || (p.associatedCallTitle && p.associatedCallTitle.toLowerCase() === call.title.toLowerCase()));
            
            const applicantNamesSet = new Set<string>();
            interests.forEach(i => applicantNamesSet.add(i.userName || i.userEmail));
            linkedImr.forEach(p => applicantNamesSet.add(p.pi));
            
            const postedDateObj = parseAnyDate(call.createdAt || (call as any).postedDate);
            const postedDateFormatted = postedDateObj ? format(postedDateObj, 'dd-MMM-yyyy') : 'NA';
            const postedMonthFormatted = postedDateObj ? format(postedDateObj, 'MMMM yyyy') : 'NA';

            const creatorUser = usersMap.get(call.createdBy);
            const postedByName = creatorUser ? `${creatorUser.name} (${creatorUser.email})` : (call.createdBy || 'Admin');

            const info = {
                title: call.title,
                postedDate: postedDateFormatted,
                postedMonth: postedMonthFormatted,
                postedBy: postedByName,
                applicantsCount: applicantNamesSet.size || (interests.length + linkedImr.length),
                applicantNames: Array.from(applicantNamesSet),
                category: `Funding Call (${call.callType || 'General'})`,
                departmentOrAgency: call.agency || 'RDC',
                deadline: call.applyDeadline ? format(parseISO(call.applyDeadline), 'dd-MMM-yyyy') : 'NA',
                status: call.status || 'Open',
                identifier: call.callIdentifier || call.id,
                rawDate: postedDateObj
            };

            callDetailsMap.set(call.id, info);
            callDetailsMap.set(call.title.toLowerCase(), info);
        });

        // Process Special CFPs
        specialCfpsList.forEach(call => {
            const subs = cfpSubmissionsList.filter(s => s.cfpId === call.id || (s.cfpTitle && s.cfpTitle.toLowerCase() === call.title.toLowerCase()));
            const applicantNamesSet = new Set<string>();
            subs.forEach(s => applicantNamesSet.add(s.piName));

            const postedDateObj = parseAnyDate(call.createdAt);
            const postedDateFormatted = postedDateObj ? format(postedDateObj, 'dd-MMM-yyyy') : 'NA';
            const postedMonthFormatted = postedDateObj ? format(postedDateObj, 'MMMM yyyy') : 'NA';

            const creatorUser = usersMap.get(call.createdBy);
            const postedByName = call.announcedBy || (creatorUser ? `${creatorUser.name} (${creatorUser.email})` : 'Admin');

            const info = {
                title: call.title,
                postedDate: postedDateFormatted,
                postedMonth: postedMonthFormatted,
                postedBy: postedByName,
                applicantsCount: subs.length,
                applicantNames: Array.from(applicantNamesSet),
                category: 'Special Call For Proposals (CFP)',
                departmentOrAgency: call.department || 'RDC',
                deadline: call.applyDeadline ? format(parseISO(call.applyDeadline), 'dd-MMM-yyyy') : 'NA',
                status: call.status || 'Open',
                identifier: call.callIdentifier || call.id,
                rawDate: postedDateObj
            };

            callDetailsMap.set(call.id, info);
            callDetailsMap.set(call.title.toLowerCase(), info);
        });

        const dataToExport = projectsToExport.map((p: any) => {
            const userDetails = usersMap.get(p.userId);
            const matchedCall = (p.callId ? callDetailsMap.get(p.callId) : null) || 
                                (p.callTitle ? callDetailsMap.get(p.callTitle.toLowerCase()) : null);

            const associatedCallTitleDisplay = matchedCall?.title || p.callTitle || 'General EMR';
            const callPostedMonthDisplay = matchedCall?.postedMonth || (p.registeredAt ? format(parseAnyDate(p.registeredAt) || new Date(), 'MMMM yyyy') : 'NA');
            const callPostedByAdminDisplay = matchedCall?.postedBy || 'Admin';
            const callApplicantsCountDisplay = matchedCall ? matchedCall.applicantsCount.toString() : 'NA';

            const regDateObj = parseAnyDate(p.registeredAt || p.proposalSubmissionDate || p.pptSubmissionDate);
            const registrationDateFormatted = regDateObj ? format(regDateObj, 'dd-MMM-yyyy') : 'NA';

            const sanctionDateObj = parseAnyDate(p.sanctionDate);
            const sanctionDateFormatted = sanctionDateObj ? format(sanctionDateObj, 'dd-MMM-yyyy') : 'NA';

            const grantAmountDisplay = p.amount ? (p.amount / 100000).toFixed(2) : (p.sanctionAmount ? (p.sanctionAmount / 100000).toFixed(2) : 'NA');
            const durationAmountDisplay = p.durationAmount || (p.amount ? `₹${Number(p.amount).toLocaleString('en-IN')}` : 'NA');

            const presentationCountDisplay = (p.pptUrl || p.proposalUrl) ? '1' : '0';
            const presentationDetailsDisplay = p.meetingDetails?.date ? `Meeting: ${p.meetingDetails.date}` : (p.pptUrl ? 'PPT Uploaded' : 'No Presentations Done');

            const row: { [key: string]: any } = {};
            selectedExportColumns.forEach(colId => {
                const column = EMR_EXPORT_COLUMNS.find(c => c.id === colId);
                if (column) {
                    const dataMap: { [key: string]: any } = {
                        callTitle: p.callTitle || 'NA',
                        agency: p.agency || 'NA',
                        associatedCallTitle: associatedCallTitleDisplay,
                        callPostedMonth: callPostedMonthDisplay,
                        callPostedByAdmin: callPostedByAdminDisplay,
                        callApplicantsCount: callApplicantsCountDisplay,
                        piName: p.userName || 'NA',
                        piEmail: p.userEmail || userDetails?.email || 'NA',
                        piContact: userDetails?.phoneNumber || 'NA',
                        misId: userDetails?.misId || 'NA',
                        piInstitute: p.institute || userDetails?.institute || 'NA',
                        piDepartment: p.department || userDetails?.department || 'NA',
                        campus: p.campus || userDetails?.campus || 'Goa',
                        coPiNames: p.coPiNames?.join(', ') || 'NA',
                        registrationDate: registrationDateFormatted,
                        sanctionDate: sanctionDateFormatted,
                        projectDuration: p.duration ? `${p.duration} Months` : 'NA',
                        grantAmount: grantAmountDisplay,
                        durationAmount: durationAmountDisplay,
                        sdgRelated: 'NA',
                        sdgGoals: 'NA',
                        interdisciplinary: 'NA',
                        presentationCount: presentationCountDisplay,
                        presentationDetails: presentationDetailsDisplay,
                        meetingsDoneForSpecifiedCalls: presentationCountDisplay,
                        status: p.status || 'NA',
                    };
                    row[column.label] = dataMap[colId];
                }
            });
            return row;
        });

        const workbook = new ExcelJS.Workbook();

        // Sheet 1: EMR Projects
        const worksheet1 = workbook.addWorksheet("EMR_Projects");
        if (dataToExport.length > 0) {
            const headers = Object.keys(dataToExport[0]);
            worksheet1.addRow(headers);
            dataToExport.forEach(item => {
                worksheet1.addRow(Object.values(item));
            });
        }

        // Sheet 2: Admin Calls Summary
        const worksheet2 = workbook.addWorksheet("Admin_Calls_Summary");
        const headers2 = [
            "Call Identifier",
            "Call Title",
            "Category / Call Type",
            "Department / Agency",
            "Date Posted",
            "Month Posted",
            "Posted By Admin",
            "Application Deadline",
            "Total Applications Applied",
            "Applicant Names",
            "Status"
        ];
        worksheet2.addRow(headers2);

        const uniqueCalls = Array.from(new Set(callDetailsMap.values()));
        let filteredCallsToExport = uniqueCalls;
        if (exportDateRange?.from) {
            const fromStr = format(exportDateRange.from, 'yyyy-MM-dd');
            const toStr = exportDateRange.to ? format(exportDateRange.to, 'yyyy-MM-dd') : null;
            filteredCallsToExport = uniqueCalls.filter(c => {
                if (!c.rawDate) return true;
                const targetStr = format(c.rawDate, 'yyyy-MM-dd');
                return toStr ? (targetStr >= fromStr && targetStr <= toStr) : (targetStr >= fromStr);
            });
        }

        filteredCallsToExport.forEach(c => {
            worksheet2.addRow([
                c.identifier,
                c.title,
                c.category,
                c.departmentOrAgency,
                c.postedDate,
                c.postedMonth,
                c.postedBy,
                c.deadline,
                c.applicantsCount,
                c.applicantNames.join(', ') || 'None',
                c.status
            ]);
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `EMR_Projects_and_Admin_Calls_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);

        toast({ title: "Export Completed", description: `Exported ${projectsToExport.length} EMR projects and ${filteredCallsToExport.length} Admin calls.` });
    };

    const handleColumnSelectionChange = (columnId: string, checked: boolean) => {
        setSelectedExportColumns(prev => checked ? [...prev, columnId] : prev.filter(id => id !== columnId));
    };


    if (!user) {
        return <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>
    }

    return (
        <>
            <div className="container mx-auto py-10">
                <PageHeader title={pageTitle} description={pageDescription}>
                    <div className="flex items-center gap-2">
                        {isSuperAdmin && activeTab === 'emr' && (
                            <Button onClick={() => setIsAddEmrDialogOpen(true)}>
                                <Plus className="mr-2 h-4 w-4" /> Add Sanctioned EMR
                            </Button>
                        )}
                        {hasAdminView && (
                            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button disabled={loading || (activeTab === 'imr' && filteredImrProjects.length === 0) || (activeTab === 'emr' && filteredEmrProjects.length === 0)}>
                                        <Download className="mr-2 h-4 w-4" /> Export Excel
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-3xl">
                                    <DialogHeader>
                                        <DialogTitle>Custom Export for {activeTab.toUpperCase()} Projects</DialogTitle>
                                        <DialogDescription>Select filters and columns for your Excel export.</DialogDescription>
                                    </DialogHeader>
                                    <div className="grid gap-6 py-4">
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <Label>{activeTab === 'imr' ? 'Filter by Submission Date' : 'Filter by Sanction / Registration Date'}</Label>
                                                {exportDateRange?.from && (
                                                    <Button variant="ghost" size="sm" onClick={() => setExportDateRange(undefined)} className="h-6 text-xs px-2 text-muted-foreground hover:text-foreground">
                                                        <X className="h-3 w-3 mr-1" /> Clear Date Filter
                                                    </Button>
                                                )}
                                            </div>
                                            {isMobile ? (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <Input type="date" value={exportDateRange?.from ? format(exportDateRange.from, 'yyyy-MM-dd') : ''} onChange={(e) => {
                                                        const date = e.target.value ? parseISO(e.target.value) : undefined;
                                                        if (date) {
                                                            setExportDateRange(prev => ({ from: date, to: prev?.to }));
                                                        } else {
                                                            setExportDateRange(undefined);
                                                        }
                                                    }} />
                                                    <span>-</span>
                                                    <Input type="date" value={exportDateRange?.to ? format(exportDateRange.to, 'yyyy-MM-dd') : ''} onChange={(e) => {
                                                        const date = e.target.value ? parseISO(e.target.value) : undefined;
                                                        setExportDateRange(prev => prev?.from ? { from: prev.from, to: date } : undefined);
                                                    }} />
                                                </div>
                                            ) : (
                                                <Popover><PopoverTrigger asChild><Button id="date" variant={"outline"} className={cn("w-full justify-start text-left font-normal mt-2", !exportDateRange && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{exportDateRange?.from ? (exportDateRange.to ? (`${format(exportDateRange.from, "LLL dd, y")} - ${format(exportDateRange.to, "LLL dd, y")}`) : format(exportDateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar captionLayout="dropdown-buttons" fromYear={2015} toYear={new Date().getFullYear()} initialFocus mode="range" defaultMonth={exportDateRange?.from} selected={exportDateRange} onSelect={setExportDateRange} /></PopoverContent></Popover>
                                            )}
                                            <div className="mt-3">
                                                <Label className="text-xs text-muted-foreground font-semibold">Quick Select Month (Calls / Submissions Posted in Month)</Label>
                                                <Select
                                                    onValueChange={(val) => {
                                                        if (val === 'all') {
                                                            setExportDateRange(undefined);
                                                        } else {
                                                            const [yearStr, monthStr] = val.split('-');
                                                            const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
                                                            setExportDateRange({
                                                                from: startOfMonth(date),
                                                                to: endOfMonth(date),
                                                            });
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger className="w-full mt-1">
                                                        <SelectValue placeholder="Filter by specific month..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">All Months (No Filter)</SelectItem>
                                                        {Array.from({ length: 24 }).map((_, i) => {
                                                            const d = subMonths(new Date(), i);
                                                            const valKey = format(d, 'yyyy-MM');
                                                            const label = format(d, 'MMMM yyyy');
                                                            return <SelectItem key={valKey} value={valKey}>{label}</SelectItem>;
                                                        })}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div>
                                            <Label>Select Columns to Export</Label>
                                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-2 p-4 border rounded-md max-h-60 overflow-y-auto">
                                                {EXPORT_COLUMNS.map(column => (
                                                    <div key={column.id} className="flex items-center space-x-2">
                                                        <Checkbox id={`col-${column.id}`} checked={selectedExportColumns.includes(column.id)} onCheckedChange={(checked) => handleColumnSelectionChange(column.id, !!checked)} />
                                                        <label htmlFor={`col-${column.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{column.label}</label>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                                        <Button onClick={handleConfirmExport}>Confirm & Export</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                </PageHeader>

                <div className="flex flex-col sm:flex-row flex-wrap items-center py-4 gap-2 sm:gap-4">
                    <Input placeholder="Filter by Title, PI, Email, or Sanction No..." value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); updateUrlParams({ q: event.target.value || undefined }); }} className="w-full sm:w-auto sm:flex-grow md:flex-grow-0 md:max-w-md" />
                    <div className="w-full sm:w-auto flex flex-wrap items-center gap-2 sm:gap-4">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-full sm:w-[200px] justify-between" disabled={activeTab === 'emr'}>
                                    {statusFilter.length === 0 ? "Filter by status" : statusFilter.length === 1 ? statusFilter[0] : `${statusFilter.length} statuses selected`}
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-[200px]">
                                {STATUSES.map(status => (
                                    <DropdownMenuCheckboxItem
                                        key={status}
                                        checked={statusFilter.includes(status)}
                                        onCheckedChange={checked => {
                                            const newFilter = checked ? [...statusFilter, status] : statusFilter.filter(s => s !== status);
                                            setStatusFilter(newFilter);
                                            updateUrlParams({ status: newFilter.length > 0 ? newFilter.join(',') : undefined });
                                        }}
                                    >
                                        {status}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {(user?.role === 'CRO' || user?.role === 'Super-admin' || user?.role === 'admin' || user?.role === 'IQAC' || user?.designation === 'Principal') && (
                            <>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="w-full sm:w-[240px] justify-between">
                                            {facultyFilter.length === 0 ? "Filter by faculty" : facultyFilter.length === 1 ? facultyFilter[0] : `${facultyFilter.length} faculties selected`}
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-[240px] max-h-[400px] overflow-y-auto">
                                        {(user?.role === 'CRO' ? user.faculties : allFaculties)?.map(faculty => (
                                            <DropdownMenuCheckboxItem
                                                key={faculty}
                                                checked={facultyFilter.includes(faculty)}
                                                onCheckedChange={checked => {
                                                    const newFilter = checked ? [...facultyFilter, faculty] : facultyFilter.filter(f => f !== faculty);
                                                    setFacultyFilter(newFilter);
                                                    updateUrlParams({ faculty: newFilter.length > 0 ? newFilter.join(',') : undefined });
                                                }}
                                            >
                                                {faculty}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="w-full sm:w-[180px] justify-between">
                                            {campusFilter.length === 0 ? "Filter by campus" : campusFilter.length === 1 ? campusFilter[0] : `${campusFilter.length} campuses selected`}
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-[180px]">
                                        {CAMPUSES.map(campus => (
                                            <DropdownMenuCheckboxItem
                                                key={campus}
                                                checked={campusFilter.includes(campus)}
                                                onCheckedChange={checked => {
                                                    const newFilter = checked ? [...campusFilter, campus] : campusFilter.filter(c => c !== campus);
                                                    setCampusFilter(newFilter);
                                                    updateUrlParams({ campus: newFilter.length > 0 ? newFilter.join(',') : undefined });
                                                }}
                                            >
                                                {campus}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            id="date"
                                            variant={"outline"}
                                            className={cn(
                                                "w-full sm:w-[240px] justify-start text-left font-normal",
                                                !dateRange && "text-muted-foreground"
                                            )}
                                        >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {dateRange?.from ? (
                                                dateRange.to ? (
                                                    <>
                                                        {format(dateRange.from, "LLL dd, y")} -{" "}
                                                        {format(dateRange.to, "LLL dd, y")}
                                                    </>
                                                ) : (
                                                    format(dateRange.from, "LLL dd, y")
                                                )
                                            ) : (
                                                <span>Pick a date range</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            initialFocus
                                            mode="range"
                                            defaultMonth={dateRange?.from}
                                            selected={dateRange}
                                            onSelect={setDateRange}
                                            numberOfMonths={2}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </>
                        )}
                        
                        {(searchTerm || statusFilter.length > 0 || facultyFilter.length > 0 || campusFilter.length > 0 || dateRange) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setSearchTerm('');
                                    setStatusFilter([]);
                                    setFacultyFilter([]);
                                    setCampusFilter([]);
                                    setDateRange(undefined);
                                    updateUrlParams({ q: undefined, status: undefined, faculty: undefined, campus: undefined });
                                }}
                                className="text-muted-foreground hover:text-destructive h-10 px-2"
                            >
                                <X className="h-4 w-4 mr-2" /> Clear All
                            </Button>
                        )}
                    </div>
                </div>
                <div className="text-sm text-muted-foreground mb-4">
                    Showing {activeTab === 'imr' ? filteredImrProjects.length : filteredEmrProjects.length} projects.
                </div>

                {hasAdminView ? (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList><TabsTrigger value="imr">IMR Projects</TabsTrigger><TabsTrigger value="emr">EMR Projects</TabsTrigger></TabsList>
                        <TabsContent value="imr" className="mt-4">
                            {loading ? <Skeleton className="h-64 w-full" /> : (
                                <>
                                    <ProjectList projects={paginatedImrProjects} currentUser={user!} allUsers={users} />
                                    {filteredImrProjects.length > itemsPerPage && (
                                        <div className="flex items-center justify-between pt-6">
                                            <div className="text-sm text-muted-foreground">
                                                Showing {((currentPageImr - 1) * itemsPerPage) + 1} to {Math.min(currentPageImr * itemsPerPage, filteredImrProjects.length)} of {filteredImrProjects.length}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setCurrentPageImr(prev => Math.max(prev - 1, 1))}
                                                    disabled={currentPageImr === 1}
                                                >
                                                    Previous
                                                </Button>
                                                <div className="text-sm">
                                                    Page {currentPageImr} of {totalPagesImr}
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setCurrentPageImr(prev => Math.min(prev + 1, totalPagesImr))}
                                                    disabled={currentPageImr === totalPagesImr}
                                                >
                                                    Next
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </TabsContent>
                        <TabsContent value="emr" className="mt-4">
                            {loading ? <Skeleton className="h-64 w-full" /> : (
                                <>
                                    <Card>
                                        <CardContent className="pt-6">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors select-none" onClick={() => handleEmrSort('callTitle')}>
                                                            <div className="flex items-center">
                                                                Project Title {getSortIcon('callTitle')}
                                                            </div>
                                                        </TableHead>
                                                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors select-none" onClick={() => handleEmrSort('userName')}>
                                                            <div className="flex items-center">
                                                                PI {getSortIcon('userName')}
                                                            </div>
                                                        </TableHead>
                                                        <TableHead>Co-PIs</TableHead>
                                                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors select-none" onClick={() => handleEmrSort('agency')}>
                                                            <div className="flex items-center">
                                                                Agency {getSortIcon('agency')}
                                                            </div>
                                                        </TableHead>
                                                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors select-none" onClick={() => handleEmrSort('sanctionDate')}>
                                                            <div className="flex items-center">
                                                                Sanction Date {getSortIcon('sanctionDate')}
                                                            </div>
                                                        </TableHead>
                                                        <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors select-none" onClick={() => handleEmrSort('amount')}>
                                                            <div className="flex items-center">
                                                                Amount {getSortIcon('amount')}
                                                            </div>
                                                        </TableHead>
                                                        <TableHead>Actions</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>{paginatedEmrProjects.map(p => {
                                                    const pi = users.find(u => u.uid === p.userId);
                                                    const proofLink = p.finalProofUrl || p.proofUrl;
                                                    return (
                                                        <TableRow key={p.id}>
                                                            <TableCell className="font-medium">
                                                                {proofLink ? (
                                                                    <a href={proofLink} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                                                                        {p.callTitle || 'N/A'}
                                                                    </a>
                                                                ) : (
                                                                    p.callTitle || 'N/A'
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                {pi?.misId ? (
                                                                    <Link href={`/profile/${pi.misId}`} className="hover:underline text-primary" target="_blank" rel="noopener noreferrer">
                                                                        {p.userName}
                                                                    </Link>
                                                                ) : p.userName}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col text-xs">
                                                                    {(p.coPiDetails || []).map(copi => {
                                                                        const coPiUser = users.find(u => u.uid === copi.uid);
                                                                        return (
                                                                            <div key={copi.email}>
                                                                                {coPiUser?.misId ? (
                                                                                    <Link href={`/profile/${coPiUser.misId}`} className="hover:underline text-primary" target="_blank" rel="noopener noreferrer">
                                                                                        {copi.name}
                                                                                    </Link>
                                                                                ) : copi.name}
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>{p.agency || 'N/A'}</TableCell>
                                                            <TableCell>{p.sanctionDate ? format(parseISO(p.sanctionDate), 'PPP') : 'N/A'}</TableCell>
                                                            <TableCell>{p.durationAmount || 'N/A'}</TableCell>
                                                            <TableCell className="flex items-center gap-2">
                                                                {isSuperAdmin && p.isBulkUploaded && (
                                                                    <Button variant="outline" size="sm" onClick={() => setProjectToEdit(p)}>
                                                                        <Edit className="h-4 w-4 mr-2" /> Edit
                                                                    </Button>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })}</TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                    {filteredEmrProjects.length > itemsPerPage && (
                                        <div className="flex items-center justify-between pt-6">
                                            <div className="text-sm text-muted-foreground">
                                                Showing {((currentPageEmr - 1) * itemsPerPage) + 1} to {Math.min(currentPageEmr * itemsPerPage, filteredEmrProjects.length)} of {filteredEmrProjects.length}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setCurrentPageEmr(prev => Math.max(prev - 1, 1))}
                                                    disabled={currentPageEmr === 1}
                                                >
                                                    Previous
                                                </Button>
                                                <div className="text-sm">
                                                    Page {currentPageEmr} of {totalPagesEmr}
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setCurrentPageEmr(prev => Math.min(prev + 1, totalPagesEmr))}
                                                    disabled={currentPageEmr === totalPagesEmr}
                                                >
                                                    Next
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </TabsContent>
                    </Tabs>
                ) : (
                    <div className="mt-4">
                        {loading ? <Skeleton className="h-64 w-full" /> : (
                            <>
                                <ProjectList projects={paginatedImrProjects} currentUser={user!} allUsers={users} />
                                {filteredImrProjects.length > itemsPerPage && (
                                    <div className="flex items-center justify-between pt-6">
                                        <div className="text-sm text-muted-foreground">
                                            Showing {((currentPageImr - 1) * itemsPerPage) + 1} to {Math.min(currentPageImr * itemsPerPage, filteredImrProjects.length)} of {filteredImrProjects.length}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPageImr(prev => Math.max(prev - 1, 1))}
                                                disabled={currentPageImr === 1}
                                            >
                                                Previous
                                            </Button>
                                            <div className="text-sm">
                                                Page {currentPageImr} of {totalPagesImr}
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setCurrentPageImr(prev => Math.min(prev + 1, totalPagesImr))}
                                                disabled={currentPageImr === totalPagesImr}
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
            {projectToEdit && (
                <EditEmrProjectDialog
                    interest={projectToEdit}
                    isOpen={!!projectToEdit}
                    onOpenChange={() => setProjectToEdit(null)}
                    onActionComplete={fetchAllData}
                />
            )}
            <AddSanctionedEmrDialog
                isOpen={isAddEmrDialogOpen}
                onOpenChange={setIsAddEmrDialogOpen}
                onActionComplete={fetchAllData}
            />
        </>
    );
}

export default function AllProjectsPage() {
    return (
        <Suspense fallback={
            <div className="container mx-auto max-w-7xl py-6 space-y-6">
                <Skeleton className="h-10 w-48 mb-4 animate-pulse" />
                <Skeleton className="h-4 w-96 mb-8 animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Skeleton className="h-32 w-full animate-pulse" />
                    <Skeleton className="h-32 w-full animate-pulse" />
                    <Skeleton className="h-32 w-full animate-pulse" />
                </div>
                <Skeleton className="h-96 w-full animate-pulse" />
            </div>
        }>
            <AllProjectsContent />
        </Suspense>
    );
}
