'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Plus, Trash2, Loader2, UserPlus, Globe, Users, Check } from 'lucide-react';
import { findUserByMisId } from '@/app/userfinding';
import { FoundUser, Author, PatentInventor } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface AuthorSearchProps {
    onAdd: (author: any) => void;
    authors: any[];
    availableRoles?: string[];
    title?: string;
    addButtonLabel?: string;
    currentUserEmail?: string;
    type?: 'author' | 'inventor' | 'applicant';
}

export function AuthorSearch({
    onAdd,
    authors,
    availableRoles = [],
    title = "Add Member",
    addButtonLabel = "Add Member",
    currentUserEmail,
    type = 'author'
}: AuthorSearchProps) {
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [foundUsers, setFoundUsers] = useState<FoundUser[]>([]);
    const [showResults, setShowResults] = useState(false);

    // External author state
    const [extName, setExtName] = useState('');
    const [extEmail, setExtEmail] = useState('');
    const [extOrg, setExtOrg] = useState('');
    const [extRole, setExtRole] = useState<string>(availableRoles[0] || 'Co-Author');

    const handleSearch = (val: string) => {
        setSearchTerm(val);
        if (val.length < 2) {
            setFoundUsers([]);
            setShowResults(false);
            setIsSearching(false);
            return;
        }

        // Immediate clearing of results to prevent stale data flash
        setFoundUsers([]);
        setIsSearching(true);
        setShowResults(true);
    };

    useEffect(() => {
        if (searchTerm.length < 2) {
            return;
        }

        const debounceTimer = setTimeout(async () => {
            try {
                const result = await findUserByMisId(searchTerm);
                if (result.success && result.users) {
                    setFoundUsers(result.users);
                } else {
                    setFoundUsers([]);
                }
            } catch (error) {
                console.error("Search failed:", error);
                setFoundUsers([]);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(debounceTimer);
    }, [searchTerm]);

    const handleAddInternal = (user: FoundUser) => {
        if (currentUserEmail && user.email?.toLowerCase() === currentUserEmail.toLowerCase()) {
            toast({ variant: 'destructive', title: 'Cannot Add Self', description: 'You are already the primary claimant.' });
            return;
        }

        if (authors.some((a: any) => a.email?.toLowerCase() === user.email?.toLowerCase() || (a.misId && a.misId === user.misId))) {
            toast({ variant: 'destructive', title: 'Already Added', description: 'This user is already in your list.' });
            return;
        }

        const newAuthor: any = {
            name: user.name,
            email: user.email,
            uid: user.uid,
            isExternal: false, // If found in search, they ARE internal
            organization: user.campus || 'Goa',
            status: 'pending'
        };

        if (type === 'author') {
            newAuthor.role = availableRoles.includes('Co-Author') ? 'Co-Author' : (availableRoles[0] || 'Co-Author');
        } else {
            newAuthor.misId = user.misId || '';
        }

        onAdd(newAuthor);
        setSearchTerm('');
        setFoundUsers([]);
        setShowResults(false);
        toast({ title: 'Added Successfully', description: `${user.name} has been added.` });
    };

    const handleAddExternal = () => {
        if (!extName.trim()) {
            toast({ variant: 'destructive', title: 'Name Required', description: 'Please enter the external author\'s name.' });
            return;
        }

        if (!extOrg.trim()) {
            toast({ variant: 'destructive', title: 'Organization Required', description: 'Please enter the external author\'s organization/affiliation.' });
            return;
        }

        if (extEmail && authors.some((a: any) => a.email?.toLowerCase() === extEmail.toLowerCase())) {
            toast({ variant: 'destructive', title: 'Already Added', description: 'This person is already added.' });
            return;
        }

        const isInternalEmail = extEmail.trim().toLowerCase().endsWith('@paruluniversity.ac.in');

        const newAuthor: any = {
            name: extName.trim(),
            email: extEmail.trim().toLowerCase(),
            organization: isInternalEmail ? 'Parul University Goa' : extOrg.trim(),
            isExternal: !isInternalEmail,
            uid: null,
            status: 'pending'
        };

        if (type === 'author') {
            newAuthor.role = extRole;
        } else {
            newAuthor.misId = '';
        }

        onAdd(newAuthor);
        setExtName('');
        setExtEmail('');
        setExtOrg('');
        toast({ title: 'Added Successfully', description: `${extName} (External) has been added.` });
    };

    return (
        <div className="space-y-6">
            {/* Inline Internal Search */}
            <div className="relative space-y-2">
                <Label className="text-sm font-semibold flex items-center gap-2">
                    <Search className="h-4 w-4" /> {title}
                </Label>
                <div className="flex gap-2 relative">
                    <div className="relative flex-1 group">
                        <Input
                            placeholder="Type name or MIS ID to search internally..."
                            value={searchTerm}
                            onChange={(e) => handleSearch(e.target.value)}
                            onFocus={() => searchTerm.length >= 2 && setShowResults(true)}
                            className="h-10 pr-10 focus-visible:ring-primary shadow-sm"
                        />
                        {isSearching && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                        )}
                        {!isSearching && searchTerm && (
                            <button
                                onClick={() => { setSearchTerm(''); setFoundUsers([]); setShowResults(false); }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-primary transition-colors"
                            >
                                <X className="h-4 w-4 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Floating Results List */}
                {showResults && (searchTerm.length >= 2) && (
                    <div className="absolute z-[50] mt-1 w-full bg-background border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 ring-1 ring-black/5">
                        <div className="max-h-[300px] overflow-y-auto">
                            {foundUsers.length > 0 ? (
                                <div className="p-1">
                                    {foundUsers.map((user) => (
                                        <button
                                            key={user.email || user.misId}
                                            type="button"
                                            onClick={() => handleAddInternal(user)}
                                            className="w-full flex flex-col items-start gap-1 p-3 hover:bg-accent hover:text-accent-foreground transition-colors border-b last:border-0 text-left"
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <span className="font-semibold text-sm">{user.name} ({user.misId})</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : !isSearching && (
                                <div className="p-8 text-center text-sm text-muted-foreground">
                                    No records found matching "{searchTerm}"
                                </div>
                            )}
                            {isSearching && foundUsers.length === 0 && (
                                <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                                </div>
                            )}
                        </div>
                        <div className="bg-muted/30 p-2 border-t text-[10px] text-center text-muted-foreground">
                            Press Escape or click outside to close
                        </div>
                    </div>
                )}
                {/* Backdrop for closing results */}
                {showResults && <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowResults(false)} />}
            </div>

            {/* External Member Form - Inline Pattern */}
            <div className="space-y-3 pt-2 border-t mt-4 border-dashed">
                <Label className="text-sm font-semibold flex items-center gap-2">
                    <Globe className="h-4 w-4" /> Add External {type === 'author' ? 'Author' : type === 'inventor' ? 'Inventor' : 'Applicant'}
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                    <div className="space-y-1">
                        <Label htmlFor="ext-name" className="text-[10px] uppercase font-bold text-muted-foreground">Name</Label>
                        <Input
                            id="ext-name"
                            placeholder="Full Name"
                            value={extName}
                            onChange={(e) => setExtName(e.target.value)}
                            className="h-9 shadow-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="ext-email" className="text-[10px] uppercase font-bold text-muted-foreground">Email (Optional)</Label>
                        <Input
                            id="ext-email"
                            placeholder="email@example.com"
                            value={extEmail}
                            onChange={(e) => setExtEmail(e.target.value)}
                            className="h-9 shadow-sm"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="ext-org" className="text-[10px] uppercase font-bold text-muted-foreground">Organization *</Label>
                        <Input
                            id="ext-org"
                            placeholder="Affiliation"
                            value={extOrg}
                            onChange={(e) => setExtOrg(e.target.value)}
                            className="h-9 shadow-sm"
                        />
                    </div>
                    <div className="flex gap-2 items-end">
                        {type === 'author' && (
                            <div className="flex-1 space-y-1">
                                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Role</Label>
                                <Select value={extRole} onValueChange={setExtRole}>
                                    <SelectTrigger className="h-9 shadow-sm">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableRoles.map((role: string) => (
                                            <SelectItem key={role} value={role}>{role}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <Button
                            type="button"
                            onClick={handleAddExternal}
                            disabled={!extName.trim() || !extOrg.trim()}
                            className="h-9 w-12 shrink-0 shadow-sm"
                        >
                            <Plus className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function X({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
    )
}

function ChevronDown({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="m6 9 6 6 6-6" />
        </svg>
    )
}
