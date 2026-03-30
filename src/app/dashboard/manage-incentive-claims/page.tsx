
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { markPaymentsCompleted, submitToAccounts, generateIncentivePaymentSheet, downloadPaymentSheetByRef } from '@/app/manage-claims-actions';
import { ClaimDetailsDialog } from '@/components/incentives/claim-details-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { isEligibleForFinancialDisbursement } from '@/lib/incentive-eligibility';

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
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [instituteFilter, setInstituteFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'submissionDate', direction: 'descending' });

  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [isGenerateSheetOpen, setIsGenerateSheetOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDownloadingNotings, setIsDownloadingNotings] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPaymentSheetRef, setSelectedPaymentSheetRef] = useState<string>('');
  const itemsPerPage = 30;

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
    if (currentUser) {
      fetchClaimsAndUsers();
    }
  }, [currentUser, fetchClaimsAndUsers]);

  const getClaimTitle = (claim: IncentiveClaim): string => {
    return claim.paperTitle || claim.patentTitle || claim.conferencePaperTitle || claim.publicationTitle || claim.professionalBodyName || claim.apcPaperTitle || 'N/A';
  };

  const uniqueFaculties = useMemo(() => {
    const faculties = new Set(
      allClaims
        .map(claim => claim.faculty)
        .filter((faculty): faculty is string => Boolean(faculty) && typeof faculty === 'string')
    );
    return Array.from(faculties).sort();
  }, [allClaims]);

  const uniqueInstitutes = useMemo(() => {
    const institutes = new Set(
      users
        .map(u => u.institute)
        .filter((institute): institute is string => Boolean(institute) && typeof institute === 'string')
    );
    return Array.from(institutes).sort();
  }, [users]);

  const filteredClaims = useMemo(() => {
    let filtered = [...allClaims];

    if (claimTypeFilter !== 'all') {
      filtered = filtered.filter(claim => claim.claimType === claimTypeFilter);
    }

    if (facultyFilter !== 'all') {
      filtered = filtered.filter(claim => claim.faculty === facultyFilter);
    }

    if (instituteFilter !== 'all') {
      filtered = filtered.filter(claim => {
        const claimUser = users.find(u => u.uid === claim.uid);
        return claimUser?.institute === instituteFilter;
      });
    }

    if (searchTerm.trim()) {
      const lowerCaseSearch = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(claim => {
        const claimUser = users.find(u => u.uid === claim.uid);
        const title = getClaimTitle(claim) || '';
        const claimIdMatch = claim.claimId ? claim.claimId.toLowerCase().includes(lowerCaseSearch) : false;
        const userNameMatch = claim.userName ? claim.userName.toLowerCase().includes(lowerCaseSearch) : false;
        const titleMatch = title.toLowerCase().includes(lowerCaseSearch);
        const emailMatch = claim.userEmail ? claim.userEmail.toLowerCase().includes(lowerCaseSearch) : false;
        const misIdMatch = claimUser?.misId ? claimUser.misId.toLowerCase().includes(lowerCaseSearch) : false;

        return claimIdMatch || userNameMatch || titleMatch || emailMatch || misIdMatch;
      });
    }
    return filtered;
  }, [allClaims, searchTerm, claimTypeFilter, facultyFilter, instituteFilter, users]);

  // count unique paper titles in the current filtered set
  const uniquePaperCount = useMemo(() => {
    const titles = filteredClaims.map(getClaimTitle).filter(t => Boolean(t));
    return new Set(titles).size;
  }, [filteredClaims]);

  const tabClaims = useMemo(() => {
    const pending = filteredClaims.filter(claim => ['Pending', 'Pending Principal Approval', 'Pending Stage 1 Approval', 'Pending Stage 2 Approval', 'Pending Stage 3 Approval', 'Pending Stage 4 Approval', 'Pending Stage 5 Approval'].includes(claim.status));
    const pendingBank = filteredClaims.filter(claim => claim.status === 'Accepted');
    const submittedBank = filteredClaims.filter(claim => claim.status === 'Submitted to Accounts' && claim.paymentSheetRef);
    const approved = filteredClaims.filter(claim => claim.status === 'Payment Completed');
    const rejected = filteredClaims.filter(claim => claim.status === 'Rejected');

    return {
      pending,
      'pending-bank': pendingBank,
      'submitted-bank': submittedBank,
      approved,
      rejected
    };
  }, [filteredClaims]);

  const sortedAndFilteredClaims = useMemo(() => {
    let claimsForTab = tabClaims[activeTab as keyof typeof tabClaims] || [];

    // Filter by payment sheet ref if in submitted-bank tab
    if (activeTab === 'submitted-bank' && selectedPaymentSheetRef) {
      claimsForTab = claimsForTab.filter(claim => claim.paymentSheetRef === selectedPaymentSheetRef);
    }

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
  }, [tabClaims, activeTab, sortConfig, selectedPaymentSheetRef]);

  const totalPages = Math.ceil(sortedAndFilteredClaims.length / itemsPerPage);

  const uniquePaymentSheetRefs = useMemo(() => {
    const submittedBankClaims = tabClaims['submitted-bank'] || [];
    const refs = Array.from(new Set(submittedBankClaims.map(claim => claim.paymentSheetRef).filter(Boolean) as string[]));
    return refs;
  }, [tabClaims]);

  const paginatedClaims = sortedAndFilteredClaims.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setSelectedClaims([]);
    setCurrentPage(1);
    setSelectedPaymentSheetRef('');
  }, [activeTab, searchTerm, claimTypeFilter, facultyFilter, instituteFilter, sortConfig]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleMarkPaymentCompleted = async () => {
    setIsUpdating(true);
    const payableClaimIds = allClaims
      .filter(claim => selectedClaims.includes(claim.id) && isEligibleForFinancialDisbursement(claim))
      .map(claim => claim.id);

    const result = await markPaymentsCompleted(payableClaimIds);
    if (result.success) {
      toast({ title: 'Success', description: `${result.processedCount || 0} claim(s) marked as payment completed.${(result.skippedCount || 0) > 0 ? ` ${result.skippedCount} claim(s) skipped.` : ''}` });
      setSelectedClaims([]);
      fetchClaimsAndUsers();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.error });
    }
    setIsUpdating(false);
  };

  const handleSubmitToAccounts = async () => {
    setIsUpdating(true);
    const payableClaimIds = allClaims
      .filter(claim => selectedClaims.includes(claim.id) && isEligibleForFinancialDisbursement(claim))
      .map(claim => claim.id);

    const result = await submitToAccounts(payableClaimIds);
    if (result.success) {
      toast({ title: 'Success', description: `${result.processedCount || 0} claim(s) submitted to accounts.${(result.skippedCount || 0) > 0 ? ` ${result.skippedCount} claim(s) skipped.` : ''}` });
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
      const eligibleClaimIds = allClaims
        .filter(claim => selectedClaims.includes(claim.id) && isEligibleForFinancialDisbursement(claim))
        .map(claim => claim.id);

      if (eligibleClaimIds.length === 0) {
        throw new Error('Selected claims are not eligible for office noting generation.');
      }

      const result = await generateOfficeNotingsZip(eligibleClaimIds);
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
        toast({ title: "Download Started", description: `Downloading ${eligibleClaimIds.length} office notings.` });
      } else {
        throw new Error(result.error || "Failed to generate ZIP file.");
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setIsDownloadingNotings(false);
    }
  };

  const handleDownloadPaymentSheet = async (paymentSheetRef: string) => {
    setIsUpdating(true);
    try {
      const result = await downloadPaymentSheetByRef(paymentSheetRef);
      if (result.success && result.fileData) {
        const binaryString = atob(result.fileData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Payment_Sheet_${paymentSheetRef}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast({ title: 'Success', description: 'Payment sheet downloaded successfully.' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to download payment sheet.' });
      }
    } catch (error) {
      console.error('Error downloading payment sheet:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to download payment sheet.' });
    } finally {
      setIsUpdating(false);
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

  const handleExportUniquePapers = () => {
    if (uniquePaperCount === 0) {
      toast({ variant: 'destructive', title: "No Data", description: "There are no papers to export in the current view." });
      return;
    }

    // Create a map of unique papers with their details
    const papersMap = new Map<string, {
      title: string;
      doi?: string;
      journalName?: string;
      quartile?: string;
      pdfLink?: string;
      firstAuthorName?: string;
      firstAuthorIsExternal?: boolean;
      firstAuthorFaculty?: string;
      firstAuthorInstitute?: string;
      allPuAuthors?: string;
      claimData?: IncentiveClaim;
    }>();

    filteredClaims.forEach(claim => {
      const title = getClaimTitle(claim);
      if (title && title !== 'N/A') {
        // Only add/update if we don't have it yet or if this claim has more complete data
        if (!papersMap.has(title) || claim.journalClassification) {
          // Get first author details
          let firstAuthorName = '';
          let firstAuthorIsExternal = false;
          let firstAuthorFaculty = '';
          let firstAuthorInstitute = '';
          let allPuAuthors = '';

          if (claim.authors && claim.authors.length > 0) {
            const firstAuthor = claim.authors.find(a =>
              a.role === 'First Author' ||
              a.role === 'First & Corresponding Author' ||
              a.role === 'First & Presenting Author'
            ) || claim.authors[0];

            firstAuthorName = firstAuthor.name || '';
            firstAuthorIsExternal = firstAuthor.isExternal;

            if (firstAuthor.uid) {
              const firstAuthorUser = users.find(u => u.uid === firstAuthor.uid);
              firstAuthorFaculty = firstAuthorUser?.faculty || '';
              firstAuthorInstitute = firstAuthorUser?.institute || '';
            }

            // If first author is external, collect all PU authors
            if (firstAuthorIsExternal) {
              const puAuthors = claim.authors
                .filter(author => author.uid && !author.isExternal)
                .map(author => author.name)
                .filter(name => name && name.trim() !== '');
              allPuAuthors = puAuthors.length > 0 ? puAuthors.join(', ') : '';
            }
          }

          // Get PDF link (first proof URL if available)
          const pdfLink = claim.publicationProofUrls && claim.publicationProofUrls.length > 0
            ? claim.publicationProofUrls[0]
            : '';

          papersMap.set(title, {
            title,
            doi: claim.doi || '',
            journalName: claim.journalName || '',
            quartile: claim.journalClassification || '',
            pdfLink,
            firstAuthorName,
            firstAuthorIsExternal,
            firstAuthorFaculty,
            firstAuthorInstitute,
            allPuAuthors,
            claimData: claim
          });
        }
      }
    });

    // Convert map to array for export
    const dataToExport = Array.from(papersMap.values()).map((paper, index) => {
      const row: any = {
        'S.No': index + 1,
        'Paper Title': paper.title,
        'DOI': paper.doi || 'N/A',
        'Journal Name': paper.journalName || 'N/A',
        'Quartile': paper.quartile || 'N/A',
        'PDF Link': paper.pdfLink || 'N/A',
        'First Author Name': paper.firstAuthorName || 'N/A',
      };

      // If first author is external, show all PU authors instead of first author faculty/institute
      if (paper.firstAuthorIsExternal) {
        row['All PU Authors'] = paper.allPuAuthors || 'N/A';
      } else {
        row['First Author Faculty'] = paper.firstAuthorFaculty || 'N/A';
        row['First Author Institute'] = paper.firstAuthorInstitute || 'N/A';
      }

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Unique Papers");
    XLSX.writeFile(workbook, `unique_papers_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: "Export Started", description: `Downloading ${dataToExport.length} unique papers.` });
  };

  const eligibleForPaymentSheet = useMemo(() => {
    return allClaims.filter(
      claim =>
        selectedClaims.includes(claim.id) &&
        (claim.status === 'Accepted' || claim.status === 'Submitted to Accounts') &&
        isEligibleForFinancialDisbursement(claim)
    );
  }, [selectedClaims, allClaims]);

  const eligibleForOfficeNotings = useMemo(() => {
    return allClaims.filter(claim => selectedClaims.includes(claim.id) && isEligibleForFinancialDisbursement(claim));
  }, [selectedClaims, allClaims]);


  const renderTable = () => (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={paginatedClaims.length > 0 && selectedClaims.length === paginatedClaims.length}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedClaims([...new Set([...selectedClaims, ...paginatedClaims.map(c => c.id)])]);
                    } else {
                      setSelectedClaims(selectedClaims.filter(id => !paginatedClaims.map(c => c.id).includes(id)));
                    }
                  }}
                  // @ts-ignore
                  indeterminate={paginatedClaims.some(c => selectedClaims.includes(c.id)) && !paginatedClaims.every(c => selectedClaims.includes(c.id)) ? "true" : undefined}
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
              <TableHead>Amount</TableHead>
              {activeTab === 'rejected' && <TableHead>Rejected At Stage</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedClaims.map((claim) => {
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
                  <TableCell className="font-medium max-w-xs">
                    <div className="flex flex-col">
                      {(() => {
                        const claimUser = users.find(u => u.uid === claim.uid);
                        const profileLink = claimUser?.campus === 'Goa' ? `/goa/${claimUser.misId}` : `/profile/${claimUser?.misId}`;
                        const hasProfileLink = claimUser && claimUser.misId;

                        return hasProfileLink ? (
                          <Link href={profileLink} target="_blank" className="text-primary hover:underline break-words">
                            {claim.userName}
                          </Link>
                        ) : (
                          <span className="break-words">{claim.userName}</span>
                        );
                      })()}
                      {claim.claimId && <span className="text-xs text-muted-foreground">{claim.claimId}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal break-words">{getClaimTitle(claim)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline">{claim.claimType}</Badge>
                      {activeTab === 'submitted-bank' && claim.paymentSheetRef && (
                        <span className="text-xs text-muted-foreground">{claim.paymentSheetRef}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{new Date(claim.submissionDate).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={claim.status === 'Accepted' || claim.status === 'Submitted to Accounts' || claim.status === 'Payment Completed' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {claim.finalApprovedAmount !== undefined && claim.finalApprovedAmount !== null ? (
                      <span>₹{claim.finalApprovedAmount.toLocaleString('en-IN')}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {activeTab === 'rejected' && <TableCell>{lastRejectedApproval ? `Stage ${lastRejectedApproval.stage}` : 'N/A'}</TableCell>}
                  <TableCell className="text-right space-x-2 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => setSelectedClaim(claim)}>View Details</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {sortedAndFilteredClaims.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, sortedAndFilteredClaims.length)} of {sortedAndFilteredClaims.length} claims
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
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
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Unique papers: {uniquePaperCount}
            </span>
            <Button onClick={handleExportUniquePapers} disabled={loading || uniquePaperCount === 0} variant="outline" title="Download unique papers with DOI and journal name">
              <Download className="mr-2 h-4 w-4" />
              Export Papers
            </Button>
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
                onChange={(event) => {
                  const value = event.target.value;
                  setSearchTerm(value);
                  setCurrentPage(1);
                  setSelectedClaims([]);
                }}
                onInput={(event) => {
                  const value = (event.target as HTMLInputElement).value;
                  setSearchTerm(value);
                }}
                className="max-w-sm"
                type="text"
                autoComplete="off"
              />
              {selectedClaims.length === 0 && (
                <>
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
                  <Select value={facultyFilter} onValueChange={setFacultyFilter}>
                    <SelectTrigger className="w-[200px]">
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
                    <SelectTrigger className="w-[200px]">
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
              {selectedClaims.length > 0 && (
                <Button variant="outline" onClick={() => setSelectedClaims([])}>
                  Deselect All ({selectedClaims.length})
                </Button>
              )}
            </div>
            {activeTab === 'pending-bank' && selectedClaims.length > 0 && (
              <div className="flex items-center gap-2">
                <Button onClick={() => setIsGenerateSheetOpen(true)} disabled={eligibleForPaymentSheet.length === 0 || isUpdating}>
                  Generate Payment Sheet ({eligibleForPaymentSheet.length})
                </Button>
                <Button onClick={handleDownloadNotings} disabled={isDownloadingNotings || eligibleForOfficeNotings.length === 0}>
                  {isDownloadingNotings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Download Notings ({eligibleForOfficeNotings.length})
                </Button>
                <Button onClick={handleSubmitToAccounts} disabled={isUpdating || !eligibleForPaymentSheet.every(c => c.status === 'Accepted') || eligibleForPaymentSheet.length === 0}>
                  {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Submit to Accounts
                </Button>
              </div>
            )}
            {activeTab === 'submitted-bank' && selectedClaims.length > 0 && (
              <div className="flex items-center gap-2">
                <Button onClick={handleMarkPaymentCompleted} disabled={isUpdating || !eligibleForPaymentSheet.every(c => c.status === 'Submitted to Accounts') || eligibleForPaymentSheet.length === 0}>
                  {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Mark as Payment Completed
                </Button>
              </div>
            )}
            {activeTab === 'submitted-bank' && selectedPaymentSheetRef && (
              <div className="flex items-center gap-2">
                <Button onClick={() => handleDownloadPaymentSheet(selectedPaymentSheetRef)} disabled={isUpdating}>
                  {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download Payment Sheet
                </Button>
              </div>
            )}
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="pending">Pending ({tabClaims.pending.length})</TabsTrigger>
              <TabsTrigger value="pending-bank">Pending for Bank ({tabClaims['pending-bank'].length})</TabsTrigger>
              <TabsTrigger value="submitted-bank">Submitted to Bank ({tabClaims['submitted-bank'].length})</TabsTrigger>
              <TabsTrigger value="approved">Approved ({tabClaims.approved.length})</TabsTrigger>
              <TabsTrigger value="rejected">Rejected ({tabClaims.rejected.length})</TabsTrigger>
            </TabsList>
            <Card className="mt-4">
              <CardContent className="pt-6">
                {activeTab === 'submitted-bank' && (
                  <div className="mb-6">
                    <Label htmlFor="payment-sheet-ref" className="mb-2 block">Select Payment Sheet Reference Number</Label>
                    <Select value={selectedPaymentSheetRef} onValueChange={setSelectedPaymentSheetRef}>
                      <SelectTrigger id="payment-sheet-ref" className="w-full md:w-[300px]">
                        <SelectValue placeholder="Choose a payment sheet..." />
                      </SelectTrigger>
                      <SelectContent>
                        {uniquePaymentSheetRefs.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">No payment sheets available</div>
                        ) : (
                          uniquePaymentSheetRefs.map(ref => (
                            <SelectItem key={ref} value={ref}>{ref}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {loading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : activeTab === 'submitted-bank' && !selectedPaymentSheetRef && !searchTerm ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <p>Please select a payment sheet reference number to view claims.</p>
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

  // Autofill remarks with Claim IDs when claims change
  useEffect(() => {
    if (claims.length > 0) {
      const initialRemarks: Record<string, string> = {};
      claims.forEach(claim => {
        initialRemarks[claim.id] = claim.claimId || claim.id;
      });
      setRemarks(initialRemarks);
    }
  }, [claims]);

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
        toast({ title: "Export Successful", description: `Payment sheet has been generated.${(result.skippedCount || 0) > 0 ? ` ${result.skippedCount} claim(s) were skipped as non-disbursement eligible.` : ''}` });
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
            {claims.sort((a, b) => {
              const claimIdA = a.claimId || a.id;
              const claimIdB = b.claimId || b.id;
              return claimIdA.localeCompare(claimIdB);
            }).map(claim => (
              <div key={claim.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-2 rounded-md">
                <div className="md:col-span-1">
                  <p className="font-medium text-sm">{claim.userName}</p>
                  {claim.claimId && <p className="text-xs text-muted-foreground">Claim ID: {claim.claimId}</p>}
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
            {isGenerating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</> : 'Generate & Download'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
