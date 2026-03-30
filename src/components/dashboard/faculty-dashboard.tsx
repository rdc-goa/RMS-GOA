
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProjectList } from '@/components/projects/project-list';
import { FilePlus2, CheckCircle, Clock, ArrowRight, BookOpenCheck } from 'lucide-react';
import type { User, Project, EmrInterest, FundingCall } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, or } from 'firebase/firestore';
import { Skeleton } from '../ui/skeleton';
import { EmrCalendar } from '../emr/emr-calendar';
import { EmrActions } from '../emr/emr-actions';


export function FacultyDashboard({ user }: { user: User }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [emrInterests, setEmrInterests] = useState<EmrInterest[]>([]);
  const [fundingCalls, setFundingCalls] = useState<FundingCall[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch IMR Projects
      const projectsRef = collection(db, 'projects');
      const projectsQuery = query(
        projectsRef,
        or(
          where('pi_uid', '==', user.uid),
          where('coPiUids', 'array-contains', user.uid)
        )
      );
      
      // Fetch EMR Interests for the user
      const interestsRef = collection(db, 'emrInterests');
      const emrQuery = query(interestsRef, where('userId', '==', user.uid));
      
      // Fetch all funding calls to map titles
      const callsRef = collection(db, 'fundingCalls');
      const callsQuery = query(callsRef);

      const [projectsSnapshot, interestsSnapshot, callsSnapshot] = await Promise.all([
          getDocs(projectsQuery),
          getDocs(emrQuery),
          getDocs(callsQuery)
      ]);

      const userProjects = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(userProjects);
      
      const userInterests = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
      setEmrInterests(userInterests);

      const allCalls = callsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));
      setFundingCalls(allCalls);

    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  
  const getCallById = (callId: string) => fundingCalls.find(c => c.id === callId);

  const activeStatuses = ['Recommended', 'In Progress', 'Pending Completion Approval', 'Sanctioned', 'SANCTIONED'];
  const activeProjects = projects.filter(p => activeStatuses.includes(p.status)).length;
  
  const pendingApprovalStatuses = ['Under Review', 'Submitted', 'Revision Needed', 'Revision Submitted'];
  const pendingApproval = projects.filter(p => pendingApprovalStatuses.includes(p.status)).length;
  
  const completedProjects = projects.filter(p => p.status === 'Completed').length;

  const statCards = [
    { title: 'Active IMR Projects', value: activeProjects.toString(), icon: BookOpenCheck },
    { title: 'IMR Pending Approval', value: pendingApproval.toString(), icon: Clock },
    { title: 'IMR Completed', value: completedProjects.toString(), icon: CheckCircle },
  ];

  const recentProjects = projects
    .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())
    .slice(0, 3);

  return (
    <>
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">My Dashboard</h2>
        <Link href="/dashboard/new-submission">
          <Button>
            <FilePlus2 className="mr-2 h-4 w-4" />
            New IMR Submission
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {statCards.map((card) => (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

       <div className="mt-4">
        <div className="mb-4 flex items-center justify-between">
            <h3 className="text-2xl font-bold tracking-tight">EMR Funding Calendar</h3>
            <Link href="/dashboard/emr-calendar">
              <Button variant="ghost">
                View Full Calendar
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
        </div>
        {loading ? <Skeleton className="h-96 w-full" /> : <EmrCalendar user={user} />}
      </div>

      <div className="mt-4">
        <div className="mb-4 flex items-center justify-between">
            <h3 className="text-2xl font-bold tracking-tight">My Recent IMR Projects</h3>
            <Link href="/dashboard/my-projects">
              <Button variant="ghost">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
        </div>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ProjectList projects={recentProjects} currentUser={user} />
        )}
      </div>
    </div>
    </>
  );
}
