'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '@/lib/config';
import { collection, query, where, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@/types';
import { type ConferenceParticipation, resolveConferenceHierarchy, submitConferenceParticipation } from '@/services/conference-participation-service';

// UI components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Loader2,
  Plus,
  Presentation,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
  Calendar,
  Building,
  User as UserIcon,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';

export default function ConferenceParticipationPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [submissions, setSubmissions] = useState<ConferenceParticipation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ConferenceParticipation | null>(null);
  const { toast } = useToast();

  // Hierarchy loading state
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchy, setHierarchy] = useState<{
    hod: { email: string; name: string } | null;
    principal: { email: string; name: string } | null;
  } | null>(null);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);

  // Form State
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    conferenceName: '',
    organizerName: '',
    venue: '',
    presentationType: 'Oral',
    paperTitle: '',
    conferenceStartDate: '',
    conferenceEndDate: '',
    registrationFee: 0,
    travelFare: 0,
    accommodationFare: 0,
  });

  // Get current user profile from Firestore in real-time
  useEffect(() => {
    let unsubscribeUser: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setCurrentUser(null);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      unsubscribeUser = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          setCurrentUser({ uid: firebaseUser.uid, ...docSnap.data() } as User);
        }
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUser) unsubscribeUser();
    };
  }, []);

  // Fetch resolved HOD and Principal
  useEffect(() => {
    if (!currentUser?.email) return;

    const fetchHierarchy = async () => {
      setHierarchyLoading(true);
      setHierarchyError(null);
      const res = await resolveConferenceHierarchy(currentUser.email);
      if (res.success) {
        setHierarchy({ hod: res.hod || null, principal: res.principal || null });
        if (!res.hod || !res.principal) {
          setHierarchyError('Warning: HOD or Principal is not configured for your academic branch in the system matrix. Submissions might not route correctly.');
        }
      } else {
        setHierarchyError(res.error || 'Failed to resolve approvals hierarchy.');
      }
      setHierarchyLoading(false);
    };

    fetchHierarchy();
  }, [currentUser]);

  // Sync submissions from Firestore
  useEffect(() => {
    if (!currentUser?.uid) return;

    let unsubscribeSnapshot: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const q = query(
        collection(db, 'conferenceParticipations'),
        where('uid', '==', currentUser.uid),
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
          toast({ variant: 'destructive', title: 'Sync Error', description: 'Failed to load participation requests.' });
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [currentUser, toast]);

  // Sum up estimated costs
  const totalAmount = useMemo(() => {
    return Number(form.registrationFee || 0) + Number(form.travelFare || 0) + Number(form.accommodationFare || 0);
  }, [form.registrationFee, form.travelFare, form.accommodationFare]);

  // Handle Form Submission
  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!hierarchy?.hod || !hierarchy?.principal) {
      toast({
        variant: 'destructive',
        title: 'Submission Blocked',
        description: 'You cannot submit without a resolved HOD and Principal in the system matrix configuration.',
      });
      return;
    }

    if (!form.conferenceName || !form.organizerName || !form.venue || !form.conferenceStartDate || !form.conferenceEndDate) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
      });
      return;
    }

    setSubmitting(true);

    const payload = {
      uid: currentUser.uid,
      userName: currentUser.name || 'N/A',
      userEmail: currentUser.email,
      misId: currentUser.misId || 'N/A',
      faculty: currentUser.faculty || 'N/A',
      institute: currentUser.institute || 'N/A',
      department: currentUser.department || 'N/A',
      conferenceName: form.conferenceName,
      organizerName: form.organizerName,
      venue: form.venue,
      presentationType: form.presentationType,
      paperTitle: form.paperTitle || undefined,
      conferenceStartDate: form.conferenceStartDate,
      conferenceEndDate: form.conferenceEndDate,
      registrationFee: Number(form.registrationFee || 0),
      travelFare: Number(form.travelFare || 0),
      accommodationFare: Number(form.accommodationFare || 0),
      totalAmount,
      hodEmail: hierarchy.hod.email,
      hodName: hierarchy.hod.name,
      principalEmail: hierarchy.principal.email,
      principalName: hierarchy.principal.name,
    };

    const res = await submitConferenceParticipation(payload);

    if (res.success) {
      toast({
        title: 'Applied Successfully',
        description: 'Your conference participation request has been submitted to your HOD.',
      });
      setIsApplyOpen(false);
      // Reset form
      setForm({
        conferenceName: '',
        organizerName: '',
        venue: '',
        presentationType: 'Oral',
        paperTitle: '',
        conferenceStartDate: '',
        conferenceEndDate: '',
        registrationFee: 0,
        travelFare: 0,
        accommodationFare: 0,
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Submission Failed',
        description: res.error || 'Failed to submit the request.',
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
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Conference Participation Approval</h1>
          <p className="text-sm text-muted-foreground mt-1">Apply for department and institute approval prior to participating in academic conferences.</p>
        </div>
        <Button onClick={() => setIsApplyOpen(true)} className="bg-primary hover:bg-primary/95 text-white font-semibold">
          <Plus className="h-4 w-4 mr-2" /> Apply for Approval
        </Button>
      </div>

      {hierarchyError && (
        <Card className="border-amber-200/50 bg-amber-500/5 text-amber-700 dark:text-amber-400">
          <CardContent className="flex items-start gap-3 p-4">
            <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
            <div className="text-xs leading-relaxed">
              <span className="font-bold">Academic Hierarchy Warning:</span> {hierarchyError}
              <p className="mt-1">Please ensure your settings are standardized, or contact RDC support to update your department's mapping config.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main List */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-lg font-bold">Your Requests</CardTitle>
          <CardDescription>View, monitor, and track the live status of your conference pre-approvals.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Presentation className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">No requests submitted</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">You have not submitted any conference pre-participation approval requests yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase border-b">
                  <tr>
                    <th className="py-3 px-4">Date Applied</th>
                    <th className="py-3 px-4">Conference Details</th>
                    <th className="py-3 px-4">Presentation Type</th>
                    <th className="py-3 px-4 text-right">Est. Budget</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {submissions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-4 px-4 font-medium whitespace-nowrap">
                        {new Date(sub.submissionDate).toLocaleDateString('en-GB')}
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{sub.conferenceName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{sub.organizerName} • {sub.venue}</div>
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant="outline" className="text-xs font-semibold">{sub.presentationType}</Badge>
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
                            setIsDetailOpen(true);
                          }}
                          className="text-primary hover:text-primary/95 text-xs font-bold"
                        >
                          View Details
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

      {/* Apply Modal */}
      <Dialog open={isApplyOpen} onOpenChange={setIsApplyOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleApplySubmit} className="space-y-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Apply for Conference Participation</DialogTitle>
              <DialogDescription>Submit your participation details and financial estimates for workflow approvals.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="conferenceName" className="font-bold">Conference Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="conferenceName"
                    placeholder="e.g., International Conference on Machine Learning"
                    value={form.conferenceName}
                    onChange={e => setForm({ ...form, conferenceName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="organizerName" className="font-bold">Organizer Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="organizerName"
                    placeholder="e.g., IEEE Computer Society"
                    value={form.organizerName}
                    onChange={e => setForm({ ...form, organizerName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="venue" className="font-bold">Venue (City, Country) <span className="text-red-500">*</span></Label>
                  <Input
                    id="venue"
                    placeholder="e.g., Panaji, Goa"
                    value={form.venue}
                    onChange={e => setForm({ ...form, venue: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="presentationType" className="font-bold">Presentation Type <span className="text-red-500">*</span></Label>
                  <select
                    id="presentationType"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={form.presentationType}
                    onChange={e => setForm({ ...form, presentationType: e.target.value })}
                  >
                    <option value="Oral">Oral Presentation</option>
                    <option value="Poster">Poster Presentation</option>
                    <option value="Participation Only">Participation Only</option>
                  </select>
                </div>
              </div>

              {form.presentationType !== 'Participation Only' && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Label htmlFor="paperTitle" className="font-bold">Paper Title <span className="text-red-500">*</span></Label>
                  <Input
                    id="paperTitle"
                    placeholder="e.g., A Deep Learning Approach for Climate Forecasting"
                    value={form.paperTitle}
                    onChange={e => setForm({ ...form, paperTitle: e.target.value })}
                    required={form.presentationType !== 'Participation Only'}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="startDate" className="font-bold">Start Date <span className="text-red-500">*</span></Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={form.conferenceStartDate}
                    onChange={e => setForm({ ...form, conferenceStartDate: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="endDate" className="font-bold">End Date <span className="text-red-500">*</span></Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={form.conferenceEndDate}
                    onChange={e => setForm({ ...form, conferenceEndDate: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Financial Estimates */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-black text-slate-700 dark:text-slate-300 mb-3">Estimated Budget Requirements (INR)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="regFee" className="text-xs font-bold text-slate-500">Registration Fee</Label>
                    <Input
                      id="regFee"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={form.registrationFee || ''}
                      onChange={e => setForm({ ...form, registrationFee: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="travelFare" className="text-xs font-bold text-slate-500">Travel Fare (Round-trip)</Label>
                    <Input
                      id="travelFare"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={form.travelFare || ''}
                      onChange={e => setForm({ ...form, travelFare: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="accFare" className="text-xs font-bold text-slate-500">Accommodation Cost</Label>
                    <Input
                      id="accFare"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={form.accommodationFare || ''}
                      onChange={e => setForm({ ...form, accommodationFare: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center bg-muted/40 rounded-lg p-3.5 mt-4 border border-dashed">
                  <span className="text-xs font-semibold text-muted-foreground">Total Estimated Budget:</span>
                  <span className="text-lg font-black text-primary">₹{totalAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Routing/Hierarchy Preview */}
              <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-4 border space-y-2.5">
                <div className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">Approval Authority</div>
                {hierarchyLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Resolving hierarchy from system matrix...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="flex items-center gap-2.5 bg-background p-2.5 rounded border">
                      <UserIcon className="h-4 w-4 text-blue-500 shrink-0" />
                      <div>
                        <div className="text-muted-foreground font-semibold">HOD Approver:</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{hierarchy?.hod?.name || 'Not Configured'}</div>
                        {hierarchy?.hod?.email && <div className="text-[10px] text-muted-foreground mt-0.5">{hierarchy.hod.email}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 bg-background p-2.5 rounded border">
                      <Building className="h-4 w-4 text-indigo-500 shrink-0" />
                      <div>
                        <div className="text-muted-foreground font-semibold">Principal Approver:</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">{hierarchy?.principal?.name || 'Not Configured'}</div>
                        {hierarchy?.principal?.email && <div className="text-[10px] text-muted-foreground mt-0.5">{hierarchy.principal.email}</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsApplyOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || hierarchyLoading || !hierarchy?.hod || !hierarchy?.principal} className="bg-primary text-white font-semibold">
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : 'Submit Application'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          {selectedRequest && (
            <div className="space-y-6">
              <DialogHeader>
                <div className="flex justify-between items-center pr-4">
                  <DialogTitle className="text-lg font-bold">Request Details</DialogTitle>
                  {getStatusBadge(selectedRequest.status)}
                </div>
                <DialogDescription>
                  Applied on {new Date(selectedRequest.submissionDate).toLocaleDateString('en-GB')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm border-b pb-4">
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold block">Conference Name</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.conferenceName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold block">Organizer</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.organizerName}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold block">Venue</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.venue}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold block">Presentation Type</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.presentationType}</span>
                  </div>
                  {selectedRequest.paperTitle && (
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground font-semibold block">Paper Title</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{selectedRequest.paperTitle}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold block">Start Date</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{new Date(selectedRequest.conferenceStartDate).toLocaleDateString('en-GB')}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold block">End Date</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{new Date(selectedRequest.conferenceEndDate).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>

                {/* Financial Breakdown */}
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

                {/* Status and Approver Comments */}
                <div className="space-y-3">
                  <span className="text-xs text-muted-foreground font-black uppercase tracking-wider block">Approval Comments</span>
                  <div className="space-y-2.5 text-xs">
                    <div className="border rounded-lg p-3 space-y-1 bg-slate-50/50 dark:bg-slate-900/30">
                      <div className="flex justify-between font-bold">
                        <span className="text-slate-700 dark:text-slate-300">HOD Approval ({selectedRequest.hodName})</span>
                        {selectedRequest.hodApproval ? (
                          <span className={selectedRequest.hodApproval.approved ? 'text-emerald-600' : 'text-rose-600'}>
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

                    <div className="border rounded-lg p-3 space-y-1 bg-slate-50/50 dark:bg-slate-900/30">
                      <div className="flex justify-between font-bold">
                        <span className="text-slate-700 dark:text-slate-300">Principal Approval ({selectedRequest.principalName})</span>
                        {selectedRequest.principalApproval ? (
                          <span className={selectedRequest.principalApproval.approved ? 'text-emerald-600' : 'text-rose-600'}>
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

                {/* Submission History / Timeline */}
                {selectedRequest.history && selectedRequest.history.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <span className="text-xs text-muted-foreground font-black uppercase tracking-wider block">Workflow Timeline</span>
                    <div className="relative pl-5 border-l border-slate-200 dark:border-slate-800 space-y-4">
                      {selectedRequest.history.map((hist, idx) => (
                        <div key={idx} className="relative text-xs">
                          {/* Dot indicator */}
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
              </div>

              <DialogFooter>
                <Button onClick={() => setIsDetailOpen(false)} className="bg-primary text-white font-semibold">
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
