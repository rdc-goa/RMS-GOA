
'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, XAxis, Line, LineChart, ResponsiveContainer, YAxis, Tooltip, Pie, PieChart, Cell, Legend, LabelList } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Project, User, EmrInterest, IncentiveClaim } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, onSnapshot, or, orderBy, Timestamp } from 'firebase/firestore';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, getYear, subDays, startOfDay } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Award, Download, Users, Loader2, FileArchive, Banknote, FileText, Calendar, Info } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { toPng } from 'html-to-image';
import { useRouter } from 'next/navigation';
import { getStorageUsage } from '@/app/actions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


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
  const [storageUsage, setStorageUsage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [timeRange, setTimeRange] = useState<string>('last6months');
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [submissionsByYearType, setSubmissionsByYearType] = useState<'submissions' | 'sanctions'>('submissions');
  const [projectsByGroupType, setProjectsByGroupType] = useState<'imr' | 'emr'>('imr');
  const [grantDateRange, setGrantDateRange] = useState<{start: string | null, end: string | null}>({start: null, end: null});
  const { toast } = useToast();
  const router = useRouter();
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  
  const statusChartRef = useRef<HTMLDivElement>(null);
  const submissionsTimeChartRef = useRef<HTMLDivElement>(null);
  const submissionsYearChartRef = useRef<HTMLDivElement>(null);
  const projectsByGroupChartRef = useRef<HTMLDivElement>(null);
  const incentiveAmountChartRef = useRef<HTMLDivElement>(null);
  const imrGrantByInstituteChartRef = useRef<HTMLDivElement>(null);
  const activeUsersChartRef = useRef<HTMLDivElement>(null);
  const fundingByAgencyChartRef = useRef<HTMLDivElement>(null);
  const fieldOfStudyChartRef = useRef<HTMLDivElement>(null);
  const fieldOfStudySubdomainChartRef = useRef<HTMLDivElement>(null);
  const projectTypeChartRef = useRef<HTMLDivElement>(null);
  const publicationChartRef = useRef<HTMLDivElement>(null);
  const monthlyPublicationChartRef = useRef<HTMLDivElement>(null);


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

  const imrGrantByInstituteData = useMemo(() => {
    if (!projects) return [];
    
    let filteredProjects = projects.filter(p => p.grant && p.grant.totalAmount > 0 && p.institute);
    
    if (grantDateRange.start && grantDateRange.end) {
      const startDate = startOfMonth(parseISO(grantDateRange.start));
      const endDate = endOfMonth(parseISO(grantDateRange.end));
      filteredProjects = filteredProjects.filter(p => {
        const submissionDate = parseISO(p.submissionDate);
        return submissionDate >= startDate && submissionDate <= endDate;
      });
    }
    
    return Object.entries(
      filteredProjects.reduce((acc, project) => {
        const groupKey = project.institute!;
        acc[groupKey] = (acc[groupKey] || 0) + project.grant!.totalAmount;
        return acc;
      }, {} as Record<string, number>)
    ).map(([institute, amount]) => ({ institute, amount }))
    .sort((a, b) => b.amount - a.amount);
  }, [projects, grantDateRange]);

  const handleExportImrGrants = useCallback(() => {
    if (imrGrantByInstituteData.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Data',
        description: 'There is no IMR grant data to export.',
      });
      return;
    }
    const dataToExport = imrGrantByInstituteData.map(item => ({
      'Institute': item.institute,
      'Total Sanctioned Amount (INR)': item.amount,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'IMR Grants by Institute');
    const rangeSuffix = grantDateRange.start && grantDateRange.end 
        ? `_${grantDateRange.start}_to_${grantDateRange.end}` 
        : '';
    XLSX.writeFile(workbook, `IMR_Grants_By_Institute${rangeSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`);
    const rangeDesc = grantDateRange.start && grantDateRange.end 
        ? ` (${format(parseISO(grantDateRange.start), 'MMM yyyy')} - ${format(parseISO(grantDateRange.end), 'MMM yyyy')})`
        : '';
    toast({ title: 'Export Started', description: `Downloading grant data for ${imrGrantByInstituteData.length} institutes${rangeDesc}.` });
  }, [imrGrantByInstituteData, toast, grantDateRange]);

    const handleGenerateReport = async () => {
        setIsGeneratingReport(true);
        toast({ title: "Generating Report", description: "This may take a moment..." });

        try {
            const doc = new jsPDF('p', 'mm', 'a4');
            let yPos = 20;
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - margin * 2;
            const isDarkMode = document.documentElement.classList.contains('dark');
            const imageBgColor = isDarkMode ? '#0f172a' : '#ffffff';

            const addImageToPdf = async (ref: React.RefObject<HTMLDivElement>, title: string) => {
                if (!ref.current) return;
                
                const imgHeight = (ref.current.clientHeight * contentWidth) / ref.current.clientWidth;

                if (yPos + imgHeight + 20 > (pageHeight - margin * 2)) {
                    doc.addPage();
                    yPos = 20;
                }

                doc.setFontSize(14);
                doc.text(title, margin, yPos);
                yPos += 8;

                const dataUrl = await toPng(ref.current, { backgroundColor: imageBgColor, pixelRatio: 2 });
                doc.addImage(dataUrl, 'PNG', margin, yPos, contentWidth, imgHeight);
                yPos += imgHeight + 15;
            };

            // --- PDF Header ---
            doc.setFontSize(22);
            doc.text('R&D Portal Analytics Report', pageWidth / 2, yPos, { align: 'center' });
            yPos += 8;
            doc.setFontSize(10);
            doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, pageWidth / 2, yPos, { align: 'center' });
            yPos += 15;

            // --- Stat Cards ---
            doc.setFontSize(16);
            doc.text('Key Metrics', margin, yPos);
            yPos += 8;
            autoTable(doc, {
                startY: yPos,
                head: [['Metric', 'Value', 'Description']],
                body: statCards.map(card => [card.title, card.value, card.description]),
                theme: 'grid'
            });
            yPos = (doc as any).lastAutoTable.finalY + 15;
            
            // --- IMR & EMR Section ---
            doc.setFontSize(18);
            doc.text('IMR & EMR Project Analytics', margin, yPos);
            yPos += 10;
            await addImageToPdf(statusChartRef, 'IMR Project Status Distribution');
            await addImageToPdf(projectTypeChartRef, 'IMR Projects by Type');

            doc.addPage(); yPos = 20;
            await addImageToPdf(submissionsTimeChartRef, 'IMR Submissions Over Time');
            await addImageToPdf(submissionsYearChartRef, 'Yearly IMR Submissions & Sanctions');

            doc.addPage(); yPos = 20;
            await addImageToPdf(projectsByGroupChartRef, `Projects by ${aggregationLabel}`);
            await addImageToPdf(fundingByAgencyChartRef, 'Top 5 EMR Funding Agencies');
            
            doc.addPage(); yPos = 20;
            await addImageToPdf(imrGrantByInstituteChartRef, 'IMR Grant Amount by Institute');

            // --- Publication & Incentive Section ---
            doc.addPage(); yPos = 20;
            doc.setFontSize(18);
            doc.text('Publication & Incentive Analytics', margin, yPos);
            yPos += 10;
            await addImageToPdf(incentiveAmountChartRef, 'Incentive Amounts by Category');
            await addImageToPdf(publicationChartRef, 'Publications by Journal Quartile');

            doc.addPage(); yPos = 20;
            await addImageToPdf(monthlyPublicationChartRef, 'Monthly Publication Distribution');
            
            // --- System & AI Section (if applicable) ---
            if (user?.role === 'Super-admin') {
                doc.addPage(); yPos = 20;
                doc.setFontSize(18);
                doc.text('System & AI Analytics', margin, yPos);
                yPos += 10;
                
                await addImageToPdf(fieldOfStudyChartRef, 'Field of Studies by Domain');
                await addImageToPdf(fieldOfStudySubdomainChartRef, 'Top Subdomains');
                
                doc.addPage(); yPos = 20;
                await addImageToPdf(activeUsersChartRef, 'Daily Active Users');

                if (fieldOfStudyDrilldown.length > 0) {
                     if (yPos > 240) { doc.addPage(); yPos = 20; }
                    doc.setFontSize(14);
                    doc.text('Claim-Level Domain Drilldown', margin, yPos);
                    yPos += 8;
                    autoTable(doc, {
                        startY: yPos,
                        head: [['Claim ID', 'Title', 'Domain', 'Subdomain', 'Confidence']],
                        body: fieldOfStudyDrilldown.map(row => [row.claimId, row.title, row.domain, row.subdomain, `${row.confidence}%`]),
                        theme: 'grid',
                        styles: { fontSize: 8, cellPadding: 1 },
                        columnStyles: { 1: { cellWidth: 80 } },
                    });
                    yPos = (doc as any).lastAutoTable.finalY + 15;
                }
            }

            // --- Add page numbers ---
            const pageCount = doc.internal.pages.length -1;
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
            }

            doc.save(`RDC_Analytics_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
            toast({ title: "Report Generated", description: "Your PDF report is downloading." });
        } catch (err: any) {
            console.error("PDF generation failed:", err);
            toast({ variant: 'destructive', title: 'PDF Generation Failed', description: err.message });
        } finally {
            setIsGeneratingReport(false);
        }
    };


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
    const isGoaHead = user.designation === 'Head of Goa Campus';


    if (isCro && user.faculties && user.faculties.length > 0) {
        projectsQuery = query(projectsCollection, where('faculty', 'in', user.faculties));
        emrQuery = query(emrCollection, where('faculty', 'in', user.faculties), where('status', 'in', ['Sanctioned', 'Process Complete']));
        claimsQuery = query(claimsCollection, where('faculty', 'in', user.faculties));
    } else if (isGoaHead) {
        projectsQuery = query(projectsCollection, where('campus', '==', 'Goa'));
        emrQuery = query(emrCollection, where('campus', '==', 'Goa'), where('status', 'in', ['Sanctioned', 'Process Complete']));
        claimsQuery = query(claimsCollection, where('campus', '==', 'Goa'));
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
        
        // Fetch storage usage only for super admins
        if (user.role === 'Super-admin') {
            getStorageUsage().then(result => {
                if (result.success) {
                    setStorageUsage(result.totalSizeMB || 0);
                }
            });
        }
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

  const grantYearOptions = useMemo(() => {
    const years = ['all', '25-26'];
    if (availableYears.length > 0) {
      years.push(...availableYears);
    }
    return [...new Set(years)]; // Remove duplicates
  }, [availableYears]);

  const monthYearOptions = useMemo(() => {
    if (filteredProjects.length === 0) return [];
    
    const dates = filteredProjects
      .map(p => parseISO(p.submissionDate))
      .sort((a, b) => a.getTime() - b.getTime());
    
    const startDate = dates[0];
    const endDate = new Date();
    
    const options = [];
    let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    
    while (current <= endDate) {
      const value = format(current, 'yyyy-MM');
      const label = format(current, 'MMM yyyy');
      options.push({ value, label });
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    
    return options.reverse(); // Most recent first
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
    if (user?.designation === 'Principal' || user?.designation === 'HOD' || user?.email === 'pit@paruluniversity.ac.in' || user?.designation === 'Head of Goa Campus') {
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

  const imrGrantByInstituteConfig = {
    amount: { label: 'Amount (₹)', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  const fundingByAgencyData = useMemo(() => {
    const agencyFunding = filteredEmrProjects
        .filter(p => p.status === 'Sanctioned' && p.durationAmount && p.agency)
        .reduce((acc, project) => {
            const amountMatch = project.durationAmount?.match(/Amount:\s*([\d,]+)/);
            if (amountMatch) {
                const amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
                if (project.agency) {
                    acc[project.agency] = (acc[project.agency] || 0) + amount;
                }
            }
            return acc;
        }, {} as Record<string, number>);

    return Object.entries(agencyFunding)
        .map(([agency, amount]) => ({ agency, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
  }, [filteredEmrProjects]);

  const fundingByAgencyConfig = {
    amount: { label: 'Amount (₹)', color: 'hsl(var(--primary))' },
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
        const amount = claim.finalApprovedAmount || 0;
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

  // --- Publication Analytics by Quartile & Monthly Distribution ---
  const { quarterlyDistributionData, monthlyDistributionData, quartileSummary } = useMemo(() => {
    // Filter research paper claims with publication data
    const researchPaperClaims = incentiveClaims.filter(
      claim => claim.claimType === 'Research Papers' && 
               claim.journalClassification && 
               claim.publicationMonth && 
               claim.publicationYear
    );

    // Calculate Q1-Q4 distribution
    const quartileCount: Record<string, number> = {
      'Q1': 0,
      'Q2': 0,
      'Q3': 0,
      'Q4': 0,
    };

    researchPaperClaims.forEach(claim => {
      if (claim.journalClassification && quartileCount.hasOwnProperty(claim.journalClassification)) {
        quartileCount[claim.journalClassification]++;
      }
    });

    // Create quartile data in proper Q1, Q2, Q3, Q4 order
    const quartileData = ['Q1', 'Q2', 'Q3', 'Q4']
      .map(q => ({ quartile: q, count: quartileCount[q] }));

    const totalArticles = researchPaperClaims.length;

    // Calculate monthly distribution
    const monthlyCount: Record<string, number> = {};
    
    researchPaperClaims.forEach(claim => {
      if (claim.publicationMonth && claim.publicationYear) {
        // Parse month and year
        const monthStr = claim.publicationMonth.toLowerCase();
        const yearStr = claim.publicationYear;
        
        // Try to parse the month string (could be "January", "Jan", "1", etc.)
        const monthMap: Record<string, number> = {
          'january': 1, 'jan': 1, 'february': 2, 'feb': 2, 'march': 3, 'mar': 3,
          'april': 4, 'apr': 4, 'may': 5, 'june': 6, 'jun': 6, 'july': 7, 'jul': 7,
          'august': 8, 'aug': 8, 'september': 9, 'sep': 9, 'october': 10, 'oct': 10,
          'november': 11, 'nov': 11, 'december': 12, 'dec': 12
        };

        let monthNum = monthMap[monthStr] || parseInt(monthStr);
        if (monthNum < 1 || monthNum > 12) monthNum = 1;

        const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthNum - 1];
        const key = `${monthName} ${yearStr}`;
        
        monthlyCount[key] = (monthlyCount[key] || 0) + 1;
      }
    });

    // Sort monthly data chronologically
    const monthlyData = Object.entries(monthlyCount)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => {
        const dateA = new Date(`${a.month.split(' ')[0]} 1, ${a.month.split(' ')[1]}`);
        const dateB = new Date(`${b.month.split(' ')[0]} 1, ${b.month.split(' ')[1]}`);
        return dateA.getTime() - dateB.getTime();
      });

    return {
      quarterlyDistributionData: quartileData,
      monthlyDistributionData: monthlyData,
      quartileSummary: {
        totalArticles,
        q1Count: quartileCount['Q1'],
        q2Count: quartileCount['Q2'],
        q3Count: quartileCount['Q3'],
        q4Count: quartileCount['Q4'],
      },
    };
  }, [incentiveClaims]);

  const quartileChartConfig = useMemo(() => {
    const config: ChartConfig = {};
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach((quartile, index) => {
      config[quartile] = {
        label: quartile,
        color: COLORS[index % COLORS.length],
      };
    });
    return config;
  }, []);

  const monthlyChartConfig = useMemo(() => {
    const config: ChartConfig = {
      count: {
        label: 'Publications',
        color: 'hsl(var(--primary))',
      },
    };
    return config;
  }, []);

  const {
    fieldOfStudyData,
    fieldOfStudyConfig,
    fieldOfStudySubdomainData,
    fieldOfStudySubdomainConfig,
    fieldOfStudyDrilldown,
    fieldOfStudySummary,
  } = useMemo(() => {
    const getClaimTitle = (claim: IncentiveClaim): string => {
      return (
        claim.paperTitle ||
        claim.patentTitle ||
        claim.conferencePaperTitle ||
        claim.publicationTitle ||
        claim.professionalBodyName ||
        claim.apcPaperTitle ||
        claim.awardTitle ||
        ''
      );
    };

    const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    const taxonomy: Array<{
      domain: string;
      subdomains: Array<{ name: string; keywords: string[]; weight: number }>;
    }> = [
      {
        domain: 'Computer Science & AI',
        subdomains: [
          { name: 'Artificial Intelligence', keywords: ['artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'llm', 'gen ai', 'nlp', 'computer vision'], weight: 5 },
          { name: 'Data Science & Analytics', keywords: ['data mining', 'predictive model', 'data analytics', 'big data', 'classification', 'regression'], weight: 4 },
          { name: 'Software & Systems', keywords: ['software', 'algorithm', 'distributed system', 'cloud', 'microservice', 'devops', 'compiler'], weight: 3 },
          { name: 'Cybersecurity & Blockchain', keywords: ['cybersecurity', 'network security', 'cryptography', 'intrusion', 'blockchain', 'smart contract'], weight: 4 },
        ],
      },
      {
        domain: 'Engineering & Technology',
        subdomains: [
          { name: 'Electrical & Electronics', keywords: ['electrical', 'power system', 'power electronics', 'vlsi', 'embedded', 'sensor', 'signal processing'], weight: 4 },
          { name: 'Mechanical & Manufacturing', keywords: ['mechanical', 'manufacturing', 'thermal', 'fluid', 'cad', 'cam', 'tribology'], weight: 4 },
          { name: 'Civil & Infrastructure', keywords: ['civil', 'concrete', 'structural', 'transportation', 'geotechnical', 'construction'], weight: 4 },
          { name: 'Robotics & Automation', keywords: ['robotics', 'automation', 'control system', 'mechatronics', 'autonomous'], weight: 5 },
        ],
      },
      {
        domain: 'Health & Life Sciences',
        subdomains: [
          { name: 'Clinical & Medical', keywords: ['clinical', 'medical', 'disease', 'patient', 'diagnosis', 'therapy', 'hospital'], weight: 5 },
          { name: 'Pharmacy & Drug Discovery', keywords: ['pharmacy', 'drug', 'formulation', 'pharmacology', 'toxicology', 'medicinal chemistry'], weight: 5 },
          { name: 'Nursing & Allied Health', keywords: ['nursing', 'physiotherapy', 'rehabilitation', 'public health', 'healthcare'], weight: 4 },
          { name: 'Biology & Biotechnology', keywords: ['biology', 'biotechnology', 'microbiology', 'genome', 'protein', 'cell', 'biomarker'], weight: 4 },
        ],
      },
      {
        domain: 'Management, Commerce & Economics',
        subdomains: [
          { name: 'Finance & Accounting', keywords: ['finance', 'accounting', 'fintech', 'investment', 'portfolio', 'banking'], weight: 4 },
          { name: 'Marketing & Consumer Behavior', keywords: ['marketing', 'consumer', 'branding', 'digital marketing', 'retail', 'customer'], weight: 4 },
          { name: 'Operations & Supply Chain', keywords: ['supply chain', 'operations', 'logistics', 'inventory', 'quality management'], weight: 4 },
          { name: 'HR & Organization Studies', keywords: ['human resource', 'hrm', 'organizational', 'leadership', 'workforce'], weight: 3 },
        ],
      },
      {
        domain: 'Social Sciences & Humanities',
        subdomains: [
          { name: 'Education & Pedagogy', keywords: ['education', 'pedagogy', 'curriculum', 'learning outcomes', 'assessment'], weight: 4 },
          { name: 'Psychology & Sociology', keywords: ['psychology', 'sociology', 'behavior', 'social', 'mental health'], weight: 4 },
          { name: 'Law, Policy & Governance', keywords: ['law', 'policy', 'governance', 'public administration', 'constitutional'], weight: 4 },
          { name: 'Language, Media & Culture', keywords: ['language', 'literature', 'media', 'communication', 'cultural'], weight: 3 },
        ],
      },
      {
        domain: 'Environmental & Sustainability',
        subdomains: [
          { name: 'Climate & Renewable Energy', keywords: ['climate', 'renewable', 'solar', 'wind', 'decarbonization', 'net zero'], weight: 5 },
          { name: 'Water, Waste & Pollution', keywords: ['water treatment', 'waste', 'pollution', 'effluent', 'air quality', 'solid waste'], weight: 4 },
          { name: 'Sustainable Development', keywords: ['sustainability', 'sdg', 'green', 'circular economy', 'eco friendly'], weight: 4 },
        ],
      },
      {
        domain: 'Basic Sciences',
        subdomains: [
          { name: 'Physics', keywords: ['physics', 'quantum', 'optics', 'photonics', 'nanophysics'], weight: 5 },
          { name: 'Chemistry', keywords: ['chemistry', 'organic synthesis', 'catalysis', 'polymer', 'electrochemistry'], weight: 5 },
          { name: 'Mathematics & Statistics', keywords: ['mathematics', 'statistics', 'probability', 'stochastic', 'optimization'], weight: 4 },
          { name: 'Biological Sciences', keywords: ['botany', 'zoology', 'ecology', 'genetics', 'microbiology'], weight: 4 },
        ],
      },
    ];

    const scoreKeyword = (text: string, keyword: string) => {
      if (keyword.includes(' ')) {
        return text.includes(keyword) ? 1 : 0;
      }
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(text) ? 1 : 0;
    };

    const analyzeTitle = (title: string) => {
      const normalized = normalize(title);
      const scored: Array<{
        domain: string;
        subdomain: string;
        score: number;
        matchedKeywords: string[];
      }> = [];

      for (const domain of taxonomy) {
        for (const sub of domain.subdomains) {
          const matchedKeywords = sub.keywords.filter((kw) => scoreKeyword(normalized, kw) > 0);
          const score = matchedKeywords.length * sub.weight;
          scored.push({
            domain: domain.domain,
            subdomain: sub.name,
            score,
            matchedKeywords,
          });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      const top = scored[0];
      const second = scored[1];

      if (!top || top.score === 0) {
        return {
          domain: 'Interdisciplinary / Other',
          subdomain: 'Unclassified',
          confidence: 35,
          matchedKeywords: [] as string[],
        };
      }

      const confidence = Math.max(
        40,
        Math.min(
          97,
          55 + top.score * 3 + (second?.score ? Math.max(0, 15 - second.score * 2) : 18)
        )
      );

      return {
        domain: top.domain,
        subdomain: top.subdomain,
        confidence,
        matchedKeywords: top.matchedKeywords.slice(0, 4),
      };
    };

    const analyzed = incentiveClaims
      .map((claim) => {
        const title = getClaimTitle(claim);
        if (!title) return null;
        const analysis = analyzeTitle(title);
        return {
          id: claim.id,
          claimId: claim.claimId || 'N/A',
          claimType: claim.claimType,
          title,
          submissionDate: claim.submissionDate,
          ...analysis,
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        claimId: string;
        claimType: string;
        title: string;
        submissionDate: string;
        domain: string;
        subdomain: string;
        confidence: number;
        matchedKeywords: string[];
      }>;

    const byDomain = analyzed.reduce((acc, item) => {
      acc[item.domain] = (acc[item.domain] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bySubdomain = analyzed.reduce((acc, item) => {
      const key = `${item.domain} • ${item.subdomain}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const domainData = Object.entries(byDomain)
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count);

    const subdomainData = Object.entries(bySubdomain)
      .map(([subdomain, count]) => ({ subdomain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    const domainConfig: ChartConfig = {};
    domainData.forEach((item, index) => {
      domainConfig[item.field] = {
        label: item.field,
        color: COLORS[index % COLORS.length],
      };
    });

    const subdomainConfig: ChartConfig = {};
    subdomainData.forEach((item, index) => {
      subdomainConfig[item.subdomain] = {
        label: item.subdomain,
        color: COLORS[index % COLORS.length],
      };
    });

    const sortedDrilldown = analyzed
      .sort((a, b) => {
        const byDate = new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime();
        if (byDate !== 0) return byDate;
        return b.confidence - a.confidence;
      })
      .slice(0, 40);

    const avgConfidence = analyzed.length > 0
      ? Math.round(analyzed.reduce((sum, row) => sum + row.confidence, 0) / analyzed.length)
      : 0;

    return {
      fieldOfStudyData: domainData,
      fieldOfStudyConfig: domainConfig,
      fieldOfStudySubdomainData: subdomainData,
      fieldOfStudySubdomainConfig: subdomainConfig,
      fieldOfStudyDrilldown: sortedDrilldown,
      fieldOfStudySummary: {
        classifiedClaims: analyzed.length,
        uniqueDomains: domainData.length,
        uniqueSubdomains: Object.keys(bySubdomain).length,
        avgConfidence,
      },
    };
  }, [incentiveClaims]);

  const { totalImrGrantAmount, totalImrGrantsAwarded, totalEmrProjects } = useMemo(() => {
    const awardedProjects = projects.filter(p => p.grant && p.grant.totalAmount > 0 && p.status !== 'Draft' && p.status !== 'Not Recommended');
    const totalAmount = awardedProjects.reduce((sum, p) => sum + p.grant!.totalAmount, 0);
    const emrSanctionedCount = emrProjects.length;
    return {
        totalImrGrantAmount: totalAmount,
        totalImrGrantsAwarded: awardedProjects.length,
        totalEmrProjects: emrSanctionedCount
    };
  }, [projects, emrProjects]);

    const { projectTypeDistributionData, projectTypeDistributionConfig } = useMemo(() => {
        if (filteredProjects.length === 0) return { projectTypeDistributionData: [], projectTypeDistributionConfig: {} };
        const typeCounts = filteredProjects.reduce((acc, project) => {
            const type = project.type || 'Unidisciplinary';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const data = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

        const config: ChartConfig = {};
        data.forEach((item, index) => {
            config[item.name] = {
                label: item.name,
                color: COLORS[index % COLORS.length],
            };
        });

        return { projectTypeDistributionData: data, projectTypeDistributionConfig: config };
    }, [filteredProjects]);


  const isCro = user?.role === 'CRO';
  const isGoaHead = user?.designation === 'Head of Goa Campus';

  const getPageTitle = () => {
      if (isCro) {
          if (facultyFilter === 'all') return `Analytics for All Your Faculties`;
          return `Analytics for ${facultyFilter}`;
      }
      if (isGoaHead) return 'Analytics for Goa Campus';
      if (user?.designation === 'Principal' && user.institute) return `Analytics for ${user.institute}`;
      if (user?.designation === 'Principal' && !user.institute) return 'Analytics (Principal - No Institute Set)';
      if (user?.designation === 'HOD' && user.department && user.institute) return `Analytics for ${user.department}, ${user.institute}`;
      return 'Analytics';
  }

  const getPageDescription = () => {
    if (user?.designation === 'Principal' && !user.institute) return 'Your institute information is not configured. Please update your profile to see institute-specific analytics.';
    if (user?.role === 'CRO' || user?.designation === 'Principal' || user?.designation === 'HOD' || isGoaHead) return 'Visualize project data and submission trends for your scope.';
    return 'Visualize project data and submission trends across the university.';
  }
  
    const statCards = [
        { title: 'Total IMR Grant Amount', value: `₹${totalImrGrantAmount.toLocaleString('en-IN')}`, icon: Banknote, description: `For ${totalImrGrantsAwarded} sanctioned IMR projects.`, loading: loading },
        { title: 'Total Sanctioned Incentives', value: `₹${totalIncentiveAmount.toLocaleString('en-IN')}`, icon: Award, description: `Across ${incentiveClaims.filter(c => c.finalApprovedAmount).length} claims`, loading: loading },
        { title: 'Total EMR Projects', value: totalEmrProjects.toString(), icon: Calendar, description: 'Sanctioned extramural projects.', loading: loading },
    ];

    if (user?.role === 'Super-admin') {
        statCards.push({
            title: 'Total Storage Used',
            value: storageUsage !== null ? `${storageUsage.toFixed(2)} MB` : '...',
            icon: FileArchive,
            description: 'Used by all uploaded files.',
            loading: storageUsage === null
        });
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <PageHeader title={getPageTitle()} description={getPageDescription()}>
          <div className="flex items-center gap-2">
            <Button onClick={handleGenerateReport} disabled={isGeneratingReport}>
                {isGeneratingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download PDF Report
            </Button>
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
          </div>
      </PageHeader>
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card, index) => (
            <Card key={card.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                    <card.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    {card.loading ? <Skeleton className="h-8 w-1/2" /> : (
                        <>
                            <div className="text-2xl font-bold">{card.value}</div>
                            <p className="text-xs text-muted-foreground">{card.description}</p>
                        </>
                    )}
                </CardContent>
            </Card>
        ))}
      </div>
      
       {/* --- IMR & EMR Section --- */}
      <div className="mt-12 space-y-8">
        <h2 className="text-2xl font-bold tracking-tight">IMR & EMR Project Analytics</h2>
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div><CardTitle>IMR Project Status Distribution</CardTitle><CardDescription>Summary of all IMR projects by status.</CardDescription></div>
                    <Button variant="outline" size="sm" onClick={() => handleExport(statusChartRef, 'project_status_distribution')}><Download className="mr-2 h-4 w-4" /> Export</Button>
                </CardHeader>
                <CardContent><div ref={statusChartRef} className="p-4 bg-card"><ChartContainer config={statusDistributionConfig} className="h-[250px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><ChartTooltip content={<ChartTooltipContent nameKey="value" formatter={(value) => value.toLocaleString()} />} /><Pie data={statusDistributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} isAnimationActive={false}>{statusDistributionData.map((entry, index) => (<Cell key={`cell-${index}`} fill={statusDistributionConfig[entry.name]?.color || '#8884d8'} />))}</Pie></PieChart></ResponsiveContainer></ChartContainer></div></CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div><CardTitle>IMR Projects by Type</CardTitle><CardDescription>Distribution by disciplinary category.</CardDescription></div>
                    <Button variant="outline" size="sm" onClick={() => handleExport(projectTypeChartRef, 'project_type_distribution')}><Download className="mr-2 h-4 w-4" /> Export</Button>
                </CardHeader>
                <CardContent><div ref={projectTypeChartRef} className="p-4 bg-card"><ChartContainer config={projectTypeDistributionConfig} className="h-[250px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><ChartTooltip content={<ChartTooltipContent nameKey="value" formatter={(value) => value.toLocaleString()} />} /><Pie data={projectTypeDistributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} isAnimationActive={false}>{projectTypeDistributionData.map((entry, index) => (<Cell key={`cell-${index}`} fill={projectTypeDistributionConfig[entry.name]?.color || '#8884d8'} />))}</Pie></PieChart></ResponsiveContainer></ChartContainer></div></CardContent>
            </Card>
        </div>
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                      <div><CardTitle>IMR Submissions Over Time</CardTitle><CardDescription>{timeRange === 'last6months' ? 'Monthly project submissions for the last 6 months.' : `Monthly project submissions for ${timeRange}.`}</CardDescription></div>
                      <div className="flex items-center gap-2"><Select value={timeRange} onValueChange={setTimeRange}><SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Select time range" /></SelectTrigger><SelectContent><SelectItem value="last6months">Last 6 Months</SelectItem>{availableYears.map(year => (<SelectItem key={year} value={year}>{year}</SelectItem>))}</SelectContent></Select><Button variant="outline" size="icon" onClick={() => handleExport(submissionsTimeChartRef, 'submissions_over_time')}><Download className="h-4 w-4" /></Button></div>
                    </div>
                </CardHeader>
                <CardContent><div ref={submissionsTimeChartRef} className="p-4 bg-card"><ChartContainer config={submissionsConfig} className="h-[300px] w-full"><LineChart accessibilityLayer data={submissionsData}><CartesianGrid vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} /><YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} /><ChartTooltip cursor={false} content={<ChartTooltipContent />} /><Line dataKey="submissions" type="monotone" stroke="var(--color-submissions)" strokeWidth={2} dot={true} isAnimationActive={false} /></LineChart></ChartContainer></div></CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                        <div><CardTitle>Yearly IMR Submissions & Sanctions</CardTitle><CardDescription>Total IMR submissions vs. sanctions over the last 6 years.</CardDescription></div>
                        <div className="flex items-center gap-2"><Select value={submissionsByYearType} onValueChange={(value) => setSubmissionsByYearType(value as 'submissions' | 'sanctions')}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="submissions">Submissions</SelectItem><SelectItem value="sanctions">Sanctions</SelectItem></SelectContent></Select><Button variant="outline" size="icon" onClick={() => handleExport(submissionsYearChartRef, 'yearly_submissions_sanctions')}><Download className="h-4 w-4" /></Button></div>
                    </div>
                </CardHeader>
                <CardContent><div ref={submissionsYearChartRef} className="p-4 bg-card"><ChartContainer config={submissionsByYearType === 'submissions' ? submissionsConfig : sanctionsConfig} className="h-[300px] w-full"><BarChart data={submissionsByYearData}><CartesianGrid vertical={false} /><XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} /><YAxis allowDecimals={false} /><ChartTooltip cursor={false} content={<ChartTooltipContent />} /><Bar dataKey="count" fill={submissionsByYearType === 'submissions' ? 'var(--color-submissions)' : 'var(--color-sanctions)'} radius={4} /></BarChart></ChartContainer></div></CardContent>
            </Card>
        </div>
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div><CardTitle>Projects by {aggregationLabel}</CardTitle><CardDescription>Total projects submitted by each {aggregationLabel.toLowerCase()}.</CardDescription></div>
                        <div className="flex items-center gap-2"><Select value={projectsByGroupType} onValueChange={(value) => setProjectsByGroupType(value as 'imr' | 'emr')}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="imr">IMR Submissions</SelectItem><SelectItem value="emr">EMR Sanctions</SelectItem></SelectContent></Select><Button variant="outline" size="icon" onClick={() => handleExport(projectsByGroupChartRef, 'projects_by_group')}><Download className="h-4 w-4" /></Button></div>
                    </div>
                </CardHeader>
                <CardContent><div ref={projectsByGroupChartRef} className="p-4 bg-card"><ChartContainer config={projectsByGroupConfig} className="h-[400px] w-full"><BarChart accessibilityLayer data={projectsByGroupData} layout="vertical" margin={{left: 30}} isAnimationActive={false}><CartesianGrid horizontal={false} /><YAxis dataKey="group" type="category" tickLine={false} tickMargin={10} axisLine={false} width={250} tick={{ fontSize: 12, width: 240, whiteSpace: 'normal', textAnchor: 'end' }} interval={0} /><XAxis dataKey="projects" type="number" hide allowDecimals={false} /><Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} /><Bar dataKey="projects" layout="vertical" fill="var(--color-projects)" radius={4}><LabelList dataKey="projects" position="right" offset={8} className="fill-foreground" fontSize={12} /></Bar></BarChart></ChartContainer></div></CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between"><CardTitle>Top 5 EMR Funding Agencies</CardTitle><Button variant="outline" size="icon" onClick={() => handleExport(fundingByAgencyChartRef, 'top_funding_agencies')}><Download className="h-4 w-4" /></Button></div>
                    <CardDescription>Total sanctioned amount from the top 5 external funding agencies.</CardDescription>
                </CardHeader>
                <CardContent><div ref={fundingByAgencyChartRef} className="p-4 bg-card"><ChartContainer config={fundingByAgencyConfig} className="h-[400px] w-full"><BarChart data={fundingByAgencyData} layout="vertical" margin={{ left: 100 }}><CartesianGrid horizontal={false} /><YAxis dataKey="agency" type="category" tickLine={false} tickMargin={10} axisLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} /><XAxis dataKey="amount" type="number" hide /><ChartTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />} /><Bar dataKey="amount" layout="vertical" fill="var(--color-amount)" radius={4}><LabelList dataKey="amount" position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`} /></Bar></BarChart></ChartContainer></div></CardContent>
            </Card>
        </div>
        <div>
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Banknote className="h-5 w-5" />IMR Grant Amount by Institute
                            </CardTitle>
                            <CardDescription>Total sanctioned Intra-Mural Research grant amounts per institute.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                                <span className="text-sm text-muted-foreground">From:</span>
                                <Select 
                                    value={grantDateRange.start || ''} 
                                    onValueChange={(value) => {
                                        // Keep stored value in yyyy-MM to match the option list.
                                        setGrantDateRange(prev => ({ 
                                            ...prev, 
                                            start: value,
                                            end: prev.end && prev.end < value ? null : prev.end
                                        }));
                                    }}
                                >
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue placeholder="Start" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {monthYearOptions.map(option => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-sm text-muted-foreground">To:</span>
                                <Select 
                                    value={grantDateRange.end || ''} 
                                    onValueChange={(value) => {
                                        // Keep stored value in yyyy-MM to match the option list.
                                        setGrantDateRange(prev => ({
                                            ...prev,
                                            end: value,
                                            start: prev.start && prev.start > value ? null : prev.start,
                                        }));
                                    }}
                                >
                                    <SelectTrigger className="w-[120px]">
                                        <SelectValue placeholder="End" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {monthYearOptions.map(option => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setGrantDateRange({start: null, end: null})}
                                disabled={!grantDateRange.start && !grantDateRange.end}
                            >
                                Clear
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleExportImrGrants} disabled={loading || imrGrantByInstituteData.length === 0}>
                                <Download className="mr-2 h-4 w-4" />
                                Export
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div ref={imrGrantByInstituteChartRef} className="p-4 bg-card">
                        <ChartContainer config={imrGrantByInstituteConfig} className="h-[800px] w-full">
                            <BarChart data={imrGrantByInstituteData} layout="vertical" margin={{ left: 180 }}>
                                <CartesianGrid horizontal={false} />
                                <YAxis dataKey="institute" type="category" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} width={180} interval={0} />
                                <XAxis dataKey="amount" type="number" hide />
                                <ChartTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />} />
                                <Bar dataKey="amount" layout="vertical" fill="var(--color-amount)" radius={4}>
                                    <LabelList dataKey="amount" position="right" offset={8} className="fill-foreground" fontSize={12} formatter={(value: number) => `₹${(value / 100000).toFixed(1)}L`} />
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>

       {/* --- Publication & Incentive Section --- */}
      <div className="mt-12 space-y-8">
        <h2 className="text-2xl font-bold tracking-tight">Publication & Incentive Analytics</h2>
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Incentive Amounts by Category</CardTitle><CardDescription>Total sanctioned amount per claim type.</CardDescription></div><Button variant="outline" size="icon" onClick={() => handleExport(incentiveAmountChartRef, 'incentive_amounts')}><Download className="h-4 w-4" /></Button></CardHeader>
                <CardContent><div ref={incentiveAmountChartRef} className="p-4 bg-card"><ChartContainer config={incentiveAmountConfig} className="h-[300px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />} /><Pie data={incentiveAmountData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => { const RADIAN = Math.PI / 180; const radius = innerRadius + (outerRadius - innerRadius) * 0.5; const x = cx + radius * Math.cos(-midAngle * RADIAN); const y = cy + radius * Math.sin(-midAngle * RADIAN); return ( <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"> {`${(percent * 100).toFixed(0)}%`} </text> ); }}>{incentiveAmountData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Legend content={<ChartLegendContent nameKey="name" />} /></PieChart></ResponsiveContainer></ChartContainer></div></CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Publications by Journal Quartile</CardTitle><CardDescription>Distribution of articles across Q1-Q4 journals.</CardDescription></div><Button variant="outline" size="icon" onClick={() => handleExport(publicationChartRef, 'publication_quartile_distribution')}><Download className="h-4 w-4" /></Button></CardHeader>
                <CardContent><div ref={publicationChartRef} className="p-4 bg-card"><ChartContainer config={quartileChartConfig} className="h-[300px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={quarterlyDistributionData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="quartile" /><YAxis allowDecimals={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" fill="hsl(var(--primary))" radius={4}><LabelList dataKey="count" position="top" offset={8} className="fill-foreground" fontSize={12} /></Bar></BarChart></ResponsiveContainer></ChartContainer></div></CardContent>
            </Card>
        </div>
        <div><Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Monthly Publication Distribution</CardTitle><CardDescription>Number of articles published by month and year.</CardDescription></div><Button variant="outline" size="icon" onClick={() => handleExport(monthlyPublicationChartRef, 'publication_monthly_distribution')}><Download className="h-4 w-4" /></Button></CardHeader><CardContent><div ref={monthlyPublicationChartRef} className="p-4 bg-card"><ChartContainer config={monthlyChartConfig} className="h-[300px] w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={monthlyDistributionData} margin={{ bottom: 20 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} /><ChartTooltip content={<ChartTooltipContent />} /><Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))', r: 4 }} isAnimationActive={false} /></LineChart></ResponsiveContainer></ChartContainer></div></CardContent></Card></div>
      </div>

       {/* --- System & AI Analytics Section --- */}
      {user.role === 'Super-admin' && (
        <div className="mt-12 space-y-8">
            <h2 className="text-2xl font-bold tracking-tight">System & AI Analytics</h2>
            <div className="grid gap-6 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Classified Claims</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{fieldOfStudySummary.classifiedClaims}</div><p className="text-xs text-muted-foreground">Claims with identifiable title text</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Unique Domains</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{fieldOfStudySummary.uniqueDomains}</div><p className="text-xs text-muted-foreground">Primary field clusters</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Unique Subdomains</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{fieldOfStudySummary.uniqueSubdomains}</div><p className="text-xs text-muted-foreground">Granular research segments</p></CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Avg Confidence</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{fieldOfStudySummary.avgConfidence}%</div><p className="text-xs text-muted-foreground">Title-based classification score</p></CardContent>
                </Card>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
                <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>Field of Studies by Domain</CardTitle><CardDescription>Primary domain distribution inferred from claim titles.</CardDescription></div><Button variant="outline" size="icon" onClick={() => handleExport(fieldOfStudyChartRef, 'field_of_studies_domain_distribution')}><Download className="h-4 w-4" /></Button></div></CardHeader><CardContent><div ref={fieldOfStudyChartRef} className="p-4 bg-card"><ChartContainer config={fieldOfStudyConfig} className="h-[420px] w-full"><BarChart data={fieldOfStudyData} layout="vertical" margin={{ left: 140 }}><CartesianGrid horizontal={false} /><YAxis dataKey="field" type="category" tickLine={false} tickMargin={10} axisLine={false} width={240} tick={{ fontSize: 12, whiteSpace: 'normal', textAnchor: 'end' }} interval={0} /><XAxis dataKey="count" type="number" allowDecimals={false} /><ChartTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} /><Bar dataKey="count" fill="hsl(var(--primary))" radius={4}><LabelList dataKey="count" position="right" offset={8} className="fill-foreground" fontSize={12} /></Bar></BarChart></ChartContainer></div></CardContent></Card>
                <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>Top Subdomains</CardTitle><CardDescription>Most frequent granular research areas (top 12).</CardDescription></div><Button variant="outline" size="icon" onClick={() => handleExport(fieldOfStudySubdomainChartRef, 'field_of_studies_subdomain_distribution')}><Download className="h-4 w-4" /></Button></div></CardHeader><CardContent><div ref={fieldOfStudySubdomainChartRef} className="p-4 bg-card"><ChartContainer config={fieldOfStudySubdomainConfig} className="h-[420px] w-full"><BarChart data={fieldOfStudySubdomainData} layout="vertical" margin={{ left: 160 }}><CartesianGrid horizontal={false} /><YAxis dataKey="subdomain" type="category" tickLine={false} tickMargin={10} axisLine={false} width={280} tick={{ fontSize: 12, whiteSpace: 'normal', textAnchor: 'end' }} interval={0} /><XAxis dataKey="count" type="number" allowDecimals={false} /><ChartTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} /><Bar dataKey="count" fill="hsl(var(--accent))" radius={4}><LabelList dataKey="count" position="right" offset={8} className="fill-foreground" fontSize={12} /></Bar></BarChart></ChartContainer></div></CardContent></Card>
            </div>
            <Card className="mt-6"><CardHeader><CardTitle>Claim-Level Domain Drilldown</CardTitle><CardDescription>Recent claims with inferred domain, subdomain, confidence, and matched title signals.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Claim ID</TableHead><TableHead>Claim Type</TableHead><TableHead>Title</TableHead><TableHead>Domain</TableHead><TableHead>Subdomain</TableHead><TableHead>Confidence</TableHead><TableHead>Matched Signals</TableHead></TableRow></TableHeader><TableBody>{fieldOfStudyDrilldown.map((row) => (<TableRow key={row.id}><TableCell className="font-medium">{row.claimId}</TableCell><TableCell>{row.claimType}</TableCell><TableCell className="max-w-[320px] truncate" title={row.title}>{row.title}</TableCell><TableCell>{row.domain}</TableCell><TableCell>{row.subdomain}</TableCell><TableCell><Badge variant={row.confidence >= 75 ? 'default' : row.confidence >= 55 ? 'secondary' : 'outline'}>{row.confidence}%</Badge></TableCell><TableCell className="max-w-[240px] truncate" title={row.matchedKeywords.join(', ')}>{row.matchedKeywords.length > 0 ? row.matchedKeywords.join(', ') : 'No explicit signal'}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Daily Active Users</CardTitle><CardDescription>Unique user logins over the past 7 days.</CardDescription></div><Button variant="outline" size="icon" onClick={() => handleExport(activeUsersChartRef, 'daily_active_users')}><Download className="h-4 w-4" /></Button></CardHeader>
                <CardContent><div ref={activeUsersChartRef} className="p-4 bg-card"><ChartContainer config={dailyActiveUsersConfig} className="h-[300px] w-full"><BarChart accessibilityLayer data={dailyActiveUsersData}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} /><YAxis /><ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} /><Bar dataKey="users" fill="var(--color-users)" radius={8} /></BarChart></ChartContainer></div></CardContent>
            </Card>
        </div>
      )}
    </div>
  );
}
