

'use client';

import { useState, useEffect } from 'react';
import type { User, Project, EmrInterest, FundingCall, ResearchPaper, Author, CoPiDetails, IncentiveClaim } from '@/types';
import { uploadFileToServer } from '@/app/actions';
import { updateEmrInterestDetails } from '@/app/emr-actions';
import { findUserByMisId } from '@/app/userfinding';
import { addResearchPaper, checkUserOrStaff, updateResearchPaper, deleteResearchPaper, manageCoAuthorRequest } from '@/app/bulkpapers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bot, Loader2, Mail, Briefcase, Building2, BookCopy, Phone, Plus, UserPlus, X, Edit, Trash2, Search, Upload, CalendarDays, FileText, Check, UserCheck, UserX, Award } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '../ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import Link from 'next/link';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';


function ProfileDetail({ label, value, icon: Icon }: { label: string; value?: string; icon: React.ElementType }) {
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
                    <div><Label htmlFor="paperTitle" className="block text-sm font-medium">Paper Title</Label><Input id="paperTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter paper title" className="mt-1"/></div>
                    <div><Label htmlFor="paperUrl" className="block text-sm font-medium">Published Paper URL</Label><Input id="paperUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://doi.org/..." className="mt-1"/></div>
                    
                    <Separator />
                    <h3 className="text-md font-semibold pt-2">Journal Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><Label htmlFor="journalName" className="block text-sm font-medium">Journal Name</Label><Input id="journalName" value={journalName} onChange={(e) => setJournalName(e.target.value)} placeholder="e.g., Nature Communications" className="mt-1"/></div>
                        <div><Label htmlFor="journalWebsite" className="block text-sm font-medium">Journal Website</Label><Input id="journalWebsite" value={journalWebsite} onChange={(e) => setJournalWebsite(e.target.value)} placeholder="https://www.nature.com/ncomms/" className="mt-1"/></div>
                        <div><Label htmlFor="qRating" className="block text-sm font-medium">Q Rating</Label><Input id="qRating" value={qRating} onChange={(e) => setQRating(e.target.value)} placeholder="e.g., Q1" className="mt-1"/></div>
                        <div><Label htmlFor="impactFactor" className="block text-sm font-medium">Impact Factor</Label><Input id="impactFactor" type="number" value={impactFactor} onChange={(e) => setImpactFactor(e.target.value ? parseFloat(e.target.value) : '')} placeholder="e.g., 16.6" className="mt-1"/></div>
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
                                        <SelectTrigger className="w-[180px] h-8 text-xs"><SelectValue/></SelectTrigger>
                                        <SelectContent>{AUTHOR_ROLES.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent>
                                    </Select>
                                    {author.email !== user.email && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeAuthor(author.email)}><X className="h-4 w-4"/></Button>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <Separator />
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="internal-author" className="text-sm font-medium">Add Internal Co-Author</Label>
                            <div className="flex gap-2 mt-1">
                                <Input id="internal-author" value={coPiSearchTerm} onChange={(e) => setCoPiSearchTerm(e.target.value)} placeholder="Search by MIS ID"/>
                                <Button onClick={handleSearchCoPi} variant="outline" size="icon" disabled={!coPiSearchTerm.trim() || isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}</Button>
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
                                <Input value={externalAuthorName} onChange={(e) => setExternalAuthorName(e.target.value)} placeholder="External author's name"/>
                                <Input value={externalAuthorEmail} onChange={(e) => setExternalAuthorEmail(e.target.value)} placeholder="External author's email"/>
                                <Button onClick={addExternalAuthor} variant="outline" size="icon" disabled={!externalAuthorName.trim() || !externalAuthorEmail.trim()}><UserPlus className="h-4 w-4"/></Button>
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


export function ProfileClient({ user, projects, emrInterests: initialEmrInterests, fundingCalls, claims }: { user: User; projects: Project[], emrInterests: EmrInterest[], fundingCalls: FundingCall[], claims: IncentiveClaim[] }) {
    const [domain, setDomain] = useState<string | null>(user.researchDomain || null);
    const [loadingDomain, setLoadingDomain] = useState(false);
    const [researchPapers, setResearchPapers] = useState<ResearchPaper[]>([]);
    const [emrInterests, setEmrInterests] = useState(initialEmrInterests);
    const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
    const [paperToEdit, setPaperToEdit] = useState<ResearchPaper | null>(null);
    const [paperToDelete, setPaperToDelete] = useState<ResearchPaper | null>(null);
    const [interestToEdit, setInterestToEdit] = useState<EmrInterest | null>(null);
    const [managingRequest, setManagingRequest] = useState<{paper: ResearchPaper, author: Author} | null>(null);
    const [assignedRole, setAssignedRole] = useState<Author['role'] | ''>('');
    const { toast } = useToast();
    const [sessionUser, setSessionUser] = useState<User | null>(null);

    const fetchPapers = async () => {
        try {
            const res = await fetch(`/api/get-research-papers?userUid=${user.uid}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) { setResearchPapers(data.papers || []); }
                 else { setResearchPapers([]); }
            } else { setResearchPapers([]); }
        } catch (paperError) { setResearchPapers([]); }
    };

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) { setSessionUser(JSON.parse(storedUser)); }
        fetchPapers();
    }, [user.uid]);
    
    const handlePaperSuccess = (paper: ResearchPaper, isNew: boolean) => {
        if (isNew) { setResearchPapers(prev => [paper, ...prev]); } 
        else { setResearchPapers(prev => prev.map(p => p.id === paper.id ? paper : p)); }
        if (paper.domain) setDomain(paper.domain);
    };

    const handleDeletePaper = async () => {
        if (!paperToDelete || !sessionUser) return;
        const result = await deleteResearchPaper(paperToDelete.id, sessionUser.uid);
        if (result.success) {
            toast({ title: "Paper Deleted" });
            setResearchPapers(prev => prev.filter(p => p.id !== paperToDelete.id));
            setPaperToDelete(null);
        } else {
            toast({ title: "Error", description: result.error, variant: "destructive" });
        }
    };

    const handleCoAuthorAction = async (paper: ResearchPaper, author: Author, action: 'accept' | 'reject') => {
        if (action === 'accept') {
            setManagingRequest({paper, author});
        } else { // Reject
            const result = await manageCoAuthorRequest(paper.id, author, 'reject');
            if(result.success) {
                toast({title: "Request Rejected"});
                fetchPapers();
            } else {
                toast({title: "Error", description: result.error, variant: "destructive"});
            }
        }
    };
    
    const handleConfirmAcceptRequest = async () => {
        if (!managingRequest || !assignedRole) {
            toast({title: "Please assign a role", variant: "destructive"});
            return;
        }
        const { paper, author } = managingRequest;
        const result = await manageCoAuthorRequest(paper.id, author, 'accept', assignedRole);
        if (result.success) {
            toast({title: "Co-Author Approved"});
            setManagingRequest(null);
            setAssignedRole('');
            fetchPapers();
        } else {
            toast({title: "Error", description: result.error, variant: "destructive"});
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

    const paperClaims = claims.filter(c => c.claimType === 'Research Papers').filter((claim) => {
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

    const otherClaims = claims.filter(c => c.claimType !== 'Research Papers');
    const totalPublicationAndClaimCount = researchPapers.length + paperClaims.length + otherClaims.length;
    const totalApprovedAmount = claims.reduce((sum, claim) => sum + (claim.finalApprovedAmount || 0), 0);

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
                                <Button asChild variant="outline" className="mt-4 sm:mt-0">
                                    <a href={`mailto:${user.email}`}>
                                        <Mail className="mr-2 h-4 w-4" /> Email
                                    </a>
                                </Button>
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 pt-6 mt-6 border-t">
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
                            <h3 className="font-semibold text-lg">Researcher IDs</h3>
                            <div className="space-y-4">
                                <ProfileDetail label="MIS ID" value={user.misId} icon={BookCopy} />
                                <ProfileDetail label="ORCID iD" value={user.orcidId} icon={BookCopy} />
                                <ProfileDetail label="Scopus ID" value={user.scopusId} icon={BookCopy} />
                                <ProfileDetail label="Vidwan ID" value={user.vidwanId} icon={BookCopy} />
                                <ProfileDetail label="Google Scholar ID" value={user.googleScholarId} icon={BookCopy} />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="w-full max-w-4xl mt-8">
                <Tabs defaultValue="projects" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="projects">IMR Projects ({projects.length})</TabsTrigger>
                        <TabsTrigger value="emr">EMR Interests ({emrInterests.length})</TabsTrigger>
                        <TabsTrigger value="publications">Publications & Incentives ({totalPublicationAndClaimCount})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="projects">
                        <div className="space-y-4 mt-4">
                            {projects.length > 0 ? projects.map(project => {
                                const isPI = project.pi_uid === user.uid || project.pi_email === user.email;
                                return (
                                <Card key={project.id}>
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-semibold">{project.title}</p>
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
                            )}) : (
                                <Card><CardContent className="p-6 text-center text-muted-foreground">No intramural research projects found.</CardContent></Card>
                            )}
                        </div>
                    </TabsContent>
                    <TabsContent value="emr">
                        <div className="space-y-4 mt-4">
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
                                                    <Edit className="h-4 w-4 mr-2"/> Edit
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
                        <div className="space-y-6 mt-4">
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
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setPaperToEdit(paper); setIsAddEditDialogOpen(true); }}><Edit className="h-4 w-4"/></Button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent><p>Edit Paper</p></TooltipContent>
                                                                </Tooltip>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setPaperToDelete(paper)}><Trash2 className="h-4 w-4"/></Button>
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
                                                                            <Button size="sm" variant="outline" className="h-7 text-green-600 border-green-600 hover:bg-green-100 hover:text-green-700" onClick={() => handleCoAuthorAction(paper, req, 'accept')}><Check className="h-4 w-4"/> Accept</Button>
                                                                            <Button size="sm" variant="outline" className="h-7 text-destructive border-destructive hover:bg-red-100 hover:text-destructive" onClick={() => handleCoAuthorAction(paper, req, 'reject')}><X className="h-4 w-4"/> Reject</Button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        )})
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
                                                        <Badge variant={claim.status === 'Payment Completed' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
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
                                                        <Badge variant={claim.status === 'Payment Completed' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
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
        </div>
    );
}
