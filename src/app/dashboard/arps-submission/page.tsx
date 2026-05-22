'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, FileText, CheckCircle, Clock, XCircle, Eye, AlertTriangle, Trash2, Edit } from 'lucide-react';
import { type ArpsSubmission, type User } from '@/types';
import { useRouter } from 'next/navigation';
import { getArpsSubmissions, deleteArpsSubmission, getArpsEvaluationCycles } from '@/app/arps-actions';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/config';

export default function ArpsSubmissionDashboard() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [submissions, setSubmissions] = useState<ArpsSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  // ARPS preview removed for end users — calculation logic hidden
  const [activeTab, setActiveTab] = useState<'all' | 'Draft' | 'Submitted' | 'Approved' | 'Rejected'>('all');
  const [selectedSub, setSelectedSub] = useState<ArpsSubmission | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [cycleLocked, setCycleLocked] = useState(false);
  const [cycleEndDate, setCycleEndDate] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const selectedYear = '2025-26';

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setCurrentUser(parsedUser);
      
      const unsub = onSnapshot(doc(db, 'users', parsedUser.uid), (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data() as User;
          setCurrentUser(prev => prev ? { ...prev, ...userData } : userData);
          localStorage.setItem('user', JSON.stringify({ ...parsedUser, ...userData }));
        }
      });
      return () => unsub();
    } else {
      router.push('/login');
    }
  }, [router]);

  const loadSubmissions = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [subsRes, cyclesRes] = await Promise.all([
        getArpsSubmissions({ uid: currentUser.uid, academicYear: selectedYear }),
        getArpsEvaluationCycles()
      ]);
      if (subsRes.success) {
        setSubmissions(subsRes.submissions || []);
      }
      if (cyclesRes.success && cyclesRes.cycles[selectedYear]) {
        const cycle = cyclesRes.cycles[selectedYear];
        if (cycle.finalDate) {
          setCycleEndDate(cycle.finalDate);
          if (new Date() > new Date(cycle.finalDate)) {
            setCycleLocked(true);
          }
        }
        if (cycle.status === 'frozen') {
          setCycleLocked(true);
        }
      }
    } catch (error) {
      console.error('Failed to load ARPS submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadSubmissions();
    }
  }, [currentUser, selectedYear]);

  const handleDelete = async (id: string) => {
    setIsDeletingId(id);
    const res = await deleteArpsSubmission(id);
    setIsDeletingId(null);
    if (res.success) {
      toast({ title: 'Submission Deleted', description: 'Your draft submission was removed.' });
      loadSubmissions();
    } else {
      toast({ variant: 'destructive', title: 'Delete Failed', description: res.error });
    }
  };

  // Submission types configuration
  const submissionTypes = [
    { type: 'publication', label: 'Research Publications', desc: 'Journals (Q1-Q4), Book Chapters, Books & Conference Proceedings', href: '/dashboard/arps-submission/publication' },
    { type: 'patent', label: 'Patents Published / Granted', desc: 'Published or Granted Patents (India or International)', href: '/dashboard/arps-submission/patent' },
    { type: 'consultancy', label: 'Consultancy Projects', desc: 'Revenue-generating external consultancy assignments', href: '/dashboard/arps-submission/consultancy' },
    { type: 'EMR', label: 'EMR Sanctioned / Ongoing', desc: 'Extramural Research Projects (sanctioned/ongoing)', href: '/dashboard/arps-submission/emr' },
    { type: 'student', label: 'Students Guided', desc: 'PhD Scholars & PG Dissertations guided', href: '/dashboard/arps-submission/student' },
    { type: 'activity', label: 'Academic Activities', desc: 'Conferences, talks, coordinations, and professional body memberships', href: '/dashboard/arps-submission/activity' },
  ];

  const getStatusBadge = (status: ArpsSubmission['status']) => {
    switch (status) {
      case 'Draft': return <Badge variant="secondary" className="bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200">Draft</Badge>;
      case 'Submitted': return <Badge className="bg-blue-500 text-white hover:bg-blue-600">Submitted</Badge>;
      case 'Under Review': return <Badge className="bg-amber-500 text-white hover:bg-amber-600">Under Review</Badge>;
      case 'Approved': return <Badge className="bg-emerald-500 text-white hover:bg-emerald-600">Approved</Badge>;
      case 'Rejected': return <Badge className="bg-rose-500 text-white hover:bg-rose-600">Rejected</Badge>;
      case 'Resubmission Required': return <Badge className="bg-purple-500 text-white hover:bg-purple-600">Revision Required</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredSubmissions = submissions.filter(s => activeTab === 'all' || s.status === activeTab);

  const stats = {
    total: submissions.length,
    pending: submissions.filter(s => s.status === 'Submitted' || s.status === 'Under Review').length,
    approved: submissions.filter(s => s.status === 'Approved').length,
    rejected: submissions.filter(s => s.status === 'Rejected').length,
  };

  const hasRequiredProfileDetails = currentUser?.hIndex !== undefined && currentUser?.i10Index !== undefined && currentUser?.citationCount !== undefined;
  const isCreationBlocked = cycleLocked || !hasRequiredProfileDetails;

  if (!currentUser) return null;

  return (
    <div className="container mx-auto py-10 px-4 md:px-8 space-y-8 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="ARPS Submissions & Calculation"
          description={`Manage and submit your research achievements for the Annual Research Performance Score (ARPS). Last Date: ${cycleEndDate ? new Date(cycleEndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not Announced'}`}
        />
        <div className="flex items-center gap-2 self-start md:self-center bg-muted p-1 rounded-lg">
          <span className="text-xs font-semibold px-2 text-muted-foreground">Academic Cycle:</span>
          <span className="text-xs font-semibold">2025-26</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <span className="ml-4 text-muted-foreground">Loading submissions...</span>
        </div>
      ) : (
        <>
          {cycleLocked && (
            <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-rose-800 dark:text-rose-200">Submission Window Closed</h3>
                <p className="text-sm text-rose-700/80 dark:text-rose-300/80 mt-1">
                  The final deadline for new submissions and draft edits has passed. You can only view your existing applications or edit those explicitly returned for correction.
                </p>
              </div>
            </div>
          )}

          {!hasRequiredProfileDetails && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex items-start gap-3 mt-4">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-amber-800 dark:text-amber-200">Profile Details Missing</h3>
                <p className="text-sm text-amber-700/80 dark:text-amber-300/80 mt-1">
                  You must save your H-Index (Scopus), i10 Index (Google Scholar), and Citation Count (Scopus) on your profile before you can create new ARPS submissions.
                </p>
                <Button variant="outline" size="sm" className="mt-3 bg-white hover:bg-amber-50 text-amber-700 border-amber-200" onClick={() => router.push('/dashboard/settings#scopus-metrics')}>
                  Update Profile
                </Button>
              </div>
            </div>
          )}

          {/* Quick Metrics & Live Score Previews */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            <Card className="shadow-lg border-t-4 border-t-emerald-500 bg-background/55 backdrop-blur-md transition-all hover:scale-[1.01]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
                  Approved Items
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold tracking-tight text-emerald-600">
                  {stats.approved}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Contributing to final score</p>
              </CardContent>
            </Card>

            <Card className="shadow-lg border-t-4 border-t-blue-500 bg-background/55 backdrop-blur-md transition-all hover:scale-[1.01]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
                  Pending Verification
                  <Clock className="h-4 w-4 text-blue-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold tracking-tight text-blue-600">
                  {stats.pending}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Awaiting admin review</p>
              </CardContent>
            </Card>
          </div>

          {/* ARPS component breakdown removed for end users */}

          {/* New Submissions Cards Grid */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold tracking-tight">Create New ARPS Claim Submissions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {submissionTypes.map((item, idx) => (
                <Card key={idx} className={`flex flex-col justify-between transition-all border border-border relative overflow-hidden bg-background ${isCreationBlocked ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-xl group'}`}>
                  <div className="p-6">
                    <h3 className={`font-bold text-base text-foreground ${!isCreationBlocked ? 'group-hover:text-primary' : ''} transition-colors`}>{item.label}</h3>
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.desc}</p>
                  </div>
                  <div className="p-6 pt-0 mt-auto">
                    <Button
                      onClick={() => !isCreationBlocked && router.push(item.href)}
                      disabled={isCreationBlocked}
                      className={`w-full mt-2 ${!isCreationBlocked ? 'group-hover:bg-primary' : ''}`}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Submit Entry
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* My Submissions Table/List */}
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <h2 className="text-lg font-bold tracking-tight">My ARPS Submissions History</h2>
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected'] as const).map(tab => (
                  <Button
                    key={tab}
                    variant={activeTab === tab ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab(tab)}
                    className="capitalize text-xs px-3 py-1 h-auto"
                  >
                    {tab === 'all' ? 'All' : tab}
                  </Button>
                ))}
              </div>
            </div>

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-wider border-b">
                      <th className="px-6 py-4">Submission ID</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Title / Name</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Submitted Date</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredSubmissions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                          No submissions found for the selected cycle.
                        </td>
                      </tr>
                    ) : (
                      filteredSubmissions.map(sub => {
                        const title = sub.paperTitle || sub.patentTitle || sub.consultancyTitle || sub.projectTitle || sub.studentName || sub.eventName || 'N/A';
                        return (
                          <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-mono font-medium text-xs">{sub.submissionId}</td>
                            <td className="px-6 py-4 capitalize text-xs">{sub.submissionType}</td>
                            <td className="px-6 py-4 font-medium max-w-xs truncate">{title}</td>
                            <td className="px-6 py-4">{getStatusBadge(sub.status)}</td>
                            <td className="px-6 py-4 text-xs text-muted-foreground">
                              {sub.submissionDate ? new Date(sub.submissionDate).toLocaleDateString('en-GB') : 'N/A'}
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedSub(sub);
                                  setIsHistoryOpen(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              {(sub.status === 'Resubmission Required' || sub.status === 'Returned for Correction' || (!cycleLocked && (sub.status === 'Draft' || sub.status === 'Rejected'))) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => router.push(`/dashboard/arps-submission/${sub.submissionType}?edit=${sub.id}`)}
                                >
                                  <Edit className="h-4 w-4 text-blue-500" />
                                </Button>
                              )}

                              {!cycleLocked && sub.status === 'Draft' && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled={isDeletingId === sub.id}
                                  onClick={() => handleDelete(sub.id)}
                                >
                                  {isDeletingId === sub.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 text-rose-500" />
                                  )}
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* History & Details Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submission Details & Audit Trail</DialogTitle>
            <DialogDescription>
              Details and transition history for {selectedSub?.submissionId}
            </DialogDescription>
          </DialogHeader>

          {selectedSub && (
            <div className="space-y-6 pt-4">
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/40 p-4 rounded-xl border">
                <div>
                  <span className="text-xs text-muted-foreground block">Submission Type</span>
                  <span className="font-semibold capitalize">{selectedSub.submissionType}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Academic Year</span>
                  <span className="font-semibold">{selectedSub.academicYear}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Status</span>
                  <span className="font-semibold">{getStatusBadge(selectedSub.status)}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Submission Date</span>
                  <span className="font-semibold">
                    {selectedSub.submissionDate ? new Date(selectedSub.submissionDate).toLocaleString('en-IN') : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Specific detail rendering based on type */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Item Metadata</h4>
                <div className="space-y-2 text-sm bg-background border p-4 rounded-xl">
                  {selectedSub.submissionType === 'publication' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground">Title:</span> {selectedSub.paperTitle}</div>
                      <div><span className="text-muted-foreground">DOI:</span> {selectedSub.doi}</div>
                      <div><span className="text-muted-foreground">Journal:</span> {selectedSub.journalName}</div>
                      <div><span className="text-muted-foreground">Quartile:</span> {selectedSub.journalClassification}</div>
                      <div><span className="text-muted-foreground">Author Position:</span> {selectedSub.authorPosition}</div>
                      <div><span className="text-muted-foreground">Index Type:</span> {selectedSub.indexType}</div>
                    </div>
                  )}

                  {selectedSub.submissionType === 'patent' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground">Title:</span> {selectedSub.patentTitle}</div>
                      <div><span className="text-muted-foreground">Patent Number:</span> {selectedSub.patentNumber}</div>
                      <div><span className="text-muted-foreground">Category:</span> {selectedSub.patentCategory}</div>
                      <div><span className="text-muted-foreground">Filing Date:</span> {selectedSub.filingDate}</div>
                      <div><span className="text-muted-foreground">Grant Date:</span> {selectedSub.grantDate}</div>
                    </div>
                  )}

                  {selectedSub.submissionType === 'consultancy' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground">Title:</span> {selectedSub.consultancyTitle}</div>
                      <div><span className="text-muted-foreground">Client:</span> {selectedSub.clientOrganization}</div>
                      <div><span className="text-muted-foreground">Revenue Amount:</span> ₹{selectedSub.revenueAmount?.toLocaleString('en-IN')}</div>
                      <div><span className="text-muted-foreground">Transaction Date:</span> {selectedSub.transactionDate}</div>
                    </div>
                  )}

                  {selectedSub.submissionType === 'EMR' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground">Title:</span> {selectedSub.projectTitle}</div>
                      <div><span className="text-muted-foreground">Agency:</span> {selectedSub.fundingAgency}</div>
                      <div><span className="text-muted-foreground">Sanction Amount:</span> ₹{selectedSub.sanctionAmount?.toLocaleString('en-IN')}</div>
                      <div><span className="text-muted-foreground">Role:</span> {selectedSub.role}</div>
                      <div><span className="text-muted-foreground">Status:</span> {selectedSub.projectStatus}</div>
                    </div>
                  )}

                  {selectedSub.submissionType === 'student' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-muted-foreground">Student Name:</span> {selectedSub.studentName}</div>
                      <div><span className="text-muted-foreground">Program:</span> {selectedSub.program}</div>
                      <div><span className="text-muted-foreground">Status:</span> {selectedSub.studentStatus}</div>
                      <div><span className="text-muted-foreground">Allotment details:</span> {selectedSub.allotmentDetails}</div>
                    </div>
                  )}

                  {selectedSub.submissionType === 'activity' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground">Event Name:</span> {selectedSub.eventName}</div>
                      <div><span className="text-muted-foreground">Category:</span> {selectedSub.activityCategory}</div>
                      <div><span className="text-muted-foreground">Organization:</span> {selectedSub.organization}</div>
                      <div><span className="text-muted-foreground">Duration (days):</span> {selectedSub.eventDurationDays}</div>
                      <div><span className="text-muted-foreground">Location:</span> {selectedSub.location}</div>
                      <div><span className="text-muted-foreground">Role performed:</span> {selectedSub.rolePerformed}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Proof URL Preview */}
              {selectedSub.proofUrls && selectedSub.proofUrls.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Uploaded Proof Documents</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedSub.proofUrls.map((url, i) => (
                      <Button key={i} size="sm" variant="outline" onClick={() => window.open(url, '_blank')} className="text-xs">
                        <FileText className="h-4 w-4 mr-1 text-primary" /> View Document {i + 1}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Review Remarks */}
              {selectedSub.remarks && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl flex gap-3 text-sm">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                  <div>
                    <span className="font-bold text-amber-800 dark:text-amber-200">Reviewer Remarks:</span>
                    <p className="mt-1 text-muted-foreground">{selectedSub.remarks}</p>
                  </div>
                </div>
              )}

              {/* Audit logs */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Audit History Logs</h4>
                <div className="border rounded-xl divide-y">
                  {selectedSub.history?.map((h, i) => (
                    <div key={i} className="p-3 text-xs flex justify-between gap-4">
                      <div>
                        <span className="font-semibold text-foreground">{h.action}</span>
                        {h.remarks && <p className="text-muted-foreground mt-0.5 italic">"{h.remarks}"</p>}
                      </div>
                      <span className="text-muted-foreground shrink-0">{new Date(h.timestamp).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
