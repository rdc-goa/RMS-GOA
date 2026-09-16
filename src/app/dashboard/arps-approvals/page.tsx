'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, CheckCircle, XCircle, AlertTriangle, MessageSquare, Eye, Search, ArrowUpDown, ArrowDown, ArrowUp, Database, Sparkles, Mail, Bell, Send } from 'lucide-react';
import { type ArpsSubmission, type User } from '@/types';
import { useRouter } from 'next/navigation';
import { getArpsSubmissions, reviewArpsSubmission, sendBulkArpsRevisionReminders, getArpsEvaluationCycles } from '@/app/arps-actions';
import { getDefaultModulesForRole } from '@/lib/modules';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
const FIELD_LABELS: Record<string, string> = {
  // Publication
  paperTitle: 'Paper Title',
  doi: 'DOI',
  scopusLink: 'Scopus Link',
  journalName: 'Journal/Book Name',
  bookTitleForChapter: 'Book Name (for Chapter)',
  journalClassification: 'Journal Quartile',
  indexType: 'Indexing Type',
  articleType: 'Article Type',
  publicationType: 'Publication Type',
  authorPosition: 'Author Position',
  authorOrder: 'Author Order',
  totalAuthors: 'Total Authors',
  isSinglePuAuthorWithExternal: 'Single PU Author with Externals',
  hasImrAcknowledgement: 'IMR Acknowledgement',
  hasEmrAcknowledgement: 'EMR Acknowledgement',
  publicationDate: 'Publication Date',
  fundingAcknowledgement: 'Funding Acknowledgement',
  publisherName: 'Publisher Name',
  publisherWebsite: 'Publisher Website',
  isbn: 'ISBN',

  // Patent
  patentTitle: 'Patent Title',
  patentCategory: 'Patent Category',
  patentNumber: 'Patent Number',
  filingDate: 'Filing Date',
  grantDate: 'Grant Date',
  applicantStructure: 'Applicant Structure',
  isPuJointApplicant: 'PU Joint Applicant',
  isPuSoleApplicant: 'PU Sole Applicant',
  patentInventors: 'Patent Inventors',

  // Consultancy
  consultancyTitle: 'Consultancy Title',
  clientOrganization: 'Client Organization',
  revenueAmount: 'Revenue Amount',
  transactionDate: 'Transaction Date',

  // EMR
  projectTitle: 'Project Title',
  fundingAgency: 'Funding Agency',
  sanctionAmount: 'Sanction Amount',
  role: 'Role',
  projectStatus: 'Project Status',
  durationMonths: 'Duration (Months)',
  startDate: 'Start Date',
  endDate: 'End Date',

  // Student
  studentName: 'Student Name',
  studentEnrollmentNo: 'Student Enrollment No',
  studentInstitute: 'Student Institute',
  studentDepartment: 'Student Department',
  program: 'Program',
  studentStatus: 'Student Status',
  allotmentDetails: 'Allotment Details',

  // Activity
  activityCategory: 'Activity Category',
  eventName: 'Event Name',
  organization: 'Organization',
  eventDurationDays: 'Event Duration Days',
  location: 'Location',
  membershipType: 'Membership Type',
  societyType: 'Society Type',
  details: 'Details / Description',
  proofUrls: 'Proof Documents'
};

function getComparisonValue(val: any): string {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) {
    if (val.length > 0 && typeof val[0] === 'object') {
      return val.map((item: any) => item.name || JSON.stringify(item)).join(', ');
    }
    return val.join(', ');
  }
  if (typeof val === 'boolean') {
    return val ? 'Yes' : 'No';
  }
  return String(val);
}

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
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(`${currentYear - 1}-${currentYear.toString().slice(-2)}`);
  const [cycles, setCycles] = useState<any>({});
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  
  // Sorting State
  const [sortColumn, setSortColumn] = useState<string>('submissionDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Review Dialog State
  const [remarks, setRemarks] = useState('');
  const [verifiedCheckboxes, setVerifiedCheckboxes] = useState<Record<string, boolean>>({});

  // Reminder Dialog State
  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);
  const [selectedApplicants, setSelectedApplicants] = useState<Record<string, boolean>>({});
  const [sendingReminders, setSendingReminders] = useState(false);

  // Pagination State
  const [limit, setLimit] = useState(30);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const router = useRouter();
  const { toast } = useToast();

  // Stats State
  const [stats, setStats] = useState({
    pending: 0,
    underReview: 0,
    approved: 0,
    rejected: 0,
    revisionRequired: 0
  });

  // Debounced Search State
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const fetchCycles = async () => {
      const res = await getArpsEvaluationCycles();
      if (res.success && res.cycles) {
        setCycles(res.cycles);
        const dbYears = Object.keys(res.cycles);
        const allYears = Array.from(new Set(dbYears)).sort((a, b) => b.localeCompare(a));
        setYearOptions(allYears);
      }
    };
    fetchCycles();
  }, [currentYear]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const u = JSON.parse(storedUser);
      const allowedModules = u.allowedModules || getDefaultModulesForRole(u.role, u.designation);
      if (!allowedModules.includes('arps-approvals')) {
        toast({ variant: 'destructive', title: 'Unauthorized', description: "You don't have permission to view this page." });
        router.push('/dashboard');
        return;
      }
      setCurrentUser(u);
    } else {
      router.push('/login');
    }
  }, [router, toast]);

  const loadPendingSubmissions = async (currentLimit = 30, isLoadMore = false) => {
    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const serverFilters: any = {};
      if (statusFilter !== 'all') serverFilters.status = statusFilter;
      if (typeFilter !== 'all') serverFilters.submissionType = typeFilter;
      if (debouncedSearchTerm.trim() !== '') serverFilters.searchTerm = debouncedSearchTerm;
      serverFilters.academicYear = selectedYear;

      const res = await getArpsSubmissions(serverFilters, currentLimit);
      if (res.success && res.submissions) {
        setSubmissions(res.submissions);
        setHasMore(res.hasMore ?? false);
        if (res.stats) {
          setStats({
            pending: res.stats.Submitted || 0,
            underReview: res.stats["Under Review"] || 0,
            approved: res.stats.Approved || 0,
            rejected: res.stats.Rejected || 0,
            revisionRequired: res.stats["Resubmission Required"] || 0
          });
        }
      } else {
        toast({ variant: 'destructive', title: 'Load Failed', description: res.error || 'Could not load submissions.' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    const nextLimit = limit + 30;
    setLimit(nextLimit);
    loadPendingSubmissions(nextLimit, true);
  };

  useEffect(() => {
    if (currentUser) {
      setLimit(30);
      loadPendingSubmissions(30, false);
    }
  }, [currentUser, statusFilter, typeFilter, debouncedSearchTerm, selectedYear]);

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
      if (sub.publicationType === 'Journal') {
        initialChecks.quartile = sub.verifiedFields?.quartile || false;
      }
      initialChecks.authorship = sub.verifiedFields?.authorship || false;
      initialChecks.proofPdf = sub.verifiedFields?.proofPdf || false;
    } else if (sub.submissionType === 'patent') {
      initialChecks.patentNo = sub.verifiedFields?.patentNo || false;
      initialChecks.applicant = sub.verifiedFields?.applicant || false;
      initialChecks.certificate = sub.verifiedFields?.certificate || false;
    } else if (sub.submissionType === 'consultancy') {
      initialChecks.revenue = sub.verifiedFields?.revenue || false;
      initialChecks.financeVal = sub.verifiedFields?.financeVal || false;
    } else if (sub.submissionType === 'EMR' || sub.submissionType === 'emr') {
      initialChecks.sanction = sub.verifiedFields?.sanction || false;
      initialChecks.role = sub.verifiedFields?.role || false;
    } else if (sub.submissionType === 'student') {
      initialChecks.allotment = sub.verifiedFields?.allotment || false;
      initialChecks.enrollment = sub.verifiedFields?.enrollment || false;
    } else if (sub.submissionType === 'activity') {
      initialChecks.certificate = sub.verifiedFields?.certificate || false;
      initialChecks.duration = sub.verifiedFields?.duration || false;
    } else if (sub.submissionType === 'other') {
      initialChecks.details = sub.verifiedFields?.details || false;
      initialChecks.proofPdf = sub.verifiedFields?.proofPdf || false;
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
        loadPendingSubmissions(limit, false);
      } else {
        toast({ variant: 'destructive', title: 'Review Failed', description: res.error });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'An unexpected error occurred.' });
    } finally {
      setReviewingId(null);
    }
  };

  const handleSendReminders = async () => {
    const toSend = groupedRevisions.filter(g => selectedApplicants[g.userEmail]);
    if (toSend.length === 0) {
      toast({ variant: 'destructive', title: 'No Selection', description: 'Please select at least one applicant.' });
      return;
    }

    setSendingReminders(true);
    try {
      const res = await sendBulkArpsRevisionReminders(toSend);
      if (res.success) {
        toast({
          title: 'Reminders Sent',
          description: `Successfully sent reminders to ${res.successCount} faculty members.${(res.failureCount ?? 0) > 0 ? ` Failed to send to ${res.failureCount}.` : ''}`
        });
        setIsReminderDialogOpen(false);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: res.error || 'Failed to send reminders.'
        });
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'An unexpected error occurred.'
      });
    } finally {
      setSendingReminders(false);
    }
  };

  // Filter submissions
  const filteredSubmissions = submissions.filter(sub => {
    if (sub.submissionType === 'other') return false; // Other submissions do not need admin verification

    const matchesSearch =
      sub.submissionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (sub.paperTitle || sub.patentTitle || sub.consultancyTitle || sub.projectTitle || sub.studentName || sub.eventName || '')
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesType = typeFilter === 'all' || sub.submissionType?.toLowerCase() === typeFilter.toLowerCase();
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Group filtered submissions in "Resubmission Required" status by applicant (faculty email)
  const groupedRevisions = useMemo(() => {
    const groups: Record<string, {
      uid: string;
      userName: string;
      userEmail: string;
      claims: {
        submissionId: string;
        submissionType: string;
        title: string;
        remarks: string;
      }[];
    }> = {};

    filteredSubmissions.forEach(sub => {
      if (sub.status === 'Resubmission Required' && sub.userEmail) {
        if (!groups[sub.userEmail]) {
          groups[sub.userEmail] = {
            uid: sub.uid,
            userName: sub.userName || 'Unknown Faculty',
            userEmail: sub.userEmail,
            claims: []
          };
        }
        const title = sub.paperTitle || sub.patentTitle || sub.consultancyTitle || sub.projectTitle || sub.studentName || sub.eventName || 'N/A';
        groups[sub.userEmail].claims.push({
          submissionId: sub.submissionId || sub.id,
          submissionType: sub.submissionType,
          title,
          remarks: sub.remarks || 'No remarks provided.'
        });
      }
    });

    return Object.values(groups);
  }, [submissions, searchTerm, typeFilter, statusFilter]);

  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    let valA: any = a[sortColumn as keyof ArpsSubmission];
    let valB: any = b[sortColumn as keyof ArpsSubmission];

    if (sortColumn === 'submissionType') {
      valA = a.submissionType === 'publication' ? (a.publicationType || 'publication') : a.submissionType;
      valB = b.submissionType === 'publication' ? (b.publicationType || 'publication') : b.submissionType;
    } else if (sortColumn === 'title') {
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


  const renderCards = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {sortedSubmissions.map(sub => {
        const title = sub.paperTitle || sub.patentTitle || sub.consultancyTitle || sub.projectTitle || sub.studentName || sub.eventName || 'N/A';
        return (
          <Card key={sub.id} className="shadow-sm hover:border-primary/20 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start gap-2">
                <div className="font-mono text-xs font-semibold flex items-center gap-1.5">
                  {sub.submissionId}
                  {sub.fetchedFrom && (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30 p-1 rounded-full text-[9px]" title={`Auto-fetched via ${sub.fetchedFrom === 'scopus' ? 'Scopus' : 'Web of Science'}`}>
                      <Database className="h-3 w-3" />
                    </Badge>
                  )}
                </div>
                {getStatusBadge(sub.status)}
              </div>
              <CardTitle className="text-sm font-bold mt-2 line-clamp-2" title={title}>
                {title}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                <span className="font-semibold text-foreground">{sub.userName}</span>
                <span className="block text-[10px] text-muted-foreground">{sub.userEmail}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-3 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type:</span>
                <span className="font-medium capitalize">{sub.submissionType === 'publication' ? (sub.publicationType || 'publication') : sub.submissionType}</span>
              </div>
              {sub.submissionType === 'publication' && (
                <>
                  {sub.journalClassification && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Quartile:</span>
                      <Badge className="bg-indigo-600 text-white font-mono text-[10px] h-4 py-0 px-1.5">{sub.journalClassification}</Badge>
                    </div>
                  )}
                  {sub.authorPosition && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Author Position:</span>
                      <span className="font-medium">{sub.authorPosition}</span>
                    </div>
                  )}
                  {sub.authorOrder != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Authorship:</span>
                      <span className="font-medium">
                        {sub.totalAuthors != null ? `${sub.authorOrder} of ${sub.totalAuthors}` : `${sub.authorOrder}`}
                      </span>
                    </div>
                  )}
                  {sub.scopusLink && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Link:</span>
                      <a href={sub.scopusLink} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-semibold">
                        Scopus <Database className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Submitted:</span>
                <span className="font-medium">{sub.submissionDate ? new Date(sub.submissionDate).toLocaleDateString('en-GB') : 'N/A'}</span>
              </div>
            </CardContent>
            <CardContent className="pt-0 flex flex-col gap-2">
              {sub.proofUrls && sub.proofUrls.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs border-indigo-600 text-indigo-600 hover:bg-indigo-50"
                  onClick={() => {
                    const urls = sub.proofUrls || [];
                    if (urls.length === 1) {
                      window.open(urls[0], '_blank');
                    } else {
                      urls.forEach(url => window.open(url, '_blank'));
                    }
                  }}
                >
                  <FileText className="h-3.5 w-3.5 mr-1" /> View Evidence
                </Button>
              )}
              <Button
                size="sm"
                className="w-full text-xs bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={() => handleOpenReview(sub)}
              >
                <Eye className="h-3.5 w-3.5 mr-1" /> Open Audit
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  if (!currentUser) return null;

  return (
    <div className="w-full mx-auto py-10 px-4 md:px-8 space-y-8 max-w-none">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
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
            <Card className="shadow border-l-4 border-l-purple-500 bg-background/55 backdrop-blur-md">
              <CardContent className="pt-6">
                <div className="text-2xl font-extrabold text-purple-600">{stats.revisionRequired}</div>
                <div className="text-xs font-semibold text-muted-foreground uppercase mt-1">Revision Required</div>
              </CardContent>
            </Card>
          </div>

          {/* Table Filters */}
          <Card className="shadow-sm">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="h-9 text-sm w-full font-semibold bg-background border border-input shadow-sm">
                      <SelectValue placeholder="Select Cycle" />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map(y => (
                        <SelectItem key={y} value={y} className="text-xs font-medium">
                          Cycle: {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

                <div className="flex justify-end items-center gap-4">
                  {statusFilter === 'Resubmission Required' && groupedRevisions.length > 0 && (
                    <Button
                      onClick={() => {
                        const initial: Record<string, boolean> = {};
                        groupedRevisions.forEach(group => {
                          initial[group.userEmail] = true;
                        });
                        setSelectedApplicants(initial);
                        setIsReminderDialogOpen(true);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm duration-300"
                    >
                      <Bell className="h-3.5 w-3.5" />
                      Send Revision Reminders
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground font-medium">Filtered: <span className="font-bold text-foreground">{filteredSubmissions.length}</span> entries</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* List of Submissions */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className={`w-full text-sm text-left border-collapse ${typeFilter === 'publication' ? 'min-w-[1200px]' : typeFilter === 'student' ? 'min-w-[1000px]' : ''}`}>
                  <thead>
                    <tr className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-wider border-b select-none">
                      {renderSortableHeader('submissionId', 'ID')}
                      {renderSortableHeader('faculty', 'Faculty Member')}
                      {renderSortableHeader('submissionType', 'Type')}
                      {renderSortableHeader('title', 'Details / Title')}
                      {typeFilter === 'publication' && (
                        <>
                          <th className="px-6 py-4 text-[10px] font-bold tracking-wider">Quartile</th>
                          <th className="px-6 py-4 text-[10px] font-bold tracking-wider">Author Role</th>
                          <th className="px-6 py-4 text-[10px] font-bold tracking-wider">Author Position</th>
                          <th className="px-6 py-4 text-[10px] font-bold tracking-wider">Scopus Link</th>
                        </>
                      )}
                      {typeFilter === 'student' && (
                        <>
                          <th className="px-6 py-4 text-[10px] font-bold tracking-wider">Program Name</th>
                          <th className="px-6 py-4 text-[10px] font-bold tracking-wider">Status</th>
                        </>
                      )}
                      {renderSortableHeader('status', 'Status / Submitted')}
                      <th className="px-6 py-4 text-right">Review Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedSubmissions.length === 0 ? (
                      <tr>
                        <td colSpan={typeFilter === 'publication' ? 10 : typeFilter === 'student' ? 8 : 6} className="px-6 py-8 text-center text-muted-foreground">
                          No submissions found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      sortedSubmissions.map(sub => {
                        const title = sub.paperTitle || sub.patentTitle || sub.consultancyTitle || sub.projectTitle || sub.studentName || sub.eventName || 'N/A';
                        return (
                          <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-mono text-xs font-semibold">
                              <div className="flex items-center gap-1.5">
                                {sub.submissionId}
                                {sub.fetchedFrom && (
                                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30 p-1 rounded-full text-[9px]" title={`Auto-fetched via ${sub.fetchedFrom === 'scopus' ? 'Scopus' : 'Web of Science'}`}>
                                    <Database className="h-3 w-3" />
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold">{sub.userName}</div>
                              <div className="text-[10px] text-muted-foreground">{sub.userEmail}</div>
                            </td>
                            <td className="px-6 py-4 capitalize text-xs">
                              {sub.submissionType === 'publication' ? (sub.publicationType || 'publication') : sub.submissionType}
                            </td>
                            <td className="px-6 py-4 font-medium max-w-xs whitespace-normal break-words">{title}</td>
                            {typeFilter === 'publication' && (
                              <>
                                <td className="px-6 py-4 font-semibold">
                                  {sub.journalClassification ? (
                                    <Badge className="bg-indigo-600 text-white font-mono text-xs">{sub.journalClassification}</Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-xs font-medium text-foreground">
                                  {sub.authorPosition || '—'}
                                </td>
                                <td className="px-6 py-4 text-xs font-medium text-foreground">
                                  {sub.authorOrder != null ? (sub.totalAuthors != null ? `${sub.authorOrder} of ${sub.totalAuthors}` : `${sub.authorOrder}`) : '—'}
                                </td>
                                <td className="px-6 py-4 text-xs font-medium text-foreground">
                                  {sub.scopusLink ? (
                                    <a href={sub.scopusLink} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-semibold">
                                      View Link <Database className="h-3 w-3" />
                                    </a>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                              </>
                            )}
                            {typeFilter === 'student' && (
                              <>
                                <td className="px-6 py-4 font-semibold text-xs">
                                  {sub.program || '—'}
                                </td>
                                <td className="px-6 py-4 text-xs font-medium text-foreground">
                                  {sub.studentStatus ? (
                                    <Badge className={sub.studentStatus === 'Completed' ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}>
                                      {sub.studentStatus}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                              </>
                            )}
                            <td className="px-6 py-4 text-xs">
                              <div>{getStatusBadge(sub.status)}</div>
                              <div className="text-muted-foreground mt-1.5 font-medium">
                                {sub.submissionDate ? new Date(sub.submissionDate).toLocaleDateString('en-GB') : 'N/A'}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right whitespace-nowrap">
                              <div className="flex justify-end gap-2">
                                {sub.proofUrls && sub.proofUrls.length > 0 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs border-indigo-600 text-indigo-600 hover:bg-indigo-50"
                                    onClick={() => {
                                      const urls = sub.proofUrls || [];
                                      if (urls.length === 1) {
                                        window.open(urls[0], '_blank');
                                      } else {
                                        urls.forEach(url => window.open(url, '_blank'));
                                      }
                                    }}
                                  >
                                    <FileText className="h-3.5 w-3.5 mr-1" /> View Evidence
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="text-xs bg-indigo-600 text-white hover:bg-indigo-700"
                                  onClick={() => handleOpenReview(sub)}
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" /> Open Audit
                                </Button>
                              </div>
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

          <div className="block md:hidden">
            {renderCards()}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-6">
              <Button 
                variant="outline" 
                onClick={handleLoadMore} 
                disabled={loadingMore || loading}
                className="px-8 bg-background border-input hover:bg-accent hover:text-accent-foreground"
              >
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />}
                Load More Applications
              </Button>
            </div>
          )}
        </>
      )}

      {/* Review Dialog */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 flex-wrap">
              <span>Document Audit & Verification for {selectedSub?.submissionId}</span>
              {selectedSub?.fetchedFrom && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30 flex items-center gap-1 text-xs py-0.5 px-2">
                  <Database className="h-3 w-3" />
                  Verified via {selectedSub.fetchedFrom === 'scopus' ? 'Scopus' : 'Web of Science'}
                </Badge>
              )}
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

              {/* Revision Changes Tracked */}
              {selectedSub.revisionDiffs && Object.keys(selectedSub.revisionDiffs).length > 0 && (
                <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-amber-800 dark:text-amber-200 uppercase flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-amber-600 animate-pulse" /> Changes Made in Resubmission
                  </h4>
                  <div className="divide-y divide-amber-500/10 text-xs">
                    {Object.entries(selectedSub.revisionDiffs).map(([fieldKey, diff]) => {
                      const label = FIELD_LABELS[fieldKey] || fieldKey;
                      const oldVal = getComparisonValue(diff.oldValue);
                      const newVal = getComparisonValue(diff.newValue);
                      return (
                        <div key={fieldKey} className="py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <span className="font-semibold text-foreground min-w-[150px]">{label}:</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-muted-foreground line-through bg-muted px-1.5 py-0.5 rounded text-[11px] max-w-[250px] truncate" title={oldVal || '(Empty)'}>
                              {oldVal || '(Empty)'}
                            </span>
                            <span className="text-amber-600 font-bold">➡️</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[11px] max-w-[250px] truncate" title={newVal || '(Empty)'}>
                              {newVal || '(Empty)'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Specific metadata table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase">Submission Metadata Fields</h4>
                <div className="border rounded-xl p-4 bg-background space-y-2 text-sm">
                  {selectedSub.submissionType === 'publication' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2 flex justify-between items-start gap-4">
                        <div>
                          <span className="text-muted-foreground font-medium">Paper Title:</span> {selectedSub.paperTitle}
                        </div>
                        {selectedSub.fetchedFrom && (
                          <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30 flex items-center gap-1 shrink-0 font-medium py-1 px-2.5 rounded-full select-none text-[11px] animate-pulse">
                            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                            Auto-fetched: {selectedSub.fetchedFrom === 'scopus' ? 'Scopus' : 'WoS'}
                          </Badge>
                        )}
                      </div>
                      <div><span className="text-muted-foreground font-medium">Publication Type:</span> {selectedSub.publicationType || 'N/A'}</div>
                      
                      {(selectedSub.publicationType === 'Journal' || selectedSub.publicationType === 'Book Chapter' || selectedSub.publicationType === 'Conference Proceedings') && (
                        <div><span className="text-muted-foreground font-medium">DOI:</span> {selectedSub.doi}</div>
                      )}
                      {selectedSub.publicationType === 'Book Editor' && (
                        <div><span className="text-muted-foreground font-medium">ISBN:</span> {selectedSub.isbn}</div>
                      )}
                      
                      <div><span className="text-muted-foreground font-medium">Publisher:</span> {selectedSub.publisherName}</div>
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Article Link:</span> <a href={selectedSub.publisherWebsite} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{selectedSub.publisherWebsite}</a></div>
                      
                      {selectedSub.publicationType === 'Book Chapter' && (
                        <div><span className="text-muted-foreground font-medium">Book Name:</span> {selectedSub.bookTitleForChapter || 'N/A'}</div>
                      )}

                      {selectedSub.publicationType === 'Journal' && (
                        <>
                          <div className="col-span-2"><span className="text-muted-foreground font-medium">Journal Name:</span> {selectedSub.journalName}</div>
                          <div><span className="text-muted-foreground font-medium">Quartile:</span> <Badge className="bg-indigo-600 text-white font-mono">{selectedSub.journalClassification || 'N/A'}</Badge></div>
                          <div><span className="text-muted-foreground font-medium">Indexing:</span> {selectedSub.indexType}</div>
                          <div><span className="text-muted-foreground font-medium">Article Type:</span> {selectedSub.articleType}</div>
                        </>
                      )}

                      {((selectedSub.publicationType === 'Book Chapter' || selectedSub.publicationType === 'Conference Proceedings') ||
                        (selectedSub.publicationType === 'Journal' && (selectedSub.indexType === 'scopus' || selectedSub.indexType === 'both'))) && selectedSub.scopusLink && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground font-medium">Scopus Link:</span>{' '}
                          <a href={selectedSub.scopusLink} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                            {selectedSub.scopusLink}
                          </a>
                        </div>
                      )}

                      <div><span className="text-muted-foreground font-medium">Your Role:</span> {selectedSub.authorPosition}</div>
                      <div><span className="text-muted-foreground font-medium">Author Position:</span> {selectedSub.authorOrder || 'N/A'} of {selectedSub.totalAuthors || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Publication Date:</span> {selectedSub.publicationDate || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Funding Agency Acknowledged:</span> {selectedSub.fundingAcknowledgement || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Single PU with Externals?</span> {selectedSub.isSinglePuAuthorWithExternal ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground font-medium">IMR Acknowledgement?</span> {selectedSub.hasImrAcknowledgement ? 'Yes' : 'No'}</div>
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
                    </div>
                  )}

                  {selectedSub.submissionType === 'consultancy' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Consultancy Title:</span> {selectedSub.consultancyTitle}</div>
                      <div><span className="text-muted-foreground font-medium">Client Organization:</span> {selectedSub.clientOrganization}</div>
                      <div><span className="text-muted-foreground font-medium">Revenue Amount:</span> ₹{selectedSub.revenueAmount?.toLocaleString('en-IN')}</div>
                      <div><span className="text-muted-foreground font-medium">Transaction Date:</span> {selectedSub.transactionDate}</div>
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
                      <div><span className="text-muted-foreground font-medium">Sanction Date:</span> {selectedSub.sanctionDate || 'N/A'}</div>
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
                      {selectedSub.activityCategory === 'Membership' ? (
                        <>
                          <div><span className="text-muted-foreground font-medium">Membership Duration Type:</span> {selectedSub.membershipType || 'N/A'}</div>
                          <div><span className="text-muted-foreground font-medium">Society / Board Type:</span> {selectedSub.societyType || 'N/A'}</div>
                        </>
                      ) : (
                        <>
                          <div><span className="text-muted-foreground font-medium">Event Duration (Days):</span> {selectedSub.eventDurationDays}</div>
                          <div><span className="text-muted-foreground font-medium">Event Location Stature:</span> {selectedSub.location}</div>
                          <div><span className="text-muted-foreground font-medium">Specific Role performed:</span> {selectedSub.rolePerformed || 'N/A'}</div>
                        </>
                      )}
                    </div>
                  )}

                  {selectedSub.submissionType === 'other' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground font-medium font-semibold text-sm">Paragraph / Description:</span></div>
                      <div className="col-span-2 bg-muted/40 p-4 rounded-xl border text-sm whitespace-pre-wrap leading-relaxed">{selectedSub.details || 'N/A'}</div>
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
                      {selectedSub.publicationType === 'Journal' && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="chk-quartile"
                            checked={verifiedCheckboxes.quartile || false}
                            onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, quartile: !!checked }))}
                          />
                          <label htmlFor="chk-quartile">Journal Quartile is correct for this index year</label>
                        </div>
                      )}
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
                        <label htmlFor="chk-applicant">Parul University is sole or joint applicant on the document</label>
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

                  {selectedSub.submissionType === 'other' && (
                    <>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-details"
                          checked={verifiedCheckboxes.details || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, details: !!checked }))}
                        />
                        <label htmlFor="chk-details">Description is authentic and matches actual achievement</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="chk-proof"
                          checked={verifiedCheckboxes.proofPdf || false}
                          onCheckedChange={(checked) => setVerifiedCheckboxes(prev => ({ ...prev, proofPdf: !!checked }))}
                        />
                        <label htmlFor="chk-proof">Uploaded evidence documents are verified and valid</label>
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

      {/* Reminder Dialog */}
      <Dialog open={isReminderDialogOpen} onOpenChange={setIsReminderDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Bell className="h-5 w-5 text-indigo-600" />
              <span>Send Revision Reminders</span>
            </DialogTitle>
            <DialogDescription>
              Select faculty members to remind them about revisions required for their ARPS submissions. They will receive a consolidated email detailing all claims requiring corrections.
            </DialogDescription>
          </DialogHeader>

          {groupedRevisions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No faculty members currently have submissions requiring revision.
            </div>
          ) : (
            <div className="space-y-6 pt-4">
              <div className="flex justify-between items-center bg-muted/40 px-4 py-3 rounded-lg border text-sm">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="select-all-reminders"
                    checked={groupedRevisions.length > 0 && groupedRevisions.every(g => selectedApplicants[g.userEmail])}
                    onCheckedChange={() => {
                      const allSelected = groupedRevisions.length > 0 && groupedRevisions.every(g => selectedApplicants[g.userEmail]);
                      const next: Record<string, boolean> = {};
                      groupedRevisions.forEach(g => {
                        next[g.userEmail] = !allSelected;
                      });
                      setSelectedApplicants(next);
                    }}
                  />
                  <label htmlFor="select-all-reminders" className="font-semibold cursor-pointer">
                    Select All Faculty
                  </label>
                </div>
                <div className="text-xs font-semibold text-muted-foreground">
                  Selected: {groupedRevisions.filter(g => selectedApplicants[g.userEmail]).length} of {groupedRevisions.length}
                </div>
              </div>

              <div className="max-h-[50vh] overflow-y-auto pr-2 space-y-4">
                {groupedRevisions.map(group => {
                  const isChecked = !!selectedApplicants[group.userEmail];
                  return (
                    <div key={group.userEmail} className="border rounded-xl p-4 space-y-3 bg-card hover:border-indigo-500/30 transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start space-x-3">
                          <Checkbox
                            id={`reminder-chk-${group.userEmail}`}
                            className="mt-1"
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              setSelectedApplicants(prev => ({ ...prev, [group.userEmail]: !!checked }));
                            }}
                          />
                          <div>
                            <label htmlFor={`reminder-chk-${group.userEmail}`} className="font-bold text-foreground block cursor-pointer hover:underline text-sm">
                              {group.userName}
                            </label>
                            <span className="text-xs text-muted-foreground font-mono block">{group.userEmail}</span>
                          </div>
                        </div>
                        <Badge className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 border-amber-500/30 font-semibold text-xs py-0.5 px-2">
                          {group.claims.length} Claim{group.claims.length > 1 ? 's' : ''} Pending
                        </Badge>
                      </div>

                      <div className="pl-8 border-l-2 border-dashed border-muted ml-2.5 space-y-2.5 pt-1">
                        {group.claims.map((claim) => (
                          <div key={claim.submissionId} className="text-xs space-y-1">
                            <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{claim.submissionId}</span>
                              <span className="capitalize text-muted-foreground text-[10px]">({claim.submissionType === 'publication' ? 'Publication' : claim.submissionType})</span>
                              <span className="text-foreground truncate max-w-[300px] font-medium" title={claim.title}>{claim.title}</span>
                            </div>
                            <div className="bg-amber-500/5 text-amber-800 dark:text-amber-200 border border-amber-500/10 p-2 rounded-lg text-[11px] leading-relaxed italic">
                              <strong>Remarks:</strong> {claim.remarks}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsReminderDialogOpen(false)}
                  disabled={sendingReminders}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center gap-1.5 shadow-sm"
                  disabled={sendingReminders || groupedRevisions.filter(g => selectedApplicants[g.userEmail]).length === 0}
                  onClick={handleSendReminders}
                >
                  {sendingReminders ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Sending Reminders...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Reminders ({groupedRevisions.filter(g => selectedApplicants[g.userEmail]).length})
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
