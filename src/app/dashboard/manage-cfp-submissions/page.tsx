'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExcelJS from 'exceljs';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, onSnapshot } from 'firebase/firestore';
import { saveSpecialCfp, deleteSpecialCfp, updateCfpSubmissionStatus, scheduleCfpMeeting, toggleCfpDraftEditPermission } from '@/app/actions';
import type { SpecialCfp, CfpSubmission, User } from '@/types';
import { getDefaultModulesForRole } from '@/lib/modules';
import { format, parseISO } from 'date-fns';
import { uploadFileToApi } from '@/lib/upload-client';
import { 
  Award, 
  Calendar, 
  Trash2, 
  Edit, 
  FileText, 
  Landmark, 
  User as UserIcon, 
  Download, 
  ClipboardCheck,
  PlusCircle,
  Users,
  MapPin,
  Clock,
  CalendarDays,
  X,
  Loader2
} from 'lucide-react';

export default function ManageCFPsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('submissions');
  const { toast } = useToast();

  // Announce CFP Tab State
  const [calls, setCalls] = useState<SpecialCfp[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const [applyDeadline, setApplyDeadline] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Multi-file state: staged new files with custom display names
  const [newFiles, setNewFiles] = useState<{ file: File; displayName: string }[]>([]);
  // Existing files already saved (for edit mode)
  const [existingFiles, setExistingFiles] = useState<{ name: string; url: string }[]>([]);

  // Submissions Tab State
  const [submissions, setSubmissions] = useState<CfpSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [filterCfp, setFilterCfp] = useState('All');
  const [filterStatus, setFilterStatus] = useState('Submitted');
  const [filterScheduleCfp, setFilterScheduleCfp] = useState('All');

  // Schedule Meeting Tab State
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [evaluators, setEvaluators] = useState<User[]>([]);
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>([]);
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [meetingVenue, setMeetingVenue] = useState('');
  const [meetingMode, setMeetingMode] = useState<'Online' | 'Offline'>('Offline');
  const [isScheduling, setIsScheduling] = useState(false);

  const usersMap = useMemo(() => {
    return new Map(allUsers.map(u => [u.email?.toLowerCase(), u]));
  }, [allUsers]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      const allowedModules = parsedUser.allowedModules || getDefaultModulesForRole(parsedUser.role, parsedUser.designation);
      const hasAccess = allowedModules.includes('manage-cfp-submissions');
      if (!hasAccess) {
        toast({
          title: 'Access Denied',
          description: "You don't have permission to view this page.",
          variant: 'destructive',
        });
        router.replace('/dashboard');
        return;
      }
      setCurrentUser(parsedUser);
    } else {
      router.replace('/login');
    }
  }, [router, toast]);

  // Subscribe to Special CFPs
  useEffect(() => {
    const callsRef = collection(db, 'specialCfps');
    const unsubscribe = onSnapshot(callsRef, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpecialCfp));
      fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCalls(fetched);
      setCallsLoading(false);
    }, (error) => {
      console.error("Error subscribing to special CFPs:", error);
      setCallsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to CFP Submissions
  useEffect(() => {
    const subsRef = collection(db, 'cfpSubmissions');
    const unsubscribe = onSnapshot(subsRef, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CfpSubmission));
      fetched.sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
      setSubmissions(fetched);
      setSubmissionsLoading(false);
    }, (error) => {
      console.error("Error subscribing to CFP submissions:", error);
      setSubmissionsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to users to identify Evaluators
  useEffect(() => {
    const usersRef = collection(db, 'users');
    const unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
      setAllUsers(fetched);
      setEvaluators(fetched.filter(u => u.role === 'Evaluator' || u.role === 'CRO' || u.role === 'admin'));
    });

    return () => unsubscribeUsers();
  }, []);

  // Announce CFP Actions
  const handleAnnounceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'Super-admin')) {
      toast({ variant: 'destructive', title: 'Unauthorized', description: 'Admin access required.' });
      return;
    }

    if (!title || !description || !department || !applyDeadline) {
      toast({ variant: 'destructive', title: 'Error', description: 'All fields are required.' });
      return;
    }

    setIsSubmitting(true);
    try {
      // Start with existing saved files, then append newly uploaded files
      let announcementFiles: { name: string; url: string }[] = [...existingFiles];
      for (const { file, displayName } of newFiles) {
        const uploadResult = await uploadFileToApi(file);
        if (uploadResult.success && uploadResult.url) {
          announcementFiles.push({ name: displayName || file.name, url: uploadResult.url });
        } else {
          throw new Error(uploadResult.error || `Failed to upload "${displayName || file.name}".`);
        }
      }

      const generatedSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const cfpId = editingId || generatedSlug;
      const cfpData: Omit<SpecialCfp, 'id'> = {
        title,
        description,
        department,
        applyDeadline: new Date(applyDeadline).toISOString(),
        status: 'Open',
        createdAt: new Date().toISOString(),
        createdBy: currentUser.uid,
        announcedBy: currentUser.name,
        files: announcementFiles,
      };

      const result = await saveSpecialCfp(cfpId, cfpData);
      if (result.success) {
        toast({ title: editingId ? 'Announcement Updated' : 'Call Announced Successfully!' });
        resetAnnounceForm();
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Action Failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditCall = (call: SpecialCfp) => {
    setEditingId(call.id);
    setTitle(call.title);
    setDescription(call.description);
    setDepartment(call.department);
    setApplyDeadline(call.applyDeadline.substring(0, 10));
    setExistingFiles(call.files || []);
    setNewFiles([]);
  };

  const handleDeleteCall = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this Call announcement?")) return;
    try {
      const result = await deleteSpecialCfp(id);
      if (result.success) {
        toast({ title: 'Call announcement deleted.' });
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to delete', description: error.message });
    }
  };

  const resetAnnounceForm = () => {
    setTitle('');
    setDescription('');
    setDepartment('');
    setApplyDeadline('');
    setEditingId(null);
    setNewFiles([]);
    setExistingFiles([]);
  };

  // Handle file selection: prompt for a display name for each new file
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    const staged = selected.map((file) => {
      const suggestedName = file.name.replace(/\.[^/.]+$/, ''); // strip extension
      const displayName = window.prompt(`Enter a display name for "${file.name}":`, suggestedName) ?? suggestedName;
      return { file, displayName: displayName.trim() || suggestedName };
    });
    setNewFiles(prev => [...prev, ...staged]);
    // Reset the input so the same file can be re-added if needed
    e.target.value = '';
  };

  const removeNewFile = (index: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = (index: number) => {
    setExistingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const exportCallsToExcel = async () => {
    if (calls.length === 0) {
      toast({ title: "No Calls Found", description: "There are no announced calls to export." });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet1 = workbook.addWorksheet("Announced_Calls");

    worksheet1.addRow([
      "Call Identifier",
      "Call Title",
      "Department",
      "Posted Date",
      "Month Posted",
      "Announced By",
      "Apply Deadline",
      "Total Submissions Applied",
      "Status"
    ]);

    calls.forEach(c => {
      const subs = submissions.filter(s => s.cfpId === c.id || (s.cfpTitle && s.cfpTitle.toLowerCase() === c.title.toLowerCase()));
      const postedDate = c.createdAt ? format(parseISO(c.createdAt), 'dd-MMM-yyyy') : 'NA';
      const postedMonth = c.createdAt ? format(parseISO(c.createdAt), 'MMMM yyyy') : 'NA';
      const deadline = c.applyDeadline ? format(parseISO(c.applyDeadline), 'dd-MMM-yyyy') : 'NA';

      worksheet1.addRow([
        c.callIdentifier || c.id,
        c.title,
        c.department,
        postedDate,
        postedMonth,
        c.announcedBy || 'Admin',
        deadline,
        subs.length,
        c.status
      ]);
    });

    const worksheet2 = workbook.addWorksheet("Submissions_Detail");
    worksheet2.addRow([
      "Submission ID",
      "Call Identifier",
      "Call Title",
      "PI Name",
      "PI Email",
      "PI Phone",
      "Organization",
      "Faculty",
      "Department",
      "Submission Date",
      "Status"
    ]);

    submissions.forEach(s => {
      const subDate = (s as any).submittedAt ? format(parseISO((s as any).submittedAt), 'dd-MMM-yyyy') : 'NA';
      worksheet2.addRow([
        s.submissionId || s.id,
        s.cfpId,
        s.cfpTitle,
        s.piName,
        s.piEmail,
        s.piPhone,
        s.piOrganization,
        s.piFaculty || 'NA',
        s.piDepartment || 'NA',
        subDate,
        s.status || 'Submitted'
      ]);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Announced_Calls_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({ title: "Export Complete", description: `Exported ${calls.length} calls and ${submissions.length} submissions to Excel.` });
  };

  // Submissions Actions
  const handleSubmissionStatusChange = async (id: string, newStatus: CfpSubmission['status']) => {
    try {
      const result = await updateCfpSubmissionStatus(id, newStatus);
      if (result.success) {
        toast({ title: 'Status Updated', description: `Proposal status is now ${newStatus}.` });
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Update Failed', description: error.message });
    }
  };

  const handleToggleDraftEdit = async (id: string, allow: boolean) => {
    try {
      const result = await toggleCfpDraftEditPermission(id, allow);
      if (result.success) {
        toast({ 
          title: allow ? 'Edits Allowed' : 'Edits Blocked', 
          description: allow 
            ? 'The PI can now edit this draft proposal even after the deadline.' 
            : 'Deadline restrictions are now enforced for this draft.' 
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Action Failed', description: error.message });
    }
  };

  const cfpTitles = useMemo(() => {
    const titles = new Set<string>();
    calls.forEach(c => {
      if (c.title) titles.add(c.title);
    });
    submissions.forEach(s => {
      if (s.cfpTitle) titles.add(s.cfpTitle);
    });
    return Array.from(titles).filter(Boolean);
  }, [calls, submissions]);

  const filteredSubmissions = submissions.filter(sub => {
    const matchesCfp = filterCfp === 'All' || sub.cfpTitle === filterCfp;
    const matchesStatus = filterStatus === 'All' || sub.status === filterStatus;
    return matchesCfp && matchesStatus;
  });

  // Schedule Meeting Actions
  const handleScheduleMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSubmissions.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select at least one proposal to schedule.' });
      return;
    }
    if (selectedEvaluators.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please assign at least one evaluator.' });
      return;
    }
    if (!meetingDate || !meetingTime || !meetingVenue) {
      toast({ variant: 'destructive', title: 'Error', description: 'Date, time, and venue are required.' });
      return;
    }

    setIsScheduling(true);
    try {
      const projectsToSchedule = submissions
        .filter(s => selectedSubmissions.includes(s.id))
        .map(s => ({
          id: s.id,
          pi: s.piName,
          title: s.title,
          piEmail: s.piEmail
        }));

      const meetingDetails = {
        date: meetingDate,
        time: meetingTime,
        venue: meetingVenue,
        evaluatorUids: selectedEvaluators,
        mode: meetingMode
      };

      const result = await scheduleCfpMeeting(projectsToSchedule, meetingDetails);
      if (result.success) {
        toast({ title: 'Meeting Scheduled!', description: 'All selected proposals updated to Under Review.' });
        setSelectedSubmissions([]);
        setSelectedEvaluators([]);
        setMeetingDate('');
        setMeetingTime('');
        setMeetingVenue('');
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Scheduling Failed', description: error.message });
    } finally {
      setIsScheduling(false);
    }
  };

  const toggleSubmissionSelection = (id: string) => {
    setSelectedSubmissions(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleEvaluatorSelection = (uid: string) => {
    setSelectedEvaluators(prev =>
      prev.includes(uid) ? prev.filter(item => item !== uid) : [...prev, uid]
    );
  };

  // Filter pending/revision-submitted proposals for scheduling
  const submissionsPendingSchedule = submissions.filter(s => {
    const isPending = s.status === 'Submitted' || s.status === 'Revision Submitted';
    if (!isPending) return false;
    if (filterScheduleCfp === 'All') return true;
    return s.cfpTitle === filterScheduleCfp;
  });

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
      <PageHeader
        title="Manage CFPs"
        description="Announce department-wise Call For Proposals, oversee academic submissions, schedule review meetings, and update statuses."
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8 space-y-6">
        <TabsList className="bg-slate-100 dark:bg-slate-950/40 p-1 border border-slate-200 dark:border-white/5 rounded-xl inline-flex flex-wrap gap-1">
          <TabsTrigger 
            value="submissions" 
            className="data-[state=active]:bg-primary data-[state=active]:text-white flex items-center gap-2 px-4 py-2 rounded-lg text-slate-500 dark:text-slate-400 font-semibold text-xs transition-all"
          >
            <ClipboardCheck className="h-4 w-4" /> CFP Submissions
          </TabsTrigger>
          <TabsTrigger 
            value="schedule" 
            className="data-[state=active]:bg-primary data-[state=active]:text-white flex items-center gap-2 px-4 py-2 rounded-lg text-slate-500 dark:text-slate-400 font-semibold text-xs transition-all"
          >
            <CalendarDays className="h-4 w-4" /> Schedule Meeting
          </TabsTrigger>
          <TabsTrigger 
            value="announce" 
            className="data-[state=active]:bg-primary data-[state=active]:text-white flex items-center gap-2 px-4 py-2 rounded-lg text-slate-500 dark:text-slate-400 font-semibold text-xs transition-all"
          >
            <PlusCircle className="h-4 w-4" /> Announce & Manage Calls
          </TabsTrigger>
        </TabsList>

        {/* Tab Content 1: Submissions */}
        <TabsContent value="submissions" className="space-y-6 focus-visible:outline-none">
          {/* Filter Section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between bg-slate-100/50 dark:bg-slate-950/20 p-4 border border-slate-200 dark:border-white/5 rounded-2xl gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">Filter by Call For Proposals:</span>
                <Select onValueChange={setFilterCfp} value={filterCfp}>
                  <SelectTrigger className="w-full sm:w-72 bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white font-semibold">
                    <SelectValue placeholder="All Call For Proposals" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white font-semibold">
                    <SelectItem value="All">All Call For Proposals</SelectItem>
                    {cfpTitles.map(title => (
                      <SelectItem key={title} value={title}>{title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 shrink-0">Status:</span>
                <Select onValueChange={setFilterStatus} value={filterStatus}>
                  <SelectTrigger className="w-full sm:w-44 bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white font-semibold">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white font-semibold">
                    <SelectItem value="All">All Statuses</SelectItem>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Submitted">Submitted</SelectItem>
                    <SelectItem value="Under Review">Under Review</SelectItem>
                    <SelectItem value="Revision Needed">Revision Needed</SelectItem>
                    <SelectItem value="Revision Submitted">Revision Submitted</SelectItem>
                    <SelectItem value="Recommended">Recommended</SelectItem>
                    <SelectItem value="Sanctioned">Sanctioned</SelectItem>
                    <SelectItem value="Not Recommended">Not Recommended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {submissionsLoading ? (
            <div className="space-y-4">
              <div className="h-32 bg-white/5 animate-pulse rounded-3xl" />
              <div className="h-32 bg-white/5 animate-pulse rounded-3xl" />
            </div>
          ) : filteredSubmissions.length > 0 ? (
            <div className="grid gap-6">
              {filteredSubmissions.map((sub) => (
                <Card key={sub.id} className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
                  <CardHeader className="border-b border-slate-200 dark:border-slate-900/60 pb-4">
                    <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                      <div>
                        <span className="text-[10px] text-primary uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                          Call: {sub.cfpTitle}
                        </span>
                        <CardTitle className="text-lg font-bold text-slate-900 dark:text-white mt-2 leading-relaxed">
                          {sub.title}
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-4 flex-wrap">
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <UserIcon className="h-3.5 w-3.5" />
                            PI: {(() => {
                              const piUser = usersMap.get(sub.piEmail?.toLowerCase());
                              const isInternal = sub.piOrganization?.toLowerCase().includes('parul');
                              return (
                                <>
                                  {piUser?.misId ? (
                                    <Link href={`/profile/${piUser.misId}`} className="text-primary hover:underline font-bold" target="_blank" rel="noopener noreferrer">
                                      {sub.piName}
                                    </Link>
                                  ) : (
                                    <span className="font-bold text-slate-800 dark:text-slate-200">{sub.piName}</span>
                                  )}
                                  {isInternal && (
                                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-black text-emerald-400 uppercase tracking-wider ml-1">
                                      Internal
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                            ({sub.piEmail})
                          </span>
                          <span className="flex items-center gap-1"><Landmark className="h-3.5 w-3.5" /> Org: {sub.piOrganization}</span>
                          <span>Submitted: {format(parseISO(sub.submissionDate), 'dd MMM yyyy HH:mm')}</span>
                        </CardDescription>
                      </div>

                      <div className="flex items-center gap-3 self-end md:self-auto">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Status:</span>
                        <Select onValueChange={(val) => handleSubmissionStatusChange(sub.id, val as CfpSubmission['status'])} value={sub.status}>
                          <SelectTrigger className="w-40 bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white font-bold h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white">
                            <SelectItem value="Draft">Draft</SelectItem>
                            <SelectItem value="Submitted">Submitted</SelectItem>
                            <SelectItem value="Under Review">Under Review</SelectItem>
                            <SelectItem value="Revision Needed">Revision Needed</SelectItem>
                            <SelectItem value="Revision Submitted">Revision Submitted</SelectItem>
                            <SelectItem value="Recommended">Recommended</SelectItem>
                            <SelectItem value="Sanctioned">Sanctioned</SelectItem>
                            <SelectItem value="Not Recommended">Not Recommended</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-6 grid gap-6 md:grid-cols-[1.5fr_0.5fr]">
                    <div className="space-y-4">
                      <div>
                        <h5 className="text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider mb-1">Abstract</h5>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{sub.abstract}</p>
                      </div>

                      <div>
                        <h5 className="text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider mb-1">Expected Outcomes</h5>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{sub.expectedOutcomes}</p>
                      </div>

                      <div>
                        <h5 className="text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider mb-1">Investigator Profile & Team</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-slate-50 dark:bg-slate-900/30 p-4 rounded-2xl border border-slate-200 dark:border-white/5 mt-1.5">
                          <div className="space-y-1">
                            <p className="text-slate-600 dark:text-slate-400"><strong>PI Contact:</strong> {sub.piPhone}</p>
                            <p className="text-slate-600 dark:text-slate-400"><strong>Faculty / Department:</strong> {sub.piFaculty || 'N/A'} {sub.piDepartment ? `/ ${sub.piDepartment}` : ''}</p>
                            <p className="text-slate-600 dark:text-slate-400"><strong>Category:</strong> <span className="text-primary font-bold">{sub.projectType}</span></p>
                          </div>
                          <div className="space-y-1">
                            {sub.sdgGoals && sub.sdgGoals.length > 0 ? (
                              <p className="text-slate-600 dark:text-slate-400"><strong>UN SDGs Linked:</strong> {sub.sdgGoals.join(', ')}</p>
                            ) : (
                              <p className="text-slate-600 dark:text-slate-400"><strong>UN SDGs:</strong> None</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {sub.coPiDetails && sub.coPiDetails.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider mb-1">Co-Investigators</h5>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {sub.coPiDetails.map((copi: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs p-3 bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-slate-200 dark:border-white/5 gap-2">
                                <div className="truncate">
                                  <p className="font-bold text-slate-900 dark:text-white truncate">{copi.name}</p>
                                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{copi.email} | {copi.organization}</p>
                                </div>
                                {copi.cvUrl && (
                                  <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/10 h-7 text-[10px] gap-1 px-2 rounded-lg font-bold shrink-0">
                                    <a href={copi.cvUrl} target="_blank" rel="noopener noreferrer">
                                      <FileText className="h-3 w-3" /> CV
                                    </a>
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {sub.studentInfo && (
                        <div>
                          <h5 className="text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider mb-1">Student Members</h5>
                          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/20 p-3 border border-slate-200 dark:border-white/5 rounded-2xl">{sub.studentInfo}</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-900/60 pt-4 md:pt-0 md:pl-6 flex flex-col justify-start">
                      <h5 className="text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider">Proposal Files</h5>
                      
                      {sub.piCvUrl && (
                        <Button asChild variant="outline" size="sm" className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-900/80 text-slate-900 dark:text-white font-bold h-9 gap-1.5 justify-start">
                          <a href={sub.piCvUrl} target="_blank" rel="noopener noreferrer">
                            <FileText className="h-4 w-4 text-primary" />
                            PI CV (PDF/Word)
                          </a>
                        </Button>
                      )}

                      {sub.proposalUrls && sub.proposalUrls.length > 0 ? (
                        sub.proposalUrls.map((url, index) => (
                          <Button key={index} asChild variant="outline" size="sm" className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-900/80 text-slate-900 dark:text-white font-bold h-9 gap-1.5 justify-start">
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4 text-primary" />
                              {sub.proposalFileNames?.[index] || `Proposal Doc ${index + 1}`}
                            </a>
                          </Button>
                        ))
                      ) : sub.proposalUrl ? (
                        <Button asChild variant="outline" size="sm" className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-900/80 text-slate-900 dark:text-white font-bold h-9 gap-1.5 justify-start">
                          <a href={sub.proposalUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 text-primary" />
                            Proposal Proposal (PDF)
                          </a>
                        </Button>
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">No proposal files uploaded.</span>
                      )}

                      {sub.ethicsUrl && (
                        <Button asChild variant="outline" size="sm" className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-900/80 text-slate-900 dark:text-white font-bold h-9 gap-1.5 justify-start">
                          <a href={sub.ethicsUrl} target="_blank" rel="noopener noreferrer">
                            <ClipboardCheck className="h-4 w-4 text-primary" />
                            Ethics Clearance (PDF)
                          </a>
                        </Button>
                      )}

                      {sub.status === 'Draft' && (
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-850 space-y-2">
                          <h5 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Admin Draft Controls</h5>
                          <Button 
                            type="button"
                            onClick={() => handleToggleDraftEdit(sub.id, !sub.allowEditAfterDeadline)} 
                            variant={sub.allowEditAfterDeadline ? "destructive" : "default"}
                            size="sm" 
                            className={`w-full font-bold h-9 gap-1.5 ${
                              sub.allowEditAfterDeadline 
                                ? 'bg-rose-600 hover:bg-rose-500 text-white' 
                                : 'bg-primary hover:bg-primary/95 text-white'
                            }`}
                          >
                            {sub.allowEditAfterDeadline ? 'Block Edits After Deadline' : 'Allow Edits After Deadline'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 text-slate-500 font-semibold border border-dashed border-white/5 rounded-3xl">
              No submissions found for the selected Call.
            </div>
          )}
        </TabsContent>

        {/* Tab Content 2: Schedule Meeting */}
        <TabsContent value="schedule" className="space-y-6 focus-visible:outline-none">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            {/* Left Side: Submissions and Evaluators Checklists */}
            <div className="space-y-6">
              <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden">
                <CardHeader className="border-b border-slate-200 dark:border-slate-900 pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                  <div>
                    <CardTitle className="text-base text-slate-900 dark:text-white font-bold">1. Select Proposals ({selectedSubmissions.length} Selected)</CardTitle>
                    <CardDescription className="text-slate-500 dark:text-slate-400 text-xs">
                      Select one or more proposals to group into this review panel slot.
                    </CardDescription>
                  </div>
                  <Select onValueChange={setFilterScheduleCfp} value={filterScheduleCfp}>
                    <SelectTrigger className="w-full sm:w-56 bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs h-8">
                      <SelectValue placeholder="Filter by Call" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs">
                      <SelectItem value="All">All Calls</SelectItem>
                      {cfpTitles.map(title => (
                        <SelectItem key={title} value={title}>{title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="p-6 max-h-[350px] overflow-y-auto custom-scrollbar space-y-4">
                  {submissionsLoading ? (
                    <div className="h-16 bg-slate-100 dark:bg-white/5 animate-pulse rounded-2xl" />
                  ) : submissionsPendingSchedule.length > 0 ? (
                    submissionsPendingSchedule.map(sub => (
                      <div key={sub.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-white/5 rounded-2xl hover:border-slate-300 dark:hover:border-white/10 transition-all duration-300">
                        <Checkbox
                          checked={selectedSubmissions.includes(sub.id)}
                          onCheckedChange={() => toggleSubmissionSelection(sub.id)}
                        />
                        <div className="flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{sub.title}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">PI: {sub.piName} | Call: {sub.cfpTitle} | Status: <span className="text-primary font-bold">{sub.status}</span></p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-slate-500 font-semibold text-xs">
                      No pending submissions found to schedule.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden">
                <CardHeader className="border-b border-slate-200 dark:border-slate-900 pb-4">
                  <CardTitle className="text-base text-slate-900 dark:text-white font-bold">2. Assign Evaluators ({selectedEvaluators.length} Assigned)</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400 text-xs">
                    Select evaluators who will score these proposals.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6 max-h-[300px] overflow-y-auto custom-scrollbar grid gap-3 md:grid-cols-2">
                  {evaluators.length > 0 ? (
                    evaluators.map(ev => (
                      <div key={ev.uid} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-white/5 rounded-2xl hover:border-slate-300 dark:hover:border-white/10 transition-all duration-300">
                        <Checkbox
                          checked={selectedEvaluators.includes(ev.uid)}
                          onCheckedChange={() => toggleEvaluatorSelection(ev.uid)}
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{ev.name}</p>
                          <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">{ev.role}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-slate-500 font-semibold text-xs col-span-2">
                      No evaluators found.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Side: Slot Details Form */}
            <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden h-fit">
              <CardHeader className="border-b border-slate-200 dark:border-slate-900 pb-4">
                <CardTitle className="text-base text-slate-900 dark:text-white font-bold">3. Review Session Details</CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400 text-xs">
                  Configure panel timings and settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={handleScheduleMeeting} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-primary" /> Session Date</label>
                    <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" /> Session Start Time</label>
                    <Input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-primary" /> Panel Venue / Room</label>
                    <Input placeholder="e.g. Dean Boardroom, Room 102" value={meetingVenue} onChange={(e) => setMeetingVenue(e.target.value)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Session Mode</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input type="radio" checked={meetingMode === 'Offline'} onChange={() => setMeetingMode('Offline')} className="accent-primary" />
                        Offline (In-Person)
                      </label>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input type="radio" checked={meetingMode === 'Online'} onChange={() => setMeetingMode('Online')} className="accent-primary" />
                        Online (Virtual)
                      </label>
                    </div>
                  </div>

                  <Button type="submit" className="w-full bg-primary hover:bg-primary/95 font-bold text-white rounded-xl h-11" disabled={isScheduling}>
                    {isScheduling ? 'Scheduling Panel...' : 'Schedule Review Session'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab Content 3: Announce & Manage Calls */}
        <TabsContent value="announce" className="space-y-6 focus-visible:outline-none">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            {/* Left Side: Create / Edit Form */}
            <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden h-fit">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
              <CardHeader className="border-b border-slate-200 dark:border-slate-900 pb-4">
                <CardTitle className="text-lg text-slate-900 dark:text-white font-bold">
                  {editingId ? 'Edit Call Announcement' : 'Announce New Call'}
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400 text-xs">
                  Fill in the details below to broadcast a Call For Proposals.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={handleAnnounceSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Proposal Title</label>
                    <Input
                      placeholder="e.g. Call for minor projects in SEMICONDUCTOR TECH"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Description & Guidelines</label>
                    <Textarea
                      placeholder="Detailed guidelines, budget range, and key eligibility rules..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={6}
                      className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Department</label>
                      <Input
                        placeholder="e.g. Applied Sciences"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Deadline Date</label>
                      <Input
                        type="date"
                        value={applyDeadline}
                        onChange={(e) => setApplyDeadline(e.target.value)}
                        className="bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Announcement Documents – multi-file with custom naming */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Announcement Documents / Brochures (Optional)</label>

                    {/* Existing saved files */}
                    {existingFiles.length > 0 && (
                      <div className="space-y-1.5">
                        {existingFiles.map((f, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl">
                            <span className="text-[11px] text-slate-700 dark:text-slate-300 truncate max-w-[220px] flex items-center gap-1.5">
                              <FileText className="h-3 w-3 text-primary shrink-0" />
                              {f.name}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeExistingFile(i)}
                              className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Newly staged files */}
                    {newFiles.length > 0 && (
                      <div className="space-y-1.5">
                        {newFiles.map((f, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-primary/5 border border-primary/20 rounded-xl">
                            <span className="text-[11px] text-primary font-semibold truncate max-w-[220px] flex items-center gap-1.5">
                              <FileText className="h-3 w-3 shrink-0" />
                              {f.displayName} <span className="text-slate-500 font-normal">({f.file.name})</span>
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeNewFile(i)}
                              className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* File picker button */}
                    <label className="flex items-center gap-2 cursor-pointer w-full bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-200 dark:border-white/10 hover:border-primary/40 text-slate-500 dark:text-slate-400 hover:text-primary text-xs font-semibold rounded-xl px-3 h-9 transition-all">
                      <PlusCircle className="h-3.5 w-3.5" />
                      Add Document (PDF / Word)
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[10px] text-slate-500">You will be prompted to name each file after selecting it.</p>
                  </div>

                  <div className="flex gap-2 pt-4 justify-end">
                    {editingId && (
                      <Button type="button" variant="outline" onClick={resetAnnounceForm}>
                        Cancel
                      </Button>
                    )}
                    <Button type="submit" className="bg-primary hover:bg-primary/95 text-white font-bold animate-shimmer" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving...' : editingId ? 'Update Call' : 'Publish Call'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Right Side: List of Calls */}
            <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
              <CardHeader className="border-b border-slate-200 dark:border-slate-900 pb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-slate-900 dark:text-white font-bold">Active Announced Calls</CardTitle>
                  <CardDescription className="text-slate-500 dark:text-slate-400 text-xs">
                    View or manage active and past calls announced on the portal.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={exportCallsToExcel} disabled={calls.length === 0} className="shrink-0 gap-1.5 font-bold">
                  <Download className="h-4 w-4 text-primary" /> Export Report
                </Button>
              </CardHeader>
              <CardContent className="p-6">
                {callsLoading ? (
                  <div className="space-y-4">
                    <div className="h-24 bg-slate-100 dark:bg-white/5 animate-pulse rounded-2xl" />
                    <div className="h-24 bg-slate-100 dark:bg-white/5 animate-pulse rounded-2xl" />
                  </div>
                ) : calls.length > 0 ? (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar">
                    {calls.map((call) => {
                      const subCount = submissions.filter(s => s.cfpId === call.id || (s.cfpTitle && s.cfpTitle.toLowerCase() === call.title.toLowerCase())).length;
                      return (
                        <div key={call.id} className="p-5 border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/40 rounded-2xl relative group hover:border-primary/30 transition-all duration-300">
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary uppercase tracking-wider">
                              {call.department}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                <Users className="h-3 w-3" /> {subCount} {subCount === 1 ? 'Application' : 'Applications'}
                              </span>
                              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                ID: {call.id}
                              </span>
                            </div>
                          </div>

                        <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors mb-2">
                          {call.title}
                        </h4>

                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 mb-3 leading-relaxed whitespace-pre-wrap">
                          {call.description}
                        </p>

                        {/* Announcement Documents */}
                        {call.files && call.files.length > 0 && (
                          <div className="mb-4 flex flex-wrap gap-2">
                            {call.files.map((f, i) => (
                              <a
                                key={i}
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-bold bg-primary/5 px-2.5 py-1.5 rounded-lg border border-primary/15 transition-all"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                {f.name}
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-900 pt-3 text-[11px] font-semibold text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            Deadline: {format(parseISO(call.applyDeadline), 'dd MMM yyyy')}
                          </span>

                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleEditCall(call)} className="h-7 w-7 rounded-lg text-primary hover:bg-primary/10">
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteCall(call.id)} className="h-7 w-7 rounded-lg text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 text-slate-500 font-semibold">
                    No Special CFPs have been announced yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
