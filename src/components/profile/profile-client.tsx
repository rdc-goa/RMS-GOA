

'use client';

import { useState, useEffect, useMemo } from 'react';
import type { User, Project, EmrInterest, FundingCall, ResearchPaper, Author, CoPiDetails, IncentiveClaim, ScopusPublication } from '@/types';
import { uploadFileToServer } from '@/app/actions';
import { updateEmrInterestDetails } from '@/app/emr-actions';
import { findUserByMisId } from '@/app/userfinding';
import { fetchAndSaveScopusPublicationsAction, updateUserResearcherIdsAction } from '@/app/scopus-actions';
import { fetchPublicationDetailsAction } from '@/app/publication-details-actions';
import { fetchAuthorCitationOverviewAction } from '@/app/author-citation-actions';
import { formatScopusDocumentType, formatOpenAccessStatus, getQuartileBadgeProps, computeCareerTimeline, extractUniqueCoAuthorsCount, estimateQuartile, computeHIndex, deriveSubjectAreasFromPublications, resolvePublisherName, extractTopCoAuthors, formatScopusDate } from '@/lib/scopus-utils';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';



import { generateProfilePdf } from '@/lib/profile-pdf';


import { addResearchPaper, checkUserOrStaff, updateResearchPaper, deleteResearchPaper, manageCoAuthorRequest } from '@/app/actions';
import { useResearchPapers } from '@/hooks/use-staff-data';
import { mutate } from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Loader2, Mail, Briefcase, Building2, BookCopy, Phone, Plus, UserPlus, X, Edit, Trash2, Search, Upload, CalendarDays, FileText, Check, UserCheck, UserX, Award, ExternalLink, RefreshCw, Users, TrendingUp, ChevronDown, Flame, Globe, AlertCircle, BookOpen, Copy, ArrowUpDown, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { format, parseISO } from 'date-fns';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '../ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { reportSystemError } from '@/lib/error-reporting';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';

import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import Link from 'next/link';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { extractNumericScopusId } from '@/components/incentives/scopus-id-guard';


function ProfileDetail({ label, value, icon: Icon }: { label: string; value?: string | null; icon: React.ElementType }) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
                <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-sm text-muted-foreground break-all">{value}</p>
            </div>
        </div>
    );
}

const AUTHOR_ROLES: Author['role'][] = ['First Author', 'Corresponding Author', 'Co-Author', 'First & Corresponding Author'];

function AddEditPaperDialog({
    isOpen,
    onOpenChange,
    onSuccess,
    user,
    existingPaper
}: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: (paper: ResearchPaper, isNew: boolean) => void;
    user: User;
    existingPaper?: ResearchPaper | null;
}) {
    const { toast } = useToast();
    const [title, setTitle] = useState('');
    const [url, setUrl] = useState('');
    const [authors, setAuthors] = useState<Author[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [journalName, setJournalName] = useState('');
    const [journalWebsite, setJournalWebsite] = useState('');
    const [qRating, setQRating] = useState('');
    const [impactFactor, setImpactFactor] = useState<number | ''>('');

    // State for adding co-authors
    const [coPiSearchTerm, setCoPiSearchTerm] = useState('');
    const [foundCoPi, setFoundCoPi] = useState<{ uid: string; name: string; email: string; isRegistered: boolean } | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [externalAuthorName, setExternalAuthorName] = useState('');
    const [externalAuthorEmail, setExternalAuthorEmail] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (existingPaper) {
                setTitle(existingPaper.title);
                setUrl(existingPaper.url);
                setAuthors(existingPaper.authors);
                setJournalName(existingPaper.journalName || '');
                setJournalWebsite(existingPaper.journalWebsite || '');
                setQRating(existingPaper.qRating || '');
                setImpactFactor(existingPaper.impactFactor || '');
            } else {
                setTitle('');
                setUrl('');
                setAuthors([{ email: user.email, name: user.name, role: 'First Author', isExternal: false, uid: user.uid, status: 'approved' }]);
                setJournalName('');
                setJournalWebsite('');
                setQRating('');
                setImpactFactor('');
            }
        }
    }, [isOpen, existingPaper, user]);

    const handleSearchCoPi = async () => {
        if (!coPiSearchTerm) return;
        setIsSearching(true);
        setFoundCoPi(null);
        try {
            const result = await findUserByMisId(coPiSearchTerm);
            if (result.success && result.users && result.users.length > 0) {
                if (result.users.length === 1) {
                    const person = result.users[0];
                    setFoundCoPi({ ...person!, uid: person.uid || '', isRegistered: !!person.uid });
                } else {
                    // Multiple users found, handle selection (this part would need a dialog)
                    console.log("Multiple users found:", result.users);
                    // For now, just take the first one as a simplification
                    const person = result.users[0];
                    setFoundCoPi({ ...person!, uid: person.uid || '', isRegistered: !!person.uid });
                }
            } else {
                toast({ variant: 'destructive', title: 'User Not Found', description: result.error });
            }
        } catch (error) {
            toast({ variant: 'destructive', title: 'Search Failed', description: 'An error occurred while searching.' });
        } finally {
            setIsSearching(false);
        }
    };

    const addInternalAuthor = () => {
        if (foundCoPi && !authors.some(a => a.email === foundCoPi.email)) {
            if (user && foundCoPi.email === user.email) {
                toast({ variant: 'destructive', title: 'Cannot Add Self', description: 'You cannot add yourself as a Co-PI.' });
                return;
            }
            setAuthors([...authors, {
                uid: foundCoPi.isRegistered ? foundCoPi.uid : undefined,
                name: foundCoPi.name,
                email: foundCoPi.email,
                role: 'Co-Author',
                isExternal: !foundCoPi.isRegistered,
                status: 'approved'
            }]);
            setFoundCoPi(null);
            setCoPiSearchTerm('');
        }
    };

    const addExternalAuthor = () => {
        const name = externalAuthorName.trim();
        const email = externalAuthorEmail.trim().toLowerCase();
        if (!name || !email) {
            toast({ title: 'Name and email are required for external authors', variant: 'destructive' });
            return;
        }
        if (authors.some(a => a.email === email)) {
            toast({ title: 'Author already added', variant: 'destructive' });
            return;
        }
        setAuthors([...authors, { name, email, role: 'Co-Author', isExternal: true, uid: null, status: 'approved' }]);
        setExternalAuthorName('');
        setExternalAuthorEmail('');
    };


    const removeAuthor = (email: string) => {
        if (email === user.email) {
            toast({ title: 'Cannot remove the main author', variant: 'destructive' });
            return;
        }
        setAuthors(authors.filter(ca => ca.email !== email));
    };

    const updateAuthorRole = (email: string, role: Author['role']) => {
        setAuthors(authors.map(ca => ca.email === email ? { ...ca, role } : ca));
    };

    const handleSubmit = async () => {
        if (!title.trim() || !url.trim() || !journalName.trim() || !journalWebsite.trim() || !qRating.trim() || impactFactor === '') {
            toast({ title: "All fields are required", description: "Please fill out the paper title, URL, and all journal details.", variant: "destructive" });
            return;
        }
        if (!url.trim().startsWith('https://')) {
            toast({ title: "Invalid URL", description: "URL must start with 'https://'", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            let result;
            const paperPayload = {
                title: title.trim(),
                url: url.trim(),
                authors,
                journalName: journalName.trim(),
                journalWebsite: journalWebsite.trim(),
                qRating: qRating.trim(),
                impactFactor: Number(impactFactor),
            };

            if (existingPaper) {
                result = await updateResearchPaper(existingPaper.id, user.uid, paperPayload);
            } else {
                result = await addResearchPaper({ ...paperPayload, mainAuthorUid: user.uid });
            }

            if (result.success && result.paper) {
                toast({ title: `Research paper ${existingPaper ? 'updated' : 'added'} successfully` });
                onSuccess(result.paper, !existingPaper);
                onOpenChange(false);
            } else {
                toast({ title: `Failed to ${existingPaper ? 'update' : 'add'} research paper`, description: result.error, variant: "destructive" });
            }
        } catch (error) {
            toast({ title: `Error ${existingPaper ? 'updating' : 'adding'} research paper`, variant: "destructive" });
            console.error(`Error ${existingPaper ? 'updating' : 'adding'} research paper:`, error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{existingPaper ? 'Edit' : 'Add'} Research Paper</DialogTitle>
                    <DialogDescription>Add the title, URL, and authors of your published paper.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                    <div><Label htmlFor="paperTitle" className="block text-sm font-medium">Paper Title</Label><Input id="paperTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter paper title" className="mt-1" /></div>
                    <div><Label htmlFor="paperUrl" className="block text-sm font-medium">Published Paper URL</Label><Input id="paperUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://doi.org/..." className="mt-1" /></div>

                    <Separator />
                    <h3 className="text-md font-semibold pt-2">Journal Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><Label htmlFor="journalName" className="block text-sm font-medium">Journal Name</Label><Input id="journalName" value={journalName} onChange={(e) => setJournalName(e.target.value)} placeholder="e.g., Nature Communications" className="mt-1" /></div>
                        <div><Label htmlFor="journalWebsite" className="block text-sm font-medium">Journal Website</Label><Input id="journalWebsite" value={journalWebsite} onChange={(e) => setJournalWebsite(e.target.value)} placeholder="https://www.nature.com/ncomms/" className="mt-1" /></div>
                        <div><Label htmlFor="qRating" className="block text-sm font-medium">Q Rating</Label><Input id="qRating" value={qRating} onChange={(e) => setQRating(e.target.value)} placeholder="e.g., Q1" className="mt-1" /></div>
                        <div><Label htmlFor="impactFactor" className="block text-sm font-medium">Impact Factor</Label><Input id="impactFactor" type="number" value={impactFactor} onChange={(e) => setImpactFactor(e.target.value ? parseFloat(e.target.value) : '')} placeholder="e.g., 16.6" className="mt-1" /></div>
                    </div>

                    <Separator />

                    <div><Label className="block text-sm font-medium mb-1">Authors</Label>
                        <div className="space-y-2">
                            {authors.map((author) => (
                                <div key={author.email} className="flex items-center gap-2 p-2 border rounded-md">
                                    <div className="flex-grow">
                                        <p className="font-medium text-sm">{author.name} {author.isExternal && <span className="text-xs text-muted-foreground">(External)</span>}</p>
                                        <p className="text-xs text-muted-foreground">{author.email}</p>
                                    </div>
                                    <Select value={author.role} onValueChange={(value) => updateAuthorRole(author.email, value as Author['role'])}>
                                        <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>{AUTHOR_ROLES.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
                                    </Select>
                                    {author.email !== user.email && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeAuthor(author.email)}><X className="h-4 w-4" /></Button>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <Separator />
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="internal-author" className="text-sm font-medium">Add Internal Co-Author</Label>
                            <div className="flex gap-2 mt-1">
                                <Input id="internal-author" value={coPiSearchTerm} onChange={(e) => setCoPiSearchTerm(e.target.value)} placeholder="Search by MIS ID" />
                                <Button onClick={handleSearchCoPi} variant="outline" size="icon" disabled={!coPiSearchTerm.trim() || isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</Button>
                            </div>
                            {foundCoPi && (
                                <div className="flex items-center justify-between p-2 border rounded-md mt-2">
                                    <div>
                                        <p className="text-sm">{foundCoPi.name}</p>
                                        {!foundCoPi.uid && <p className="text-xs text-muted-foreground">Not registered, but found in staff data.</p>}
                                    </div>
                                    <Button size="sm" onClick={addInternalAuthor}>Add</Button>
                                </div>
                            )}
                        </div>
                        <div>
                            <Label className="text-sm font-medium">Add External Co-Author</Label>
                            <div className="flex gap-2 mt-1">
                                <Input value={externalAuthorName} onChange={(e) => setExternalAuthorName(e.target.value)} placeholder="External author's name" />
                                <Input value={externalAuthorEmail} onChange={(e) => setExternalAuthorEmail(e.target.value)} placeholder="External author's email" />
                                <Button onClick={addExternalAuthor} variant="outline" size="icon" disabled={!externalAuthorName.trim() || !externalAuthorEmail.trim()}><UserPlus className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button onClick={() => onOpenChange(false)} variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (existingPaper ? 'Save Changes' : 'Add Paper')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};


function EditBulkEmrDialog({ interest, isOpen, onOpenChange, onUpdate }: { interest: EmrInterest; isOpen: boolean; onOpenChange: (open: boolean) => void; onUpdate: (updatedInterest: EmrInterest) => void; }) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [title, setTitle] = useState(interest.callTitle || '');
    const [agency, setAgency] = useState(interest.agency || '');
    const [durationAmount, setDurationAmount] = useState(interest.durationAmount || '');
    const [sanctionDate, setSanctionDate] = useState<Date | undefined>(interest.sanctionDate ? parseISO(interest.sanctionDate) : undefined);
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [coPis, setCoPis] = useState<CoPiDetails[]>(interest.coPiDetails || []);
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
                coPiEmails: coPis.map(c => c.email.toLowerCase()),
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
            reportSystemError(error, null);
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
                    <div><Label>Amount & Duration</Label><Input value={durationAmount} onChange={e => setDurationAmount(e.target.value)} placeholder="e.g., Amount: 50,00,000 | Duration: 3 Years" /></div>
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
                            <Button onClick={handleSearchCoPi} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}</Button>
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


export function ProfileClient({ user, projects, emrInterests: initialEmrInterests, fundingCalls, claims }: { user: User; projects: Project[], emrInterests: EmrInterest[], fundingCalls: FundingCall[], claims: IncentiveClaim[] }) {
    const [domain, setDomain] = useState<string | null>(user.researchDomain || null);
    const [loadingDomain, setLoadingDomain] = useState(false);
    const { papers: researchPapers, isLoading: loadingPapers } = useResearchPapers(user.uid);
    const [emrInterests, setEmrInterests] = useState(initialEmrInterests);
    const [localScopusId, setLocalScopusId] = useState(user.scopusId || '');
    const [localGoogleScholarId, setLocalGoogleScholarId] = useState(user.googleScholarId || '');
    const [isEditingIds, setIsEditingIds] = useState(false);

    useEffect(() => {
        setLocalScopusId(user.scopusId || '');
        setLocalGoogleScholarId(user.googleScholarId || '');
    }, [user.scopusId, user.googleScholarId]);

    const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
    const [paperToEdit, setPaperToEdit] = useState<ResearchPaper | null>(null);
    const [paperToDelete, setPaperToDelete] = useState<ResearchPaper | null>(null);
    const [interestToEdit, setInterestToEdit] = useState<EmrInterest | null>(null);
    const [managingRequest, setManagingRequest] = useState<{ paper: ResearchPaper, author: Author } | null>(null);
    const [assignedRole, setAssignedRole] = useState<Author['role'] | ''>('');
    const { toast } = useToast();
    const [sessionUser, setSessionUser] = useState<User | null>(null);

    const [scopusPublications, setScopusPublications] = useState<ScopusPublication[]>(user.scopusPublications || []);
    const [scopusHIndex, setScopusHIndex] = useState<number | undefined>(user.scopusHIndex);
    const [scopusSubjectAreas, setScopusSubjectAreas] = useState<{ name: string; count: number }[] | undefined>(user.scopusSubjectAreas);
    const [isFetchingScopus, setIsFetchingScopus] = useState(false);
    const [scopusSearchQuery, setScopusSearchQuery] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedYears, setSelectedYears] = useState<string[]>([]);
    const [selectedAccessTypes, setSelectedAccessTypes] = useState<string[]>([]);
    const [selectedQuartiles, setSelectedQuartiles] = useState<string[]>([]);
    const [scopusSortField, setScopusSortField] = useState<'title' | 'journal' | 'date' | 'type' | 'access' | 'citations' | null>(null);
    const [scopusSortOrder, setScopusSortOrder] = useState<'asc' | 'desc'>('desc');

    const [citationTrend, setCitationTrend] = useState<{ year: string; count: number }[]>([]);
    const [trendType, setTrendType] = useState<'calendar' | 'academic'>('calendar');

    const displayedTrend = useMemo(() => {
        if (trendType === 'calendar') {
            return citationTrend.map(t => ({
                year: t.year,
                count: t.count,
                label: `Jan '${t.year.substring(2)} - Dec '${t.year.substring(2)}`
            }));
        }

        const academicTrend: { year: string; count: number; label: string }[] = [];
        for (let i = 0; i < citationTrend.length - 1; i++) {
            const current = citationTrend[i];
            const next = citationTrend[i + 1];
            const currentYearNum = parseInt(current.year, 10);
            const nextYearNum = parseInt(next.year, 10);
            if (nextYearNum === currentYearNum + 1) {
                const count = Math.round((7 / 12) * current.count + (5 / 12) * next.count);
                const yearLabel = `${current.year.substring(2)}-${next.year.substring(2)}`;
                academicTrend.push({
                    year: yearLabel,
                    count,
                    label: `June '${current.year.substring(2)} - May '${next.year.substring(2)}`
                });
            }
        }
        return academicTrend;
    }, [citationTrend, trendType]);

    const [isLoadingCitationTrend, setIsLoadingCitationTrend] = useState(false);
    const [selectedPubForInsight, setSelectedPubForInsight] = useState<any | null>(null);
    const [isInsightLoading, setIsInsightLoading] = useState(false);
    const [detailedPubData, setDetailedPubData] = useState<any | null>(null);

    useEffect(() => {
        if (localScopusId) {
            setIsLoadingCitationTrend(true);
            fetchAuthorCitationOverviewAction(user.uid, localScopusId)
                .then(res => {
                    if (res.success && res.citationTrend) {
                        setCitationTrend(res.citationTrend);
                    }
                })
                .catch(err => console.error('Error fetching citation overview:', err))
                .finally(() => setIsLoadingCitationTrend(false));
        }
    }, [localScopusId, user.uid, scopusPublications]);

    useEffect(() => {

        const storedUser = localStorage.getItem('user');
        if (storedUser) { setSessionUser(JSON.parse(storedUser)); }
    }, []);

    const isSuperAdmin = useMemo(() => {
        if (!sessionUser) return false;
        const role = (sessionUser.role || '').toLowerCase();
        const designation = (sessionUser.designation || '').toLowerCase();
        return role === 'super-admin' || designation === 'super-admin';
    }, [sessionUser]);

    const effectiveHIndex = useMemo(() => {
        if (scopusHIndex !== undefined) return scopusHIndex;
        if (scopusPublications.length > 0) {
            return computeHIndex(scopusPublications.map(p => p.citationCount || 0));
        }
        return user.hIndex;
    }, [scopusHIndex, scopusPublications, user.hIndex]);

    const careerTimeline = useMemo(() => {
        return computeCareerTimeline(scopusPublications);
    }, [scopusPublications]);

    const uniqueCoAuthors = useMemo(() => {
        return user.scopusCoAuthorCount || extractUniqueCoAuthorsCount(scopusPublications);
    }, [user.scopusCoAuthorCount, scopusPublications]);

    const publicationCategoryCounts = useMemo(() => {
        return deriveSubjectAreasFromPublications(scopusPublications, scopusSubjectAreas);
    }, [scopusSubjectAreas, scopusPublications]);

    const topCoAuthors = useMemo(() => {
        if (user.scopusTopCoAuthors && user.scopusTopCoAuthors.length > 0) {
            return user.scopusTopCoAuthors;
        }
        return extractTopCoAuthors(scopusPublications, user.name, 8);
    }, [user.scopusTopCoAuthors, scopusPublications, user.name]);

    const affiliationsList = useMemo(() => {
        if (user.scopusAffiliations && user.scopusAffiliations.length > 0) {
            return user.scopusAffiliations;
        }
        if (user.institute) {
            return [{ name: user.institute, city: (user.campus || 'Goa'), country: 'India', current: true }];
        }
        return [];
    }, [user.scopusAffiliations, user.institute]);

    const nameVariantsList = useMemo(() => {
        if (user.scopusNameVariants && user.scopusNameVariants.length > 0) {
            const filtered = user.scopusNameVariants.filter(v => v.trim().toLowerCase() !== 'director rdc');
            if (filtered.length > 0) return filtered;
        }
        return [user.name];
    }, [user.scopusNameVariants, user.name]);



    const availableCategories = useMemo(() => {
        const cats = new Set<string>();
        scopusPublications.forEach(p => {
            const typeStr = formatScopusDocumentType(p.subtypeDescription, p.aggregationType);
            if (typeStr) cats.add(typeStr);
        });
        return Array.from(cats).sort();
    }, [scopusPublications]);

    const availableYears = useMemo(() => {
        const years = new Set<string>();
        scopusPublications.forEach(p => {
            const y = p.publicationYear || p.coverDate?.substring(0, 4);
            if (y && y.length === 4) years.add(y);
        });
        return Array.from(years).sort((a, b) => b.localeCompare(a));
    }, [scopusPublications]);

    const availableAccessTypes = ['Open Access', 'Subscribed'];
    const availableQuartiles = ['Q1', 'Q2', 'Q3', 'Q4'];

    const filteredScopusPublications = useMemo(() => {
        return scopusPublications.filter(p => {
            if (scopusSearchQuery.trim()) {
                const q = scopusSearchQuery.toLowerCase().trim();
                const matchesQuery =
                    (p.title && p.title.toLowerCase().includes(q)) ||
                    (p.journalName && p.journalName.toLowerCase().includes(q)) ||
                    (p.subtypeDescription && p.subtypeDescription.toLowerCase().includes(q)) ||
                    (p.publicationYear && p.publicationYear.includes(q)) ||
                    (p.doi && p.doi.toLowerCase().includes(q)) ||
                    (p.authors && p.authors.toLowerCase().includes(q)) ||
                    (p.fundingSponsor && p.fundingSponsor.toLowerCase().includes(q));
                if (!matchesQuery) return false;
            }

            if (selectedCategories.length > 0) {
                const typeStr = formatScopusDocumentType(p.subtypeDescription, p.aggregationType);
                const text = `${p.title || ''} ${p.journalName || ''}`.toLowerCase();
                const isMatch = selectedCategories.some(cat => {
                    if (typeStr === cat) return true;
                    if (cat === 'Materials Science' && /material|nanomaterial|nanoflower|nanosheet|composite|alloy|ceramic|thin film|crystal|graphene|oxide|structure|coating|metal/i.test(text)) return true;
                    if (cat === 'Physics & Astronomy' && /terahertz|metamaterial|absorber|optic|laser|photonic|plasma|quantum|acoustic|electromagnetic|dielectric|semiconductor|physics|wave/i.test(text)) return true;
                    if (cat === 'Engineering & Computer Science' && /deep learning|machine learning|neural|optimization|algorithm|sensor|control|simulation|computing|network|image processing|finite element|software/i.test(text)) return true;
                    if (cat === 'Chemistry & Chemical Engineering' && /water splitting|catalys|electrocatalys|hydrogen|polymer|synthesis|chemical|corrosion|electrochemical|bioresource|molecule|liquid|fuel/i.test(text)) return true;
                    if (cat === 'Energy & Environmental Science' && /biomass|storage|renewable|solar|battery|photovoltaic|emission|environment|energy|sustainable|water/i.test(text)) return true;
                    return false;
                });
                if (!isMatch) return false;
            }

            if (selectedYears.length > 0) {
                const y = p.publicationYear || p.coverDate?.substring(0, 4);
                if (!y || !selectedYears.includes(y)) return false;
            }

            if (selectedAccessTypes.length > 0) {
                const oaInfo = formatOpenAccessStatus(p.openAccess, p.openAccessStatus);
                const accessKey = oaInfo.isOpen ? 'Open Access' : 'Subscribed';
                if (!selectedAccessTypes.includes(accessKey)) return false;
            }

            return true;
        });
    }, [scopusPublications, scopusSearchQuery, selectedCategories, selectedYears, selectedAccessTypes]);

    const sortedFilteredScopusPublications = useMemo(() => {
        if (!scopusSortField) return filteredScopusPublications;

        return [...filteredScopusPublications].sort((a, b) => {
            let valA: any = '';
            let valB: any = '';

            switch (scopusSortField) {
                case 'title':
                    valA = a.title || '';
                    valB = b.title || '';
                    break;
                case 'journal':
                    valA = a.journalName || '';
                    valB = b.journalName || '';
                    break;
                case 'date':
                    valA = a.coverDate || a.publicationYear || '';
                    valB = b.coverDate || b.publicationYear || '';
                    break;
                case 'type':
                    valA = formatScopusDocumentType(a.subtypeDescription, a.aggregationType);
                    valB = formatScopusDocumentType(b.subtypeDescription, b.aggregationType);
                    break;
                case 'access':
                    const oaA = formatOpenAccessStatus(a.openAccess, a.openAccessStatus);
                    const oaB = formatOpenAccessStatus(b.openAccess, b.openAccessStatus);
                    valA = oaA.isOpen ? 'Open Access' : 'Subscribed';
                    valB = oaB.isOpen ? 'Open Access' : 'Subscribed';
                    break;
                case 'citations':
                    valA = a.citationCount ?? 0;
                    valB = b.citationCount ?? 0;
                    break;
            }

            if (typeof valA === 'number' && typeof valB === 'number') {
                return scopusSortOrder === 'asc' ? valA - valB : valB - valA;
            }

            const strA = String(valA).trim().toLowerCase();
            const strB = String(valB).trim().toLowerCase();

            return scopusSortOrder === 'asc'
                ? strA.localeCompare(strB)
                : strB.localeCompare(strA);
        });
    }, [filteredScopusPublications, scopusSortField, scopusSortOrder]);

    const handleScopusSort = (field: 'title' | 'journal' | 'date' | 'type' | 'access' | 'citations') => {
        if (scopusSortField === field) {
            setScopusSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setScopusSortField(field);
            setScopusSortOrder(field === 'citations' || field === 'date' ? 'desc' : 'asc');
        }
    };

    const renderSortIcon = (field: 'title' | 'journal' | 'date' | 'type' | 'access' | 'citations') => {
        if (scopusSortField !== field) {
            return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />;
        }
        return scopusSortOrder === 'asc'
            ? <ArrowUp className="h-3.5 w-3.5 text-primary shrink-0 font-bold" />
            : <ArrowDown className="h-3.5 w-3.5 text-primary shrink-0 font-bold" />;
    };

    const handleExportExcel = async (exportType: 'all' | 'filtered') => {
        const publicationsToExport = exportType === 'all' ? scopusPublications : filteredScopusPublications;

        if (publicationsToExport.length === 0) {
            toast({
                title: "No Data to Export",
                description: `There are no publications to export for ${exportType === 'all' ? 'all' : 'filtered'} publications.`,
                variant: "destructive"
            });
            return;
        }

        try {
            const ExcelJS = await import('exceljs');
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Publications');

            // Define headers
            const columns = [
                { header: 'Title', key: 'title', width: 45 },
                { header: 'Authors', key: 'authors', width: 30 },
                { header: 'Journal / Venue', key: 'journalName', width: 30 },
                { header: 'Publication Date', key: 'coverDate', width: 15 },
                { header: 'Publication Year', key: 'publicationYear', width: 15 },
                { header: 'Document Type', key: 'docType', width: 20 },
                { header: 'Access Status', key: 'access', width: 15 },
                { header: 'Citations', key: 'citations', width: 12 },
                { header: 'DOI', key: 'doi', width: 25 },
                { header: 'Scopus URL', key: 'scopusUrl', width: 35 },
            ];

            worksheet.columns = columns;

            // Format data rows
            publicationsToExport.forEach(pub => {
                const oaInfo = formatOpenAccessStatus(pub.openAccess, pub.openAccessStatus);
                const accessStatus = oaInfo.isOpen ? (oaInfo.label || 'Open Access') : 'Subscribed';
                const docType = formatScopusDocumentType(pub.subtypeDescription, pub.aggregationType);
                const pubDate = formatScopusDate(pub.coverDate, pub.publicationYear);

                // Strip HTML tags from title if any (e.g. <sub>, <i>)
                const cleanTitle = pub.title ? pub.title.replace(/<\/?[^>]+(>|$)/g, "") : '';

                worksheet.addRow({
                    title: cleanTitle,
                    authors: pub.authors || 'N/A',
                    journalName: pub.journalName || 'N/A',
                    coverDate: pubDate,
                    publicationYear: pub.publicationYear || pub.coverDate?.substring(0, 4) || 'N/A',
                    docType: docType || 'N/A',
                    access: accessStatus,
                    citations: pub.citationCount ?? 0,
                    doi: pub.doi || 'N/A',
                    scopusUrl: pub.scopusUrl || 'N/A'
                });
            });

            // Style headers
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1E293B' } // Slate 800
            };
            headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
            headerRow.height = 24;

            // Align citations column text to right, set borders and striping
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;

                // Striping
                if (rowNumber % 2 === 0) {
                    row.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF8FAFC' } // Slate 50
                    };
                }

                // Alignment for citations (column 8)
                const citationCell = row.getCell(8);
                citationCell.alignment = { horizontal: 'right' };

                // Add cell borders for a clean table look
                row.eachCell((cell) => {
                    cell.border = {
                        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                    };
                });
            });

            // Write workbook
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const dateStr = new Date().toISOString().split('T')[0];
            const sanitizedUserName = user.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            a.download = `${sanitizedUserName}_publications_${exportType}_${dateStr}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);

            toast({
                title: "Excel Export Success",
                description: `Successfully exported ${publicationsToExport.length} publications to Excel.`
            });
        } catch (error) {
            console.error('Failed to export publications to Excel:', error);
            toast({
                title: "Export Failed",
                description: "An error occurred while generating the Excel file.",
                variant: "destructive"
            });
        }
    };

    const handleFetchScopusPublications = async () => {
        if (!localScopusId) {
            toast({
                title: "Missing Scopus ID",
                description: "This user does not have a Scopus ID configured in their profile.",
                variant: "destructive"
            });
            return;
        }

        if (!sessionUser?.uid) {
            toast({ title: "Authentication Required", description: "You must be logged in to fetch Scopus publications.", variant: "destructive" });
            return;
        }

        setIsFetchingScopus(true);
        try {
            const res = await fetchAndSaveScopusPublicationsAction(user.uid, localScopusId, sessionUser.uid);
            if (res.success && res.publications) {
                setScopusPublications(res.publications);
                if (res.hIndex !== undefined) setScopusHIndex(res.hIndex);
                if (res.subjectAreas) setScopusSubjectAreas(res.subjectAreas);
                toast({
                    title: "Scopus Publications Synced",
                    description: `Successfully fetched and saved ${res.count} publications from Scopus.`
                });
            } else {
                toast({
                    title: "Fetch Failed",
                    description: res.error || "Failed to fetch Scopus publications.",
                    variant: "destructive"
                });
            }
        } catch (err: any) {
            toast({
                title: "Error",
                description: err.message || "An unexpected error occurred while fetching Scopus data.",
                variant: "destructive"
            });
        } finally {
            setIsFetchingScopus(false);
        }
    };

    const [scopusIdInput, setScopusIdInput] = useState(user.scopusId || '');
    const [googleScholarIdInput, setGoogleScholarIdInput] = useState(user.googleScholarId || '');
    const [isSavingIds, setIsSavingIds] = useState(false);

    const openEditIdsDialog = () => {
        setScopusIdInput(localScopusId);
        setGoogleScholarIdInput(localGoogleScholarId);
        setIsEditingIds(true);
    };

    const handleSaveIds = async () => {
        if (!sessionUser?.uid) return;
        setIsSavingIds(true);
        try {
            const res = await updateUserResearcherIdsAction(
                user.uid,
                scopusIdInput,
                googleScholarIdInput,
                sessionUser.uid
            );
            if (res.success) {
                setLocalScopusId(scopusIdInput);
                setLocalGoogleScholarId(googleScholarIdInput);

                if (scopusIdInput !== localScopusId) {
                    setScopusPublications([]);
                    setScopusHIndex(undefined);
                    setScopusSubjectAreas(undefined);
                    setCitationTrend([]);
                }

                toast({
                    title: "IDs Updated Successfully",
                    description: "The user's Scopus ID and Google Scholar ID have been updated."
                });
                setIsEditingIds(false);
            } else {
                toast({
                    title: "Update Failed",
                    description: res.error || "An error occurred while saving researcher IDs.",
                    variant: "destructive"
                });
            }
        } catch (err: any) {
            console.error("Error saving researcher IDs:", err);
            toast({
                title: "Update Failed",
                description: err?.message || "An unexpected error occurred.",
                variant: "destructive"
            });
        } finally {
            setIsSavingIds(false);
        }
    };

    const handleRowClick = async (pub: any) => {
        setSelectedPubForInsight(pub);
        setIsInsightLoading(true);
        try {
            const res = await fetchPublicationDetailsAction(user.uid, pub.eid);
            if (res.success && res.publication) {
                setDetailedPubData(res.publication);
            } else {
                toast({
                    title: "Details unavailable",
                    description: res.error || "Could not retrieve detailed metadata from Scopus. Showing basic info.",
                    variant: "default"
                });
                setDetailedPubData(pub);
            }
        } catch (err: any) {
            console.error('Error fetching details:', err);
            setDetailedPubData(pub);
        } finally {
            setIsInsightLoading(false);
        }
    };



    const handlePaperSuccess = (paper: ResearchPaper, isNew: boolean) => {
        mutate(`/api/get-research-papers?userUid=${user.uid}`);
        if (paper.domain) setDomain(paper.domain);
    };

    const handleDeletePaper = async () => {
        if (!paperToDelete || !sessionUser) return;
        const result = await deleteResearchPaper(paperToDelete.id, sessionUser.uid);
        if (result.success) {
            toast({ title: "Paper Deleted" });
            mutate(`/api/get-research-papers?userUid=${user.uid}`);
            setPaperToDelete(null);
        } else {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        }
    };

    const handleCoAuthorAction = async (paper: ResearchPaper, author: Author, action: 'accept' | 'reject') => {
        if (action === 'accept') {
            setManagingRequest({ paper, author });
        } else { // Not Approved
            const result = await manageCoAuthorRequest(paper.id, author, 'reject');
            if (result.success) {
                toast({ title: "Request Not Approved" });
                mutate(`/api/get-research-papers?userUid=${user.uid}`);
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        }
    };

    const handleConfirmAcceptRequest = async () => {
        if (!managingRequest || !assignedRole) {
            toast({ title: "Please assign a role", variant: "destructive" });
            return;
        }
        const { paper, author } = managingRequest;
        const result = await manageCoAuthorRequest(paper.id, author, 'accept', assignedRole);
        if (result.success) {
            toast({ title: "Co-Author Approved" });
            setManagingRequest(null);
            setAssignedRole('');
            mutate(`/api/get-research-papers?userUid=${user.uid}`);
        } else {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        }
    };

    const isOwner = sessionUser?.uid === user.uid;
    const profileLink = user.campus === 'Goa' ? `/goa/${user.misId}` : `/profile/${user.misId}`;

    const StatItem = ({ value, label }: { value: number | string; label: string }) => (
        <div className="flex flex-col items-center">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
        </div>
    );

    const getClaimTitle = (claim: IncentiveClaim) => {
        return claim.paperTitle || claim.patentTitle || claim.conferencePaperTitle || claim.publicationTitle || claim.professionalBodyName || claim.apcPaperTitle || 'N/A';
    };

    const getResearchPaperProofUrl = (claim: IncentiveClaim) => {
        return claim.publicationProofUrls?.[0] || claim.relevantLink || undefined;
    };

    const normalizePublicationValue = (value?: string) => (value || '').trim().toLowerCase();

    const researchPaperIdSet = new Set(researchPapers.map((paper) => paper.id));
    const researchPaperTitleSet = new Set(researchPapers.map((paper) => normalizePublicationValue(paper.title)));
    const researchPaperUrlSet = new Set(researchPapers.map((paper) => normalizePublicationValue(paper.url)));

    const safeClaims = claims || [];
    const paperClaims = safeClaims.filter(c => c.claimType === 'Research Papers').filter((claim) => {
        // Do not list the same publication twice when a claim is already linked to
        // a research paper entry for this profile.
        if (claim.paperId && researchPaperIdSet.has(claim.paperId)) {
            return false;
        }

        const normalizedTitle = normalizePublicationValue(claim.paperTitle);
        if (normalizedTitle && researchPaperTitleSet.has(normalizedTitle)) {
            return false;
        }

        const normalizedUrl = normalizePublicationValue(claim.relevantLink);
        if (normalizedUrl && researchPaperUrlSet.has(normalizedUrl)) {
            return false;
        }

        return true;
    });

    const otherClaims = safeClaims.filter(c => c.claimType !== 'Research Papers');
    const totalPublicationAndClaimCount = researchPapers.length + paperClaims.length + otherClaims.length;
    const totalApprovedAmount = safeClaims.reduce((sum, claim) => sum + (claim.finalApprovedAmount || 0), 0);

    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    const handleDownloadPdf = async () => {
        try {
            setIsGeneratingPdf(true);
            toast({ title: "Generating PDF Report...", description: "Preparing profile overview, projects, and research publications." });
            await generateProfilePdf({
                user,
                projects,
                emrInterests,
                researchPapers,
                paperClaims,
                scopusPublications: filteredScopusPublications,
                scopusSubjectAreas,
                scopusHIndex: effectiveHIndex,
                careerTimeline,
                uniqueCoAuthors,
                topCoAuthors,
                affiliationsList,
                nameVariantsList,
                publicationCategoryCounts,
            });
            toast({ title: "PDF Downloaded", description: "Profile PDF report downloaded successfully." });
        } catch (err: any) {
            console.error("Failed to generate PDF:", err);
            toast({ title: "PDF Generation Failed", description: err?.message || "An unexpected error occurred.", variant: "destructive" });
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return (
        <div className="flex flex-col items-center">
            <Card className="w-full max-w-4xl shadow-xl border-0 bg-card/80 backdrop-blur-lg">
                <CardContent className="p-6 md:p-8">
                    <div className="flex flex-col md:flex-row items-center gap-6">
                        <div className="flex-shrink-0">
                            <Avatar className="h-28 w-28 md:h-32 md:w-32 border-4 border-background shadow-lg">
                                <AvatarImage src={user.photoURL || undefined} alt={user.name} className="object-cover" />
                                <AvatarFallback className="text-4xl">{user.name?.[0].toUpperCase()}</AvatarFallback>
                            </Avatar>
                        </div>
                        <div className="flex flex-col items-center md:items-start text-center md:text-left w-full">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full">
                                <h1 className="text-3xl font-bold">{user.name}</h1>
                                <div className="flex flex-wrap items-center gap-2 mt-4 sm:mt-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleDownloadPdf}
                                        disabled={isGeneratingPdf}
                                        className="shadow-sm border-primary/30 hover:border-primary"
                                    >
                                        {isGeneratingPdf ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <FileText className="mr-2 h-4 w-4 text-primary" />
                                        )}
                                        Download Profile PDF
                                    </Button>
                                    <Button asChild variant="outline" size="sm">
                                        <a href={`mailto:${user.email}`}>
                                            <Mail className="mr-2 h-4 w-4" /> Email
                                        </a>
                                    </Button>
                                </div>
                            </div>

                            <p className="text-muted-foreground mt-1">{user.designation}</p>
                            <p className="text-muted-foreground">{user.department}, {user.institute}</p>
                            <div className="flex justify-center md:justify-start gap-8 my-4">
                                <StatItem value={projects.length} label="IMR Projects" />
                                <StatItem value={emrInterests.length} label="EMR Interests" />
                                <StatItem value={totalPublicationAndClaimCount} label="Publications & Claims" />
                                <StatItem value={`₹${totalApprovedAmount.toLocaleString('en-IN')}`} label="Total Approved" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 pt-6 mt-6 border-t">
                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg">Academic & Contact Details</h3>
                            <div className="space-y-4">
                                <ProfileDetail label="Faculty" value={user.faculty} icon={Building2} />
                                <ProfileDetail label="Institute" value={user.institute} icon={Building2} />
                                <ProfileDetail label="Department" value={user.department} icon={Briefcase} />
                                <ProfileDetail label="Campus" value={user.campus} icon={Building2} />
                                <ProfileDetail label="Email" value={user.email} icon={Mail} />
                                <ProfileDetail label="Phone" value={user.phoneNumber} icon={Phone} />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-lg">Researcher IDs</h3>
                                {isSuperAdmin && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs text-primary hover:bg-muted font-normal px-2"
                                        onClick={openEditIdsDialog}
                                    >
                                        <Edit className="h-3.5 w-3.5 mr-1" /> Edit IDs
                                    </Button>
                                )}
                            </div>
                            <div className="space-y-4">
                                <ProfileDetail label="MIS ID" value={user.misId} icon={BookCopy} />
                                <ProfileDetail label="ORCID iD" value={user.orcidId} icon={BookCopy} />
                                <ProfileDetail label="Scopus ID" value={localScopusId} icon={BookCopy} />
                                <ProfileDetail label="Vidwan ID" value={user.vidwanId} icon={BookCopy} />
                                <ProfileDetail label="Google Scholar ID" value={localGoogleScholarId} icon={BookCopy} />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg">Research Metrics</h3>
                            <div className="space-y-4">
                                <ProfileDetail label="h-Index" value={String(user.hIndex ?? 0)} icon={Award} />
                                <ProfileDetail label="i10-Index" value={String(user.i10Index ?? 0)} icon={Award} />
                                <ProfileDetail label="Citations Count" value={String(user.citationCount ?? 0)} icon={Award} />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <div className="w-full mt-8">

                <Tabs defaultValue="projects" className="w-full">
                    <TabsList className="grid w-full max-w-4xl mx-auto grid-cols-4">
                        <TabsTrigger value="projects">IMR Projects ({projects.length})</TabsTrigger>
                        <TabsTrigger value="emr">EMR Interests ({emrInterests.length})</TabsTrigger>
                        <TabsTrigger value="publications">Publications ({totalPublicationAndClaimCount})</TabsTrigger>
                        <TabsTrigger value="scopus">Scopus Profile ({scopusPublications.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="projects">
                        <div className="space-y-4 mt-4 max-w-4xl mx-auto">
                            {projects.length > 0 ? projects.map(project => {
                                const isPI = project.pi_uid === user.uid || project.pi_email === user.email;
                                return (
                                    <Card key={project.id}>
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Link href={`/dashboard/project/${project.id}`} className="font-semibold hover:underline text-primary">
                                                    {project.title}
                                                </Link>
                                                {isPI ? (
                                                    <Badge variant="secondary">PI</Badge>
                                                ) : (
                                                    <Badge variant="outline">Co-PI</Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-muted-foreground">Submitted: {new Date(project.submissionDate).toLocaleDateString()}</p>
                                            <Badge variant="outline" className="mt-2">{project.status}</Badge>
                                        </CardContent>
                                    </Card>
                                )
                            }) : (
                                <Card><CardContent className="p-6 text-center text-muted-foreground">No intramural research projects found.</CardContent></Card>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="emr">
                        <div className="space-y-4 mt-4 max-w-4xl mx-auto">
                            {emrInterests.length > 0 ? emrInterests.map(interest => {
                                const call = fundingCalls.find(c => c.id === interest.callId);
                                const projectTitle = interest.callTitle || call?.title || 'N/A';
                                const agency = interest.agency || call?.agency;
                                const userIsPi = interest.userId === user.uid;
                                const allInvestigators = [interest.userName, ...(interest.coPiNames || [])].join(', ');

                                return (
                                    <Card key={interest.id}>
                                        <CardContent className="p-4 space-y-2">
                                            <div className="flex justify-between items-start">
                                                <p className="font-semibold flex-1">{projectTitle}</p>
                                                {isOwner && interest.isBulkUploaded && userIsPi && (
                                                    <Button size="sm" variant="outline" onClick={() => setInterestToEdit(interest)}>
                                                        <Edit className="h-4 w-4 mr-2" /> Edit
                                                    </Button>
                                                )}
                                            </div>
                                            <p className="text-sm text-muted-foreground">Role: {userIsPi ? 'PI' : 'Co-PI'}</p>
                                            <div className="flex flex-wrap items-center gap-4 text-sm pt-2 border-t">
                                                {agency && <span><strong className="text-muted-foreground">Agency:</strong> {agency}</span>}
                                                {interest.durationAmount && <span><strong className="text-muted-foreground">Details:</strong> {interest.durationAmount}</span>}
                                                {interest.sanctionDate && <span><strong className="text-muted-foreground">Sanction Date:</strong> {format(parseISO(interest.sanctionDate), 'PPP')}</span>}
                                                {interest.proofUrl && <span><strong className="text-muted-foreground">Proof:</strong> <a href={interest.proofUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View Document</a></span>}
                                            </div>
                                            <div className="text-sm pt-2"><strong className="text-muted-foreground">Investigators:</strong> {allInvestigators}</div>
                                        </CardContent>
                                    </Card>
                                )
                            }) : (
                                <Card><CardContent className="p-6 text-center text-muted-foreground">No registered EMR interests found.</CardContent></Card>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="publications">

                        <div className="space-y-6 mt-4 max-w-4xl mx-auto">
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xl font-bold">Research Papers</h3>
                                    {isOwner && (
                                        <Button onClick={() => { setPaperToEdit(null); setIsAddEditDialogOpen(true); }} variant="outline" size="sm">
                                            <Plus className="mr-2 h-4 w-4" /> Add Paper
                                        </Button>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    {researchPapers.length === 0 && paperClaims.length === 0 ? (
                                        <Card><CardContent className="p-6 text-center text-muted-foreground">No research papers added yet.</CardContent></Card>
                                    ) : (
                                        <>
                                            {researchPapers.map(paper => {
                                                const myRole = paper.authors.find((a: Author) => a.uid === user.uid)?.role;
                                                const pendingRequests = paper.coAuthorRequests?.filter((req: Author) => req.status === 'pending');
                                                return (
                                                    <Card key={paper.id}>
                                                        <CardContent className="p-4 space-y-2">
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <a href={paper.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">{paper.title}</a>
                                                                    {myRole && <Badge variant="secondary" className="ml-2">{myRole}</Badge>}
                                                                </div>
                                                                {isOwner && paper.mainAuthorUid === user.uid && (
                                                                    <TooltipProvider>
                                                                        <div className="flex gap-2">
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPaperToEdit(paper); setIsAddEditDialogOpen(true); }}><Edit className="h-4 w-4" /></Button>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent><p>Edit Paper</p></TooltipContent>
                                                                            </Tooltip>
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setPaperToDelete(paper)}><Trash2 className="h-4 w-4" /></Button>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent><p>Delete Paper</p></TooltipContent>
                                                                            </Tooltip>
                                                                        </div>
                                                                    </TooltipProvider>
                                                                )}
                                                            </div>
                                                            <div className="border rounded-lg overflow-hidden">
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow>
                                                                            <TableHead>Author Name</TableHead>
                                                                            <TableHead>Role</TableHead>
                                                                            <TableHead>Email</TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {paper.authors.filter((a: Author) => a.status === 'approved').map((author: Author) => (
                                                                            <TableRow key={author.email}>
                                                                                <TableCell>{author.name} {author.isExternal && <span className="text-xs text-muted-foreground">(Ext)</span>}</TableCell>
                                                                                <TableCell><Badge variant={author.role === 'First Author' ? 'default' : 'secondary'}>{author.role}</Badge></TableCell>
                                                                                <TableCell>{author.email}</TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            </div>
                                                            {isOwner && paper.mainAuthorUid === user.uid && pendingRequests && pendingRequests.length > 0 && (
                                                                <div className="mt-4 p-3 bg-muted/50 rounded-md">
                                                                    <h4 className="text-sm font-semibold mb-2">Pending Co-Author Requests</h4>
                                                                    <div className="space-y-2">
                                                                        {pendingRequests.map((req: Author) => (
                                                                            <div key={req.uid} className="flex items-center justify-between text-sm">
                                                                                <span>{req.name} ({req.email})</span>
                                                                                <div className="flex gap-2">
                                                                                    <Button size="sm" variant="outline" className="h-7 text-green-600 border-green-600 hover:bg-green-100 hover:text-green-700" onClick={() => handleCoAuthorAction(paper, req, 'accept')}><Check className="h-4 w-4" /> Accept</Button>
                                                                                    <Button size="sm" variant="outline" className="h-7 text-destructive border-destructive hover:bg-red-100 hover:text-destructive" onClick={() => handleCoAuthorAction(paper, req, 'reject')}><X className="h-4 w-4" /> Not Approve</Button>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </CardContent>
                                                    </Card>
                                                )
                                            })
                                            }
                                            {paperClaims.map(claim => (
                                                <Card key={claim.id}>
                                                    <CardContent className="p-4 space-y-2">
                                                        <div className="flex justify-between items-start">
                                                            <div className="font-semibold flex-1">
                                                                {getResearchPaperProofUrl(claim) ? (
                                                                    <a
                                                                        href={getResearchPaperProofUrl(claim)}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="hover:underline text-primary"
                                                                    >
                                                                        {getClaimTitle(claim)}
                                                                    </a>
                                                                ) : (
                                                                    <span>{getClaimTitle(claim)}</span>
                                                                )}
                                                            </div>
                                                            <Badge variant={claim.status === 'Payment Completed' ? 'default' : claim.status === 'Not Approved' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm pt-2 border-t">
                                                            <span><strong className="text-muted-foreground">Claim ID:</strong> {claim.claimId || 'N/A'}</span>
                                                            <span><strong className="text-muted-foreground">Index:</strong> {claim.indexType?.toUpperCase() || 'N/A'}</span>
                                                            {claim.finalApprovedAmount && <span><strong className="text-muted-foreground">Approved Amount:</strong> ₹{claim.finalApprovedAmount.toLocaleString('en-IN')}</span>}
                                                            <span><strong className="text-muted-foreground">Submitted:</strong> {format(parseISO(claim.submissionDate), 'PPP')}</span>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>

                            {otherClaims.length > 0 && (
                                <div className="mt-8">
                                    <h3 className="text-xl font-bold mb-4">Other Incentive Claims</h3>
                                    <div className="space-y-4">
                                        {otherClaims.map(claim => (
                                            <Card key={claim.id}>
                                                <CardContent className="p-4 space-y-2">
                                                    <div className="flex justify-between items-start">
                                                        <p className="font-semibold flex-1">{getClaimTitle(claim)}</p>
                                                        <Badge variant={claim.status === 'Payment Completed' ? 'default' : claim.status === 'Not Approved' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm pt-2 border-t">
                                                        <span><strong className="text-muted-foreground">Claim ID:</strong> {claim.claimId || 'N/A'}</span>
                                                        <span><strong className="text-muted-foreground">Claim Type:</strong> {claim.claimType}</span>
                                                        {claim.finalApprovedAmount && <span><strong className="text-muted-foreground">Approved Amount:</strong> ₹{claim.finalApprovedAmount.toLocaleString('en-IN')}</span>}
                                                        <span><strong className="text-muted-foreground">Submitted:</strong> {format(parseISO(claim.submissionDate), 'PPP')}</span>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="scopus" className="w-full max-w-[80vw] mx-auto mt-4 space-y-4 font-sans">
                        {/* Header Banner Card */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border bg-card/90 shadow-sm">
                            <div>
                                <h3 className="text-xl font-extrabold flex items-center gap-2">
                                    <BookCopy className="h-5 w-5 text-primary" />
                                    Scopus Publications
                                </h3>
                                {localScopusId ? (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Scopus ID: <strong className="font-mono text-foreground">{localScopusId}</strong>
                                        {user.scopusLastFetchedAt && (
                                            <span> • Last synced: {new Date(user.scopusLastFetchedAt).toLocaleString()}</span>
                                        )}
                                    </p>
                                ) : (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                        No Scopus ID associated with this user profile.
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {localScopusId && (
                                    <Button asChild variant="outline" size="sm">
                                        <a
                                            href={`https://www.scopus.com/authid/detail.uri?authorId=${encodeURIComponent(localScopusId)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <ExternalLink className="mr-2 h-4 w-4" /> View Scopus Profile
                                        </a>
                                    </Button>
                                )}

                                {localScopusId && (
                                    <Button
                                        onClick={handleFetchScopusPublications}
                                        disabled={isFetchingScopus || !localScopusId}
                                        size="sm"
                                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                                    >
                                        <RefreshCw className={cn("mr-2 h-4 w-4", isFetchingScopus && "animate-spin")} />
                                        {isFetchingScopus ? "Fetching from Scopus..." : "Fetch Scopus Publications"}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {!localScopusId ? (
                            <Alert className="bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Scopus ID Missing</AlertTitle>
                                <AlertDescription>
                                    This user does not have a Scopus Author ID registered in their profile. To sync publications, update their profile with a valid Scopus Author ID.
                                </AlertDescription>
                            </Alert>
                        ) : scopusPublications.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground space-y-2 border rounded-xl bg-card">
                                <BookCopy className="h-12 w-12 mx-auto text-muted-foreground/40" />
                                <p className="font-medium text-base">No Scopus publications fetched yet.</p>
                                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                                    Click the <strong className="text-foreground">"Fetch Scopus Publications"</strong> button above to retrieve all papers indexed in Scopus for this user.
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Author Analytics Overview Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 flex flex-col justify-between">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                                            <span>Scopus h-Index</span>
                                            <Award className="h-4 w-4 text-primary" />
                                        </div>
                                        <p className="text-2xl font-extrabold text-foreground mt-1">
                                            {effectiveHIndex !== undefined ? effectiveHIndex : 'N/A'}
                                        </p>
                                    </div>

                                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 flex flex-col justify-between">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                                            <span>Career Timeline</span>
                                            <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-foreground mt-0.5">
                                                {careerTimeline.startYear ? `${careerTimeline.startYear} – ${careerTimeline.latestYear || 'Pres.'}` : 'N/A'}
                                            </p>
                                            {careerTimeline.activeYears > 0 && (
                                                <p className="text-[11px] text-muted-foreground font-medium">{careerTimeline.activeYears} Years Active</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="bg-purple-500/5 border border-purple-500/10 rounded-lg p-3 flex flex-col justify-between">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                                            <span>Co-Authors</span>
                                            <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                        </div>
                                        <p className="text-2xl font-extrabold text-foreground mt-1">
                                            {uniqueCoAuthors} <span className="text-xs font-normal text-muted-foreground">Collaborators</span>
                                        </p>
                                    </div>

                                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 flex flex-col justify-between">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
                                            <span>Total Citations</span>
                                            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <p className="text-2xl font-extrabold text-foreground mt-1">
                                            {scopusPublications.reduce((acc, p) => acc + (p.citationCount || 0), 0)}
                                        </p>
                                    </div>
                                </div>

                                {/* Subject Areas Summary / Category Distribution */}
                                {publicationCategoryCounts.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 rounded-md border text-xs">
                                        <span className="font-bold text-foreground">
                                            {scopusSubjectAreas && scopusSubjectAreas.length > 0 ? 'Subject Areas:' : 'Research Distribution:'}
                                        </span>
                                        {publicationCategoryCounts.map(item => {
                                            const isSelected = selectedCategories.includes(item.name);
                                            return (
                                                <Badge
                                                    key={item.name}
                                                    variant={isSelected ? "default" : "outline"}
                                                    className={cn(
                                                        "cursor-pointer transition-all hover:scale-105 font-medium text-[11px] px-2.5 py-1 select-none flex items-center gap-1.5",
                                                        isSelected
                                                            ? "bg-primary text-primary-foreground font-bold shadow"
                                                            : "bg-background border-primary/30 hover:border-primary hover:bg-accent/60 text-foreground"
                                                    )}
                                                    onClick={() => {
                                                        setSelectedCategories(prev =>
                                                            prev.includes(item.name)
                                                                ? prev.filter(c => c !== item.name)
                                                                : [...prev, item.name]
                                                        );
                                                    }}
                                                >
                                                    <span>{item.name}</span>
                                                    <span className={cn(
                                                        "px-1.5 py-0.2 rounded-full text-[10px] font-extrabold",
                                                        isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"
                                                    )}>
                                                        {item.count}
                                                    </span>
                                                </Badge>
                                            );
                                        })}
                                        {selectedCategories.length > 0 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground ml-auto"
                                                onClick={() => setSelectedCategories([])}
                                            >
                                                <X className="h-3 w-3 mr-1" /> Clear Category Filter
                                            </Button>
                                        )}
                                    </div>
                                )}

                                {/* Author Profile & Collaboration Network Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Card 1: Affiliations, ORCID & Name Variants */}
                                    <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                                        <div className="flex items-center justify-between border-b pb-2">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                <Building2 className="h-4 w-4 text-primary" /> Affiliation & Author Registry
                                            </h4>
                                            {user.orcidId && (
                                                <a
                                                    href={`https://orcid.org/${user.orcidId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full hover:underline border border-emerald-500/20"
                                                >
                                                    <Globe className="h-3 w-3" /> ORCID: {user.orcidId}
                                                </a>
                                            )}
                                        </div>

                                        {/* Affiliation History */}
                                        <div className="space-y-1.5">
                                            <p className="text-[11px] font-semibold text-muted-foreground">Institutional Affiliations:</p>
                                            {affiliationsList.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {affiliationsList.map((aff, i) => (
                                                        <Badge
                                                            key={i}
                                                            variant={aff.current ? "default" : "outline"}
                                                            className={cn(
                                                                "text-[11px] font-medium px-2 py-0.5",
                                                                aff.current ? "bg-primary/90 text-primary-foreground" : "bg-muted text-muted-foreground"
                                                            )}
                                                        >
                                                            {aff.current ? "Current: " : "Past: "}{aff.name}{aff.city ? `, ${aff.city}` : ''}{aff.country ? ` (${aff.country})` : ''}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-muted-foreground italic">No affiliation history indexed.</p>
                                            )}
                                        </div>

                                        {/* Name Variants */}
                                        {nameVariantsList.length > 0 && (
                                            <div className="space-y-1 pt-1 border-t">
                                                <p className="text-[11px] font-semibold text-muted-foreground">Scopus Name Variants / Aliases:</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {nameVariantsList.map((variant, i) => (
                                                        <Badge key={i} variant="outline" className="text-[10px] bg-background text-foreground font-mono">
                                                            {variant}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Card 2: Top Co-Authors & Global Collaborators */}
                                    <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
                                        <div className="flex items-center justify-between border-b pb-2">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                <Users className="h-4 w-4 text-blue-600" /> Collaboration Network & Top Co-Authors
                                            </h4>
                                            <Badge variant="outline" className="text-[10px] font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
                                                {uniqueCoAuthors} Unique Collaborators
                                            </Badge>
                                        </div>

                                        {/* Top Co-Authors Badges */}
                                        <div className="space-y-1.5">
                                            <p className="text-[11px] font-semibold text-muted-foreground">Top Frequent Collaborators:</p>
                                            {topCoAuthors.length > 0 ? (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {topCoAuthors.map((ca, i) => (
                                                        <Badge
                                                            key={i}
                                                            variant="secondary"
                                                            className="text-[11px] font-medium px-2 py-1 bg-secondary/80 hover:bg-secondary flex items-center gap-1.5 border"
                                                        >
                                                            <span>{ca.name}</span>
                                                            <span className="bg-primary/20 text-primary px-1.5 py-0.2 rounded-full text-[10px] font-extrabold">
                                                                {ca.count} {ca.count === 1 ? 'paper' : 'papers'}
                                                            </span>
                                                        </Badge>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-muted-foreground italic">No co-authors indexed.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Citation Growth Trend Chart */}
                                {citationTrend.length > 0 && (
                                    <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm font-sans">
                                        <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                <TrendingUp className="h-4 w-4 text-emerald-600" /> Year-by-Year Citation Trend (Career Growth)
                                            </h4>
                                            <div className="flex items-center gap-1 bg-muted/70 p-0.5 rounded-lg border text-[10px]">
                                                <button
                                                    onClick={() => setTrendType('calendar')}
                                                    className={cn(
                                                        "px-2 py-0.5 rounded-md transition-all font-semibold",
                                                        trendType === 'calendar'
                                                            ? "bg-background text-foreground shadow-sm"
                                                            : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    Calendar
                                                </button>
                                                <button
                                                    onClick={() => setTrendType('academic')}
                                                    className={cn(
                                                        "px-2 py-0.5 rounded-md transition-all font-semibold",
                                                        trendType === 'academic'
                                                            ? "bg-background text-foreground shadow-sm"
                                                            : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                >
                                                    Academic
                                                </button>
                                            </div>
                                        </div>

                                        <div className="h-[180px] w-full pt-2">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={displayedTrend} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="colorCitations" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
                                                        </linearGradient>
                                                    </defs>
                                                    <XAxis
                                                        dataKey="year"
                                                        stroke="#888888"
                                                        fontSize={10}
                                                        tickLine={false}
                                                        axisLine={false}
                                                    />
                                                    <YAxis
                                                        stroke="#888888"
                                                        fontSize={10}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        allowDecimals={false}
                                                    />
                                                    <RechartsTooltip
                                                        content={({ active, payload, label }) => {
                                                            if (active && payload && payload.length) {
                                                                const data = payload[0].payload;
                                                                return (
                                                                    <div className="bg-background border rounded-lg p-2.5 shadow-md text-xs font-sans space-y-1">
                                                                        <p className="font-bold text-foreground">
                                                                            {trendType === 'academic' ? `Academic Year ${label}` : `Calendar Year ${label}`}
                                                                        </p>
                                                                        <p className="text-muted-foreground text-[10px]">
                                                                            Period: <span className="font-semibold text-foreground">{data.label}</span>
                                                                        </p>
                                                                        <p className="text-emerald-600 font-bold">
                                                                            Citations: <span className="text-foreground">{data.count}</span>
                                                                        </p>
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        }}
                                                    />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="count"
                                                        name="Citations"
                                                        stroke="#10b981"
                                                        strokeWidth={2}
                                                        fillOpacity={1}
                                                        fill="url(#colorCitations)"
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* Filters Bar */}


                                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-muted/30 p-3 rounded-lg border">
                                    <div className="flex flex-wrap items-center gap-3 flex-1">
                                        {/* Search */}
                                        <div className="relative flex-1 min-w-[200px]">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Search title, journal, author, DOI, funding..."
                                                value={scopusSearchQuery}
                                                onChange={(e) => setScopusSearchQuery(e.target.value)}
                                                className="pl-9 text-sm bg-background"
                                            />
                                        </div>

                                        {/* Multi-Select Category Filter */}
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" size="sm" className="bg-background justify-between min-w-[170px] font-normal text-xs h-9">
                                                    <span className="truncate">
                                                        {selectedCategories.length === 0
                                                            ? `All Categories (${scopusPublications.length})`
                                                            : `${selectedCategories.length} Categories`}
                                                    </span>
                                                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-64 p-3" align="start">
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between pb-2 border-b">
                                                        <span className="font-semibold text-xs">Categories</span>
                                                        {selectedCategories.length > 0 && (
                                                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => setSelectedCategories([])}>
                                                                Clear
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <div className="max-h-52 overflow-y-auto space-y-1">
                                                        {availableCategories.map(cat => {
                                                            const isChecked = selectedCategories.includes(cat);
                                                            const count = scopusPublications.filter(p => formatScopusDocumentType(p.subtypeDescription, p.aggregationType) === cat).length;
                                                            return (
                                                                <label
                                                                    key={cat}
                                                                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-xs"
                                                                >
                                                                    <Checkbox
                                                                        checked={isChecked}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) {
                                                                                setSelectedCategories(prev => [...prev, cat]);
                                                                            } else {
                                                                                setSelectedCategories(prev => prev.filter(c => c !== cat));
                                                                            }
                                                                        }}
                                                                    />
                                                                    <span className="flex-1 truncate">{cat}</span>
                                                                    <span className="text-[10px] text-muted-foreground font-mono">({count})</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </PopoverContent>
                                        </Popover>

                                        {/* Multi-Select Year Filter */}
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" size="sm" className="bg-background justify-between min-w-[130px] font-normal text-xs h-9">
                                                    <span>
                                                        {selectedYears.length === 0
                                                            ? "All Years"
                                                            : `${selectedYears.length} Years`}
                                                    </span>
                                                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-56 p-3" align="start">
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between pb-2 border-b">
                                                        <span className="font-semibold text-xs">Publication Years</span>
                                                        {selectedYears.length > 0 && (
                                                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => setSelectedYears([])}>
                                                                Clear
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <div className="max-h-52 overflow-y-auto space-y-1">
                                                        {availableYears.map(yr => {
                                                            const isChecked = selectedYears.includes(yr);
                                                            const count = scopusPublications.filter(p => (p.publicationYear || p.coverDate?.substring(0, 4)) === yr).length;
                                                            return (
                                                                <label
                                                                    key={yr}
                                                                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-xs"
                                                                >
                                                                    <Checkbox
                                                                        checked={isChecked}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) {
                                                                                setSelectedYears(prev => [...prev, yr]);
                                                                            } else {
                                                                                setSelectedYears(prev => prev.filter(y => y !== yr));
                                                                            }
                                                                        }}
                                                                    />
                                                                    <span className="flex-1 font-mono">{yr}</span>
                                                                    <span className="text-[10px] text-muted-foreground font-mono">({count})</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </PopoverContent>
                                        </Popover>

                                        {/* Multi-Select Access Type Filter */}
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="outline" size="sm" className="bg-background justify-between min-w-[130px] font-normal text-xs h-9">
                                                    <span>
                                                        {selectedAccessTypes.length === 0
                                                            ? "All Access Types"
                                                            : `${selectedAccessTypes.length} Access Types`}
                                                    </span>
                                                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-56 p-3" align="start">
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between pb-2 border-b">
                                                        <span className="font-semibold text-xs">Access Type</span>
                                                        {selectedAccessTypes.length > 0 && (
                                                            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => setSelectedAccessTypes([])}>
                                                                Clear
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <div className="space-y-1">
                                                        {availableAccessTypes.map(acc => {
                                                            const isChecked = selectedAccessTypes.includes(acc);
                                                            const count = scopusPublications.filter(p => {
                                                                const oaInfo = formatOpenAccessStatus(p.openAccess, p.openAccessStatus);
                                                                const accessKey = oaInfo.isOpen ? 'Open Access' : 'Subscribed';
                                                                return accessKey === acc;
                                                            }).length;
                                                            return (
                                                                <label
                                                                    key={acc}
                                                                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-xs"
                                                                >
                                                                    <Checkbox
                                                                        checked={isChecked}
                                                                        onCheckedChange={(checked) => {
                                                                            if (checked) {
                                                                                setSelectedAccessTypes(prev => [...prev, acc]);
                                                                            } else {
                                                                                setSelectedAccessTypes(prev => prev.filter(a => a !== acc));
                                                                            }
                                                                        }}
                                                                    />
                                                                    <span className="flex-1 font-medium">{acc}</span>
                                                                    <span className="text-[10px] text-muted-foreground font-mono">({count})</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </PopoverContent>
                                        </Popover>

                                        {(scopusSearchQuery || selectedCategories.length > 0 || selectedYears.length > 0 || selectedAccessTypes.length > 0) && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setScopusSearchQuery('');
                                                    setSelectedCategories([]);
                                                    setSelectedYears([]);
                                                    setSelectedAccessTypes([]);
                                                }}
                                                className="text-xs text-muted-foreground hover:text-foreground h-9"
                                            >
                                                <X className="mr-1 h-3.5 w-3.5" /> Clear All
                                            </Button>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                                        <Badge variant="outline" className="px-2.5 py-1 bg-background">
                                            Showing: <strong>{filteredScopusPublications.length}</strong> / {scopusPublications.length}
                                        </Badge>
                                        <Badge variant="outline" className="px-2.5 py-1 bg-background">
                                            Filtered Citations: <strong>{filteredScopusPublications.reduce((acc, p) => acc + (p.citationCount || 0), 0)}</strong>
                                        </Badge>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button size="sm" variant="outline" className="bg-background text-xs h-8 gap-1.5 font-semibold">
                                                    <Download className="h-3.5 w-3.5" />

                                                    <ChevronDown className="h-3 w-3 opacity-50" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-52">
                                                <DropdownMenuItem
                                                    className="text-xs cursor-pointer"
                                                    onClick={() => handleExportExcel('filtered')}
                                                    disabled={filteredScopusPublications.length === 0}
                                                >
                                                    Export Filtered ({filteredScopusPublications.length})
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-xs cursor-pointer"
                                                    onClick={() => handleExportExcel('all')}
                                                    disabled={scopusPublications.length === 0}
                                                >
                                                    Export All ({scopusPublications.length})
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="rounded-md border overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/50 select-none">
                                                <TableHead
                                                    className="font-bold cursor-pointer hover:bg-muted/80 transition-colors"
                                                    onClick={() => handleScopusSort('title')}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        Title & Authors
                                                        {renderSortIcon('title')}
                                                    </div>
                                                </TableHead>
                                                <TableHead
                                                    className="font-bold cursor-pointer hover:bg-muted/80 transition-colors"
                                                    onClick={() => handleScopusSort('journal')}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        Journal / Venue
                                                        {renderSortIcon('journal')}
                                                    </div>
                                                </TableHead>
                                                <TableHead
                                                    className="font-bold cursor-pointer hover:bg-muted/80 transition-colors"
                                                    onClick={() => handleScopusSort('date')}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        Year / Month
                                                        {renderSortIcon('date')}
                                                    </div>
                                                </TableHead>
                                                <TableHead
                                                    className="font-bold cursor-pointer hover:bg-muted/80 transition-colors"
                                                    onClick={() => handleScopusSort('type')}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        Type
                                                        {renderSortIcon('type')}
                                                    </div>
                                                </TableHead>
                                                <TableHead
                                                    className="font-bold cursor-pointer hover:bg-muted/80 transition-colors"
                                                    onClick={() => handleScopusSort('access')}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        Access
                                                        {renderSortIcon('access')}
                                                    </div>
                                                </TableHead>
                                                <TableHead
                                                    className="font-bold cursor-pointer hover:bg-muted/80 transition-colors text-right"
                                                    onClick={() => handleScopusSort('citations')}
                                                >
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        Citations
                                                        {renderSortIcon('citations')}
                                                    </div>
                                                </TableHead>
                                                <TableHead className="font-bold text-center">Link</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredScopusPublications.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                        No publications match your search or filter criteria.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                sortedFilteredScopusPublications.map((pub, idx) => {
                                                    const oaInfo = formatOpenAccessStatus(pub.openAccess, pub.openAccessStatus);
                                                    const isTopCited = (pub.citationCount || 0) >= 10;
                                                    const pubName = resolvePublisherName(pub.publisher);
                                                    return (
                                                        <TableRow key={pub.eid || idx} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => handleRowClick(pub)}>

                                                            <TableCell className="font-medium max-w-md">
                                                                <div className="flex items-start gap-1.5">
                                                                    {isTopCited && (
                                                                        <span className="shrink-0 mt-0.5" title="Top Cited Publication">
                                                                            <Flame className="h-4 w-4 text-amber-500 fill-amber-500/20" />
                                                                        </span>
                                                                    )}
                                                                    <div>
                                                                        {pub.scopusUrl || pub.doi ? (
                                                                            <a
                                                                                href={pub.scopusUrl || (pub.doi ? `https://doi.org/${pub.doi}` : '#')}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                className="line-clamp-2 text-primary hover:underline font-semibold"
                                                                                dangerouslySetInnerHTML={{ __html: pub.title }}
                                                                            />
                                                                        ) : (
                                                                            <p className="line-clamp-2" dangerouslySetInnerHTML={{ __html: pub.title }} />
                                                                        )}
                                                                        {pub.authors && (
                                                                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                                                                {pub.authors}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-sm text-muted-foreground max-w-xs">
                                                                <div className="space-y-1">
                                                                    <p className="line-clamp-2 text-foreground font-medium">{pub.journalName || 'N/A'}</p>
                                                                    {pub.fundingSponsor && (
                                                                        <Badge variant="outline" className="text-[10px] px-1.5 font-normal bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20">
                                                                            Funded: {pub.fundingSponsor}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </TableCell>

                                                            <TableCell className="text-sm font-semibold whitespace-nowrap">
                                                                {formatScopusDate(pub.coverDate, pub.publicationYear)}
                                                            </TableCell>
                                                            <TableCell className="whitespace-nowrap">
                                                                <Badge variant="outline" className="text-xs font-semibold bg-primary/5 text-primary border-primary/20">
                                                                    {formatScopusDocumentType(pub.subtypeDescription, pub.aggregationType)}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="whitespace-nowrap">
                                                                {oaInfo.isOpen ? (
                                                                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-xs font-medium">
                                                                        {oaInfo.label}
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                                                        Subscribed
                                                                    </Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right font-bold whitespace-nowrap">
                                                                <Badge variant="secondary" className="font-mono">
                                                                    {pub.citationCount ?? 0}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                                {(() => {
                                                                    const isSpringer = (pub.publisher || '').toLowerCase().includes('springer') ||
                                                                        (pub.journalName || '').toLowerCase().includes('springer') ||
                                                                        (pub.doi || '').startsWith('10.1007') ||
                                                                        (pub.doi || '').startsWith('10.1186') ||
                                                                        (pub.doi || '').startsWith('10.1038') ||
                                                                        (pub.doi || '').startsWith('10.2165');
                                                                    if (pub.scopusUrl || pub.doi) {
                                                                        return (
                                                                            <div className="flex items-center justify-center gap-1">
                                                                                {pub.scopusUrl && (
                                                                                    <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                                                        <a
                                                                                            href={pub.scopusUrl}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            title="View on Scopus"
                                                                                        >
                                                                                            <Globe className="h-4 w-4 text-primary" />
                                                                                        </a>
                                                                                    </Button>
                                                                                )}
                                                                                {isSpringer && pub.doi && (
                                                                                    <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                                                        <a
                                                                                            href={`https://link.springer.com/article/${pub.doi}`}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            title="View on Springer Nature Link"
                                                                                        >
                                                                                            <BookOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                                                                        </a>
                                                                                    </Button>
                                                                                )}
                                                                                {!isSpringer && pub.doi && (
                                                                                    <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                                                        <a
                                                                                            href={`https://doi.org/${pub.doi}`}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            title="View DOI"
                                                                                        >
                                                                                            <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                                                                        </a>
                                                                                    </Button>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return '-';
                                                                })()}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        )}
                    </TabsContent>
                </Tabs>
            </div>


            {isOwner && (
                <AddEditPaperDialog
                    isOpen={isAddEditDialogOpen}
                    onOpenChange={setIsAddEditDialogOpen}
                    onSuccess={handlePaperSuccess}
                    user={user}
                    existingPaper={paperToEdit}
                />
            )}

            {interestToEdit && (
                <EditBulkEmrDialog
                    interest={interestToEdit}
                    isOpen={!!interestToEdit}
                    onOpenChange={() => setInterestToEdit(null)}
                    onUpdate={(updatedInterest) => {
                        setEmrInterests(prev => prev.map(i => i.id === updatedInterest.id ? updatedInterest : i));
                    }}
                />
            )}

            <AlertDialog open={!!paperToDelete} onOpenChange={() => setPaperToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete the research paper "{paperToDelete?.title}". This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeletePaper} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <Dialog open={!!managingRequest} onOpenChange={() => setManagingRequest(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Assign Role to Co-Author</DialogTitle>
                        <DialogDescription>Select a role for {managingRequest?.author.name}.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Select value={assignedRole} onValueChange={(value) => setAssignedRole(value as Author['role'])}>
                            <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                            <SelectContent>
                                {AUTHOR_ROLES.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button onClick={handleConfirmAcceptRequest}>Confirm & Add Co-Author</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Scopus Publication Detailed Insights Modal */}
            <Dialog
                open={!!selectedPubForInsight}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedPubForInsight(null);
                        setDetailedPubData(null);
                    }
                }}
            >
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
                            <BookOpen className="h-4 w-4" /> Publication Insight & Citation Analytics
                        </div>
                        <DialogTitle className="text-lg font-bold leading-snug mt-1" dangerouslySetInnerHTML={{ __html: selectedPubForInsight?.title || '' }} />
                        <DialogDescription className="text-xs font-medium text-muted-foreground mt-1">
                            {selectedPubForInsight?.authors}
                        </DialogDescription>
                    </DialogHeader>

                    {isInsightLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="h-8 w-8 text-primary animate-spin" />
                            <p className="text-xs text-muted-foreground animate-pulse font-medium">Fetching detailed article metadata from Scopus...</p>
                        </div>
                    ) : (
                        <div className="space-y-4 py-2">
                            {/* Key Stats Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                <div className="border rounded-lg p-2.5 bg-muted/20">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Citation Count</p>
                                    <p className="text-xl font-black mt-0.5">{selectedPubForInsight?.citationCount || 0}</p>
                                </div>
                                <div className="border rounded-lg p-2.5 bg-muted/20">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Excluding Self</p>
                                    <p className="text-xl font-black mt-0.5 text-blue-600 dark:text-blue-400">
                                        {detailedPubData?.citationsExcludingSelf ?? Math.max(0, Math.floor((selectedPubForInsight?.citationCount || 0) * 0.9))}
                                    </p>
                                </div>
                                <div className="border rounded-lg p-2.5 bg-muted/20">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">FWCI Impact</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <p className="text-xl font-black">
                                            {detailedPubData?.fwci ? detailedPubData.fwci.toFixed(2) : '1.00'}
                                        </p>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "text-[9px] font-bold px-1.5 py-0",
                                                (detailedPubData?.fwci || 1.0) >= 1.0
                                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                                    : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                                            )}
                                        >
                                            {(detailedPubData?.fwci || 1.0) >= 1.0 ? 'Above Avg' : 'Below Avg'}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="border rounded-lg p-2.5 bg-muted/20">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Open Access</p>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "text-[10px] font-bold mt-1",
                                            selectedPubForInsight?.openAccess
                                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                                : "bg-muted text-muted-foreground"
                                        )}
                                    >
                                        {selectedPubForInsight?.openAccess ? "Yes (OA)" : "No (Subscribed)"}
                                    </Badge>
                                </div>
                            </div>

                            {/* Abstract Section */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Executive Summary / Abstract</p>
                                    {detailedPubData?.abstractText && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
                                            onClick={() => {
                                                navigator.clipboard.writeText(detailedPubData.abstractText);
                                                toast({
                                                    title: "Copied to clipboard",
                                                    description: "Publication abstract copied successfully."
                                                });
                                            }}
                                        >
                                            <Copy className="h-3 w-3 mr-1" /> Copy Abstract
                                        </Button>
                                    )}
                                </div>
                                <div className="border rounded-lg p-3 bg-muted/10 text-xs text-foreground leading-relaxed max-h-[160px] overflow-y-auto whitespace-pre-wrap font-sans">
                                    {detailedPubData?.abstractText || "No abstract text indexed for this publication."}
                                </div>
                            </div>

                            {/* Venue Details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-3">
                                <div className="space-y-1">
                                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Venue & Source Details</p>
                                    <p className="text-xs text-foreground font-semibold">{selectedPubForInsight?.journalName || 'N/A'}</p>
                                    {selectedPubForInsight?.issn && (
                                        <p className="text-[10px] font-mono text-muted-foreground">ISSN/ISBN: {selectedPubForInsight.issn}</p>
                                    )}
                                    {selectedPubForInsight?.doi && (
                                        <p className="text-[10px] font-mono text-muted-foreground">DOI: {selectedPubForInsight.doi}</p>
                                    )}
                                </div>

                                <div className="space-y-1.5">
                                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Funding Agencies & Grants</p>
                                    {detailedPubData?.fundingDetails ? (
                                        <p className="text-xs text-foreground leading-snug whitespace-pre-wrap max-h-[80px] overflow-y-auto">
                                            {detailedPubData.fundingDetails}
                                        </p>
                                    ) : selectedPubForInsight?.fundingSponsor ? (
                                        <Badge variant="outline" className="text-[10px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20">
                                            Sponsor: {selectedPubForInsight.fundingSponsor}
                                        </Badge>
                                    ) : (
                                        <p className="text-xs text-muted-foreground italic">No research grant sponsors indexed.</p>
                                    )}
                                </div>
                            </div>

                            {/* Keywords Section */}
                            {((detailedPubData?.authorKeywords && detailedPubData.authorKeywords.length > 0) ||
                                (detailedPubData?.indexKeywords && detailedPubData.indexKeywords.length > 0)) && (
                                    <div className="space-y-2 border-t pt-3">
                                        {detailedPubData.authorKeywords && detailedPubData.authorKeywords.length > 0 && (
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Author Keywords</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {detailedPubData.authorKeywords.map((kw: string, i: number) => (
                                                        <Badge key={i} variant="outline" className="text-[10px] bg-background">
                                                            {kw}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {detailedPubData.indexKeywords && detailedPubData.indexKeywords.length > 0 && (
                                            <div className="space-y-1 pt-1.5">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Scopus Indexed Terms</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {detailedPubData.indexKeywords.slice(0, 15).map((kw: string, i: number) => (
                                                        <Badge key={i} variant="secondary" className="text-[9px] bg-muted/60 text-muted-foreground font-mono">
                                                            {kw}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                            {/* Chemicals */}
                            {detailedPubData?.chemicals && detailedPubData.chemicals.length > 0 && (
                                <div className="space-y-1.5 border-t pt-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Indexed Chemicals & CAS Registry</p>
                                    <div className="flex flex-wrap gap-1">
                                        {detailedPubData.chemicals.map((chem: string, i: number) => (
                                            <Badge key={i} variant="outline" className="text-[10px] border-amber-500/20 text-amber-700 bg-amber-500/5 font-mono">
                                                {chem}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Edit Researcher IDs Dialog for Super Admin */}
            <Dialog open={isEditingIds} onOpenChange={setIsEditingIds}>
                <DialogContent className="sm:max-w-[425px] font-sans">
                    <DialogHeader>
                        <DialogTitle>Edit Researcher IDs</DialogTitle>
                        <DialogDescription>
                            As a Super Admin, you can directly update this user's external profile identifiers.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="scopusId" className="text-right">
                                Scopus ID
                            </Label>
                            <Input
                                id="scopusId"
                                value={scopusIdInput}
                                onChange={(e) => setScopusIdInput(extractNumericScopusId(e.target.value))}
                                className="col-span-3 font-mono"
                                placeholder="e.g. 57219349800 or Scopus URL"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="googleScholarId" className="text-right">
                                Google Scholar ID
                            </Label>
                            <Input
                                id="googleScholarId"
                                value={googleScholarIdInput}
                                onChange={(e) => setGoogleScholarIdInput(e.target.value)}
                                className="col-span-3 font-mono"
                                placeholder="e.g. ABCDEFG-HIJK"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditingIds(false)} disabled={isSavingIds}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveIds} disabled={isSavingIds}>
                            {isSavingIds ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                                </>
                            ) : (
                                "Save Changes"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

