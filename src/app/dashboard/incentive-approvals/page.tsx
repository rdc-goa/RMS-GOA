
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import type { User, IncentiveClaim } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, ArrowUpDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { ClaimDetailsDialog } from '@/components/incentives/claim-details-dialog';
import { ApprovalDialog } from '@/components/incentives/approval-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CLAIM_TYPES = ['Research Papers', 'Patents', 'Conference Presentations', 'Books', 'Membership of Professional Bodies', 'Seed Money for APC'];
type SortableKeys = 'userName' | 'claimType' | 'submissionDate' | 'status' | 'paperTitle';

export default function IncentiveApprovalsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [pendingClaims, setPendingClaims] = useState<IncentiveClaim[]>([]);
    const [historyClaims, setHistoryClaims] = useState<IncentiveClaim[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [approvalStage, setApprovalStage] = useState<number | null>(null);
    const [selectedClaim, setSelectedClaim] = useState<IncentiveClaim | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isApprovalOpen, setIsApprovalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [claimTypeFilter, setClaimTypeFilter] = useState('all');
    const [facultyFilter, setFacultyFilter] = useState('all');
    const [instituteFilter, setInstituteFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'submissionDate', direction: 'descending' });
    const [activeTab, setActiveTab] = useState('pending');
    const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string>>(new Set());

    const fetchClaimsAndUsers = useCallback(async (currentUser: User, stage: number) => {
        setLoading(true);
        try {
            const claimsCollection = collection(db, 'incentiveClaims');
            const usersQuery = query(collection(db, 'users'));
            
            const statusToFetch = `Pending Stage ${stage + 1} Approval`;
            
            const pendingClaimsQuery = query(
                claimsCollection, 
                where('status', '==', statusToFetch), 
                orderBy('submissionDate', 'desc')
            );

            // History should include all claims the user has acted upon at their stage
            const historyQuery = query(
              claimsCollection, 
              where(`approvals.${stage}.approverUid`, '==', currentUser.uid),
              orderBy('submissionDate', 'desc')
            );
            
            const [pendingSnapshot, historySnapshot, usersSnapshot] = await Promise.all([
                getDocs(pendingClaimsQuery),
                getDocs(historyQuery),
                getDocs(usersQuery)
            ]);

            setPendingClaims(pendingSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim)));
            setHistoryClaims(historySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim)));
            setAllUsers(usersSnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as User)));

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
        return claim.paperTitle || claim.patentTitle || claim.conferencePaperTitle || claim.publicationTitle || claim.professionalBodyName || claim.apcPaperTitle || 'N/A';
    };

    const uniqueFaculties = useMemo(() => {
        const faculties = new Set([...pendingClaims, ...historyClaims].map(claim => claim.faculty).filter(Boolean));
        return Array.from(faculties).sort();
    }, [pendingClaims, historyClaims]);

    const uniqueInstitutes = useMemo(() => {
        const institutes = new Set(
            allUsers.map(u => u.institute).filter(Boolean)
        );
        return Array.from(institutes).sort();
    }, [allUsers]);
    
    const applyFiltersAndSort = useCallback((claims: IncentiveClaim[]) => {
        let filteredClaims = claims.filter(claim => {
            if (claimTypeFilter !== 'all' && claim.claimType !== claimTypeFilter) return false;
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
                <TableHead><Button variant="ghost" onClick={() => requestSort('submissionDate')}>Submitted On <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                {isHistory && <TableHead>Approved Amount</TableHead>}
                <TableHead><Button variant="ghost" onClick={() => requestSort('status')}>Status <ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
                {claimsList.map(claim => {
                    const claimant = allUsers.find(u => u.uid === claim.uid);
                    const profileLink = claimant?.campus === 'Goa' ? `/goa/${claimant.misId}` : `/profile/${claimant.misId}`;
                    const hasProfileLink = claimant && claimant.misId;
                    const myApproval = isHistory ? claim.approvals?.find(a => a?.approverUid === user?.uid) : null;
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
                            <TableCell className="font-medium max-w-xs whitespace-normal break-words">{getClaimTitle(claim)}</TableCell>
                            <TableCell><Badge variant="outline">{claim.claimType}</Badge></TableCell>
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
              const profileLink = claimant?.campus === 'Goa' ? `/goa/${claimant.misId}` : `/profile/${claimant.misId}`;
              const hasProfileLink = claimant && claimant.misId;
              const myApproval = isHistory ? claim.approvals?.find(a => a?.approverUid === user?.uid) : null;
              
              return (
                  <Card key={claim.id}>
                      <CardHeader>
                          <CardTitle className="text-base break-words">
                            {getClaimTitle(claim)}
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
                              <Badge variant="outline">{claim.claimType}</Badge>
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
                            <Select value={claimTypeFilter} onValueChange={setClaimTypeFilter}>
                                <SelectTrigger className="w-full sm:w-[200px]">
                                    <SelectValue placeholder="Filter by claim type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Claim Types</SelectItem>
                                    {CLAIM_TYPES.map(type => (
                                        <SelectItem key={type} value={type}>{type}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
                    {selectedClaimIds.size > 0 && (
                        <Button variant="outline" onClick={() => {
                            setSelectedClaimIds(new Set());
                        }}>
                            Deselect All
                        </Button>
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
        </>
    );
}
