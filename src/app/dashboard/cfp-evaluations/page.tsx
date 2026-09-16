'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { getDefaultModulesForRole } from '@/lib/modules';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { submitCfpEvaluation } from '@/app/actions';
import type { CfpSubmission, User } from '@/types';
import { format, parseISO } from 'date-fns';
import { ClipboardCheck, FileText, User as UserIcon, Calendar, MapPin, Loader2 } from 'lucide-react';

export default function CfpEvaluationsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [submissions, setSubmissions] = useState<CfpSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendation, setRecommendation] = useState<'Recommended' | 'Not Recommended' | 'Revision Is Needed'>('Recommended');
  const [comments, setComments] = useState('');
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      const allowedModules = parsedUser.allowedModules || getDefaultModulesForRole(parsedUser.role, parsedUser.designation);
      const hasAccess = allowedModules.includes('cfp-evaluations');
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

  useEffect(() => {
    if (!currentUser) return;
    const subsRef = collection(db, 'cfpSubmissions');
    const isAdmin = ['Super-admin', 'admin', 'CRO'].includes(currentUser.role);
    const q = isAdmin 
      ? subsRef 
      : query(subsRef, where('meetingDetails.assignedEvaluators', 'array-contains', currentUser.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CfpSubmission));
      // Filter submissions Under Review where the current user is assigned as an evaluator
      // and has not evaluated this submission yet
      const assigned = fetched.filter(s =>
        s.status === 'Under Review' &&
        s.meetingDetails?.assignedEvaluators?.includes(currentUser.uid) &&
        !s.evaluatedBy?.includes(currentUser.uid)
      );
      setSubmissions(assigned);
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !activeSubId) return;
    if (!comments) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please provide evaluation comments.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitCfpEvaluation(
        activeSubId,
        currentUser.uid,
        currentUser.name,
        recommendation,
        comments
      );

      if (result.success) {
        toast({ title: 'Evaluation Submitted!', description: 'Your grading and notes have been registered.' });
        setComments('');
        setActiveSubId(null);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Submission Failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

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
        title="CFP Evaluations Queue"
        description="Review assigned Call For Proposals submissions, inspect project guidelines, and log your grading marks."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
        
        {/* Left Side: Pending Evaluations List */}
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Your Assigned Reviews ({submissions.length})
          </h3>

          {loading ? (
            <div className="space-y-4">
              <div className="h-32 bg-slate-100 dark:bg-white/5 animate-pulse rounded-3xl" />
            </div>
          ) : submissions.length > 0 ? (
            <div className="grid gap-6">
              {submissions.map(sub => (
                <Card key={sub.id} className={`border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden transition-all duration-300 ${
                  activeSubId === sub.id ? 'ring-2 ring-primary/45 border-transparent' : 'hover:border-primary/20'
                }`}>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
                  <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-900/60">
                    <span className="text-[10px] text-primary uppercase font-bold tracking-wider px-3 py-1 rounded-full bg-primary/10 border border-primary/20 w-fit">
                      Call: {sub.cfpTitle}
                    </span>
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white mt-3 leading-snug">{sub.title}</CardTitle>
                    <CardDescription className="text-xs text-slate-600 dark:text-slate-400 mt-2 flex flex-wrap gap-4">
                      <span className="flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> PI: {sub.piName} ({sub.piOrganization})</span>
                      {sub.meetingDetails && (
                        <>
                          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Date: {sub.meetingDetails.date} ({sub.meetingDetails.time})</span>
                          <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Venue: {sub.meetingDetails.venue}</span>
                        </>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="py-4 space-y-4">
                    <div>
                      <h5 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1">Abstract</h5>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">{sub.abstract}</p>
                    </div>

                    <div className="flex gap-2 text-xs font-semibold">
                      {sub.proposalUrls && sub.proposalUrls.length > 0 ? (
                        sub.proposalUrls.map((url, index) => (
                          <Button key={index} asChild variant="outline" size="sm" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs h-8">
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-3.5 w-3.5 mr-1" />
                              View {sub.proposalFileNames?.[index] || `Proposal Doc ${index + 1}`}
                            </a>
                          </Button>
                        ))
                      ) : sub.proposalUrl ? (
                        <Button asChild variant="outline" size="sm" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs h-8">
                          <a href={sub.proposalUrl} target="_blank" rel="noopener noreferrer">
                            <FileText className="h-3.5 w-3.5 mr-1" />
                            View Proposal (PDF/Word)
                          </a>
                        </Button>
                      ) : null}
                      {sub.piCvUrl && (
                        <Button asChild variant="outline" size="sm" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-800 text-xs h-8">
                          <a href={sub.piCvUrl} target="_blank" rel="noopener noreferrer">
                            <UserIcon className="h-3.5 w-3.5 mr-1" />
                            View PI CV
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="border-t border-slate-100 dark:border-slate-900/60 py-3 flex justify-end">
                    <Button onClick={() => setActiveSubId(sub.id)} className="bg-primary hover:bg-primary/95 text-white text-xs font-bold h-8 rounded-xl">
                      Evaluate Proposal
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="p-10 border border-dashed border-slate-200 dark:border-white/10 rounded-3xl text-center text-slate-600 dark:text-slate-400 font-semibold bg-slate-50 dark:bg-slate-950/10 text-xs">
              No assigned CFP proposals to evaluate in your queue.
            </div>
          )}
        </div>

        {/* Right Side: Quick Evaluation Form Drawer/Panel */}
        {activeSubId ? (
          <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden h-fit animate-in slide-in-from-right duration-300">
            <CardHeader className="border-b border-slate-100 dark:border-slate-900 pb-4">
              <CardTitle className="text-base text-slate-900 dark:text-white">Log Evaluation Grading</CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400 text-xs">
                Log score and notes for: {submissions.find(s => s.id === activeSubId)?.title.substring(0, 40)}...
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSubmitEvaluation} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Recommendation Decision</label>
                  <Select onValueChange={(val: any) => setRecommendation(val)} value={recommendation}>
                    <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-950 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white">
                      <SelectItem value="Recommended">Recommended</SelectItem>
                      <SelectItem value="Revision Is Needed">Revision Is Needed</SelectItem>
                      <SelectItem value="Not Recommended">Not Recommended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Grading Comments & Remarks</label>
                  <Textarea
                    placeholder="Provide robust evaluation notes, scientific strengths/weaknesses, or suggestions for revision..."
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={6}
                    className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex gap-2 pt-2 justify-end">
                  <Button type="button" variant="ghost" onClick={() => setActiveSubId(null)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-primary hover:bg-primary/95 text-white text-xs font-bold px-4" disabled={isSubmitting}>
                    {isSubmitting ? 'Logging...' : 'Submit Evaluation'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="hidden lg:flex flex-col justify-center items-center p-8 border border-dashed border-slate-200 dark:border-white/5 rounded-3xl bg-slate-50/50 dark:bg-slate-950/5 text-center text-slate-500 h-64 text-xs">
            Select a proposal from the queue to start evaluating.
          </div>
        )}
      </div>
    </div>
  );
}
