
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Download, Loader2 } from "lucide-react";
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
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { db } from '@/lib/config';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import type { IncentiveClaim, User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { markPaymentsCompleted, submitToAccounts, generateIncentivePaymentSheet, updateIncentiveClaimStatus } from '@/app/server-actions';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

const STATUSES_SIMPLE: IncentiveClaim['status'][] = ['Pending', 'Accepted', 'Rejected'];

export default function ManageIncentiveClaimsPage() {
  const [claims, setClaims] = useState<IncentiveClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [isSheetDialogOpen, setIsSheetDialogOpen] = useState(false);
  const [referenceNumber, setReferenceNumber] = useState('');
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('payment-processing');
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const usersMap = useMemo(() => new Map(allUsers.map(u => [u.uid, u])), [allUsers]);

  const fetchClaimsAndUsers = useCallback(async () => {
    setLoading(true);
    try {
      const claimsCollection = collection(db, 'incentiveClaims');
      const q = query(claimsCollection, orderBy('submissionDate', 'desc'));
      const claimSnapshot = await getDocs(q);
      const claimList = claimSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim));
      setClaims(claimList);
      
      const usersCollection = collection(db, 'users');
      const usersSnapshot = await getDocs(usersCollection);
      setAllUsers(usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));

    } catch (error) {
      console.error("Error fetching claims:", error);
      toast({ variant: 'destructive', title: "Error", description: "Could not fetch incentive claims." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchClaimsAndUsers();
  }, [fetchClaimsAndUsers]);

  const handleSimpleStatusChange = useCallback(async (id: string, newStatus: IncentiveClaim['status']) => {
    const result = await updateIncentiveClaimStatus(id, newStatus);
    if (result.success) {
      toast({ title: 'Status Updated', description: "The claim's status has been changed and the user has been notified." });
      fetchClaimsAndUsers(); 
    } else {
       toast({ variant: 'destructive', title: "Error", description: result.error || "Could not update status." });
    }
  }, [fetchClaimsAndUsers, toast]);

  const handleBulkAction = async (action: 'submitToAccounts' | 'markPaid') => {
    setIsProcessing(true);
    try {
        const actionFunction = action === 'submitToAccounts' ? submitToAccounts : markPaymentsCompleted;
        const result = await actionFunction(selectedClaims);
        if (result.success) {
            toast({ title: 'Success', description: 'Selected claims have been updated.' });
            fetchClaimsAndUsers();
            setSelectedClaims([]);
        } else {
            throw new Error(result.error);
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Action Failed', description: error.message });
    } finally {
        setIsProcessing(false);
    }
  };
  
  const handleGenerateSheet = async () => {
    if (!referenceNumber) {
        toast({ variant: 'destructive', title: 'Reference number is required.' });
        return;
    }
    setIsProcessing(true);
    try {
        const result = await generateIncentivePaymentSheet(selectedClaims, remarks, referenceNumber);
        if (result.success && result.fileData) {
            const byteCharacters = atob(result.fileData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Payment_Sheet_${referenceNumber}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast({ title: "Download Started" });
            setIsSheetDialogOpen(false);
            fetchClaimsAndUsers();
        } else {
            throw new Error(result.error);
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Generation Failed', description: error.message });
    } finally {
        setIsProcessing(false);
    }
  };

  const getFilteredClaims = (tab: string) => {
    switch (tab) {
        case 'payment-processing':
            return claims.filter(c => ['Accepted', 'Submitted to Accounts'].includes(c.status));
        case 'all-claims':
            return claims;
        case 'pending-claims':
             return claims.filter(c => c.status !== 'Accepted' && c.status !== 'Submitted to Accounts' && c.status !== 'Payment Completed' && c.status !== 'Rejected');
        default:
            return claims;
    }
  };
  
  const filteredClaims = getFilteredClaims(activeTab);

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Manage Incentive Claims" description="Review and manage all submitted incentive claims." />
        <div className="mt-8">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              </CardContent>
            </Card>
        </div>
      </div>
    );
  }

  const renderTable = (claimsList: IncentiveClaim[], isPaymentTab: boolean) => (
      <Table>
          <TableHeader>
              <TableRow>
                  {isPaymentTab && (
                      <TableHead className="w-[50px]">
                          <Checkbox
                              checked={selectedClaims.length === claimsList.length && claimsList.length > 0}
                              onCheckedChange={(checked) => setSelectedClaims(checked ? claimsList.map(c => c.id) : [])}
                              aria-label="Select all"
                          />
                      </TableHead>
                  )}
                  <TableHead>Claimant</TableHead>
                  <TableHead className="hidden md:table-cell">Paper Title</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  {isPaymentTab && <TableHead>Amount</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
              </TableRow>
          </TableHeader>
          <TableBody>
              {claimsList.map((claim) => (
                  <TableRow key={claim.id} data-state={selectedClaims.includes(claim.id) ? "selected" : ""}>
                      {isPaymentTab && (
                          <TableCell>
                              <Checkbox
                                  checked={selectedClaims.includes(claim.id)}
                                  onCheckedChange={(checked) => setSelectedClaims(checked ? [...selectedClaims, claim.id] : selectedClaims.filter(id => id !== claim.id))}
                              />
                          </TableCell>
                      )}
                      <TableCell className="font-medium">{claim.userName}</TableCell>
                      <TableCell className="hidden md:table-cell max-w-sm truncate">{claim.paperTitle}</TableCell>
                      <TableCell>{new Date(claim.submissionDate).toLocaleDateString()}</TableCell>
                      <TableCell><Badge variant={claim.status === 'Accepted' || claim.status === 'Submitted to Accounts' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge></TableCell>
                      {isPaymentTab && <TableCell>₹{claim.finalApprovedAmount?.toLocaleString('en-IN') || 'N/A'}</TableCell>}
                      <TableCell className="text-right">
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button aria-haspopup="true" size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Toggle menu</span></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                                  {STATUSES_SIMPLE.map(status => (
                                      <DropdownMenuItem key={status} onClick={() => handleSimpleStatusChange(claim.id, status)} disabled={claim.status === status}>
                                          {status}
                                      </DropdownMenuItem>
                                  ))}
                              </DropdownMenuContent>
                          </DropdownMenu>
                      </TableCell>
                  </TableRow>
              ))}
          </TableBody>
      </Table>
  );

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Manage Incentive Claims" description="Review and manage all submitted incentive claims." />
      <div className="mt-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="payment-processing">Payment Processing ({getFilteredClaims('payment-processing').length})</TabsTrigger>
                <TabsTrigger value="all-claims">All Claims ({claims.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="payment-processing" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Processing Queue</CardTitle>
                    <CardDescription>Claims that are approved and awaiting payment.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                      {getFilteredClaims('payment-processing').length > 0 ? renderTable(getFilteredClaims('payment-processing'), true) : <p className="text-center text-muted-foreground">No claims are currently pending payment.</p>}
                  </CardContent>
                  <CardFooter className="justify-between border-t p-4">
                      <span className="text-sm text-muted-foreground">{selectedClaims.length} selected</span>
                      <div className="flex gap-2">
                          <Button onClick={() => setIsSheetDialogOpen(true)} disabled={selectedClaims.length === 0 || isProcessing}>Generate Payment Sheet</Button>
                          <Button onClick={() => handleBulkAction('submitToAccounts')} disabled={selectedClaims.length === 0 || isProcessing}>Submit to Accounts</Button>
                          <Button onClick={() => handleBulkAction('markPaid')} disabled={selectedClaims.length === 0 || isProcessing}>Mark as Paid</Button>
                      </div>
                  </CardFooter>
                </Card>
            </TabsContent>
            <TabsContent value="all-claims" className="mt-4">
                 <Card>
                  <CardHeader>
                    <CardTitle>All Incentive Claims</CardTitle>
                    <CardDescription>View and manage the status of all claims submitted to the portal.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                      {getFilteredClaims('all-claims').length > 0 ? renderTable(getFilteredClaims('all-claims'), false) : <p className="text-center text-muted-foreground">No claims have been submitted yet.</p>}
                  </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
      </div>

       <Dialog open={isSheetDialogOpen} onOpenChange={setIsSheetDialogOpen}>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Generate Payment Sheet</DialogTitle>
                    <DialogDescription>Add remarks for each claim and provide a reference number for the payment sheet.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div className="space-y-2">
                        <Label htmlFor="ref-num">Reference Number</Label>
                        <Input id="ref-num" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="e.g., RDC/PAY/2024/01" />
                    </div>
                    <Table>
                        <TableHeader><TableRow><TableHead>Claimant</TableHead><TableHead>Amount</TableHead><TableHead className="w-[50%]">Remarks</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {selectedClaims.map(id => {
                                const claim = claims.find(c => c.id === id);
                                if (!claim) return null;
                                return (
                                    <TableRow key={id}>
                                        <TableCell>{claim.userName}</TableCell>
                                        <TableCell>₹{claim.finalApprovedAmount?.toLocaleString('en-IN')}</TableCell>
                                        <TableCell>
                                            <Input 
                                                value={remarks[id] || ''}
                                                onChange={(e) => setRemarks(prev => ({ ...prev, [id]: e.target.value }))}
                                                placeholder="Optional remarks..."
                                            />
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleGenerateSheet} disabled={isProcessing || !referenceNumber}>
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>}
                        Generate & Download
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
  );
}

    