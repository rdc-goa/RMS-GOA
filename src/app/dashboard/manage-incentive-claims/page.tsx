
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { MoreHorizontal, Download, ArrowUpDown, Printer, Loader2, FileSpreadsheet, CheckCheck, Send, FileArchive } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/config';
import { collection, getDocs, doc, orderBy, query, where } from 'firebase/firestore';
import type { IncentiveClaim, User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateOfficeNotingsZip } from '@/app/document-actions';
import { markPaymentsCompleted, submitToAccounts, generateIncentivePaymentSheet } from '@/app/manage-claims-actions';
import { ClaimDetailsDialog } from '@/components/incentives/claim-details-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

const CLAIM_TYPES = ['Research Papers', 'Patents', 'Conference Presentations', 'Books', 'Membership of Professional Bodies', 'Seed Money for APC'];
type SortableKeys = keyof Pick<IncentiveClaim, 'userName' | 'paperTitle' | 'submissionDate' | 'status' | 'claimType'>;


export default function ManageIncentiveClaimsPage() {
  const [allClaims, setAllClaims] = useState<IncentiveClaim[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<IncentiveClaim | null>(null);
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState('');
  const [claimTypeFilter, setClaimTypeFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'submissionDate', direction: 'descending' });
  
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [isGenerateSheetOpen, setIsGenerateSheetOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDownloadingNotings, setIsDownloadingNotings] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      if (!parsedUser.allowedModules?.includes('manage-incentive-claims')) {
        toast({ variant: 'destructive', title: 'Access Denied', description: 'You do not have permission to view this page.' });
        router.replace('/dashboard');
        return;
      }
      setCurrentUser(parsedUser);
    } else {
        router.replace('/login');
    }
  }, [router, toast]);


  const fetchClaimsAndUsers = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const usersCollection = collection(db, 'users');
      const userSnapshot = await getDocs(usersCollection);
      const userList = userSnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as User));
      setUsers(userList);

      const claimsCollection = collection(db, 'incentiveClaims');
      let q;
      if (currentUser.role === 'Super-admin' || currentUser.role === 'admin') {
          q = query(claimsCollection, orderBy('submissionDate', 'desc'));
      } else if (currentUser.role === 'CRO') {
          q = query(claimsCollection, where('faculty', 'in', currentUser.faculties || []), orderBy('submissionDate', 'desc'));
      } else {
          setAllClaims([]);
          setLoading(false);
          return;
      }

      const claimSnapshot = await getDocs(q);
      const claimList = claimSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim));
      setAllClaims(claimList);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not fetch incentive claims or user data." });
    } finally {
      setLoading(false);
    }
  }, [toast, currentUser]);

  useEffect(() => {
    if(currentUser) {
        fetchClaimsAndUsers();
    }
  }, [currentUser, fetchClaimsAndUsers]);
  
  const getClaimTitle = (claim: IncentiveClaim): string => {
    return claim.paperTitle || claim.patentTitle || claim.conferencePaperTitle || claim.publicationTitle || claim.professionalBodyName || claim.apcPaperTitle || 'N/A';
  };
  
  const filteredClaims = useMemo(() => {
    let filtered = [...allClaims];
    
    if (claimTypeFilter !== 'all') {
      filtered = filtered.filter(claim => claim.claimType === claimTypeFilter);
    }

    if (searchTerm) {
      const lowerCaseSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(claim =>
        claim.userName.toLowerCase().includes(lowerCaseSearch) ||
        getClaimTitle(claim).toLowerCase().includes(lowerCaseSearch) ||
        (claim.claimId && claim.claimId.toLowerCase().includes(lowerCaseSearch))
      );
    }
    return filtered;
  }, [allClaims, searchTerm, claimTypeFilter]);
  
  const tabClaims = useMemo(() => {
    const pending = filteredClaims.filter(claim => ['Pending', 'Pending Stage 1 Approval', 'Pending Stage 2 Approval', 'Pending Stage 3 Approval'].includes(claim.status));
    const pendingBank = filteredClaims.filter(claim => ['Accepted', 'Submitted to Accounts'].includes(claim.status));
    const approved = filteredClaims.filter(claim => claim.status === 'Payment Completed');
    const rejected = filteredClaims.filter(claim => claim.status === 'Rejected');
    
    return {
        pending,
        'pending-bank': pendingBank,
        approved,
        rejected
    };
  }, [filteredClaims]);

  const sortedAndFilteredClaims = useMemo(() => {
    let claimsForTab = tabClaims[activeTab as keyof typeof tabClaims] || [];
    
    claimsForTab.sort((a, b) => {
        const key = sortConfig.key as keyof IncentiveClaim;
        let aValue = a[key] || '';
        let bValue = b[key] || '';
        if (aValue < bValue) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
    });

    return claimsForTab;
  }, [tabClaims, activeTab, sortConfig]);
  
  useEffect(() => {
    setSelectedClaims([]);
  }, [activeTab, searchTerm, claimTypeFilter, sortConfig]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const handleMarkPaymentCompleted = async () => {
    setIsUpdating(true);
    const result = await markPaymentsCompleted(selectedClaims);
    if (result.success) {
      toast({ title: 'Success', description: `${selectedClaims.length} claim(s) marked as payment completed.` });
      setSelectedClaims([]);
      fetchClaimsAndUsers();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.error });
    }
    setIsUpdating(false);
  };

  const handleSubmitToAccounts = async () => {
    setIsUpdating(true);
    const result = await submitToAccounts(selectedClaims);
    if (result.success) {
        toast({ title: 'Success', description: `${selectedClaims.length} claim(s) submitted to accounts.`});
        setSelectedClaims([]);
        fetchClaimsAndUsers();
    } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error });
    }
    setIsUpdating(false);
  };

  const handleDownloadNotings = async () => {
    if (selectedClaims.length === 0) {
        toast({ variant: 'destructive', title: 'No Claims Selected' });
        return;
    }
    setIsDownloadingNotings(true);
    try {
        const result = await generateOfficeNotingsZip(selectedClaims);
        if (result.success && result.fileData) {
            const byteCharacters = atob(result.fileData);
            const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/zip' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Office_Notings_${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast({ title: "Download Started", description: `Downloading ${selectedClaims.length} office notings.` });
        } else {
            throw new Error(result.error || "Failed to generate ZIP file.");
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
        setIsDownloadingNotings(false);
    }
  };


  const handleExport = () => {
    if (sortedAndFilteredClaims.length === 0) {
      toast({ variant: 'destructive', title: "No Data", description: "There are no claims to export in the current view." });
      return;
    }

    const userDetailsMap = new Map(users.map(u => [u.uid, { misId: u.misId || '', designation: u.designation || '' }]));
    
    const dataToExport = sortedAndFilteredClaims.map(claim => {
      const { bankDetails, id, uid, ...rest } = claim;
      const userDetails = userDetailsMap.get(uid);
      return {
        ...rest,
        misId: userDetails?.misId || '',
        designation: userDetails?.designation || '',
        beneficiaryName: bankDetails?.beneficiaryName || '',
        accountNumber: bankDetails?.accountNumber || '',
        bankName: bankDetails?.bankName || '',
        branchName: bankDetails?.branchName || '',
        city: bankDetails?.city || '',
        ifscCode: bankDetails?.ifscCode || '',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Claims");
    XLSX.writeFile(workbook, `incentive_claims_${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Export Started", description: `Downloading ${sortedAndFilteredClaims.length} claims.` });
  };
  
  const eligibleForPaymentSheet = useMemo(() => {
      return allClaims.filter(claim => selectedClaims.includes(claim.id) && (claim.status === 'Accepted' || claim.status === 'Submitted to Accounts'));
  }, [selectedClaims, allClaims]);

  
  const renderTable = () => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
                <Checkbox
                    checked={sortedAndFilteredClaims.length > 0 && selectedClaims.length === sortedAndFilteredClaims.length && sortedAndFilteredClaims.length <= 30}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        if (sortedAndFilteredClaims.length > 30) {
                          toast({ variant: 'destructive', title: 'Limit Exceeded', description: 'You can only select up to 30 claims at once.' });
                          setSelectedClaims(sortedAndFilteredClaims.slice(0, 30).map(c => c.id));
                        } else {
                          setSelectedClaims(sortedAndFilteredClaims.map(c => c.id));
                        }
                      } else {
                        setSelectedClaims([]);
                      }
                    }}
                    disabled={sortedAndFilteredClaims.length > 30}
                    // @ts-ignore
                    indeterminate={selectedClaims.length > 0 && selectedClaims.length < sortedAndFilteredClaims.length ? "true" : undefined}
                />
            </TableHead>
            <TableHead>
               <Button variant="ghost" onClick={() => requestSort('userName')}>
                  Claimant <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="hidden md:table-cell">
               <Button variant="ghost" onClick={() => requestSort('claimType')}>
                  Claim Type <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>
               <Button variant="ghost" onClick={() => requestSort('submissionDate')}>
                  Date <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead>Status</TableHead>
            {activeTab === 'rejected' && <TableHead>Rejected At Stage</TableHead>}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAndFilteredClaims.map((claim) => {
            const lastRejectedApproval = claim.approvals?.slice().reverse().find(a => a?.status === 'Rejected');
            return (
              <TableRow key={claim.id} data-state={selectedClaims.includes(claim.id) ? "selected" : ""}>
                <TableCell>
                    <Checkbox
                        checked={selectedClaims.includes(claim.id)}
                        onCheckedChange={(checked) => {
                            if (checked && selectedClaims.length >= 30) {
                                toast({ variant: 'destructive', title: 'Limit Reached', description: 'You can only select up to 30 claims at once.' });
                                return;
                            }
                            setSelectedClaims(
                                checked
                                ? [...selectedClaims, claim.id]
                                : selectedClaims.filter((id) => id !== claim.id)
                            );
                        }}
                    />
                </TableCell>
                <TableCell className="font-medium whitespace-nowrap">{claim.userName}</TableCell>
                <TableCell className="max-w-xs whitespace-normal break-words">{getClaimTitle(claim)}</TableCell>
                <TableCell className="hidden md:table-cell"><Badge variant="outline">{claim.claimType}</Badge></TableCell>
                <TableCell>{new Date(claim.submissionDate).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant={claim.status === 'Accepted' || claim.status === 'Submitted to Accounts' || claim.status === 'Payment Completed' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
                </TableCell>
                {activeTab === 'rejected' && <TableCell>{lastRejectedApproval ? `Stage ${lastRejectedApproval.stage}` : 'N/A'}</TableCell>}
                <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setSelectedClaim(claim)}>View Details</Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  const pageTitle = currentUser?.role === 'CRO' 
    ? `Incentive Claims from Your Faculties`
    : "Manage Incentive Claims";

  const pageDescription = currentUser?.role === 'CRO' 
    ? `Review claims submitted from your assigned faculties.` 
    : "Review and manage all submitted incentive claims.";

  return (
    <>
    <div className="container mx-auto py-10">
      <PageHeader title={pageTitle} description={pageDescription}>
         <div className="flex items-center gap-2">
            <Button onClick={handleExport} disabled={loading}>
                <Download className="mr-2 h-4 w-4" />
                Export XLSX
            </Button>
        </div>
      </PageHeader>
      <div className="mt-8">
        <div className="flex items-center justify-between py-4 gap-4">
            <div className="flex items-center gap-2">
              <Input
                  placeholder="Filter by claimant, title, or Claim ID..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="max-w-sm"
              />
              <Select value={claimTypeFilter} onValueChange={setClaimTypeFilter}>
                  <SelectTrigger className="w-[240px]">
                      <SelectValue placeholder="Filter by claim type" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="all">All Claim Types</SelectItem>
                      {CLAIM_TYPES.map(type => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                  </SelectContent>
              </Select>
            </div>
            {activeTab === 'pending-bank' && selectedClaims.length > 0 && (
                <div className="flex items-center gap-2">
                    <Button onClick={() => setIsGenerateSheetOpen(true)} disabled={eligibleForPaymentSheet.length === 0 || isUpdating}>
                        Generate Payment Sheet ({eligibleForPaymentSheet.length})
                    </Button>
                    <Button onClick={handleDownloadNotings} disabled={isDownloadingNotings}>
                        {isDownloadingNotings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Download Notings ({selectedClaims.length})
                    </Button>
                    <Button onClick={handleSubmitToAccounts} disabled={isUpdating || !selectedClaims.every(id => allClaims.find(c => c.id === id)?.status === 'Accepted')}>
                        {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Submit to Accounts
                    </Button>
                    <Button onClick={handleMarkPaymentCompleted} disabled={isUpdating || !selectedClaims.every(id => allClaims.find(c => c.id === id)?.status === 'Submitted to Accounts')}>
                        {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Mark as Payment Completed
                    </Button>
                </div>
            )}
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="pending">Pending ({tabClaims.pending.length})</TabsTrigger>
                <TabsTrigger value="pending-bank">Pending for Bank ({tabClaims['pending-bank'].length})</TabsTrigger>
                <TabsTrigger value="approved">Approved ({tabClaims.approved.length})</TabsTrigger>
                <TabsTrigger value="rejected">Rejected ({tabClaims.rejected.length})</TabsTrigger>
            </TabsList>
            <Card className="mt-4">
              <CardContent className="pt-6">
                 {loading ? (
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                 ) : sortedAndFilteredClaims.length > 0 ? (
                    renderTable()
                 ) : (
                    <div className="text-center py-10 text-muted-foreground">
                        <p>No claims found for this category.</p>
                    </div>
                 )}
              </CardContent>
            </Card>
        </Tabs>
      </div>
      <ClaimDetailsDialog 
        claim={selectedClaim} 
        open={!!selectedClaim} 
        onOpenChange={() => setSelectedClaim(null)} 
        currentUser={currentUser}
        claimant={users.find(u => u.uid === selectedClaim?.uid) || null}
      />
    </div>
    <GeneratePaymentSheetDialog 
        isOpen={isGenerateSheetOpen}
        onOpenChange={setIsGenerateSheetOpen}
        claims={eligibleForPaymentSheet}
        allUsers={users}
    />
    </>
  );
}

function GeneratePaymentSheetDialog({ isOpen, onOpenChange, claims, allUsers }: { isOpen: boolean; onOpenChange: (open: boolean) => void; claims: IncentiveClaim[]; allUsers: User[] }) {
    const { toast } = useToast();
    const [remarks, setRemarks] = useState<Record<string, string>>({});
    const [referenceNumber, setReferenceNumber] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerate = async () => {
        if (!referenceNumber.trim()) {
            toast({ variant: 'destructive', title: 'Reference Number Required' });
            return;
        }
        setIsGenerating(true);
        try {
            const result = await generateIncentivePaymentSheet(claims.map(c => c.id), remarks, `RDC/ACCT/PYMT/${referenceNumber}`);
            if (result.success && result.fileData) {
                const byteCharacters = atob(result.fileData);
                const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Incentive_Payment_Sheet_${referenceNumber}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                toast({ title: "Export Successful", description: "Payment sheet has been generated." });
                onOpenChange(false);
            } else {
                throw new Error(result.error || "Failed to generate sheet.");
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Generate Incentive Payment Sheet</DialogTitle>
                    <DialogDescription>Add remarks for the selected claims and provide a reference number for the payment sheet.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                    <div className="flex items-center gap-2">
                        <Label htmlFor="ref-no" className="whitespace-nowrap">Reference Number:</Label>
                        <Input id="ref-no" value={`RDC/ACCT/PYMT/${referenceNumber}`} onChange={(e) => setReferenceNumber(e.target.value.replace('RDC/ACCT/PYMT/', ''))} />
                    </div>
                    <Separator />
                    <div className="space-y-2">
                        <h4 className="font-semibold">Add Remarks</h4>
                        {claims.map(claim => (
                            <div key={claim.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-2 rounded-md">
                                <div className="md:col-span-1">
                                    <p className="font-medium text-sm">{claim.userName}</p>
                                    <p className="text-xs text-muted-foreground">{claim.paperTitle || claim.publicationTitle || claim.claimType}</p>
                                    <p className="text-sm font-semibold">₹{claim.finalApprovedAmount?.toLocaleString('en-IN')}</p>
                                </div>
                                <div className="md:col-span-2">
                                    <Textarea
                                        placeholder="Enter remarks for this claim..."
                                        value={remarks[claim.id] || ''}
                                        onChange={(e) => setRemarks(prev => ({ ...prev, [claim.id]: e.target.value }))}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleGenerate} disabled={isGenerating}>
                        {isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Generating...</> : 'Generate & Download'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
