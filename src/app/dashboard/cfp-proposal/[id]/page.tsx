'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { submitCfpRevision, updateCfpDuration, updateCfpSubmissionStatus, toggleCfpDraftEditPermission } from '@/app/actions';
import type { CfpSubmission, User } from '@/types';
import { getDefaultModulesForRole } from '@/lib/modules';
import { uploadFileToApi } from '@/lib/upload-client';
import { format, parseISO } from 'date-fns';
import { FileText, Calendar, Landmark, User as UserIcon, Coins, RefreshCw, Clock } from 'lucide-react';
import Link from 'next/link';

export default function CfpProposalDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  const [submission, setSubmission] = useState<CfpSubmission | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();

  // Revision & Duration local states
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [isRevisionUploading, setIsRevisionUploading] = useState(false);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isTimelineSaving, setIsTimelineSaving] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    } else {
      router.replace('/login');
    }
  }, [router]);

  useEffect(() => {
    if (loading || !currentUser || !submission) return;

    const allowedModules = currentUser.allowedModules || getDefaultModulesForRole(currentUser.role, currentUser.designation);
    const hasAdminPermission = allowedModules.includes('manage-cfp-submissions');
    const hasEvaluatorPermission = allowedModules.includes('cfp-evaluations');
    const isPI = currentUser.email === submission.piEmail;

    if (!hasAdminPermission && !hasEvaluatorPermission && !isPI) {
      toast({
        title: 'Access Denied',
        description: "You don't have permission to view this proposal.",
        variant: 'destructive',
      });
      router.replace('/dashboard');
    }
  }, [currentUser, submission, loading, router, toast]);

  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'cfpSubmissions', id);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as CfpSubmission;
        setSubmission(data);
        if (data.projectStartDate) setStartDate(data.projectStartDate);
        if (data.projectEndDate) setEndDate(data.projectEndDate);
      } else {
        toast({ variant: 'destructive', title: 'Error', description: 'Submission details not found.' });
      }
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id, toast]);

  const handleRevisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revisionFile) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a revised PDF or Word proposal document.' });
      return;
    }

    setIsRevisionUploading(true);
    try {
      const uploadRes = await uploadFileToApi(revisionFile);
      if (!uploadRes.success || !uploadRes.url) {
        throw new Error(uploadRes.error || 'Failed to upload revised file.');
      }

      const result = await submitCfpRevision(id, uploadRes.url, "PI Uploaded Revised Proposal Description");
      if (result.success) {
        toast({ title: 'Revision Submitted!', description: 'Your revised proposal has been logged.' });
        setRevisionFile(null);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Revision Failed', description: error.message });
    } finally {
      setIsRevisionUploading(false);
    }
  };

  const handleSaveTimeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please provide start and end dates.' });
      return;
    }

    setIsTimelineSaving(true);
    try {
      const result = await updateCfpDuration(id, startDate, endDate);
      if (result.success) {
        toast({ title: 'Timeline Updated', description: 'Timelines updated successfully!' });
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to update duration', description: error.message });
    } finally {
      setIsTimelineSaving(false);
    }
  };

  const handleSanctionAction = async () => {
    try {
      const result = await updateCfpSubmissionStatus(id, "Sanctioned");
      if (result.success) {
        toast({ title: 'Project Sanctioned!', description: 'The project is now officially Sanctioned.' });
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to sanction', description: error.message });
    }
  };

  const handleToggleDraftEdit = async (allow: boolean) => {
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

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center">
        <RefreshCw className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!submission) return null;

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'Super-admin';
  const isPI = currentUser?.email === submission.piEmail;

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
      <PageHeader
        title="CFP Proposal Details"
        description={`Track panel details, budget tracking, and evaluation status for submission: ${submission.submissionId}`}
        backButtonHref="/dashboard/call-for-proposals"
      />

      <div className="mt-8 flex flex-col gap-8">
        
        {/* Section 1: General Info, Timelines & Grants */}
        <div className="space-y-6">
          <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
            <CardHeader className="border-b border-slate-100 dark:border-slate-900 pb-4 flex flex-row justify-between items-center">
              <div>
                <CardTitle className="text-lg text-slate-900 dark:text-white">Proposal Specs</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 text-xs">PI and core project descriptors.</CardDescription>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider border ${
                submission.status === 'Submitted' || submission.status === 'Revision Submitted'
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-500 dark:text-blue-400'
                  : submission.status === 'Sanctioned' || submission.status === 'Recommended'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  : submission.status === 'Revision Needed'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                  : 'bg-slate-500/10 border-slate-500/20 text-slate-600 dark:text-slate-400'
              }`}>
                {submission.status}
              </span>
            </CardHeader>
            <CardContent className="p-6 space-y-4 text-slate-700 dark:text-slate-300 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Principal Investigator</span>
                  <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5"><UserIcon className="h-4 w-4 text-primary" /> {submission.piName}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{submission.piEmail} | {submission.piPhone}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-white/5 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Institution / Organization</span>
                  <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5"><Landmark className="h-4 w-4 text-primary" /> {submission.piOrganization}</p>
                  {submission.piFaculty && <p className="text-xs text-slate-600 dark:text-slate-400">{submission.piFaculty} | {submission.piDepartment}</p>}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-base mb-1">{submission.title}</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{submission.abstract}</p>
              </div>

              <div className="flex gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400 flex-wrap pb-2">
                <span>Category: <strong className="text-slate-900 dark:text-white">{submission.projectType}</strong></span>
                {submission.sdgGoals && submission.sdgGoals.length > 0 && (
                  <span>Goals: <strong className="text-slate-900 dark:text-white">{submission.sdgGoals.length} SDG Goals Linked</strong></span>
                )}
              </div>

              {submission.sdgGoals && submission.sdgGoals.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-900">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Linked SDG Goals</span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {submission.sdgGoals.map((goal, idx) => (
                      <span key={idx} className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20">
                        {goal}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {submission.coPiDetails && submission.coPiDetails.length > 0 && (
                <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-900">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Co-Investigators (Co-PIs)</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {submission.coPiDetails.map((coPi, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-white/5 space-y-1">
                        <p className="font-bold text-slate-900 dark:text-white text-xs">{coPi.name}</p>
                        <p className="text-[11px] text-slate-500">{coPi.organization}</p>
                        <p className="text-[11px] text-slate-500">{coPi.email}</p>
                        {coPi.cvUrl && (
                          <a href={coPi.cvUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1 mt-1">
                            <FileText className="h-3.5 w-3.5" /> View CV
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {submission.studentInfo && (
                <div className="space-y-1 pt-3 border-t border-slate-100 dark:border-slate-900">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Student Members / Support Staff</span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/20 p-3 rounded-xl border border-slate-100 dark:border-white/5 mt-1 leading-relaxed">
                    {submission.studentInfo}
                  </p>
                </div>
              )}

              {submission.expectedOutcomes && (
                <div className="space-y-1 pt-3 border-t border-slate-100 dark:border-slate-900">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Expected Outcomes & Socio-Economic Impact</span>
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/20 p-3 rounded-xl border border-slate-100 dark:border-white/5 mt-1 leading-relaxed">
                    {submission.expectedOutcomes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timelines and Duration Panel (For Sanctioned or In Progress) */}
          {(submission.status === 'Sanctioned' || submission.status === 'Recommended') && (
            <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
              <CardHeader className="border-b border-slate-100 dark:border-slate-900 pb-4">
                <CardTitle className="text-base text-slate-900 dark:text-white">Project Timelines & Durations</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 text-xs">Set duration parameters (Admin only).</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={handleSaveTimeline} className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="space-y-1.5 flex-1 w-full">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Project Start Date</label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!isAdmin} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                  </div>
                  <div className="space-y-1.5 flex-1 w-full">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Project End Date</label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!isAdmin} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                  </div>
                  {isAdmin && (
                    <Button type="submit" disabled={isTimelineSaving} className="bg-primary hover:bg-primary/95 text-white font-bold h-10 px-6 rounded-xl">
                      {isTimelineSaving ? 'Saving...' : 'Save Dates'}
                    </Button>
                  )}
                </form>
              </CardContent>
            </Card>
          )}

          {/* Grant Management Access Card */}
          {submission.status === 'Sanctioned' && (
            <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden border-emerald-500/20 bg-gradient-to-r from-emerald-50/50 via-white to-emerald-50/30 dark:from-slate-950/40 dark:via-slate-950/40 dark:to-emerald-950/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <Coins className="h-5 w-5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
                  Active Grant Management
                </CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 text-xs">
                  This CFP proposal has been officially sanctioned. You can now manage installments and utilize budgets.
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-6">
                <Button asChild className="bg-emerald-600 hover:bg-emerald-500 font-bold text-white h-10 px-6 rounded-xl shadow-lg shadow-emerald-500/10">
                  <Link href={`/dashboard/cfp-grant-management/${submission.id}`}>
                    Go to Grant Tracker <Coins className="h-4 w-4 ml-1.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Side: Revisions, Actions, Files */}
        <div className="space-y-6">
          {/* File Explorer Panel */}
          <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-slate-900 pb-4">
              <CardTitle className="text-sm text-slate-900 dark:text-white">Submitted Proposal Artifacts</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {submission.proposalUrls && submission.proposalUrls.length > 0 ? (
                  submission.proposalUrls.map((url, index) => (
                    <Button key={index} asChild variant="outline" className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-bold h-10 justify-start gap-2">
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 text-primary" /> Download {submission.proposalFileNames?.[index] || `Proposal Doc ${index + 1}`}
                      </a>
                    </Button>
                  ))
                ) : submission.proposalUrl ? (
                  <Button asChild variant="outline" className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-bold h-10 justify-start gap-2">
                    <a href={submission.proposalUrl} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-4 w-4 text-primary" /> Download Proposal (PDF/Word)
                    </a>
                  </Button>
                ) : null}
                {submission.piCvUrl && (
                  <Button asChild variant="outline" className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-bold h-10 justify-start gap-2">
                    <a href={submission.piCvUrl} target="_blank" rel="noopener noreferrer">
                      <UserIcon className="h-4 w-4 text-primary" /> Download PI CV (PDF/Word)
                    </a>
                  </Button>
                )}
                {submission.coPiDetails && submission.coPiDetails.map((coPi, index) => coPi.cvUrl ? (
                  <Button key={`coPiCv-${index}`} asChild variant="outline" className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-bold h-10 justify-start gap-2">
                    <a href={coPi.cvUrl} target="_blank" rel="noopener noreferrer">
                      <UserIcon className="h-4 w-4 text-primary" /> Download Co-PI CV: {coPi.name}
                    </a>
                  </Button>
                ) : null)}
                {submission.ethicsUrl && (
                  <Button asChild variant="outline" className="w-full bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-white font-bold h-10 justify-start gap-2">
                    <a href={submission.ethicsUrl} target="_blank" rel="noopener noreferrer">
                      <FileText className="h-4 w-4 text-primary" /> Download Ethics Cert (PDF/Word)
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Meeting Details Card */}
          {submission.meetingDetails && (
            <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden border-blue-500/20 bg-gradient-to-br from-blue-50/50 via-white to-blue-50/30 dark:from-slate-950/40 dark:to-blue-950/10">
              <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-900/60">
                <CardTitle className="text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-blue-500 dark:text-blue-400 animate-pulse" />
                  Scheduled Review Panel
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 text-slate-700 dark:text-slate-300 text-xs space-y-2">
                <p><strong>Date:</strong> {submission.meetingDetails.date}</p>
                <p><strong>Time:</strong> {submission.meetingDetails.time}</p>
                <p><strong>Venue:</strong> {submission.meetingDetails.venue}</p>
                <p><strong>Mode:</strong> {submission.meetingDetails.mode}</p>
              </CardContent>
            </Card>
          )}

          {/* Revision Upload Panel (For PI) */}
          {submission.status === 'Revision Needed' && isPI && (
            <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden border-amber-500/20 bg-gradient-to-br from-amber-50/50 via-white to-amber-50/30 dark:from-slate-950/40 dark:to-amber-950/10 animate-pulse">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-900 dark:text-white">Revision Needed</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 text-xs">
                  Upload revised proposal descriptions based on the evaluator comments.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <form onSubmit={handleRevisionSubmit} className="space-y-4">
                  <Input type="file" accept=".pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => setRevisionFile(e.target.files?.[0] || null)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                  <Button type="submit" disabled={isRevisionUploading} className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold h-9">
                    {isRevisionUploading ? 'Uploading...' : 'Submit Revised Proposal'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Draft Notice & Edit Button (For PI) */}
          {submission.status === 'Draft' && isPI && (
            <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-white to-primary/5 dark:from-slate-950/40 dark:to-primary/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-slate-900 dark:text-white font-bold">Draft Submission</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 text-xs">
                  This proposal is currently saved as a draft. You must complete and submit it to be reviewed by the panel.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <Button asChild className="w-full bg-primary hover:bg-primary/95 text-white font-bold h-10 rounded-xl">
                  <Link href={`/dashboard/call-for-proposals/apply/${submission.cfpId}?draftId=${submission.id}`}>
                    Edit Draft & Submit
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Admin Command Decisions Panel */}
          {isAdmin && submission.status === 'Recommended' && (
            <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/30 dark:from-slate-950/40 dark:to-emerald-950/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-900 dark:text-white">RDC Administrative Decisions</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 text-xs">Approve and Sanction this proposal.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <Button onClick={handleSanctionAction} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 rounded-xl shadow-lg shadow-emerald-500/10">
                  Sanction Proposal & Award Grant
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Admin Draft Controls Panel */}
          {isAdmin && submission.status === 'Draft' && (
            <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden bg-gradient-to-br from-amber-50/50 via-white to-amber-50/30 dark:from-slate-950/40 dark:to-amber-950/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-900 dark:text-white font-bold">Admin Draft Controls</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400 text-xs">Allow edits to this draft after the deadline has passed.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <Button 
                  onClick={() => handleToggleDraftEdit(!submission.allowEditAfterDeadline)} 
                  className={`w-full font-bold h-10 rounded-xl shadow-lg ${
                    submission.allowEditAfterDeadline 
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/10' 
                      : 'bg-primary hover:bg-primary/95 text-white shadow-primary/10'
                  }`}
                >
                  {submission.allowEditAfterDeadline ? 'Block Edits After Deadline' : 'Allow Edits After Deadline'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
