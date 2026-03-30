
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Book, CheckCircle, Clock, Users, FileCheck2, FolderOpen, Calendar, Info } from 'lucide-react';
import { ProjectList } from '@/components/projects/project-list';
import Link from 'next/link';
import { Button } from '../ui/button';
import { ArrowRight } from 'lucide-react';
import { db } from '@/lib/config';
import { collection, getDocs, query, where,getCountFromServer, or } from 'firebase/firestore';
import type { Project, User } from '@/types';
import { Skeleton } from '../ui/skeleton';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { createDebugInfo, logDebugInfo } from '@/lib/debug-utils';
import { Alert, AlertTitle, AlertDescription } from '../ui/alert';

interface DashboardStats {
  totalImrProjects: number;
  totalEmrProjects: number;
  pendingReviews: number;
  completedProjects: number;
  totalUsers: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalImrProjects: 0,
    totalEmrProjects: 0,
    pendingReviews: 0,
    completedProjects: 0,
    totalUsers: 0,
  });
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [chartData, setChartData] = useState<{ group: string, projects: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        setUser(JSON.parse(storedUser));
    }
  }, []);

  const chartConfig = {
    projects: { label: 'Projects', color: 'hsl(var(--accent))' },
  } satisfies ChartConfig;

  const { aggregationKey, aggregationLabel, chartTitle } = useMemo(() => {
    if (user?.role === 'CRO') {
        return { aggregationKey: 'institute', aggregationLabel: 'Institute', chartTitle: 'Top Institute Submissions' };
    }
    if (user?.designation === 'Principal' || user?.designation === 'HOD') {
        return { aggregationKey: 'departmentName', aggregationLabel: 'Department', chartTitle: 'Top Department Submissions' };
    }
    return { aggregationKey: 'faculty', aggregationLabel: 'Faculty', chartTitle: 'Top Faculty Submissions' };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
        setLoading(true);
        try {
            const projectsRef = collection(db, "projects");
            const usersRef = collection(db, "users");
            const emrInterestsRef = collection(db, "emrInterests");
            
            const isPrincipal = user.designation === 'Principal';
            const isHod = user.designation === 'HOD';
            const isCro = user.role === 'CRO';

            let projectsQuery;
            let allProjects: Project[] = [];

            if (isPrincipal && user.institute) {
                projectsQuery = query(projectsRef, where('institute', '==', user.institute));
                const snapshot = await getDocs(projectsQuery);
                allProjects = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            } else if (isHod && user.department && user.institute) {
                projectsQuery = query(projectsRef, where('departmentName', '==', user.department), where('institute', '==', user.institute));
                const snapshot = await getDocs(projectsQuery);
                allProjects = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            } else if (isCro && user.faculties && user.faculties.length > 0) {
                projectsQuery = query(projectsRef, where('faculty', 'in', user.faculties));
                 const snapshot = await getDocs(projectsQuery);
                allProjects = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            } else { // Admin, Super-admin, or CRO with no faculties
                projectsQuery = query(projectsRef);
                 const snapshot = await getDocs(projectsQuery);
                allProjects = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Project));
            }
            
            // Stats should also be filtered
            let sanctionedEmrQuery = query(emrInterestsRef, or(where('status', '==', 'Sanctioned'), where('status', '==', 'SANCTIONED')));
            if (isHod && user.department && user.institute) {
                sanctionedEmrQuery = query(sanctionedEmrQuery, where('department', '==', user.department), where('institute', '==', user.institute));
            }
            
            const [usersSnapshot, emrSnapshot] = await Promise.all([
              getDocs(usersRef),
              getCountFromServer(sanctionedEmrQuery)
            ]);

            const totalImrProjects = allProjects.length;
            const totalEmrProjects = emrSnapshot.data().count;
            const pendingReviews = allProjects.filter(p => p.status === 'Submitted' || p.status === 'Under Review' || p.status === 'Revision Submitted' || p.status === 'Pending Completion Approval').length;
            const completedProjects = allProjects.filter(p => p.status === 'Completed').length;
            const totalUsers = usersSnapshot.size;

            setStats({ totalImrProjects, totalEmrProjects, pendingReviews, completedProjects, totalUsers });

            const sortedProjects = allProjects
                .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())
                .slice(0, 5);
            setRecentProjects(sortedProjects);
            
             const groupCounts = Object.entries(
                allProjects.reduce((acc, project) => {
                    const key = project[aggregationKey as keyof Project] as string | undefined;
                    if (key) {
                        acc[key] = (acc[key] || 0) + 1;
                    }
                    return acc;
                }, {} as Record<string, number>)
            ).map(([group, count]) => ({ group, projects: count }))
            .sort((a, b) => b.projects - a.projects)
            .slice(0, 7);
            setChartData(groupCounts);

        } catch (error) {
            console.error("Error fetching admin dashboard data:", error);
        } finally {
            setLoading(false);
        }
    };

    fetchData();
  }, [user, aggregationKey]);
  
  const isPrincipal = user?.designation === 'Principal';
  const isHod = user?.designation === 'HOD';
  const isCro = user?.role === 'CRO';
  const isCroWithoutFaculties = isCro && (!user?.faculties || user.faculties.length === 0);

  const getDashboardTitle = () => {
      if (isPrincipal && user?.institute) return `${user.institute} Dashboard`;
      if (isPrincipal && !user?.institute) return 'Principal Dashboard (No Institute Set)';
      if (isHod && user?.department) return `${user.department} Dashboard`;
      if (isCro) return 'CRO Dashboard';
      return "Admin Dashboard";
  };

  const statCards = [
    { title: 'Total IMR Projects', value: stats.totalImrProjects.toString(), icon: FolderOpen, loading: loading },
    { title: 'Total EMR Projects', value: stats.totalEmrProjects.toString(), icon: Calendar, loading: loading },
    { title: 'Pending Reviews', value: stats.pendingReviews.toString(), icon: Clock, loading: loading },
    { title: 'Completed Projects', value: stats.completedProjects.toString(), icon: FileCheck2, loading: loading },
    ...(isPrincipal || isHod || isCro ? [] : [{ title: 'Total Users', value: stats.totalUsers.toString(), icon: Users, loading: loading }]),
  ];

  if (!user) {
    return <Skeleton className="h-[600px] w-full" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-3xl font-bold tracking-tight">
        {getDashboardTitle()}
      </h2>
      
      {isCroWithoutFaculties ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Configuration Pending</AlertTitle>
          <AlertDescription>
            You have not been assigned to any faculties yet. Please wait for some time. Your dashboard will refresh automatically once faculties are assigned to you.
          </AlertDescription>
        </Alert>
      ) : (
      <>
        {isPrincipal && !user?.institute && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">
                <strong>⚠️ Configuration Issue:</strong> Your institute information is not set. Please update your profile settings to see institute-specific data.
            </p>
            </div>
        )}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {statCards.map((card, index) => (
            <Card 
                key={card.title} 
                className="animate-in fade-in-0 slide-in-from-bottom-4"
                style={{ animationFillMode: 'backwards', animationDelay: `${index * 100}ms` }}
            >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <card.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                {card.loading ? <Skeleton className="h-8 w-1/4" /> : <div className="text-2xl font-bold">{card.value}</div>}
                </CardContent>
            </Card>
            ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 animate-in fade-in-0 slide-in-from-bottom-4" style={{ animationFillMode: 'backwards', animationDelay: '600ms' }}>
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-2xl font-bold tracking-tight">Recent Submissions</h3>
                    <Link href="/dashboard/all-projects" passHref>
                    <Button variant="ghost">
                        View All
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    </Link>
                </div>
                {loading ? <Skeleton className="h-[400px] w-full" /> : <ProjectList projects={recentProjects} currentUser={user} />}
            </div>
            <div className="lg:col-span-2 animate-in fade-in-0 slide-in-from-bottom-4" style={{ animationFillMode: 'backwards', animationDelay: '700ms' }}>
                <div className="mb-4 flex items-center justify-between">
                <h3 className="text-2xl font-bold tracking-tight">Projects by {aggregationLabel}</h3>
                <Link href="/dashboard/analytics" passHref>
                    <Button variant="ghost">
                        Analytics
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    </Link>
                </div>
                {loading ? <Skeleton className="h-[400px] w-full" /> : (
                    <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">{chartTitle}</CardTitle>
                        <CardDescription>
                        Distribution of projects across the top 7 {aggregationLabel.toLowerCase()}s.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pl-0">
                        <ChartContainer config={chartConfig} className="h-[320px] w-full">
                        <BarChart
                            accessibilityLayer
                            data={chartData}
                            layout="vertical"
                            margin={{ left: 5, right: 5 }}
                        >
                            <CartesianGrid horizontal={false} />
                            <YAxis
                            dataKey="group"
                            type="category"
                            tickLine={false}
                            tickMargin={10}
                            axisLine={false}
                            width={150}
                            tick={(props) => {
                                const { x, y, payload } = props;
                                const label = payload.value.length > 20 ? `${payload.value.substring(0, 20)}...` : payload.value;
                                return (
                                    <g transform={`translate(${x},${y})`}>
                                        <text x={0} y={0} dy={4} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={12}>{label}</text>
                                    </g>
                                )
                            }}
                            />
                            <XAxis dataKey="projects" type="number" hide />
                            <ChartTooltip
                            cursor={{ fill: 'hsl(var(--muted))' }}
                            content={<ChartTooltipContent />}
                            />
                            <Bar
                            dataKey="projects"
                            layout="vertical"
                            fill="var(--color-projects)"
                            radius={4}
                            />
                        </BarChart>
                        </ChartContainer>
                    </CardContent>
                    </Card>
                )}
            </div>
        </div>
      </>
      )}
    </div>
  );
}
