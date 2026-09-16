'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, FileText, CheckCircle, Clock, XCircle, Eye, AlertTriangle, Trash2, Edit, Database, Sparkles, Upload } from 'lucide-react';
import { type ArpsSubmission, type User } from '@/types';
import { useRouter } from 'next/navigation';
import { getArpsSubmissions, deleteArpsSubmission, getArpsEvaluationCycles, uploadArpsPresentationAction, deleteArpsPresentationAction } from '@/app/arps-actions';
import { getDefaultModulesForRole } from '@/lib/modules';
import { uploadFileToApi } from '@/lib/upload-client';
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
  const [activeTab, setActiveTab] = useState<'all' | 'Draft' | 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Resubmission Required'>('all');
  const [selectedSub, setSelectedSub] = useState<ArpsSubmission | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [cycleLocked, setCycleLocked] = useState(false);
  const [cycleEndDate, setCycleEndDate] = useState<string | null>(null);
  const [presentationUploading, setPresentationUploading] = useState(false);
  const [presentationDeleting, setPresentationDeleting] = useState(false);
  const [presentationDeadline, setPresentationDeadline] = useState<string | null>(null);
  const [presentationLocked, setPresentationLocked] = useState(false);

  // Real-time ticking system clock and countdown
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number; isOver: boolean } | null>(null);

  const router = useRouter();
  const { toast } = useToast();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(`${currentYear - 1}-${currentYear.toString().slice(-2)}`);
  const [yearOptions, setYearOptions] = useState<string[]>([]);

  const formatDateTime = (date: Date | string) => {
    return new Date(date).toLocaleString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const getCycleDateRangeDescription = (yearStr: string) => {
    const match = yearStr.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const startYear = match[1];
      const endYearShort = match[2];
      const century = startYear.slice(0, 2);
      const endYear = `${century}${endYearShort}`;
      return `June 1, ${startYear} - May 31, ${endYear}`;
    }
    return '';
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!cycleEndDate) {
      setTimeLeft(null);
      return;
    }

    const difference = new Date(cycleEndDate).getTime() - currentTime.getTime();
    if (difference <= 0) {
      setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isOver: true });
      setCycleLocked(true);
    } else {
      const hours = Math.floor(difference / (1000 * 60 * 60));
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);
      setTimeLeft({ hours, minutes, seconds, isOver: false });
    }
  }, [cycleEndDate, currentTime]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      
      const allowedModules = parsedUser.allowedModules || getDefaultModulesForRole(parsedUser.role, parsedUser.designation);
      if (!allowedModules.includes('arps-submission')) {
        toast({
          title: 'Access Denied',
          description: "You don't have permission to view this page.",
          variant: 'destructive',
        });
        router.replace('/dashboard');
        return;
      }

      setCurrentUser(parsedUser);

      const unsub = onSnapshot(doc(db, 'users', parsedUser.uid), (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data() as User;
          const updatedModules = userData.allowedModules || getDefaultModulesForRole(userData.role, userData.designation);
          if (!updatedModules.includes('arps-submission')) {
            toast({
              title: 'Access Denied',
              description: "You don't have permission to view this page.",
              variant: 'destructive',
            });
            router.replace('/dashboard');
            return;
          }
          setCurrentUser(prev => prev ? { ...prev, ...userData } : userData);
          localStorage.setItem('user', JSON.stringify({ ...parsedUser, ...userData }));
        }
      });
      return () => unsub();
    } else {
      router.push('/login');
    }
  }, [router, toast]);

  const loadSubmissions = async () => {
    if (!currentUser) return;
    setLoading(true);
    setCycleLocked(false);
    setCycleEndDate(null);
    setPresentationLocked(false);
    setPresentationDeadline(null);
    try {
      const [subsRes, cyclesRes] = await Promise.all([
        getArpsSubmissions({ uid: currentUser.uid, academicYear: selectedYear }),
        getArpsEvaluationCycles()
      ]);
      if (subsRes.success) {
        setSubmissions(subsRes.submissions || []);
      }
      if (cyclesRes.success && cyclesRes.cycles) {
        const dbYears = Object.keys(cyclesRes.cycles);
        const allYears = Array.from(new Set(dbYears)).sort((a, b) => b.localeCompare(a));
        setYearOptions(allYears);

        const cycle = cyclesRes.cycles[selectedYear];
        if (cycle) {
          if (cycle.finalDate) {
            setCycleEndDate(cycle.finalDate);
            if (new Date() > new Date(cycle.finalDate)) {
              setCycleLocked(true);
            }
          }
          if (cycle.presentationDeadline) {
            setPresentationDeadline(cycle.presentationDeadline);
            if (new Date() > new Date(cycle.presentationDeadline)) {
              setPresentationLocked(true);
            }
          }
          if (cycle.status === 'frozen') {
            setCycleLocked(true);
            setPresentationLocked(true);
          }
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

  const handlePresentationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentUser) return;
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    const isPresentationLocked = presentationLocked && !currentUser?.manualArpsEnabled;
    if (isPresentationLocked) {
      toast({ variant: 'destructive', title: 'Upload Blocked', description: 'The presentation upload deadline has passed.' });
      return;
    }

    const allowedExtensions = ['.ppt', '.pptx', '.pdf'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      toast({ variant: 'destructive', title: 'Invalid File Type', description: 'Only PPT, PPTX, and PDF files are allowed.' });
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File Too Large', description: 'Maximum file size is 25MB.' });
      return;
    }

    setPresentationUploading(true);
    try {
      const uploadPath = `arps-presentations/${currentUser.uid}/${selectedYear}/${Date.now()}-${file.name}`;
      const uploadRes = await uploadFileToApi(file, { path: uploadPath });

      if (uploadRes.success && uploadRes.url) {
        const res = await uploadArpsPresentationAction(currentUser.uid, selectedYear, uploadRes.url, file.name);
        if (res.success) {
          toast({ title: 'Presentation Uploaded', description: 'Your ARPS presentation has been saved successfully.' });
        } else {
          toast({ variant: 'destructive', title: 'Upload Failed', description: res.error || 'Failed to save presentation metadata.' });
        }
      } else {
        toast({ variant: 'destructive', title: 'Upload Failed', description: uploadRes.error || 'Failed to upload presentation file.' });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Upload Error', description: error.message || 'An error occurred during upload.' });
    } finally {
      setPresentationUploading(false);
      e.target.value = '';
    }
  };

  const handleDeletePresentation = async () => {
    if (!currentUser) return;
    const isPresentationLocked = presentationLocked && !currentUser?.manualArpsEnabled;
    if (isPresentationLocked) {
      toast({ variant: 'destructive', title: 'Delete Blocked', description: 'The presentation upload deadline has passed.' });
      return;
    }
    if (!confirm('Are you sure you want to remove your presentation?')) return;
    setPresentationDeleting(true);
    try {
      const res = await deleteArpsPresentationAction(currentUser.uid, selectedYear);
      if (res.success) {
        toast({ title: 'Presentation Removed', description: 'Your presentation has been removed successfully.' });
      } else {
        toast({ variant: 'destructive', title: 'Removal Failed', description: res.error || 'Failed to remove presentation.' });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'An error occurred.' });
    } finally {
      setPresentationDeleting(false);
    }
  };

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
    { type: 'other', label: 'Other Details', desc: 'Submit any other custom research/academic achievements (Paragraph & Description) to print in your report', href: '/dashboard/arps-submission/other' },
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
    resubmissionRequired: submissions.filter(s => s.status === 'Resubmission Required').length,
  };

  const hasRequiredProfileDetails = currentUser?.hIndex !== undefined && currentUser?.i10Index !== undefined && currentUser?.citationCount !== undefined;
  const isCreationBlocked = (cycleLocked && !currentUser?.manualArpsEnabled) || !hasRequiredProfileDetails;
  const isPresentationLocked = presentationLocked && !currentUser?.manualArpsEnabled;

  if (!currentUser) return null;

  return (
    <div className="container mx-auto py-10 px-4 md:px-8 space-y-8 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="ARPS Submissions & Calculation"
          description={`Manage and submit your research achievements for the Annual Research Performance Score (ARPS). Last Date: ${cycleEndDate ? formatDateTime(cycleEndDate) : 'Not Announced'}`}
        />
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3 self-start md:self-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Cycle Year:</span>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="h-9 text-xs w-[140px] font-semibold bg-muted/30 border border-input shadow-sm">
                <SelectValue placeholder="Select Cycle" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(y => (
                  <SelectItem key={y} value={y} className="text-xs font-medium">
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedYear && getCycleDateRangeDescription(selectedYear) && (
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted/10 border px-2 py-1.5 rounded-lg shadow-inner">
              {getCycleDateRangeDescription(selectedYear)}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <span className="ml-4 text-muted-foreground">Loading submissions...</span>
        </div>
      ) : (
        <>
          {/* Live Countdown & System Time Banner */}
          {cycleEndDate && (
            <Card className={`overflow-hidden border shadow-lg bg-gradient-to-r ${(cycleLocked && !currentUser?.manualArpsEnabled) ? 'from-rose-500/10 to-red-500/10 border-rose-500/30' : 'from-indigo-500/10 via-purple-500/10 to-pink-500/10 border-indigo-500/30'} backdrop-blur-md transition-all hover:shadow-xl`}>
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                  {/* Info Column */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        {(!cycleLocked || currentUser?.manualArpsEnabled) && (
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        )}
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${(cycleLocked && !currentUser?.manualArpsEnabled) ? 'bg-rose-500' : 'bg-indigo-500'}`}></span>
                      </span>
                      <h3 className={`font-bold text-lg ${(cycleLocked && !currentUser?.manualArpsEnabled) ? 'text-rose-800 dark:text-rose-200' : 'text-indigo-800 dark:text-indigo-200'}`}>
                        {(cycleLocked && !currentUser?.manualArpsEnabled) ? 'Submission Window Closed' : 'ARPS Submission Countdown'}
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs font-medium text-muted-foreground">

                      <div className="flex items-center gap-2">
                        <span>Submission Deadline: <span className="font-bold text-foreground">{formatDateTime(cycleEndDate)}</span></span>
                      </div>
                    </div>

                    {(cycleLocked && !currentUser?.manualArpsEnabled) && (
                      <p className="text-xs text-rose-700/80 dark:text-rose-300/80 mt-2 max-w-2xl">
                        The final deadline for new submissions and draft edits has passed. You can only view your existing applications or edit those explicitly returned for correction.
                      </p>
                    )}
                    {(cycleLocked && currentUser?.manualArpsEnabled) && (
                      <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80 mt-2 max-w-2xl font-bold bg-emerald-500/10 p-2 border border-emerald-500/30 rounded-lg">
                        Submission window has been manually opened for you by the Super Admin.
                      </p>
                    )}
                  </div>

                  {/* Countdown Cards Column */}
                  {timeLeft && (
                    <div className="flex items-center gap-3 self-center">
                      {timeLeft.isOver ? (
                        <Badge variant="destructive" className="px-4 py-2 text-sm font-extrabold uppercase tracking-wider animate-pulse bg-rose-600 text-white">
                          Locked
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-2 select-none">
                          <div className="flex flex-col items-center">
                            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2.5 min-w-[54px] text-center shadow-inner relative overflow-hidden group">
                              <span className="font-mono text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 animate-pulse">
                                {String(timeLeft.hours).padStart(2, '0')}
                              </span>
                              <div className="absolute inset-0 bg-indigo-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                            </div>
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Hours</span>
                          </div>

                          <span className="font-mono text-xl font-bold text-indigo-400 animate-pulse">:</span>

                          <div className="flex flex-col items-center">
                            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2.5 min-w-[54px] text-center shadow-inner relative overflow-hidden group">
                              <span className="font-mono text-2xl font-extrabold text-purple-600 dark:text-purple-400 animate-pulse">
                                {String(timeLeft.minutes).padStart(2, '0')}
                              </span>
                              <div className="absolute inset-0 bg-purple-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                            </div>
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Mins</span>
                          </div>

                          <span className="font-mono text-xl font-bold text-purple-400 animate-pulse">:</span>

                          <div className="flex flex-col items-center">
                            <div className="bg-pink-500/10 border border-pink-500/20 rounded-lg p-2.5 min-w-[54px] text-center shadow-inner relative overflow-hidden group">
                              <span className="font-mono text-2xl font-extrabold text-pink-600 dark:text-pink-400 animate-pulse">
                                {String(timeLeft.seconds).padStart(2, '0')}
                              </span>
                              <div className="absolute inset-0 bg-pink-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                            </div>
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Secs</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Achievement Presentation Upload Card */}
          <Card className="overflow-hidden border shadow-lg bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-cyan-500/10 border-teal-500/30 backdrop-blur-md transition-all hover:shadow-xl mt-4">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-teal-600 animate-pulse" />
                    <h3 className="font-bold text-lg text-teal-800 dark:text-teal-200">
                      Annual ARPS Presentation
                    </h3>
                  </div>

                  {presentationDeadline && (
                    <p className="text-xs text-muted-foreground font-semibold">
                      Presentation Upload Deadline: <span className="text-foreground font-bold">{formatDateTime(presentationDeadline)}</span>
                    </p>
                  )}
                  {currentUser?.arpsScores?.[selectedYear]?.presentationUrl ? (
                    <div className="flex items-center gap-2 text-xs font-semibold text-teal-700 bg-teal-500/10 p-2 border border-teal-500/20 rounded-lg w-fit mt-2">
                      <FileText className="h-4 w-4 text-teal-600" />
                      <span>
                        Uploaded:{' '}
                        <span
                          className="underline cursor-pointer font-bold hover:text-teal-800 dark:hover:text-teal-300 transition-colors"
                          onClick={() => currentUser?.arpsScores?.[selectedYear]?.presentationUrl && window.open(currentUser.arpsScores[selectedYear].presentationUrl, '_blank')}
                        >
                          {currentUser.arpsScores[selectedYear].presentationName || 'presentation'}
                        </span>
                        {currentUser.arpsScores[selectedYear].presentationUploadedAt && (
                          <span className="text-muted-foreground font-normal">
                            {' '}
                            (on {new Date(currentUser.arpsScores[selectedYear].presentationUploadedAt).toLocaleString('en-GB')})
                          </span>
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="text-xs text-amber-600 bg-amber-500/5 p-2 border border-amber-500/10 rounded-lg w-fit mt-2 font-medium">
                      No presentation uploaded yet for this cycle.
                    </div>
                  )}
                  {isPresentationLocked && (
                    <p className="text-xs text-rose-600 font-bold bg-rose-500/10 p-2 border border-rose-500/30 rounded-lg w-fit mt-2">
                      The presentation upload window is closed.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0 self-center md:self-auto">
                  {presentationUploading ? (
                    <Button disabled className="bg-teal-600 text-white min-w-[140px]">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading...
                    </Button>
                  ) : (
                    <>
                      <input
                        type="file"
                        id="presentation-file-input"
                        className="hidden"
                        accept=".ppt,.pptx,.pdf"
                        onChange={handlePresentationUpload}
                        disabled={isPresentationLocked}
                      />
                      <Button
                        onClick={() => document.getElementById('presentation-file-input')?.click()}
                        disabled={isPresentationLocked}
                        className="bg-teal-600 hover:bg-teal-700 text-white font-medium"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {currentUser?.arpsScores?.[selectedYear]?.presentationUrl ? 'Change File' : 'Upload Presentation'}
                      </Button>

                      {currentUser?.arpsScores?.[selectedYear]?.presentationUrl && (
                        <Button
                          variant="outline"
                          onClick={handleDeletePresentation}
                          disabled={presentationDeleting || isPresentationLocked}
                          className="border-rose-200 hover:bg-rose-50 text-rose-600 hover:text-rose-700"
                        >
                          {presentationDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

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
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6 mt-6">
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

            <Card className="shadow-lg border-t-4 border-t-purple-500 bg-background/55 backdrop-blur-md transition-all hover:scale-[1.01]">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex justify-between items-center">
                  Revision Required
                  <AlertTriangle className="h-4 w-4 text-purple-500" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold tracking-tight text-purple-600">
                  {stats.resubmissionRequired}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Requires your corrections</p>
              </CardContent>
            </Card>
          </div>

          {/* ARPS component breakdown removed for end users */}

          {/* New Submissions Cards Grid */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold tracking-tight">Create New ARPS Claim Submissions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {submissionTypes.map((item, idx) => {
                const isOther = item.type === 'other';
                const existingOtherSub = submissions.find(s => s.submissionType === 'other');
                const hasExistingOther = isOther && existingOtherSub;
                const buttonText = hasExistingOther ? 'Edit Entry' : 'Submit Entry';
                const targetHref = hasExistingOther ? `/dashboard/arps-submission/other?edit=${existingOtherSub.id}` : item.href;

                return (
                  <Card key={idx} className={`flex flex-col justify-between transition-all border border-border relative overflow-hidden bg-background ${isCreationBlocked ? 'opacity-70 cursor-not-allowed' : 'hover:shadow-xl group'}`}>
                    <div className="p-6">
                      <h3 className={`font-bold text-base text-foreground ${!isCreationBlocked ? 'group-hover:text-primary' : ''} transition-colors`}>{item.label}</h3>
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.desc}</p>
                    </div>
                    <div className="p-6 pt-0 mt-auto">
                      <Button
                        onClick={() => !isCreationBlocked && router.push(targetHref)}
                        disabled={isCreationBlocked}
                        className={`w-full mt-2 ${!isCreationBlocked ? 'group-hover:bg-primary' : ''}`}
                      >
                        {hasExistingOther ? <Edit className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />} {buttonText}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* My Submissions Table/List */}
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <h2 className="text-lg font-bold tracking-tight">My ARPS Submissions History</h2>
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Resubmission Required'] as const).map(tab => (
                  <Button
                    key={tab}
                    variant={activeTab === tab ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTab(tab)}
                    className="capitalize text-xs px-3 py-1 h-auto"
                  >
                    {tab === 'all' ? 'All' : tab === 'Resubmission Required' ? 'Revision Required' : tab}
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
                        const title = sub.paperTitle || sub.patentTitle || sub.consultancyTitle || sub.projectTitle || sub.studentName || sub.eventName || sub.details || 'N/A';
                        return (
                          <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-6 py-4 font-mono font-medium text-xs">{sub.submissionId}</td>
                            <td className="px-6 py-4 capitalize text-xs">{sub.submissionType}</td>
                            <td className="px-6 py-4 font-medium max-w-xs whitespace-normal break-words">{title}</td>
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

                              {sub.status !== 'Approved' && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => router.push(`/dashboard/arps-submission/${sub.submissionType}?edit=${sub.id}`)}
                                >
                                  <Edit className="h-4 w-4 text-blue-500" />
                                </Button>
                              )}

                              {sub.status !== 'Approved' && (
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
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <span>Submission Details</span>
              {selectedSub?.fetchedFrom && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30 flex items-center gap-1 text-xs py-0.5 px-2 select-none">
                  <Database className="h-3 w-3" />
                  Verified via {selectedSub.fetchedFrom === 'scopus' ? 'Scopus' : 'Web of Science'}
                </Badge>
              )}
            </DialogTitle>
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
                      <div className="col-span-2 flex justify-between items-start gap-4">
                        <div>
                          <span className="text-muted-foreground font-medium">Title:</span> {selectedSub.paperTitle}
                        </div>
                        {selectedSub.fetchedFrom && (
                          <Badge className="bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 border-emerald-500/30 flex items-center gap-1 shrink-0 font-medium py-1 px-2.5 rounded-full select-none text-[11px] animate-pulse">
                            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                            Auto-fetched: {selectedSub.fetchedFrom === 'scopus' ? 'Scopus' : 'WoS'}
                          </Badge>
                        )}
                      </div>
                      <div><span className="text-muted-foreground font-medium">DOI:</span> {selectedSub.doi}</div>
                      <div><span className="text-muted-foreground font-medium">Journal:</span> {selectedSub.journalName}</div>
                      {selectedSub.publicationType === 'Journal' && <div><span className="text-muted-foreground font-medium">Quartile:</span> {selectedSub.journalClassification}</div>}
                      <div><span className="text-muted-foreground font-medium">Author Position:</span> {selectedSub.authorPosition}</div>
                      <div><span className="text-muted-foreground font-medium">Index Type:</span> {selectedSub.indexType}</div>
                      <div><span className="text-muted-foreground font-medium">Article Type:</span> {selectedSub.articleType}</div>
                      <div><span className="text-muted-foreground font-medium">Publication Type:</span> {selectedSub.publicationType}</div>
                      <div><span className="text-muted-foreground font-medium">Author Rank/Order:</span> {selectedSub.authorOrder}</div>
                      <div><span className="text-muted-foreground font-medium">Total Authors:</span> {selectedSub.totalAuthors}</div>
                      <div><span className="text-muted-foreground font-medium">Single PU Author with External Co-authors?</span> {selectedSub.isSinglePuAuthorWithExternal ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground font-medium">IMR Acknowledged?</span> {selectedSub.hasImrAcknowledgement ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground font-medium">EMR Acknowledged?</span> {selectedSub.hasEmrAcknowledgement ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground font-medium">Publication Date:</span> {selectedSub.publicationDate}</div>
                      <div><span className="text-muted-foreground font-medium">Funding Agency Acknowledged:</span> {selectedSub.fundingAcknowledgement || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Publisher Name:</span> {selectedSub.publisherName}</div>
                      {selectedSub.publicationType === 'Book Chapter' && <div><span className="text-muted-foreground font-medium">Book Name:</span> {selectedSub.bookTitleForChapter || 'N/A'}</div>}
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Publisher Link:</span> {selectedSub.publisherWebsite ? <a href={selectedSub.publisherWebsite} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{selectedSub.publisherWebsite}</a> : 'N/A'}</div>
                      {selectedSub.scopusLink && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground font-medium">Scopus Link:</span>{' '}
                          <a href={selectedSub.scopusLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {selectedSub.scopusLink}
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedSub.submissionType === 'patent' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Title:</span> {selectedSub.patentTitle}</div>
                      <div><span className="text-muted-foreground font-medium">Patent Number:</span> {selectedSub.patentNumber}</div>
                      <div><span className="text-muted-foreground font-medium">Category:</span> {selectedSub.patentCategory}</div>
                      <div><span className="text-muted-foreground font-medium">Filing Date:</span> {selectedSub.filingDate}</div>
                      <div><span className="text-muted-foreground font-medium">Grant Date:</span> {selectedSub.grantDate || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Applicant Structure:</span> {selectedSub.applicantStructure || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">PU Joint Applicant?</span> {selectedSub.isPuJointApplicant ? 'Yes' : 'No'}</div>
                      <div><span className="text-muted-foreground font-medium">PU Sole Applicant?</span> {selectedSub.isPuSoleApplicant ? 'Yes' : 'No'}</div>
                    </div>
                  )}

                  {selectedSub.submissionType === 'consultancy' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Title:</span> {selectedSub.consultancyTitle}</div>
                      <div><span className="text-muted-foreground font-medium">Client:</span> {selectedSub.clientOrganization}</div>
                      <div><span className="text-muted-foreground font-medium">Revenue Amount:</span> ₹{selectedSub.revenueAmount?.toLocaleString('en-IN')}</div>
                      <div><span className="text-muted-foreground font-medium">Transaction Date:</span> {selectedSub.transactionDate}</div>
                    </div>
                  )}

                  {(selectedSub.submissionType === 'EMR' || selectedSub.submissionType === 'emr') && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Title:</span> {selectedSub.projectTitle}</div>
                      <div><span className="text-muted-foreground font-medium">Agency:</span> {selectedSub.fundingAgency}</div>
                      <div><span className="text-muted-foreground font-medium">Sanction Amount:</span> ₹{selectedSub.sanctionAmount?.toLocaleString('en-IN')}</div>
                      <div><span className="text-muted-foreground font-medium">Role:</span> {selectedSub.role}</div>
                      <div><span className="text-muted-foreground font-medium">Status:</span> {selectedSub.projectStatus}</div>
                      <div><span className="text-muted-foreground font-medium">Duration (months):</span> {selectedSub.durationMonths}</div>
                      <div><span className="text-muted-foreground font-medium">Start Date:</span> {selectedSub.startDate}</div>
                      <div><span className="text-muted-foreground font-medium">End Date:</span> {selectedSub.endDate}</div>
                    </div>
                  )}

                  {selectedSub.submissionType === 'student' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-muted-foreground font-medium">Student Name:</span> {selectedSub.studentName}</div>
                      <div><span className="text-muted-foreground font-medium">Enrollment No:</span> {selectedSub.studentEnrollmentNo || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Program:</span> {selectedSub.program}</div>
                      <div><span className="text-muted-foreground font-medium">Institute:</span> {selectedSub.studentInstitute || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Department:</span> {selectedSub.studentDepartment || 'N/A'}</div>
                      <div><span className="text-muted-foreground font-medium">Status:</span> {selectedSub.studentStatus}</div>
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Allotment details:</span> {selectedSub.allotmentDetails}</div>
                    </div>
                  )}

                  {selectedSub.submissionType === 'activity' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="col-span-2"><span className="text-muted-foreground font-medium">Event Name:</span> {selectedSub.eventName}</div>
                      <div><span className="text-muted-foreground font-medium">Category:</span> {selectedSub.activityCategory}</div>
                      <div><span className="text-muted-foreground font-medium">Organization:</span> {selectedSub.organization}</div>
                      <div><span className="text-muted-foreground font-medium">Duration (days):</span> {selectedSub.eventDurationDays}</div>
                      <div><span className="text-muted-foreground font-medium">Location:</span> {selectedSub.location}</div>
                      <div><span className="text-muted-foreground font-medium">Role performed:</span> {selectedSub.rolePerformed}</div>
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
