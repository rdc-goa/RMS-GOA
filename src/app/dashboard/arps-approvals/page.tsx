'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, CheckCircle, XCircle, AlertTriangle, MessageSquare, Eye, Search, ArrowUpDown, ArrowDown, ArrowUp } from 'lucide-react';
import { type ArpsSubmission, type User } from '@/types';
import { useRouter } from 'next/navigation';
import { getArpsSubmissions, reviewArpsSubmission } from '@/app/arps-actions';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export default function ArpsApprovalsPanel() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [submissions, setSubmissions] = useState<ArpsSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<ArpsSubmission | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('Submitted');
  
  // Sorting State
  const [sortColumn, setSortColumn] = useState<string>('submissionDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Review Dialog State
  const [remarks, setRemarks] = useState('');
  const [verifiedCheckboxes, setVerifiedCheckboxes] = useState<Record<string, boolean>>({});

  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const u = JSON.parse(storedUser);
      if (u.role === 'faculty') {
        toast({ variant: 'destructive', title: 'Unauthorized', description: 'Faculty members cannot access the Approvals portal.' });
        router.push('/dashboard/arps-submission');
      } else {
        setCurrentUser(u);
      }
    } else {
      router.push('/login');
    }
  }, [router]);

  const loadPendingSubmissions = async () => {
    setLoading(true);
    try {
      const res = await getArpsSubmissions();
      if (res.success && res.submissions) {
        setSubmissions(res.submissions);
      } else {
        toast({ variant: 'destructive', title: 'Load Failed', description: res.error || 'Could not load submissions.' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadPendingSubmissions();
    }
  }, [currentUser]);

  const getStatusBadge = (status: ArpsSubmission['status']) => {
    switch (status) {
      case 'Submitted': return <Badge className="bg-blue-500 text-white">Submitted</Badge>;
      case 'Under Review': return <Badge className="bg-amber-500 text-white">Under Review</Badge>;
      case 'Approved': return <Badge className="bg-emerald-500 text-white">Approved</Badge>;
      case 'Rejected': return <Badge className="bg-rose-500 text-white">Rejected</Badge>;
      case 'Resubmission Required': return <Badge className="bg-purple-500 text-white">Revision Req.</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleOpenReview = (sub: ArpsSubmission) => {
    setSelectedSub(sub);
    setRemarks(sub.remarks || '');
    // Initialize checkboxes
    const initialChecks: Record<string, boolean> = {};
    if (sub.submissionType === 'publication') {
      initialChecks.doi = sub.verifiedFields?.doi || false;
      initialChecks.quartile = sub.verifiedFields?.quartile || false;
      initialChecks.authorship = sub.verifiedFields?.authorship || false;
      initialChecks.proofPdf = sub.verifiedFields?.proofPdf || false;
    } else if (sub.submissionType === 'patent') {
      initialChecks.patentNo = sub.verifiedFields?.patentNo || false;
      initialChecks.applicant = sub.verifiedFields?.applicant || false;
      initialChecks.certificate = sub.verifiedFields?.certificate || false;
    } else if (sub.submissionType === 'consultancy') {
      initialChecks.revenue = sub.verifiedFields?.revenue || false;
      initialChecks.financeVal = sub.verifiedFields?.financeVal || false;
    } else if (sub.submissionType === 'EMR') {
      initialChecks.sanction = sub.verifiedFields?.sanction || false;
      initialChecks.role = sub.verifiedFields?.role || false;
    } else if (sub.submissionType === 'student') {
      initialChecks.allotment = sub.verifiedFields?.allotment || false;
      initialChecks.enrollment = sub.verifiedFields?.enrollment || false;
    } else if (sub.submissionType === 'activity') {
      initialChecks.certificate = sub.verifiedFields?.certificate || false;
      initialChecks.duration = sub.verifiedFields?.duration || false;
    }
    setVerifiedCheckboxes(initialChecks);
    setIsReviewOpen(true);
  };

  const submitReview = async (newStatus: 'Approved' | 'Rejected' | 'Resubmission Required') => {
    if (!selectedSub || !currentUser) return;

    if (!remarks.trim() && (newStatus === 'Rejected' || newStatus === 'Resubmission Required')) {
      toast({ variant: 'destructive', title: 'Remarks Required', description: 'Please provide remarks justifying rejection or correction request.' });
      return;
    }

    setReviewingId(selectedSub.id);
    try {
      const res = await reviewArpsSubmission(
        selectedSub.id,
        newStatus,
        remarks,
        currentUser.name || 'Admin Reviewer',
        verifiedCheckboxes
      );

      if (res.success) {
        toast({ title: 'Review Saved', description: `Submission is successfully marked as ${newStatus}.` });
        setIsReviewOpen(false);
        loadPendingSubmissions();
      } else {
        toast({ variant: 'destructive', title: 'Review Failed', description: res.error });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'An unexpected error occurred.' });
    } finally {
      setReviewingId(null);
    }
  };

  // Filter submissions
  const filteredSubmissions = submissions.filter(sub => {
    const matchesSearch =
      sub.submissionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (sub.paperTitle || sub.patentTitle || sub.consultancyTitle || sub.projectTitle || sub.studentName || sub.eventName || '')
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === 'all' || sub.submissionType === typeFilter;
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    let valA: any = a[sortColumn as keyof ArpsSubmission];
    let valB: any = b[sortColumn as keyof ArpsSubmission];

    if (sortColumn === 'title') {
      valA = a.paperTitle || a.patentTitle || a.consultancyTitle || a.projectTitle || a.studentName || a.eventName || '';
      valB = b.paperTitle || b.patentTitle || b.consultancyTitle || b.projectTitle || b.studentName || b.eventName || '';
    } else if (sortColumn === 'faculty') {
      valA = a.userName;
      valB = b.userName;
    }

    if (valA === valB) return 0;
    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;
    
    if (typeof valA === 'string' && typeof valB === 'string') {
        const compare = valA.localeCompare(valB);
        return sortDirection === 'asc' ? compare : -compare;
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const renderSortableHeader = (column: string, label: string, align: 'left' | 'right' = 'left') => {
    const isActive = sortColumn === column;
    return (
      <th 
        key={column}
        className={`px-6 py-4 cursor-pointer hover:bg-muted/50 transition-colors ${align === 'right' ? 'text-right' : ''}`} 
        onClick={() => {
          if (isActive) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
          } else {
            setSortColumn(column);
            setSortDirection('asc');
          }
        }}
      >
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          {label}
          {isActive ? (
            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
          ) : (
            <ArrowUpDown className="h-3 w-3 text-muted-foreground/30" />
          )}
        </div>
      </th>
    );
  };

  const stats = {
    pending: submissions.filter(s => s.status === 'Submitted').length,
    underReview: submissions.filter(s => s.status === 'Under Review').length,
    approved: submissions.filter(s => s.status === 'Approved').length,
    rejected: submissions.filter(s => s.status === 'Rejected').length,
  };

  if (!currentUser) return null;

  return (
    <div className="container mx-auto py-10 px-4 md:px-8 space-y-8 max-w-7xl">
      <PageHeader
        title="ARPS Verification Panel"
        description="Verify document proofs, check field accuracies, and process annual score submissions for Faculty members."
      />

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <span className="ml-4 text-muted-foreground">Loading approvals queue...</span>
        </div>
      ) : (
        <>
          {/* Summary metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="shadow border-l-4 border-l-blue-500 bg-background/55 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="text-2xl font-extrabold text-blue-600">{stats.pending}</div>
                <div className="text-xs font-semibold text-muted-foreground uppercase mt-1">Pending Reviews</div>
              </CardContent>
            </Card>
            <Card className="shadow border-l-4 border-l-amber-500 bg-background/55 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="text-2xl font-extrabold text-amber-600">{stats.underReview}</div>
                <div className="text-xs font-semibold text-muted-foreground uppercase mt-1">Under Review</div>
              </CardContent>
            </Card>
            <Card className="shadow border-l-4 border-l-emerald-500 bg-background/55 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="text-2xl font-extrabold text-emerald-600">{stats.approved}</div>
                <div className="text-xs font-semibold text-muted-foreground uppercase mt-1">Verified Approved</div>
              </CardContent>
            </Card>
            <Card className="shadow border-l-4 border-l-rose-500 bg-background/55 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="text-2xl font-extrabold text-rose-600">{stats.rejected}</div>
                <div className="text-xs font-semibold text-muted-foreground uppercase mt-1">Rejected Entries</div>
              </CardContent>
            </Card>
          </div>

          {/* Table Filters */}
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search ID, title, or faculty..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 text-sm bg-background border border-input rounded-md py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">All Submission Types</option>
                    <option value="publication">Publications</option>
                    <option value="patent">Patents</option>
                    <option value="consultancy">Consultancies</option>
                    <option value="emr">EMR Projects</option>
                    <option value="student">Student Guidance</option>
                    <option value="activity">Academic Activities</option>
                  </select>
                </div>

                <div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Submitted">Pending Review (Submitted)</option>
                    <option value="Under Review">Under Review</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Resubmission Required">Revision Required</option>
                  </select>
                </div>

                <div className="flex justify-end items-center">
                  <span className="text-xs text-muted-foreground font-medium">Filtered: <span className="font-bold text-foreground">{filteredSubmissions.length}</span> entries</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* List of Submissions */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-wider border-b select-none">
                    {renderSortableHeader('submissionId', 'ID')}
                    {renderSortableHeader('faculty', 'Faculty Member')}
                    {renderSortableHeader('submissionType', 'Type')}
                    {renderSortableHeader('title', 'Details / Title')}
                    {renderSortableHeader('submissionDate', 'Submitted Date')}
                    {renderSortableHeader('status', 'Status')}
                    <th className="px-6 py-4 text-right">Review Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sortedSubmissions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                        No submissions found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    sortedSubmissions.map(sub => {
                      const title = sub.paperTitle || sub.patentTitle || sub.consultancyTitle || sub.projectTitle || sub.studentName || sub.eventName || 'N/A';
                      return (
                        <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 font-mono text-xs font-semibold">{sub.submissionId}</td>
                          <td className="px-6 py-4">
                            <div className="font-semibold">{sub.userName}</div>
                            <div className="text-[10px] text-muted-foreground">{sub.userEmail}</div>
                          </td>
                          <td className="px-6 py-4 capitalize text-xs">{sub.submissionType}</td>
                          <td className="px-6 py-4 font-medium max-w-xs truncate">{title}</td>
                          <td className="px-6 py-4 text-xs text-muted-foreground">
                            {sub.submissionDate ? new Date(sub.submissionDate).toLocaleDateString('en-GB') : 'N/A'}
                          </td>
                          <td className="px-6 py-4">{getStatusBadge(sub.status)}</td>
                          <td className="px-6 py-4 text-right">
                            <Button
                              size="sm"
                              className="text-xs bg-indigo-600 text-white hover:bg-indigo-700"
                              onClick={() => handleOpenReview(sub)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> Open Audit
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Review Dialog */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              Document Audit & Verification for {selectedSub?.submissionId}
            </DialogTitle>
            <DialogDescription>
              Verify documentary evidence, perform checks, and approve/reject the submission.
            </DialogDescription>
          </DialogHeader>

          {selectedSub && (
            <div className="space-y-6 pt-4">
              {/* Detailed view of item */}
              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/40 p-4 rounded-xl border">
                <div>
                  <span className="text-xs text-muted-foreground block font-medium">Faculty Applicant</span>
                  <span className="font-bold text-foreground">{selectedSub.userName}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block font-medium">Academic Cycle</span>
                  <span className="font-bold text-foreground">{selectedSub.academicYear}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block font-medium">Claim Type</span>
                  <span className="font-bold text-foreground capitalize">{selectedSub.submissionType}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block font-medium">Submission Timestamp</span>
                  <span>{selectedSub.submissionDate ? new Date(selectedSub.submissionDate).toLocaleString('en-IN') : 'N/A'}</span>
                </div>
              </div>

              {/* Specific metadata table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase">Submission Metadata Fields</h4>
                <div className="border rounded-xl p-4 bg-background space-y-2 text-sm">
                  {selectedSub.submissionType === 'publication' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Paper Title:</span> {selectedSub.paperTitle}</div>
                      <div><span className="text-muted-foreground font-medium">DOI:</span> {selectedSub.doi}</div>
                      <div><span className="text-muted-foreground font-medium">Journal/Book:</span> {selectedSub.journalName}</div>
                      <div><span className="text-muted-foreground font-medium">Publication Type:</span> {selectedSub.publicationType || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Quartile:</span> <Badge className="bg-indigo-600 text-white font-mono">{selectedSub.journalClassification || 'N/A'}</Badge></div>
                      <div><span className="text-muted-foreground font-medium">Author Position:</span> {selectedSub.authorPosition}</div>
                      <div><span className="text-muted-foreground font-medium">Author Order:</span> {selectedSub.authorOrder || 'N/A'} of {selectedSub.totalAuthors || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Indexing:</span> {selectedSub.indexType}</div>
                      <div><span className="text-muted-foreground font-medium">Article Type:</span> {selectedSub.articleType}</div>
                      <div><span className="text-muted-foreground font-medium">Publication Date:</span> {selectedSub.publicationDate || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Single PU with Externals?</span> {selectedSub.isSinglePuAuthorWithExternal ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground font-medium">IMR Acknowledgement?</span> {selectedSub.hasImrAcknowledgement ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground font-medium">EMR Acknowledgement?</span> {selectedSub.hasEmrAcknowledgement ? 'Yes' : 'No'}</div>
                      {selectedSub.fundingAcknowledgement && <div className="col-span-2"><span className="text-muted-foreground font-medium">Funding Acknowledgement:</span> {selectedSub.fundingAcknowledgement}</div>}
                      {selectedSub.publisherName && <div><span className="text-muted-foreground font-medium">Publisher:</span> {selectedSub.publisherName}</div>}
                      {selectedSub.isbn && <div><span className="text-muted-foreground font-medium">ISBN:</span> {selectedSub.isbn}</div>}
                      {selectedSub.publisherWebsite && <div className="col-span-2"><span className="text-muted-foreground font-medium">Publisher Website:</span> <a href={selectedSub.publisherWebsite} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{selectedSub.publisherWebsite}</a></div>}
                    </div>
                  )}

                  {selectedSub.submissionType === 'patent' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Patent Title:</span> {selectedSub.patentTitle}</div>
                      <div><span className="text-muted-foreground font-medium">Patent Number:</span> {selectedSub.patentNumber}</div>
                      <div><span className="text-muted-foreground font-medium">Category:</span> {selectedSub.patentCategory}</div>
                      <div><span className="text-muted-foreground font-medium">Filing Date:</span> {selectedSub.filingDate}</div>
                      <div><span className="text-muted-foreground font-medium">Grant Date:</span> {selectedSub.grantDate || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Applicant Structure:</span> {selectedSub.applicantStructure || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">PU Sole Applicant?</span> {selectedSub.isPuSoleApplicant ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground font-medium">PU Joint Applicant?</span> {selectedSub.isPuJointApplicant ? 'Yes' : 'No'}</div>
                      {selectedSub.patentInventors && selectedSub.patentInventors.length > 0 && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground font-medium">Inventors:</span>
                          <ul className="list-disc ml-5 mt-1">
                            {selectedSub.patentInventors.map((inv, idx) => (
                              <li key={idx}>{inv.name} {inv.organization ? `(${inv.organization})` : ''}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedSub.submissionType === 'consultancy' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Consultancy Title:</span> {selectedSub.consultancyTitle}</div>
                      <div><span className="text-muted-foreground font-medium">Client Organization:</span> {selectedSub.clientOrganization}</div>
                      <div><span className="text-muted-foreground font-medium">Revenue Amount:</span> ₹{selectedSub.revenueAmount?.toLocaleString('en-IN')}</div>
                      <div><span className="text-muted-foreground font-medium">Transaction Date:</span> {selectedSub.transactionDate}</div>
                      {selectedSub.routingProofUrl && (
                        <div className="col-span-2"><span className="text-muted-foreground font-medium">Routing Proof:</span> <a href={selectedSub.routingProofUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">View Routing Proof</a></div>
                      )}
                    </div>
                  )}

                  {(selectedSub.submissionType === 'EMR' || selectedSub.submissionType === 'emr') && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Project Sponsoring Title:</span> {selectedSub.projectTitle}</div>
                      <div><span className="text-muted-foreground font-medium">Funding Agency:</span> {selectedSub.fundingAgency}</div>
                      <div><span className="text-muted-foreground font-medium">Sanction Amount:</span> ₹{selectedSub.sanctionAmount?.toLocaleString('en-IN')}</div>
                      <div><span className="text-muted-foreground font-medium">My Role:</span> {selectedSub.role}</div>
                      <div><span className="text-muted-foreground font-medium">State:</span> {selectedSub.projectStatus}</div>
                      <div><span className="text-muted-foreground font-medium">Duration:</span> {selectedSub.durationMonths} Months</div>
                      <div><span className="text-muted-foreground font-medium">Start Date:</span> {selectedSub.startDate || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">End Date:</span> {selectedSub.endDate || 'N/A'}</div>
                      {selectedSub.emrTeamMembers && (
                        <div className="col-span-2"><span className="text-muted-foreground font-medium">Team Members (PU):</span> <span className="whitespace-pre-wrap">{selectedSub.emrTeamMembers}</span></div>
                      )}
                    </div>
                  )}

                  {selectedSub.submissionType === 'student' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-muted-foreground font-medium">Student Name:</span> {selectedSub.studentName}</div>
                      <div><span className="text-muted-foreground font-medium">Enrollment No:</span> {selectedSub.studentEnrollmentNo || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Institute:</span> {selectedSub.studentInstitute || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Department:</span> {selectedSub.studentDepartment || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Program:</span> {selectedSub.program}</div>
                      <div><span className="text-muted-foreground font-medium">Status:</span> {selectedSub.studentStatus}</div>
                      <div><span className="text-muted-foreground font-medium">Allotment Details:</span> {selectedSub.allotmentDetails}</div>
                    </div>
                  )}

                  {selectedSub.submissionType === 'activity' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Event Name:</span> {selectedSub.eventName}</div>
                      <div><span className="text-muted-foreground font-medium">Category:</span> {selectedSub.activityCategory}</div>
                      <div><span className="text-muted-foreground font-medium">Host Organization:</span> {selectedSub.organization}</div>
                      <div><span className="text-muted-foreground font-medium">Duration (days):</span> {selectedSub.eventDurationDays}</div>
                      <div><span className="text-muted-foreground font-medium">Location Stature:</span> {selectedSub.location}</div>
                      <div><span className="text-muted-foreground font-medium">My Role performed:</span> {selectedSub.rolePerformed}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Documentary Proof List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase">Uploaded Proof Documents</h4>
                {selectedSub.proofUrls && selectedSub.proofUrls.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedSub.proofUrls.map((url, i) => (
                      <Button key={i} variant="outline" size="sm" onClick={() => window.open(url, '_blank')} className="text-xs">
                        <FileText className="h-4 w-4 mr-1.5 text-primary" /> View Evidence Document {i + 1}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-800 text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Warning: No documentary evidence was uploaded with this submission. Verify carefully before approving!</span>
                  </div>
                )}
              </div>

              {/* Verification Checklist */}
              <div className="space-y-3 bg-indigo-500/5 p-4 rounded-xl border border-indigo-500/20">
                <h4 className="text-xs font-bold text-indigo-800 dark:text-indigo-200 uppercase flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4" /> Policy Verification Checklist
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                  {selectedSub.submissionType === 'publication' && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-doi"
                          checked={verifiedCheckboxes.doi || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, doi: !!checked }))}
                        />
                        <label htmlFor="chk-doi">DOI is authentic and matches paper metadata</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-quartile"
                          checked={verifiedCheckboxes.quartile || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, quartile: !!checked }))}
                        />
                        <label htmlFor="chk-quartile">Journal Quartile is correct for this index year</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-authorship"
                          checked={verifiedCheckboxes.authorship || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, authorship: !!checked }))}
                        />
                        <label htmlFor="chk-authorship">Author Position matches proof exactly</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-proofPdf"
                          checked={verifiedCheckboxes.proofPdf || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, proofPdf: !!checked }))}
                        />
                        <label htmlFor="chk-proofPdf">Indexing proof (Scopus/WoS) is authentic</label>
                      </div>
                    </>
                  )}

                  {selectedSub.submissionType === 'patent' && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-patNo"
                          checked={verifiedCheckboxes.patentNo || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, patentNo: !!checked }))}
                        />
                        <label htmlFor="chk-patNo">Patent application/grant number is correct</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-applicant"
                          checked={verifiedCheckboxes.applicant || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, applicant: !!checked }))}
                        />
                        <label htmlFor="chk-applicant">Parul University Goa is sole or joint applicant on the document</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-certificate"
                          checked={verifiedCheckboxes.certificate || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, certificate: !!checked }))}
                        />
                        <label htmlFor="chk-certificate">Patent filing/grant certificate is verified authentic</label>
                      </div>
                    </>
                  )}

                  {selectedSub.submissionType === 'consultancy' && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-revenue"
                          checked={verifiedCheckboxes.revenue || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, revenue: !!checked }))}
                        />
                        <label htmlFor="chk-revenue">Consultancy revenue amount matches invoice proof</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-financeVal"
                          checked={verifiedCheckboxes.financeVal || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, financeVal: !!checked }))}
                        />
                        <label htmlFor="chk-financeVal">Finance division verification receipt is present</label>
                      </div>
                    </>
                  )}

                  {selectedSub.submissionType === 'EMR' && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-sanction"
                          checked={verifiedCheckboxes.sanction || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, sanction: !!checked }))}
                        />
                        <label htmlFor="chk-sanction">EMR sanction letter details and amount match proof</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-role"
                          checked={verifiedCheckboxes.role || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, role: !!checked }))}
                        />
                        <label htmlFor="chk-role">PI/Co-PI/Team Member assignment matches sanction order</label>
                      </div>
                    </>
                  )}

                  {selectedSub.submissionType === 'student' && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-allotment"
                          checked={verifiedCheckboxes.allotment || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, allotment: !!checked }))}
                        />
                        <label htmlFor="chk-allotment">Allotment order matches student name and program</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-enrollment"
                          checked={verifiedCheckboxes.enrollment || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, enrollment: !!checked }))}
                        />
                        <label htmlFor="chk-enrollment">Degree completion certificate is verified (if completed)</label>
                      </div>
                    </>
                  )}

                  {selectedSub.submissionType === 'activity' && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-cert"
                          checked={verifiedCheckboxes.certificate || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, certificate: !!checked }))}
                        />
                        <label htmlFor="chk-cert">Participation/Organization/Expert talk certificate is authentic</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-duration"
                          checked={verifiedCheckboxes.duration || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, duration: !!checked }))}
                        />
                        <label htmlFor="chk-duration">Event duration days/location matches certificate parameters</label>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Audit history logs */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase mb-2">Audit Transition Logs</h4>
                <div className="border rounded-xl divide-y text-xs">
                  {selectedSub.history?.map((h, i) => (
                    <div key={i} className="p-3 flex justify-between gap-4">
                      <div>
                        <span className="font-semibold text-foreground">{h.action}</span>
                        {h.remarks && <p className="text-muted-foreground mt-0.5 italic">"{h.remarks}"</p>}
                        <span className="text-[10px] text-muted-foreground mt-1 block">By {h.user}</span>
                      </div>
                      <span className="text-muted-foreground shrink-0">{new Date(h.timestamp).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Decision Section */}
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="review-remarks" className="flex items-center gap-1 font-bold text-sm">
                    <MessageSquare className="h-4 w-4 text-primary" /> Reviewer Remarks & Comments
                  </Label>
                  <Textarea
                    id="review-remarks"
                    placeholder="Write detailed audit remarks (Required if rejecting or sending back for resubmission)..."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="flex flex-wrap gap-3 justify-end pt-2">
                  <Button
                    variant="outline"
                    className="text-purple-600 hover:text-purple-700"
                    disabled={reviewingId !== null}
                    onClick={() => submitReview('Resubmission Required')}
                  >
                    Send Back (Correction Required)
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={reviewingId !== null}
                    onClick={() => submitReview('Rejected')}
                  >
                    Reject Submission
                  </Button>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={reviewingId !== null}
                    onClick={() => submitReview('Approved')}
                  >
                    {reviewingId === selectedSub.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-1" />
                    )}
                    Approve Achievement Score
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
