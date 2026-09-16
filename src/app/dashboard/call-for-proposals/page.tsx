'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getDefaultModulesForRole } from '@/lib/modules';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/config';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type { SpecialCfp, CfpSubmission, User } from '@/types';
import { format, parseISO } from 'date-fns';
import { Award, Calendar, ArrowRight, BookOpen, Clock, FileCheck } from 'lucide-react';
import { isCfpDeadlinePast } from '@/lib/utils';
import Link from 'next/link';

export default function CallForProposalsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [calls, setCalls] = useState<SpecialCfp[]>([]);
  const [mySubmissions, setMySubmissions] = useState<CfpSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      const allowedModules = parsedUser.allowedModules || getDefaultModulesForRole(parsedUser.role, parsedUser.designation);
      if (!allowedModules.includes('call-for-proposals')) {
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
    const callsRef = collection(db, 'specialCfps');
    const unsubscribeCalls = onSnapshot(callsRef, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpecialCfp));
      setCalls(fetched.filter(c => c.status === 'Open' && !isCfpDeadlinePast(c.applyDeadline, c.status)));
      setLoading(false);
    });

    return () => unsubscribeCalls();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const submissionsRef = query(
      collection(db, 'cfpSubmissions'),
      where('piEmail', '==', currentUser.email)
    );
    const unsubscribeSubmissions = onSnapshot(submissionsRef, (snapshot) => {
      const allSubmissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CfpSubmission));
      setMySubmissions(allSubmissions);
    });

    return () => unsubscribeSubmissions();
  }, [currentUser]);

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
      <PageHeader
        title="Call For Proposals"
        description="View and apply for Parul University Goa's special research calls and department-specific grants."
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
        {/* Left Side: Active Call Announcements */}
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Active Announcements
          </h3>

          {loading ? (
            <div className="space-y-4">
              <div className="h-32 bg-slate-100 dark:bg-white/5 animate-pulse rounded-3xl" />
              <div className="h-32 bg-slate-100 dark:bg-white/5 animate-pulse rounded-3xl" />
            </div>
          ) : calls.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-1">
              {calls.map((call) => (
                <Card key={call.id} className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden group hover:border-primary/20 transition-all duration-300">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-3 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                        {call.department}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        ID: {call.callIdentifier}
                      </span>
                    </div>
                    <CardTitle className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors leading-snug">
                      {call.title}
                    </CardTitle>
                    <CardDescription className="text-slate-600 dark:text-slate-400 text-xs mt-2 line-clamp-3 leading-relaxed">
                      {call.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-3 pb-6 border-t border-slate-100 dark:border-slate-900/60 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-primary" />
                      Apply By: {format(parseISO(call.applyDeadline), 'dd MMM yyyy')}
                    </span>

                    <Button asChild className="bg-primary hover:bg-primary/95 text-white font-bold h-9 px-4 rounded-xl gap-1">
                      <Link href={`/dashboard/call-for-proposals/apply/${call.id}`}>
                        Apply Now <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="p-10 border border-dashed border-slate-200 dark:border-white/10 rounded-3xl text-center text-slate-500 dark:text-slate-400 font-semibold bg-slate-50 dark:bg-slate-950/10">
              No active Special Call For Proposals at this moment. Please check back later.
            </div>
          )}
        </div>

        {/* Right Side: My Proposal Submissions */}
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            My CFP Submissions
          </h3>

          <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden h-fit">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <CardHeader className="border-b border-slate-100 dark:border-slate-900 pb-4">
              <CardTitle className="text-base text-slate-900 dark:text-white">Track Your Applications</CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400 text-xs">
                History of proposals submitted under announced CFPs.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar">
              {mySubmissions.length > 0 ? (
                mySubmissions.map((sub) => (
                  <div key={sub.id} className="p-4 border border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-900/30 rounded-2xl space-y-2 hover:border-slate-200 dark:hover:border-white/10 transition-all duration-300">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {sub.submissionId}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                        sub.status === 'Submitted' || sub.status === 'Revision Submitted'
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-500 dark:text-blue-400'
                          : sub.status === 'Sanctioned' || sub.status === 'Recommended'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : sub.status === 'Revision Needed'
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                          : 'bg-slate-500/10 border-slate-500/20 text-slate-600 dark:text-slate-400'
                      }`}>
                        {sub.status}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-2 leading-relaxed">
                      {sub.title}
                    </h4>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-900/60 mt-2">
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 flex items-center gap-1">
                        <FileCheck className="h-3 w-3 text-primary" />
                        Call: {sub.cfpTitle}
                      </p>
                      {sub.status === 'Draft' ? (
                        <Button asChild size="sm" variant="ghost" className="text-primary hover:text-primary/80 hover:bg-primary/10 h-7 text-[10px] font-bold px-2 rounded-lg gap-1">
                          <Link href={`/dashboard/call-for-proposals/apply/${sub.cfpId}?draftId=${sub.id}`}>
                            Edit Draft <ArrowRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="ghost" className="text-primary hover:text-primary/80 hover:bg-primary/10 h-7 text-[10px] font-bold px-2 rounded-lg gap-1">
                          <Link href={`/dashboard/cfp-proposal/${sub.id}`}>
                            View Details <ArrowRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-500 text-xs font-semibold">
                  You have not submitted any proposals yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
