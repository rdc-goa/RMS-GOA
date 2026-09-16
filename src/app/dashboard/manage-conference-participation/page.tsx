'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/config';
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/types';
import { type ConferenceParticipation, reviewConferenceParticipation } from '@/services/conference-participation-service';

// UI components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, 
  Presentation, 
  CheckCircle2, 
  XCircle, 
  Info, 
  Calendar,
  Users,
  Search,
  History,
  FileCheck2,
  Check,
  X
} from 'lucide-react';

export default function ManageConferenceParticipationPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [submissions, setSubmissions] = useState<ConferenceParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();
  
  // Review Modal State
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ConferenceParticipation | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Get current user profile from Firestore in real-time
  useEffect(() => {
    let unsubscribeUser: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setCurrentUser(null);
        setAuthLoading(false);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      unsubscribeUser = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          setCurrentUser({ uid: firebaseUser.uid, ...docSnap.data() } as User);
        }
        setAuthLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  // Enforce page authorization check
  useEffect(() => {
    if (!authLoading && currentUser) {
      if (!currentUser.allowedModules?.includes('manage-conference-participation')) {
        toast({ variant: 'destructive', title: 'Access Denied', description: 'You do not have permission to view this page.' });
        router.replace('/dashboard');
      }
    }
  }, [currentUser, authLoading, router, toast]);

  // Sync all requests from Firestore
  useEffect(() => {
    if (!currentUser) return;

    let unsubscribeSnapshot: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const q = query(
        collection(db, 'conferenceParticipations'),
        orderBy('submissionDate', 'desc')
      );

      unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
          const docs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as ConferenceParticipation[];
          setSubmissions(docs);
          setLoading(false);
        },
        (error) => {
          console.error('Error syncing submissions:', error);
          toast({ variant: 'destructive', title: 'Sync Error', description: 'Failed to load requests.' });
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [currentUser, toast]);

  const isAdminOrCro = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.role === 'Super-admin' || currentUser.role === 'admin' || currentUser.role === 'CRO';
  }, [currentUser]);

  // Filter requests pending current user's review
  const pendingRequests = useMemo(() => {
    if (!currentUser) return [];
    const email = currentUser.email.toLowerCase();

    return submissions.filter((sub) => {
      const isSearchMatched = 
        sub.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.conferenceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.department.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!isSearchMatched) return false;

      if (isAdminOrCro) {
        return sub.status === 'Pending HOD Approval' || sub.status === 'Pending Principal Approval';
      }

      const isPendingHod = sub.hodEmail.toLowerCase() === email && sub.status === 'Pending HOD Approval';
      const isPendingPrincipal = sub.principalEmail.toLowerCase() === email && sub.status === 'Pending Principal Approval';

      return isPendingHod || isPendingPrincipal;
    });
  }, [submissions, currentUser, isAdminOrCro, searchTerm]);

  // Filter requests already reviewed by current user (or all resolved requests if Admin)
  const historyRequests = useMemo(() => {
    if (!currentUser) return [];
    const email = currentUser.email.toLowerCase();

    return submissions.filter((sub) => {
      const isSearchMatched = 
        sub.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.conferenceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.department.toLowerCase().includes(searchTerm.toLowerCase());

      if (!isSearchMatched) return false;

      if (isAdminOrCro) {
        return sub.status === 'Approved' || sub.status === 'Rejected';
      }

      // Check if user has acted on it in history
      const hasActed = sub.history?.some(h => h.actorEmail.toLowerCase() === email && h.action.includes('Approved') || h.action.includes('Rejected')) || false;
      return hasActed && (sub.status === 'Approved' || sub.status === 'Rejected' || sub.status === 'Pending Principal Approval');
    });
  }, [submissions, currentUser, isAdminOrCro, searchTerm]);

  // Determine reviewer role for selected request
  const reviewerRole = useMemo(() => {
    if (!selectedRequest || !currentUser) return null;
    if (isAdminOrCro) {
      return selectedRequest.status === 'Pending HOD Approval' ? 'HOD' : 'Principal';
    }
    const email = currentUser.email.toLowerCase();
    if (selectedRequest.hodEmail.toLowerCase() === email && selectedRequest.status === 'Pending HOD Approval') return 'HOD';
    if (selectedRequest.principalEmail.toLowerCase() === email && selectedRequest.status === 'Pending Principal Approval') return 'Principal';
    return null;
  }, [selectedRequest, currentUser, isAdminOrCro]);

  // Action Submit (Approve / Reject)
  const handleReviewAction = async (approved: boolean) => {
    if (!selectedRequest || !currentUser || !reviewerRole) return;
    if (!approved && !comments.trim()) {
      toast({
        variant: 'destructive',
        title: 'Comments Required',
        description: 'Please provide comments/reasons for rejection.',
      });
      return;
    }

    setSubmitting(true);

    const res = await reviewConferenceParticipation(
      selectedRequest.id!,
      currentUser.email,
      currentUser.name || 'N/A',
      reviewerRole,
      approved,
      comments
    );

    if (res.success) {
      toast({
        title: approved ? 'Request Approved' : 'Request Rejected',
        description: `Successfully processed review action on the request.`,
      });
      setIsReviewOpen(false);
      setComments('');
    } else {
      toast({
        variant: 'destructive',
        title: 'Review Action Failed',
        description: res.error || 'Failed to submit action.',
      });
    }

    setSubmitting(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending HOD Approval':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 font-bold border-none">Pending HOD</Badge>;
      case 'Pending Principal Approval':
        return <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 font-bold border-none">Pending Principal</Badge>;
      case 'Approved':
        return <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 font-bold border-none">Approved</Badge>;
      case 'Rejected':
        return <Badge variant="secondary" className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 font-bold border-none">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      <div className="border-b pb-5">
        <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Manage Conference Participation</h1>
        <p className="text-sm text-muted-foreground mt-1">Review and process conference participation pre-approvals for faculty members.</p>
      </div>

      {/* Filter and search */}
      <div className="flex items-center gap-3 bg-card p-3 rounded-lg border shadow-sm max-w-md">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input 
          type="text" 
          placeholder="Search by faculty, conference, department..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="border-none bg-transparent shadow-none focus-visible:ring-0 p-0 text-xs h-7"
        />
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="grid w-full sm:w-[400px] grid-cols-2">
          <TabsTrigger value="pending" className="font-bold relative">
            Pending Reviews
            {pendingRequests.length > 0 && (
              <span className="ml-1.5 bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full font-black animate-pulse">
                {pendingRequests.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="font-bold">Review History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="m-0">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg font-bold">Pending Approvals</CardTitle>
              <CardDescription>A list of conference participation requests awaiting your review.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : pendingRequests.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <FileCheck2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Clean Queue</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">There are no pending conference participation approval requests for you to review.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                      <tr>
                        <th className="py-3 px-4">Faculty Member</th>
                        <th className="py-3 px-4">Conference Details</th>
                        <th className="py-3 px-4 text-right">Est. Cost</th>
                        <th className="py-3 px-4">Current Stage</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pendingRequests.map((sub) => (
                        <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-4 px-4">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{sub.userName}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{sub.department} • {sub.institute}</div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{sub.conferenceName}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {sub.venue} • {new Date(sub.conferenceStartDate).toLocaleDateString('en-GB')}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                            ₹{sub.totalAmount.toLocaleString('en-IN')}
                          </td>
                          <td className="py-4 px-4">{getStatusBadge(sub.status)}</td>
                          <td className="py-4 px-4 text-center">
                            <Button 
                              size="sm" 
                              onClick={() => {
                                setSelectedRequest(sub);
                                setIsReviewOpen(true);
                              }}
                              className="bg-primary hover:bg-primary/95 text-white text-xs font-bold"
                            >
                              Review & Act
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="m-0">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg font-bold">Review History</CardTitle>
              <CardDescription>A list of conference participation requests you have already reviewed or decided.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-6 space-y-3">
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : historyRequests.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <History className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">No History</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">You have not reviewed any conference participation requests yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                      <tr>
                        <th className="py-3 px-4">Faculty Member</th>
                        <th className="py-3 px-4">Conference Details</th>
                        <th className="py-3 px-4 text-right">Est. Cost</th>
                        <th className="py-3 px-4">Final Status</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {historyRequests.map((sub) => (
                        <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-4 px-4">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{sub.userName}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{sub.department} • {sub.institute}</div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{sub.conferenceName}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {sub.venue} • {new Date(sub.conferenceStartDate).toLocaleDateString('en-GB')}
                            </div>
                          </td>
                          <td className="py-4 px-4 text-right font-semibold text-slate-700 dark:text-slate-300">
                            ₹{sub.totalAmount.toLocaleString('en-IN')}
                          </td>
                          <td className="py-4 px-4">{getStatusBadge(sub.status)}</td>
                          <td className="py-4 px-4 text-center">
                            <Button 
                              variant="ghost"
                              size="sm" 
                              onClick={() => {
                                setSelectedRequest(sub);
                                setIsReviewOpen(true); // Detail mode
                              }}
                              className="text-primary hover:text-primary/95 text-xs font-bold"
                            >
                              View details
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Modal */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          {selectedRequest && (
            <div className="space-y-6 animate-in zoom-in-95 duration-200">
              <DialogHeader>
                <div className="flex justify-between items-center pr-4">
                  <DialogTitle className="text-lg font-bold">
                    {reviewerRole ? `Review Request: ${reviewerRole} Stage` : 'Review Request (Read Only)'}
                  </DialogTitle>
                  {getStatusBadge(selectedRequest.status)}
                </div>
                <DialogDescription>
                  Submitted by {selectedRequest.userName} (${selectedRequest.misId}) on {new Date(selectedRequest.submissionDate).toLocaleDateString('en-GB')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-xs border-b pb-4">
                  <div>
                    <span className="text-[10px] text-muted-foreground font-semibold block">Faculty</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.faculty}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-semibold block">Institute</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.institute}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-semibold block">Department</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.department}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-semibold block">Conference Name</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.conferenceName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-semibold block">Organizer</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.organizerName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-semibold block">Venue</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.venue}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-semibold block">Dates</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {new Date(selectedRequest.conferenceStartDate).toLocaleDateString('en-GB')} to {new Date(selectedRequest.conferenceEndDate).toLocaleDateString('en-GB')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-semibold block">Presentation Type</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.presentationType}</span>
                  </div>
                  {selectedRequest.paperTitle && (
                    <div className="col-span-2">
                      <span className="text-[10px] text-muted-foreground font-semibold block">Paper Title</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.paperTitle}</span>
                    </div>
                  )}
                </div>

                {/* Financial Details */}
                <div className="border-b pb-4 space-y-2">
                  <span className="text-xs text-muted-foreground font-black uppercase tracking-wider block">Estimated Budget Details</span>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-muted/30 p-2.5 rounded text-center">
                      <div className="text-muted-foreground font-semibold">Registration</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 mt-1">₹{selectedRequest.registrationFee.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="bg-muted/30 p-2.5 rounded text-center">
                      <div className="text-muted-foreground font-semibold">Travel Fare</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 mt-1">₹{selectedRequest.travelFare.toLocaleString('en-IN')}</div>
                    </div>
                    <div className="bg-muted/30 p-2.5 rounded text-center">
                      <div className="text-muted-foreground font-semibold">Accommodation</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 mt-1">₹{selectedRequest.accommodationFare.toLocaleString('en-IN')}</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-muted/40 p-2.5 rounded border border-dashed text-sm">
                    <span className="font-semibold text-muted-foreground">Total Budget Estimate:</span>
                    <span className="font-black text-primary">₹{selectedRequest.totalAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                {/* Stage Approver Comments */}
                <div className="space-y-3 border-b pb-4">
                  <span className="text-xs text-muted-foreground font-black uppercase tracking-wider block">Current Workflow Stage Comments</span>
                  <div className="space-y-2 text-xs">
                    <div className="border rounded-lg p-2.5 bg-slate-50/50 dark:bg-slate-900/30">
                      <div className="flex justify-between font-semibold">
                        <span>HOD Approval ({selectedRequest.hodName})</span>
                        {selectedRequest.hodApproval ? (
                          <span className={selectedRequest.hodApproval.approved ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                            {selectedRequest.hodApproval.approved ? 'Approved' : 'Rejected'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Pending Review</span>
                        )}
                      </div>
                      {selectedRequest.hodApproval?.comments && (
                        <p className="italic text-muted-foreground mt-1.5">"{selectedRequest.hodApproval.comments}"</p>
                      )}
                    </div>

                    <div className="border rounded-lg p-2.5 bg-slate-50/50 dark:bg-slate-900/30">
                      <div className="flex justify-between font-semibold">
                        <span>Principal Approval ({selectedRequest.principalName})</span>
                        {selectedRequest.principalApproval ? (
                          <span className={selectedRequest.principalApproval.approved ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                            {selectedRequest.principalApproval.approved ? 'Approved' : 'Rejected'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Pending Review</span>
                        )}
                      </div>
                      {selectedRequest.principalApproval?.comments && (
                        <p className="italic text-muted-foreground mt-1.5">"{selectedRequest.principalApproval.comments}"</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Workflow History */}
                {selectedRequest.history && selectedRequest.history.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <span className="text-xs text-muted-foreground font-black uppercase tracking-wider block">Workflow Timeline</span>
                    <div className="relative pl-5 border-l border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                      {selectedRequest.history.map((hist, idx) => (
                        <div key={idx} className="relative">
                          <div className="absolute -left-[26px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-slate-400 dark:bg-slate-700 flex items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-white"></div>
                          </div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">{hist.action}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            By {hist.actorName} • {new Date(hist.date).toLocaleString()}
                          </div>
                          {hist.comments && (
                            <p className="text-[11px] text-muted-foreground mt-1 italic">"{hist.comments}"</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Review Action Form (Visible only if reviewer role applies and status matches) */}
                {reviewerRole && (
                  <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-4 border space-y-3 mt-4 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">Submit Review Decision as {reviewerRole}</div>
                    
                    <div className="space-y-1.5">
                      <Label htmlFor="reviewComments" className="text-xs font-bold">Review Comments/Reasons</Label>
                      <Textarea 
                        id="reviewComments"
                        placeholder={selectedRequest.status === 'Pending HOD Approval' ? 'e.g., Recommended, relevant topic.' : 'Provide rejection reason if rejecting.'}
                        value={comments}
                        onChange={e => setComments(e.target.value)}
                        className="text-xs h-20"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t mt-3">
                      <Button 
                        type="button" 
                        variant="destructive" 
                        disabled={submitting} 
                        onClick={() => handleReviewAction(false)}
                        className="text-xs font-bold gap-1.5 text-white"
                      >
                        <X className="h-3.5 w-3.5" /> Reject Request
                      </Button>
                      <Button 
                        type="button" 
                        disabled={submitting} 
                        onClick={() => handleReviewAction(true)}
                        className="text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve Request
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsReviewOpen(false);
                    setComments('');
                  }}
                  disabled={submitting}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
