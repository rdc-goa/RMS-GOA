
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import type { User, IncentiveClaim } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { fetchAllClaimsAction, runBulkAiMatchAction, getSystemSettings } from '@/app/actions';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, ArrowUpDown, Sparkles, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ClaimDetailsDialog } from '@/components/incentives/claim-details-dialog';
import { ApprovalDialog } from '@/components/incentives/approval-dialog';
import { isPotentialDuplicate } from '@/lib/duplicate-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect } from '@/components/ui/multi-select';

const CLAIM_TYPES = [
    'Research Papers',
    'Patents',
    'Conference Presentations',
    'Book',
    'Book Chapter',
    'Membership of Professional Bodies',
    'Seed Money for APC',
    'Award',
    'EMR Sanction Project',
    'Workshop/FDP/Training'
];
type SortableKeys = 'userName' | 'claimType' | 'submissionDate' | 'status' | 'paperTitle';

export default function IncentiveApprovalsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [pendingClaims, setPendingClaims] = useState<IncentiveClaim[]>([]);
    const [historyClaims, setHistoryClaims] = useState<IncentiveClaim[]>([]);
    const [allClaimsForDup, setAllClaimsForDup] = useState<IncentiveClaim[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);

    const duplicateClaimsMap = useMemo(() => {
        const map = new Map<string, { isDuplicate: boolean; type: 'self' | 'cross'; originalClaimant: string; similarityScore?: number; reason?: string }>();
        if (!allClaimsForDup || allClaimsForDup.length === 0) return map;

        allClaimsForDup.forEach(a => {
            if (a.status === 'Draft') return;

            for (const b of allClaimsForDup) {
                if (a.id === b.id || b.status === 'Rejected' || b.status === 'Draft') continue;

                const duplicateInfo = isPotentialDuplicate(a, b);
                if (!duplicateInfo) continue;

                map.set(a.id, {
                    ...duplicateInfo,
                    originalClaimant: b.userName || "Another researcher"
                });
                break;
            }
        });

        return map;
    }, [allClaimsForDup]);

    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [approvalStage, setApprovalStage] = useState<number | null>(null);
    const [selectedClaim, setSelectedClaim] = useState<IncentiveClaim | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isApprovalOpen, setIsApprovalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [claimTypeFilter, setClaimTypeFilter] = useState<string[]>([]);
    const [facultyFilter, setFacultyFilter] = useState('all');
    const [instituteFilter, setInstituteFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'submissionDate', direction: 'descending' });
    const [activeTab, setActiveTab] = useState('pending');
    const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string>>(new Set());
    const [isBulkProcessOpen, setIsBulkProcessOpen] = useState(false);
    const [isAiMatching, setIsAiMatching] = useState(false);

    const handleRunAiMatch = async () => {
        if (!user || approvalStage === null) return;
        
        // Find claims that do not already have an AI confidence score
        const unverifiedClaims = pendingClaims.filter(c => !c.aiVerification || typeof c.aiVerification.confidenceScore !== 'number');
        
        if (unverifiedClaims.length === 0) {
            toast({
                title: "AI Match Up to Date",
                description: "All pending claims already have AI verification match scores!"
            });
            return;
        }

        const claimsToMatch = unverifiedClaims.slice(0, 5);
        const claimIdsToMatch = claimsToMatch.map(c => c.id);

        setIsAiMatching(true);
        toast({
            title: "AI Match Started",
            description: `Analyzing ${claimsToMatch.length} recent unverified claims. Please wait...`
        });

        try {
            const res = await runBulkAiMatchAction(claimIdsToMatch);
            if (res.success) {
                toast({
                    title: "AI Match Complete",
                    description: `Successfully analyzed ${claimsToMatch.length} claims and loaded their scores!`
                });
                await fetchClaimsAndUsers(user, approvalStage);
            } else {
                toast({
                    variant: "destructive",
                    title: "AI Match Failed",
                    description: res.error || "An error occurred during AI Match."
                });
            }
        } catch (e: any) {
            console.error("AI Match error:", e);
            toast({
                variant: "destructive",
                title: "AI Match Error",
                description: e.message || "Failed to run AI Match."
            });
        } finally {
            setIsAiMatching(false);
        }
    };

    const fetchClaimsAndUsers = useCallback(async (currentUser: User, stage: number) => {
        setLoading(true);
        try {
            const statusToFetch = `Pending Stage ${stage + 1} Approval`;
            const [combinedClaims, usersSnapshot, settings] = await Promise.all([
                fetchAllClaimsAction(currentUser),
                getDocs(query(collection(db, 'users'))),
                getSystemSettings()
            ]);

            const usersList = usersSnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as User));
            
            let pending = combinedClaims.filter(c => c.status === statusToFetch);
            
            if (stage === 0) {
                if (settings?.principalEmails) {
                    const userEmailLower = currentUser.email.toLowerCase();
                    const principalInstitutes = Object.entries(settings.principalEmails)
                        .filter(([_, email]) => email.toLowerCase() === userEmailLower)
                        .map(([inst, _]) => inst);
                    
                    if (principalInstitutes.length > 0) {
                        const uidToInstitute: Record<string, string> = {};
                        usersList.forEach(u => {
                            uidToInstitute[u.uid] = u.institute || '';
                        });
                        pending = pending.filter(claim => 
                            principalInstitutes.includes(uidToInstitute[claim.uid] || '')
                        );
                    } else {
                        pending = [];
                    }
                } else {
                    pending = [];
                }
            }

            const history = combinedClaims.filter(c => c.approvals?.[stage]?.approverUid === currentUser.uid);

            setPendingClaims(pending);
            setHistoryClaims(history);
            setAllClaimsForDup(combinedClaims);
            setAllUsers(usersList);

        } catch (error) {
            console.error('Error fetching data:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch claims or user data.' });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser) as User;
            setUser(parsedUser);
            const stage = parsedUser.allowedModules?.find(m => m.startsWith('incentive-approver-'))
                ? parseInt(parsedUser.allowedModules.find(m => m.startsWith('incentive-approver-'))!.split('-')[2], 10) - 1
                : null;

            setApprovalStage(stage);

            if (stage !== null) {
                fetchClaimsAndUsers(parsedUser, stage);
            } else {
                setLoading(false);
            }
        } else {
            setLoading(false);
        }
    }, [fetchClaimsAndUsers]);

    const handleViewDetails = (claim: IncentiveClaim) => {
        setSelectedClaim(claim);
        setIsDetailsOpen(true);
    };

    const handleOpenApproval = (claim: IncentiveClaim) => {
        setSelectedClaim(claim);
        setIsApprovalOpen(true);
    };

    const handleActionComplete = () => {
        if (user && approvalStage !== null) {
            fetchClaimsAndUsers(user, approvalStage);
        }
    };

    const getClaimTitle = (claim: IncentiveClaim) => {
        return claim.paperTitle || claim.patentTitle || claim.conferencePaperTitle || claim.publicationTitle || claim.professionalBodyName || claim.apcPaperTitle || claim.awardTitle || claim.emrProjectName || claim.workshopName || 'N/A';
    };

    const uniqueFaculties = useMemo(() => {
        const faculties = new Set([...pendingClaims, ...historyClaims].map(claim => claim.faculty).filter(Boolean));
        return Array.from(faculties).sort();
    }, [pendingClaims, historyClaims]);

    const uniqueInstitutes = useMemo(() => {
        const institutes = new Set(
            allUsers.map(u => u.institute).filter(Boolean) as string[]
        );
        return Array.from(institutes).sort();
    }, [allUsers]);

    const applyFiltersAndSort = useCallback((claims: IncentiveClaim[]) => {
        let filteredClaims = claims.filter(claim => {
            if (claimTypeFilter.length > 0) {
                const effectiveType = claim.claimType === 'Books'
                    ? (claim.bookApplicationType === 'Book Chapter' ? 'Book Chapter' : 'Book')
                    : claim.claimType;
                if (!claimTypeFilter.includes(effectiveType)) return false;
            }
            if (facultyFilter !== 'all' && claim.faculty !== facultyFilter) return false;
            if (instituteFilter !== 'all') {
                const claimUser = allUsers.find(u => u.uid === claim.uid);
                if (claimUser?.institute !== instituteFilter) return false;
            }
            if (!searchTerm) return true;
            const lowerCaseSearch = searchTerm.toLowerCase();
            return claim.userName.toLowerCase().includes(lowerCaseSearch) ||
                getClaimTitle(claim).toLowerCase().includes(lowerCaseSearch) ||
                (claim.claimId && claim.claimId.toLowerCase().includes(lowerCaseSearch));
        });

        filteredClaims.sort((a, b) => {
            const key = sortConfig.key;
            let aValue, bValue;

            if (key === 'paperTitle') {
                aValue = getClaimTitle(a) || '';
                bValue = getClaimTitle(b) || '';
            } else {
                aValue = a[key as keyof IncentiveClaim] || '';
                bValue = b[key as keyof IncentiveClaim] || '';
            }

            if (aValue < bValue) {
                return sortConfig.direction === 'ascending' ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === 'ascending' ? 1 : -1;
            }
            return 0;
        });

        return filteredClaims;
    }, [claimTypeFilter, facultyFilter, instituteFilter, searchTerm, sortConfig, allUsers]);

    const filteredPendingClaims = useMemo(() => applyFiltersAndSort(pendingClaims), [pendingClaims, applyFiltersAndSort]);
    const filteredHistoryClaims = useMemo(() => applyFiltersAndSort(historyClaims), [historyClaims, applyFiltersAndSort]);

    const requestSort = (key: SortableKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    if (loading) {
        return (
            <div className="container mx-auto py-10">
                <PageHeader title="Incentive Approvals" description="Loading claims awaiting your review..." />
                <Skeleton className="mt-8 h-64 w-full" />
            </div>
        )
    }

    if (approvalStage === null) {
        return (
            <div className="container mx-auto py-10">
                <PageHeader title="Access Denied" description="You do not have permission to view this page." />
            </div>
        )
    }

    const renderTable = (claimsList: IncentiveClaim[], isHistory = false) => {
        const allSelected = claimsList.length > 0 && claimsList.every(claim => selectedClaimIds.has(claim.id));
        return (
            <div className="hidden md:block">
                <Table>
                    <TableHeader><TableRow>
                        <TableHead className="w-12">
                            <Checkbox
                                checked={allSelected}
                                onCheckedChange={(checked) => {
                                    if (checked) {
                                        setSelectedClaimIds(new Set([...selectedClaimIds, ...claimsList.map(c => c.id)]));
                                    } else {
                                        const newSet = new Set(selectedClaimIds);
                                        claimsList.forEach(c => newSet.delete(c.id));
                                        setSelectedClaimIds(newSet);
                                    }
                                }}
                            />
                        </TableHead>
                        <TableHead><Button variant="ghost" onClick={() => requestSort('userName')}>Claimant <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                        <TableHead><Button variant="ghost" onClick={() => requestSort('paperTitle')}>Title <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                        <TableHead><Button variant="ghost" onClick={() => requestSort('claimType')}>Claim Type <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                        {claimTypeFilter.includes('Conference Presentations') && <TableHead>Conf. Dates &amp; Mode</TableHead>}
                        {approvalStage === 0 && <TableHead>AI Match %</TableHead>}
                        <TableHead><Button variant="ghost" onClick={() => requestSort('submissionDate')}>Submitted On <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                        {isHistory && <TableHead>Approved Amount</TableHead>}
                        <TableHead><Button variant="ghost" onClick={() => requestSort('status')}>Status <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                        {claimsList.map(claim => {
                            const claimant = allUsers.find(u => u.uid === claim.uid);
                            const hasProfileLink = !!claimant?.misId;
                            const profileLink = hasProfileLink
                                ? (claimant?.campus === 'Goa' ? `/goa/${claimant?.misId}` : `/profile/${claimant?.misId}`)
                                : '#';
                            const myApproval = (isHistory && Array.isArray(claim.approvals)) ? claim.approvals.find(a => a?.approverUid === user?.uid) : null;
                            return (
                                <TableRow key={claim.id}>
                                    <TableCell className="w-12">
                                        <Checkbox
                                            checked={selectedClaimIds.has(claim.id)}
                                            onCheckedChange={(checked) => {
                                                const newSet = new Set(selectedClaimIds);
                                                if (checked) {
                                                    newSet.add(claim.id);
                                                } else {
                                                    newSet.delete(claim.id);
                                                }
                                                setSelectedClaimIds(newSet);
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {hasProfileLink ? (
                                            <Link href={profileLink} target="_blank" className="text-primary hover:underline">
                                                {claim.userName}
                                            </Link>
                                        ) : (
                                            claim.userName
                                        )}
                                    </TableCell>
                                    <TableCell className="font-medium max-w-xs whitespace-normal break-words">
                                        <div className="flex flex-col gap-1">
                                            <span>{getClaimTitle(claim)}</span>
                                            {(() => {
                                                const dupInfo = duplicateClaimsMap.get(claim.id);
                                                if (!dupInfo) return null;
                                                return (
                                                    <Badge className={`w-fit mt-1 text-[10px] py-0.5 px-2 rounded-full font-black animate-pulse shadow-sm border-none ${
                                                        dupInfo.type === 'self'
                                                            ? "bg-red-500 hover:bg-red-600 text-white"
                                                            : "bg-amber-500 hover:bg-amber-600 text-black"
                                                    }`}>
                                                        {dupInfo.type === 'self'
                                                            ? "🛑 Duplicate: Self-Resubmission"
                                                            : `⚠️ Duplicate: Applied by ${dupInfo.originalClaimant}`}
                                                    </Badge>
                                                );
                                            })()}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">
                                            {claim.claimType === 'Books'
                                                ? (claim.bookApplicationType === 'Book Chapter' ? 'Book Chapter' : 'Book')
                                                : claim.claimType}
                                        </Badge>
                                    </TableCell>
                                    {claimTypeFilter.includes('Conference Presentations') && (
                                        <TableCell>
                                            <div className="flex flex-col gap-1 text-xs">
                                                {claim.conferenceMode && (
                                                    <span className={`inline-flex w-fit items-center px-2 py-0.5 rounded-full font-semibold ${
                                                        claim.conferenceMode === 'Online'
                                                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                                            : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                                                    }`}>
                                                        {claim.conferenceMode === 'Online' ? '🌐' : '📍'} {claim.conferenceMode}
                                                    </span>
                                                )}
                                                <span className="text-muted-foreground">
                                                    {claim.conferenceDate || '—'} → {(claim as any).conferenceEndDate || '—'}
                                                </span>
                                            </div>
                                        </TableCell>
                                    )}
                                    {approvalStage === 0 && (
                                        <TableCell>
                                            {claim.aiVerification ? (
                                                <div className="flex flex-col gap-1">
                                                    <span className={`inline-flex items-center gap-1 font-black text-xs px-2 py-0.5 rounded-full w-fit ${
                                                        claim.aiVerification.confidenceScore >= 80
                                                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                                            : claim.aiVerification.confidenceScore >= 50
                                                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                                    }`}>
                                                        🤖 {claim.aiVerification.confidenceScore}%
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground font-semibold">
                                                        {claim.aiVerification.isAuthentic ? "Authentic" : "Flagged"}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </TableCell>
                                    )}
                                    <TableCell>{new Date(claim.submissionDate).toLocaleDateString()}</TableCell>
                                    {isHistory && <TableCell>₹{myApproval?.approvedAmount.toLocaleString('en-IN') || 'N/A'}</TableCell>}
                                    <TableCell><Badge variant={claim.status === 'Accepted' || claim.status === 'Submitted to Accounts' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge></TableCell>
                                    <TableCell className="text-right space-x-2">
                                        <Button variant="outline" onClick={() => handleViewDetails(claim)}>
                                            <Eye className="h-4 w-4 mr-2" />
                                            View Details
                                        </Button>
                                        {!isHistory && (
                                            <Button onClick={() => handleOpenApproval(claim)}>
                                                Take Action
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>
        )
    };

    const renderCards = (claimsList: IncentiveClaim[], isHistory = false) => (
        <div className="grid md:hidden grid-cols-1 sm:grid-cols-2 gap-4">
            {claimsList.map(claim => {
                const claimant = allUsers.find(u => u.uid === claim.uid);
                const hasProfileLink = !!claimant?.misId;
                const profileLink = hasProfileLink
                    ? (claimant?.campus === 'Goa' ? `/goa/${claimant?.misId}` : `/profile/${claimant?.misId}`)
                    : '#';
                const myApproval = (isHistory && Array.isArray(claim.approvals)) ? claim.approvals.find(a => a?.approverUid === user?.uid) : null;

                return (
                    <Card key={claim.id}>
                        <CardHeader>
                            <CardTitle className="text-base break-words">
                                <div className="flex flex-col gap-1">
                                    <span>{getClaimTitle(claim)}</span>
                                    {(() => {
                                        const dupInfo = duplicateClaimsMap.get(claim.id);
                                        if (!dupInfo) return null;
                                        return (
                                            <Badge className={`w-fit text-[10px] py-0.5 px-2 rounded-full font-black animate-pulse shadow-sm border-none ${
                                                dupInfo.type === 'self'
                                                    ? "bg-red-500 hover:bg-red-600 text-white"
                                                    : "bg-amber-500 hover:bg-amber-600 text-black"
                                            }`}>
                                                {dupInfo.type === 'self'
                                                    ? "🛑 Duplicate: Self-Resubmission"
                                                    : `⚠️ Duplicate: Applied by ${dupInfo.originalClaimant}`}
                                            </Badge>
                                        );
                                    })()}
                                </div>
                            </CardTitle>
                            <CardDescription>
                                Claimant: {' '}
                                {hasProfileLink ? (
                                    <Link href={profileLink} target="_blank" className="text-primary hover:underline">{claim.userName}</Link>
                                ) : (
                                    claim.userName
                                )}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground">Submitted On</p>
                                <p className="text-sm">{new Date(claim.submissionDate).toLocaleDateString()}</p>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground">Claim Type</p>
                                <Badge variant="outline">
                                    {claim.claimType === 'Books'
                                        ? (claim.bookApplicationType === 'Book Chapter' ? 'Book Chapter' : 'Book')
                                        : claim.claimType}
                                </Badge>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-muted-foreground">Status</p>
                                <Badge variant={claim.status === 'Accepted' || claim.status === 'Submitted to Accounts' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
                            </div>
                            {isHistory && myApproval && (
                                <div>
                                    <p className="text-xs font-semibold text-muted-foreground">Approved Amount</p>
                                    <p>₹{myApproval.approvedAmount.toLocaleString('en-IN') || 'N/A'}</p>
                                </div>
                            )}
                        </CardContent>
                        <CardContent className="flex flex-col gap-2">
                            <Button variant="outline" onClick={() => handleViewDetails(claim)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                            </Button>
                            {!isHistory && (
                                <Button onClick={() => handleOpenApproval(claim)}>
                                    Take Action
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    );

    const tabs = [
        { value: "pending", label: `Pending For My Approval (${filteredPendingClaims.length})`, content: renderTable(filteredPendingClaims), mobileContent: renderCards(filteredPendingClaims), count: filteredPendingClaims.length },
        { value: "history", label: `My History (${filteredHistoryClaims.length})`, content: renderTable(filteredHistoryClaims, true), mobileContent: renderCards(filteredHistoryClaims, true), count: filteredHistoryClaims.length }
    ];

    return (
        <>
            <div className="container mx-auto py-10">
                <PageHeader title={`Incentive Approvals (Stage ${approvalStage + 1})`} description="Claims awaiting your review and approval." />
                <div className="flex flex-col sm:flex-row items-center py-4 gap-4">
                    <Input
                        placeholder="Filter by claimant, title, or Claim ID..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className="w-full sm:max-w-sm"
                    />
                    {selectedClaimIds.size === 0 && (
                        <>
                            <MultiSelect
                                options={CLAIM_TYPES.map(type => ({ label: type, value: type }))}
                                selectedValues={claimTypeFilter}
                                onChange={setClaimTypeFilter}
                                placeholder="All Claim Types"
                                className="w-full sm:w-[220px]"
                            />
                            <Select value={facultyFilter} onValueChange={setFacultyFilter}>
                                <SelectTrigger className="w-full sm:w-[200px]">
                                    <SelectValue placeholder="Filter by faculty" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Faculties</SelectItem>
                                    {uniqueFaculties.map(faculty => (
                                        <SelectItem key={faculty} value={faculty}>{faculty}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={instituteFilter} onValueChange={setInstituteFilter}>
                                <SelectTrigger className="w-full sm:w-[200px]">
                                    <SelectValue placeholder="Filter by institute" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Institutes</SelectItem>
                                    {uniqueInstitutes.map(institute => (
                                        <SelectItem key={institute} value={institute}>{institute}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </>
                    )}
                    {selectedClaimIds.size === 0 && approvalStage === 0 && (
                        <Button 
                            onClick={handleRunAiMatch} 
                            disabled={isAiMatching} 
                            className="sm:ml-auto w-full sm:w-auto bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold flex items-center gap-2 shadow-md hover:shadow-lg transition-all"
                        >
                            {isAiMatching ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Matching...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4" />
                                    Run AI Match
                                </>
                            )}
                        </Button>
                    )}
                    {selectedClaimIds.size > 0 && (
                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={() => {
                                setSelectedClaimIds(new Set());
                            }}>
                                Deselect All ({selectedClaimIds.size})
                            </Button>
                            {activeTab === 'pending' && approvalStage === 4 && (
                                <Button onClick={() => setIsBulkProcessOpen(true)} className="bg-primary hover:bg-primary/90">
                                    Bulk Actions ({selectedClaimIds.size})
                                </Button>
                            )}
                        </div>
                    )}
                </div>
                <div className="mt-4">
                    <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="grid w-full grid-cols-2">
                            {tabs.map(tab => (
                                <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
                            ))}
                        </TabsList>
                        {tabs.map(tab => (
                            <TabsContent key={tab.value} value={tab.value} className="mt-4">
                                <Card>
                                    <CardContent className="pt-6">
                                        {tab.count > 0 ? (
                                            <>
                                                {tab.content}
                                                {tab.mobileContent}
                                            </>
                                        ) : (
                                            <div className="text-center py-12 text-muted-foreground">
                                                <p>There are no claims in this category.</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        ))}
                    </Tabs>
                </div>
            </div>
            {selectedClaim && user && (
                <>
                    <ClaimDetailsDialog
                        claim={selectedClaim}
                        open={isDetailsOpen}
                        onOpenChange={setIsDetailsOpen}
                        currentUser={user}
                        claimant={allUsers.find(u => u.uid === selectedClaim?.uid) || null}
                        onTakeAction={!historyClaims.some(c => c.id === selectedClaim.id) ? () => {
                            setIsDetailsOpen(false);
                            handleOpenApproval(selectedClaim);
                        } : undefined}
                        duplicateInfo={selectedClaim ? duplicateClaimsMap.get(selectedClaim.id) : null}
                    />
                    <ApprovalDialog
                        claim={selectedClaim}
                        approver={user}
                        claimant={allUsers.find(u => u.uid === selectedClaim.uid) || null}
                        stageIndex={approvalStage}
                        isOpen={isApprovalOpen}
                        onOpenChange={setIsApprovalOpen}
                        onActionComplete={handleActionComplete}
                    />
                </>
            )}
            <BulkProcessDialog
                isOpen={isBulkProcessOpen}
                onOpenChange={setIsBulkProcessOpen}
                claims={pendingClaims.filter(c => selectedClaimIds.has(c.id))}
                approver={user}
                stageIndex={approvalStage || 0}
                onActionComplete={() => {
                    setSelectedClaimIds(new Set());
                    handleActionComplete();
                }}
            />
        </>
    );
}

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';


function BulkProcessDialog({
    isOpen,
    onOpenChange,
    claims,
    approver,
    stageIndex,
    onActionComplete
}: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    claims: IncentiveClaim[];
    approver: User | null;
    stageIndex: number;
    onActionComplete: () => void;
}) {
    const { toast } = useToast();
    const [comments, setComments] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const totalAmount = claims.reduce((sum, claim) => sum + (claim.finalApprovedAmount || claim.calculatedIncentive || 0), 0);

    const handleBulkAction = async (action: 'approve' | 'reject') => {
        if (!approver) return;

        setIsProcessing(true);
        try {
            const { bulkProcessIncentiveClaimsAction } = await import('@/services/incentive-service');
            const result = await bulkProcessIncentiveClaimsAction(
                claims.map(c => c.id),
                action,
                approver,
                stageIndex,
                { comments }
            );

            if (result.success) {
                toast({ title: 'Success', description: `Successfully processed ${result.processedCount} claims.` });
                onOpenChange(false);
                onActionComplete();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Bulk Process Claims</DialogTitle>
                    <DialogDescription>
                        You are about to process {claims.length} claims in one go.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="bg-muted/50 p-4 rounded-lg flex justify-between items-center">
                        <div>
                            <p className="text-sm text-muted-foreground font-medium">Selected Claims</p>
                            <p className="text-2xl font-bold">{claims.length}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-muted-foreground font-medium">Total Approved Amount</p>
                            <p className="text-2xl font-bold text-primary">₹{totalAmount.toLocaleString('en-IN')}</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="bulk-comments">Comments (Optional)</Label>
                        <Textarea
                            id="bulk-comments"
                            placeholder="Enter your comments here..."
                            value={comments}
                            onChange={(e) => setComments(e.target.value)}
                            className="min-h-[100px]"
                        />
                    </div>

                    <div className="max-h-[200px] overflow-y-auto border rounded-md p-2 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground px-1">Claims to be processed:</p>
                        {claims.map(claim => (
                            <div key={claim.id} className="flex justify-between items-center text-sm p-2 bg-muted/30 rounded border-b last:border-0">
                                <div className="flex flex-col">
                                    <span className="font-medium">{claim.userName}</span>
                                    <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                                        {claim.paperTitle || claim.publicationTitle || claim.claimType}
                                    </span>
                                </div>
                                <span className="font-semibold">₹{(claim.finalApprovedAmount || claim.calculatedIncentive || 0).toLocaleString('en-IN')}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
                        Cancel
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            variant="destructive"
                            onClick={() => handleBulkAction('reject')}
                            disabled={isProcessing}
                        >
                            Bulk Reject
                        </Button>
                        <Button
                            onClick={() => handleBulkAction('approve')}
                            disabled={isProcessing}
                            className="bg-primary hover:bg-primary/90"
                        >
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Bulk Approve
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
