
'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { db_rtdb } from '@/lib/config';
import { ref, update } from 'firebase/database';
import type { IncentiveClaim } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useIncentiveClaims } from '@/hooks/use-staff-data';

const STATUSES: IncentiveClaim['status'][] = ['Pending', 'Accepted', 'Rejected'];

export function IncentiveClaimsList() {
  const { claims, isLoading: loading, mutate } = useIncentiveClaims();
  const { toast } = useToast();

  const handleStatusChange = useCallback(async (id: string, newStatus: IncentiveClaim['status']) => {
    try {
      // Legacy Firestore write has been completely purged to strictly enforce the RTDB-only pipeline.
      console.warn("LEGACY: Direct Firestore update in IncentiveClaimsList is disabled. Use the API instead.");

      // Sync to Realtime Database
      try {
        const { sanitizeForRtdb } = await import('@/lib/rtdb-utils');
        const sanitizedUpdate = sanitizeForRtdb({ 
          status: newStatus,
          lastSyncedAt: new Date().toISOString()
        });
        const rtdbRef = ref(db_rtdb, `incentiveClaims/${id}`);
        await update(rtdbRef, sanitizedUpdate);
      } catch (rtdbError) {
        console.error("RTDB Sync Error (handleStatusChange):", rtdbError);
      }


      toast({ title: 'Status Updated', description: "The claim's status has been changed." });
      mutate(); 
    } catch (error) {
       console.error("Error updating status:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not update status." });
    }
  }, [mutate, toast]);

  
  if (loading) {
    return (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          </CardContent>
        </Card>
    );
  }

  return (
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
  );
}
