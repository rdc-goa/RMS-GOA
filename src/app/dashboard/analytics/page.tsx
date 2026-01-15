

'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, XAxis, Line, LineChart, ResponsiveContainer, YAxis, Tooltip, Pie, PieChart, Cell, Legend, LabelList } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import type { Project, User, EmrInterest, IncentiveClaim } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, onSnapshot, or, orderBy, Timestamp } from 'firebase/firestore';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, getYear, subDays, startOfDay } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Award, Download, Users, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { toPng } from 'html-to-image';
import { useRouter } from 'next/navigation';


const COLORS = ["#64B5F6", "#81C784", "#FFB74D", "#E57373", "#BA68C8", "#7986CB", "#4DD0E1", "#FFF176", "#FF8A65", "#A1887F", "#90A4AE"];
const GOA_FACULTIES = [
    "Faculty of Engineering, IT & CS (Goa)",
    "Faculty of Management Studies (Goa)",
    "Faculty of Pharmacy (Goa)",
    "Faculty of Applied and Health Sciences (Goa)",
    "Faculty of Nursing (Goa)",
    "Faculty of Physiotherapy (Goa)"
];

// A helper component for the Pie chart legend
const ChartLegendContent = (props: any) => {
    const { payload } = props;
    return (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 justify-center text-sm text-muted-foreground">
            {payload.map((entry: any, index: number) => (
                <li key={`item-${index}`} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span>{entry.value}</span>
                </li>
            ))}
        </ul>
    );
};


export default function AnalyticsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [emrProjects, setEmrProjects] = useState<EmrInterest[]>([]);
  const [incentiveClaims, setIncentiveClaims] = useState<IncentiveClaim[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [timeRange, setTimeRange] = useState<string>('last6months');
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [submissionsByYearType, setSubmissionsByYearType] = useState<'submissions' | 'sanctions'>('submissions');
  const [projectsByGroupType, setProjectsByGroupType] = useState<'imr' | 'emr'>('imr');
  const { toast } = useToast();
  const router = useRouter();
  
  const statusChartRef = useRef<HTMLDivElement>(null);
  const submissionsTimeChartRef = useRef<HTMLDivElement>(null);
  const submissionsYearChartRef = useRef<HTMLDivElement>(null);
  const projectsByGroupChartRef = useRef<HTMLDivElement>(null);
  const incentiveAmountChartRef = useRef<HTMLDivElement>(null);
  const activeUsersChartRef = useRef<HTMLDivElement>(null);

  const handleExport = useCallback(async (ref: React.RefObject<HTMLDivElement>, fileName: string) => {
    if (!ref.current) {
        toast({ variant: 'destructive', title: "Export Error", description: "Chart element not found." });
        return;
    }
    
    try {
        const isDarkMode = document.documentElement.classList.contains('dark');
        const dataUrl = await toPng(ref.current, { 
            cacheBust: true, 
            backgroundColor: isDarkMode ? '#0f172a' : '#ffffff'
        });
        const link = document.createElement('a');
        link.download = `${fileName}.png`;
        link.href = dataUrl;
        link.click();
    } catch (err: any) {
        console.error('Chart export failed:', err);
        toast({ variant: 'destructive', title: 'Export Failed', description: err.message });
    }
  }, [toast]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
         if (!parsedUser.allowedModules?.includes('analytics')) {
            toast({
            title: 'Access Denied',
            description: "You don't have permission to view this page.",
            variant: 'destructive',
            });
            router.replace('/dashboard');
            return;
        }
        setUser(parsedUser);
        if (parsedUser.role === 'CRO' && parsedUser.faculties && parsedUser.faculties.length > 0) {
            setFacultyFilter(parsedUser.faculties[0]);
        }
    } else {
        router.replace('/login');
    }
  }, [router, toast]);

  useEffect(() => {
    if (!user) return;
    
    setLoading(true);
    
    const projectsCollection = collection(db, 'projects');
    const emrCollection = collection(db, 'emrInterests');
    const claimsCollection = collection(db, 'incentiveClaims');
    const logsCollection = collection(db, 'logs');
    let projectsQuery, emrQuery, claimsQuery;
    
    const sevenDaysAgo = startOfDay(subDays(new Date(), 6));
    const logsQuery = query(logsCollection, where('message', '==', 'User logged in'), where('timestamp', '>=', sevenDaysAgo.toISOString()));

    const isPrincipal = user.designation === 'Principal';
    const isCro = user.role === 'CRO';
    const isHod = user.designation === 'HOD';
    const isSpecialPitUser = user.email === 'pit@paruluniversity.ac.in';


    if (isCro && user.faculties && user.faculties.length > 0) {
        projectsQuery = query(projectsCollection, where('faculty', 'in', user.faculties));
        emrQuery = query(emrCollection, where('faculty', 'in', user.faculties), where('status', 'in', ['Sanctioned', 'Process Complete']));
        claimsQuery = query(claimsCollection, where('faculty', 'in', user.faculties));
    } else if (isHod && user.department && user.institute) {
        projectsQuery = query(projectsCollection, where('departmentName', '==', user.department), where('institute', '==', user.institute));
        emrQuery = query(emrCollection, where('department', '==', user.department), where('status', 'in', ['Sanctioned', 'Process Complete']));
        claimsQuery = query(claimsCollection, where('faculty', '==', user.faculty)); // HODs are faculty-scoped for claims
    } else if (isSpecialPitUser) {
        projectsQuery = query(projectsCollection, where('institute', 'in', ['Parul Institute of Technology', 'Parul Institute of Technology-Diploma studies']));
        emrQuery = query(emrCollection, where('institute', 'in', ['Parul Institute of Technology', 'Parul Institute of Technology-Diploma studies']), where('status', 'in', ['Sanctioned', 'Process Complete']));
        claimsQuery = query(claimsCollection, where('faculty', '==', 'Faculty of Engineering & Technology'));
    } else if (isPrincipal && user.institute) {
        projectsQuery = query(projectsCollection, where('institute', '==', user.institute));
        emrQuery = query(emrCollection, where('faculty', '==', user.faculty), where('status', 'in', ['Sanctioned', 'Process Complete']));
        claimsQuery = query(claimsCollection, where('faculty', '==', user.faculty));
    } else {
        projectsQuery = query(projectsCollection);
        emrQuery = query(emrCollection, where('status', 'in', ['Sanctioned', 'Process Complete']));
        claimsQuery = query(claimsCollection);
    }
    
    const unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
        setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
        setLoading(false);
    }, (error) => { console.error("Error fetching project data:", error); setLoading(false); });

    const unsubscribeEmr = onSnapshot(emrQuery, (snapshot) => {
        setEmrProjects(snapshot.docs.map(doc => doc.data() as EmrInterest));
    }, (error) => { console.error("Error fetching EMR data:", error); });
    
    const unsubscribeClaims = onSnapshot(claimsQuery, (snapshot) => {
        setIncentiveClaims(snapshot.docs.map(doc => doc.data() as IncentiveClaim));
    }, (error) => { console.error("Error fetching incentive claims:", error); });

    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
        setLoginLogs(snapshot.docs.map(doc => doc.data()));
    }, (error) => { console.error("Error fetching log data:", error); });

    return () => {
        unsubscribeProjects();
        unsubscribeEmr();
        unsubscribeClaims();
        unsubscribeLogs();
    }

  }, [user]);
  
  const dailyActiveUsersData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), i));
    const data = last7Days.map(date => {
        const start = startOfDay(date).toISOString();
        const end = endOfMonth(date).toISOString();
        
        const uniqueUsers = new Set(
            loginLogs
                .filter(log => log.timestamp >= start && log.timestamp < end)
                .map(log => log.context.uid)
        );
        return {
            date: format(date, 'MMM d'),
            users: uniqueUsers.size,
        };
    }).reverse();
    return data;
  }, [loginLogs]);
  
  const dailyActiveUsersConfig = {
    users: { label: 'Active Users', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  const filteredProjects = useMemo(() => {
    if (user?.role === 'CRO' && facultyFilter !== 'all') {
      return projects.filter(p => p.faculty === facultyFilter);
    }
    return projects;
  }, [projects, user, facultyFilter]);
  
  const filteredEmrProjects = useMemo(() => {
    if (user?.role === 'CRO' && facultyFilter !== 'all') {
      return emrProjects.filter(p => p.faculty === facultyFilter);
    }
    return emrProjects;
  }, [emrProjects, user, facultyFilter]);

  useEffect(() => {
    if (filteredProjects.length > 0) {
      const years = new Set(
        filteredProjects.map(p => getYear(parseISO(p.submissionDate)))
      );
      setAvailableYears(Array.from(years).sort((a,b) => b-a).map(String));
    }
  }, [filteredProjects]);

  const submissionsData = useMemo(() => {
    if (timeRange === 'last6months') {
        const last6Months = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(new Date(), i);
        return { name: format(d, 'MMM'), start: startOfMonth(d), end: endOfMonth(d) };
        }).reverse();

        return last6Months.map(month => {
        const count = filteredProjects.filter(p => {
            const submissionDate = parseISO(p.submissionDate);
            return submissionDate >= month.start && submissionDate <= month.end;
        }).length;
        return { month: month.name, submissions: count };
        });
    }

    const year = parseInt(timeRange, 10);
    const months = Array.from({ length: 12 }, (_, i) => format(new Date(year, i, 1), 'MMM'));
    return months.map((monthName, monthIndex) => {
        const count = filteredProjects.filter(p => {
            const submissionDate = parseISO(p.submissionDate);
            return getYear(submissionDate) === year && submissionDate.getMonth() === monthIndex;
        }).length;
        return { month: monthName, submissions: count };
    });
    
  }, [filteredProjects, timeRange]);
  
  const submissionsConfig = {
    submissions: { label: 'Submissions', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  const sanctionsConfig = {
    sanctions: { label: 'Sanctions', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  const submissionsByYearData = useMemo(() => {
    if (filteredProjects.length === 0) return [];

    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 5;

    const projectsToCount = submissionsByYearType === 'sanctions'
        ? filteredProjects.filter(p => ['Sanctioned', 'In Progress', 'Completed'].includes(p.status) && p.grant)
        : filteredProjects;
    
    const yearCounts = projectsToCount
      .filter(p => {
        const year = getYear(parseISO(p.submissionDate));
        return year >= startYear && year <= currentYear;
      })
      .reduce((acc, project) => {
        const year = getYear(parseISO(project.submissionDate));
        acc[year] = (acc[year] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    // Ensure all years in the range are present
    for (let year = startYear; year <= currentYear; year++) {
      if (!yearCounts[year]) {
        yearCounts[year] = 0;
      }
    }

    return Object.entries(yearCounts)
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
  }, [filteredProjects, submissionsByYearType]);

  const { aggregationKey, aggregationLabel } = useMemo(() => {
    if (user?.role === 'CRO') {
        return { aggregationKey: 'institute', aggregationLabel: 'Institute' };
    }
    if (user?.designation === 'Principal' || user?.designation === 'HOD' || user?.email === 'pit@paruluniversity.ac.in') {
        return { aggregationKey: 'departmentName', aggregationLabel: 'Department' };
    }
    return { aggregationKey: 'faculty', aggregationLabel: 'Faculty' };
  }, [user]);


  const projectsByGroupData = useMemo(() => {
    const dataToAggregate = projectsByGroupType === 'imr' ? filteredProjects : filteredEmrProjects;
    
    const key = projectsByGroupType === 'imr' 
        ? (aggregationKey as keyof Project)
        : (aggregationKey === 'departmentName' ? 'department' : aggregationKey as keyof EmrInterest);

    return Object.entries(
        (dataToAggregate as any[]).reduce((acc, item) => {
            const groupKey = item[key] as string | undefined;
            if (groupKey) {
                acc[groupKey] = (acc[groupKey] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>)
    ).map(([group, count]) => ({ group, projects: count }))
    .sort((a, b) => b.projects - a.projects);
  }, [filteredProjects, filteredEmrProjects, aggregationKey, projectsByGroupType]);

  const projectsByGroupConfig = {
    projects: { label: 'Projects', color: 'hsl(var(--accent))' },
  } satisfies ChartConfig;

  const statusDistributionData = useMemo(() => {
    const statusCounts = filteredProjects.reduce((acc, project) => {
        const status = project.status || 'Unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  }, [filteredProjects]);

  const statusDistributionConfig = useMemo(() => {
    const config: ChartConfig = {};
    statusDistributionData.forEach((item, index) => {
        config[item.name] = {
            label: item.name,
            color: COLORS[index % COLORS.length],
        };
    });
    return config;
  }, [statusDistributionData]);

  // --- Incentive Claim Chart Data & Config ---
  const { incentiveAmountData, totalIncentiveAmount } = useMemo(() => {
    const claimsByCategory = incentiveClaims
      .filter(claim => (claim.finalApprovedAmount || 0) > 0)
      .reduce((acc, claim) => {
        const type = claim.claimType;
        acc[type] = (acc[type] || 0) + amount;
        return acc;
      }, {} as Record<string, number>);

    const chartData = Object.entries(claimsByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const totalAmount = chartData.reduce((sum, item) => sum + item.value, 0);

    return { incentiveAmountData: chartData, totalIncentiveAmount: totalAmount };
  }, [incentiveClaims]);

  const incentiveAmountConfig = useMemo(() => {
    const config: ChartConfig = {};
    incentiveAmountData.forEach((item, index) => {
        config[item.name] = {
            label: item.name,
            color: COLORS[index % COLORS.length],
        };
    });
    return config;
  }, [incentiveAmountData]);


  const isCro = user?.role === 'CRO';

  const getPageTitle = () => {
      if (isCro) {
          if (facultyFilter === 'all') return `Analytics for All Your Faculties`;
          return `Analytics for ${facultyFilter}`;
      }
      if (user?.designation === 'Principal' && user.institute) return `Analytics for ${user.institute}`;
      if (user?.designation === 'Principal' && !user.institute) return 'Analytics (Principal - No Institute Set)';
      if (user?.designation === 'HOD' && user.department && user.institute) return `Analytics for ${user.department}, ${user.institute}`;
      return 'Analytics';
  }

  const getPageDescription = () => {
    if (user?.designation === 'Principal' && !user.institute) return 'Your institute information is not configured. Please update your profile to see institute-specific analytics.';
    if (user?.role === 'CRO' || user?.designation === 'Principal' || user?.designation === 'HOD') return 'Visualize project data and submission trends for your scope.';
    return 'Visualize project data and submission trends across the university.';
  }

  if (loading || !user) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Analytics" description="Loading data..." />
        <div className="mt-8 grid gap-6 md:grid-cols-1 lg:grid-cols-3">
             <Card className="lg:col-span-1"><CardHeader><Skeleton className="h-6 w-32" /></CardHeader><CardContent><Skeleton className="h-20 w-full" /></CardContent></Card>
             <Card className="lg:col-span-2"><CardHeader><Skeleton className="h-6 w-48" /></CardHeader><CardContent><Skeleton className="h-[250px] w-full" /></CardContent></Card>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <Card><CardHeader><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-3/4" /></CardHeader><CardContent><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title={getPageTitle()} description={getPageDescription()}>
          {isCro && user.faculties && user.faculties.length > 1 && (
            <Select value={facultyFilter} onValueChange={(value) => { setFacultyFilter(value); }}>
                <SelectTrigger className="w-full sm:w-[280px]">
                    <SelectValue placeholder="Filter by faculty" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Assigned Faculties</SelectItem>
                    {user.faculties.map(faculty => (
                        <SelectItem key={faculty} value={faculty}>{faculty}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        )}
      </PageHeader>
      <div className="mt-8 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
            <CardHeader>
                <CardTitle>Daily Active Users</CardTitle>
                <CardDescription>Unique user logins over the last 7 days.</CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={dailyActiveUsersConfig} className="h-[250px] w-full">
                    <BarChart data={dailyActiveUsersData} margin={{ top: 20 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                        <YAxis allowDecimals={false} />
                        <Tooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="users" fill="var(--color-users)" radius={4}>
                            <LabelList position="top" offset={5} className="fill-foreground" fontSize={12} />
                        </Bar>
                    </BarChart>
                </ChartContainer>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sanctioned Incentives</CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">₹{totalIncentiveAmount.toLocaleString('en-IN')}</div>
                <p className="text-xs text-muted-foreground">Across {incentiveClaims.filter(c => c.finalApprovedAmount).length} claims</p>
            </CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Project Status Distribution</CardTitle>
              <CardDescription>A summary of all projects by their current status.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleExport(statusChartRef, 'project_status_distribution')}>
              <Download className="mr-2 h-4 w-4" /> Export PNG
            </Button>
          </CardHeader>
          <CardContent>
            <div ref={statusChartRef} className="p-4 bg-card">
              <ChartContainer config={statusDistributionConfig} className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                          <ChartTooltip content={<ChartTooltipContent nameKey="value" formatter={(value) => value.toLocaleString()} />} />
                          <Pie data={statusDistributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} isAnimationActive={false}>
                              {statusDistributionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={statusDistributionConfig[entry.name]?.color || '#8884d8'} />
                              ))}
                          </Pie>
                      </PieChart>
                  </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>
       <div className="mt-8 grid gap-6 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
              <div>
                <CardTitle>Submissions Over Time</CardTitle>
                <CardDescription>
                  {timeRange === 'last6months'
                    ? 'Monthly project submissions for the last 6 months.'
                    : `Monthly project submissions for ${timeRange}.`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Select time range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last6months">Last 6 Months</SelectItem>
                    {availableYears.map(year => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                 <Button variant="outline" size="icon" onClick={() => handleExport(submissionsTimeChartRef, 'submissions_over_time')}><Download className="h-4 w-4" /></Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={submissionsTimeChartRef} className="p-4 bg-card">
              <ChartContainer config={submissionsConfig} className="h-[300px] w-full">
                <LineChart accessibilityLayer data={submissionsData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Line dataKey="submissions" type="monotone" stroke="var(--color-submissions)" strokeWidth={2} dot={true} isAnimationActive={false} />
                </LineChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Incentive Amounts by Category</CardTitle>
              <CardDescription>Total sanctioned amount per claim type.</CardDescription>
            </div>
             <Button variant="outline" size="icon" onClick={() => handleExport(incentiveAmountChartRef, 'incentive_amounts')}><Download className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <div ref={incentiveAmountChartRef} className="p-4 bg-card">
              <ChartContainer config={incentiveAmountConfig} className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent 
                                hideLabel 
                                formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`}
                            />}
                        />
                        <Pie
                            data={incentiveAmountData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            labelLine={false}
                            label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                                const RADIAN = Math.PI / 180;
                                const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                return ( <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"> {`${(percent * 100).toFixed(0)}%`} </text> );
                            }}
                        >
                            {incentiveAmountData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Legend content={<ChartLegendContent nameKey="name" />} />
                    </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>
       <div className="mt-8 grid gap-6 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <div>
                  <CardTitle>Yearly Submissions & Sanctions</CardTitle>
                  <CardDescription>Total IMR submissions vs. sanctions over the last 6 years.</CardDescription>
                </div>
                 <div className="flex items-center gap-2">
                    <Select value={submissionsByYearType} onValueChange={(value) => setSubmissionsByYearType(value as 'submissions' | 'sanctions')}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="submissions">Submissions</SelectItem>
                        <SelectItem value="sanctions">Sanctions</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" onClick={() => handleExport(submissionsYearChartRef, 'yearly_submissions_sanctions')}><Download className="h-4 w-4" /></Button>
                 </div>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={submissionsYearChartRef} className="p-4 bg-card">
              <ChartContainer config={submissionsByYearType === 'submissions' ? submissionsConfig : sanctionsConfig} className="h-[300px] w-full">
                <BarChart data={submissionsByYearData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill={submissionsByYearType === 'submissions' ? 'var(--color-submissions)' : 'var(--color-sanctions)'} radius={4} />
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <CardTitle>Projects by {aggregationLabel}</CardTitle>
                        <CardDescription>Total projects submitted by each {aggregationLabel.toLowerCase()}.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Select value={projectsByGroupType} onValueChange={(value) => setProjectsByGroupType(value as 'imr' | 'emr')}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="imr">IMR Submissions</SelectItem>
                                <SelectItem value="emr">EMR Sanctions</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" size="icon" onClick={() => handleExport(projectsByGroupChartRef, 'projects_by_group')}><Download className="h-4 w-4" /></Button>
                    </div>
                </div>
            </CardHeader>
          <CardContent>
            <div ref={projectsByGroupChartRef} className="p-4 bg-card">
              <ChartContainer config={projectsByGroupConfig} className="h-[400px] w-full">
              <BarChart accessibilityLayer data={projectsByGroupData} layout="vertical" margin={{left: 30}} isAnimationActive={false}>
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="group"
                  type="category"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  width={250}
                  tick={{ fontSize: 12, width: 240, whiteSpace: 'normal', textAnchor: 'end' }}
                  interval={0}
                />
                 <XAxis dataKey="projects" type="number" hide allowDecimals={false} />
                 <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} />
                <Bar dataKey="projects" layout="vertical" fill="var(--color-projects)" radius={4}>
                   <LabelList dataKey="projects" position="right" offset={8} className="fill-foreground" fontSize={12} />
                </Bar>
              </BarChart>
            </ChartContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
