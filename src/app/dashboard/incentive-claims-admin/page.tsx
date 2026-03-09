
'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { db } from '@/lib/config';
import { collection, getDocs, doc, orderBy, query } from 'firebase/firestore';
import type { IncentiveClaim } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { updateIncentiveClaimStatus } from '@/app/actions';

const STATUSES: IncentiveClaim['status'][] = ['Pending', 'Accepted', 'Rejected'];

export default function ManageIncentiveClaimsPage() {
  const [claims, setClaims] = useState<IncentiveClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const claimsCollection = collection(db, 'incentiveClaims');
      const q = query(claimsCollection, orderBy('submissionDate', 'desc'));
      const claimSnapshot = await getDocs(q);
      const claimList = claimSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim));
      setClaims(claimList);
    } catch (error) {
      console.error("Error fetching claims:", error);
      toast({ variant: 'destructive', title: "Error", description: "Could not fetch incentive claims." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const handleStatusChange = useCallback(async (id: string, newStatus: IncentiveClaim['status']) => {
    const result = await updateIncentiveClaimStatus(id, newStatus);
    if (result.success) {
      toast({ title: 'Status Updated', description: "The claim's status has been changed and the user has been notified." });
      fetchClaims(); 
    } else {
       toast({ variant: 'destructive', title: "Error", description: result.error || "Could not update status." });
    }
  }, [fetchClaims, toast]);
  
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

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Manage Incentive Claims" description="Review and manage all submitted incentive claims." />
      <div className="mt-8">
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claimant</TableHead>
                  <TableHead className="hidden md:table-cell">Paper Title</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{claim.userName}</TableCell>
                      <TableCell className="hidden md:table-cell max-w-sm truncate">{claim.paperTitle}</TableCell>
                      <TableCell>{new Date(claim.submissionDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant={claim.status === 'Accepted' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                         <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button aria-haspopup="true" size="icon" variant="ghost">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Toggle menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                             {STATUSES.map(status => (
                                <DropdownMenuItem 
                                    key={status} 
                                    onClick={() => handleStatusChange(claim.id, status)}
                                    disabled={claim.status === status}
                                >
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
