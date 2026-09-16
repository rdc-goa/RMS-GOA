
'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ExcelJS from 'exceljs';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Bar, BarChart, CartesianGrid, XAxis, Line, LineChart, ResponsiveContainer, YAxis, Tooltip, Pie, PieChart, Cell, Legend, LabelList, Treemap, ComposedChart, Area } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { Project, User, EmrInterest, FundingCall, IncentiveClaim, ScopusPublication } from '@/types';
import { db, db_rtdb } from '@/lib/config';
import { cn } from '@/lib/utils';
import { ref as rtdbRef, onValue as rtdbOnValue } from 'firebase/database';
import { collection, query, where, getDocs, onSnapshot, or, orderBy, Timestamp } from 'firebase/firestore';
import { format, subMonths, startOfMonth, endOfMonth, parseISO, getYear, subDays, startOfDay } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Award, Download, Users, Loader2, FileArchive, Banknote, FileText, Calendar, Info, X, Clock, CheckCheck, TrendingUp, Network, Zap, ExternalLink, Building2, Trophy, RefreshCw, BookCopy, Megaphone, BookOpen, ChevronRight, Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { toPng } from 'html-to-image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStorageUsage } from '@/services/storage-service';
import { fetchAllClaimsAction, getTopCollaboratingInstitutesGemini, getCachedCollaborationsAction } from '@/app/incentive-actions';
import { fetchParulUniversityTopCitedScopusPublicationsAction } from '@/app/scopus-actions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ClaimDetailsDialog } from '@/components/incentives/claim-details-dialog';


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
      {payload?.map((entry: any, index: number) => {
        const amount = entry.payload?.value;
        const tooltipText = typeof amount === 'number'
          ? `₹${amount.toLocaleString('en-IN')}`
          : '';
        return (
          <li
            key={`item-${index}`}
            className="flex items-center gap-2"
            title={tooltipText}
          >
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="cursor-help hover:text-foreground transition-colors">{entry.value}</span>
          </li>
        );
      })}
    </ul>
  );
};


export default function AnalyticsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [emrProjects, setEmrProjects] = useState<EmrInterest[]>([]);
  const [fundingCalls, setFundingCalls] = useState<FundingCall[]>([]);
  const [incentiveClaims, setIncentiveClaims] = useState<IncentiveClaim[]>([]);
  const [loginLogs, setLoginLogs] = useState<any[]>([]);
  const [storageUsage, setStorageUsage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedSubdomain, setSelectedSubdomain] = useState<string | null>(null);
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [timeRange, setTimeRange] = useState<string>('last6months');
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [submissionsByYearType, setSubmissionsByYearType] = useState<'submissions' | 'sanctions'>('submissions');
  const [projectsByGroupType, setProjectsByGroupType] = useState<'imr' | 'emr'>('imr');
  const [globalDateRange, setGlobalDateRange] = useState<{ start: string | null, end: string | null }>({ start: null, end: null });
  const { toast } = useToast();
  const router = useRouter();
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [collaborationInstitutes, setCollaborationInstitutes] = useState<Array<{ name: string; count: number; country: string }>>([]);
  const [isAnalyzingInstitutes, setIsAnalyzingInstitutes] = useState(false);
  const [selectedInstDrilldown, setSelectedInstDrilldown] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedClaimForDetails, setSelectedClaimForDetails] = useState<IncentiveClaim | null>(null);

  // --- Top Journals State & Drilldown ---
  const [topJournalSearch, setTopJournalSearch] = useState<string>('');
  const [selectedJournalForDrilldown, setSelectedJournalForDrilldown] = useState<{
    journalName: string;
    count: number;
    articles: Array<{
      id: string;
      title: string;
      doi?: string;
      monthYear: string;
      puAuthors: string[];
      claimId?: string;
      scopusLink?: string;
      wosLink?: string;
      claim?: IncentiveClaim;
    }>;
  } | null>(null);

  // --- Incentive Claim Summary State ---
  const [incentiveGroupType, setIncentiveGroupType] = useState<'institute' | 'faculty'>('institute');
  const [incentiveGroupSearch, setIncentiveGroupSearch] = useState('');

  // --- Top Cited Scopus Publications State ---
  const [topScopusPubs, setTopScopusPubs] = useState<ScopusPublication[]>([]);
  const [isLiveScopusData, setIsLiveScopusData] = useState<boolean>(false);
  const [isLoadingTopScopus, setIsLoadingTopScopus] = useState<boolean>(false);
  const [topScopusTotalResults, setTopScopusTotalResults] = useState<number>(0);
  const [scopusYearFilter, setScopusYearFilter] = useState<string>('all');

  const loadTopScopusPubs = useCallback(async (yearOverride?: string) => {
    setIsLoadingTopScopus(true);
    try {
      const yearToFetch = yearOverride !== undefined ? yearOverride : scopusYearFilter;
      const res = await fetchParulUniversityTopCitedScopusPublicationsAction(
        15,
        yearToFetch === 'all' ? undefined : yearToFetch,
        'AFFILORG("Parul University Goa") OR AFFIL("Parul University Goa")'
      );
      if (res.success && res.publications) {
        setTopScopusPubs(res.publications);
        setIsLiveScopusData(!!res.isLiveApi);
        setTopScopusTotalResults(res.totalResults || res.publications.length);
      }
    } catch (err) {
      console.error('Failed to load top Scopus publications:', err);
    } finally {
      setIsLoadingTopScopus(false);
    }
  }, [scopusYearFilter]);

  useEffect(() => {
    loadTopScopusPubs();
  }, [loadTopScopusPubs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsDark(document.documentElement.classList.contains('dark'));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const textColor = `var(--chart-text-color, ${isDark ? '#f8fafc' : '#0f172a'})`;
  const mutedTextColor = `var(--chart-muted-color, ${isDark ? '#94a3b8' : '#64748b'})`;
  const gridColor = `var(--chart-grid-color, ${isDark ? '#334155' : '#e2e8f0'})`;

  const statusChartRef = useRef<HTMLDivElement>(null);
  const submissionsTimeChartRef = useRef<HTMLDivElement>(null);
  const submissionsYearChartRef = useRef<HTMLDivElement>(null);
  const projectsByGroupChartRef = useRef<HTMLDivElement>(null);
  const incentiveAmountChartRef = useRef<HTMLDivElement>(null);
  const imrGrantByInstituteChartRef = useRef<HTMLDivElement>(null);
  const activeUsersChartRef = useRef<HTMLDivElement>(null);
  const fundingByAgencyChartRef = useRef<HTMLDivElement>(null);
  const emrStatusChartRef = useRef<HTMLDivElement>(null);
  const emrTrendChartRef = useRef<HTMLDivElement>(null);
  const emrAgencyTableRef = useRef<HTMLDivElement>(null);
  const fieldOfStudyChartRef = useRef<HTMLDivElement>(null);
  const fieldOfStudySubdomainChartRef = useRef<HTMLDivElement>(null);
  const projectTypeChartRef = useRef<HTMLDivElement>(null);
  const publicationChartRef = useRef<HTMLDivElement>(null);
  const monthlyPublicationChartRef = useRef<HTMLDivElement>(null);
  const stage1ApproverChartRef = useRef<HTMLDivElement>(null);
  const waitTimeChartRef = useRef<HTMLDivElement>(null);
  const submissionVsApprovalChartRef = useRef<HTMLDivElement>(null);
  const collaborationChartRef = useRef<HTMLDivElement>(null);
  const autoCalcAccuracyChartRef = useRef<HTMLDivElement>(null);
  const researchRoiChartRef = useRef<HTMLDivElement>(null);
  const emergingTopicsChartRef = useRef<HTMLDivElement>(null);
  const incentiveGroupChartRef = useRef<HTMLDivElement>(null);


  const handleExport = useCallback(async (ref: React.RefObject<HTMLDivElement>, fileName: string) => {
    if (!ref.current) {
      toast({ variant: 'destructive', title: "Export Error", description: "Chart element not found." });
      return;
    }

    try {
      const dataUrl = await toPng(ref.current, {
        cacheBust: true,
        backgroundColor: '#ffffff', // Always white background for exported PNG
        pixelRatio: 3,
        style: {
          // Force light theme text/muted-text colors on UI labels
          '--foreground': '0 0% 0%',
          '--muted-foreground': '240 3.8% 25%',
          '--card-foreground': '0 0% 0%',
          // Force chart fill colors to pure black / dark gray
          '--chart-text-color': '#000000',
          '--chart-muted-color': '#000000',
          '--chart-grid-color': '#e2e8f0',
          // Force larger typography sizes
          '--chart-label-font-size': '15px',
          '--chart-tick-font-size': '14px',
          '--card-title-font-size': '20px',
          '--is-exporting': 'true',
          '--card-total-color': '#000000',
          '--card-total-size': '20px',
        } as any,
        filter: (node) => {
          if (
            node.tagName === 'BUTTON' ||
            node.tagName === 'SELECT' ||
            (node.classList && (node.classList.contains('no-export') || node.classList.contains('export-btn')))
          ) {
            return false;
          }
          return true;
        }
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


  const scopedProjects = useMemo(() => {
    if (user?.role === 'CRO' && facultyFilter !== 'all') {
      return projects.filter(p => p.faculty === facultyFilter);
    }
    return projects;
  }, [projects, user, facultyFilter]);

  const filteredProjects = useMemo(() => {
    let base = scopedProjects;
    if (globalDateRange.start && globalDateRange.end) {
      const startDate = startOfMonth(parseISO(globalDateRange.start));
      const endDate = endOfMonth(parseISO(globalDateRange.end));
      base = base.filter(p => {
        const date = parseISO(p.submissionDate);
        return date >= startDate && date <= endDate;
      });
    }
    return base;
  }, [scopedProjects, globalDateRange]);

  const filteredIncentiveClaims = useMemo(() => {
    let base = incentiveClaims;
    if (user?.role === 'CRO' && facultyFilter !== 'all') {
      base = base.filter(c => c.faculty === facultyFilter);
    }
    if (globalDateRange.start && globalDateRange.end) {
      const startDate = startOfMonth(parseISO(globalDateRange.start));
      const endDate = endOfMonth(parseISO(globalDateRange.end));
      base = base.filter(c => {
        const date = parseISO(c.submissionDate);
        return date >= startDate && date <= endDate;
      });
    }
    return base;
  }, [incentiveClaims, user, facultyFilter, globalDateRange]);

  // --- Institute / Faculty / Department wise Incentive Claim Aggregation ---
  const { incentiveGroupData, maxGroupAmount, maxGroupCount, grandTotalGroup, activeGroupType } = useMemo(() => {
    const isPrincipal = user?.designation === 'Principal';
    const isCro = user?.role === 'CRO';

    const groupType = isPrincipal
      ? 'department'
      : (isCro ? 'institute' : incentiveGroupType);

    const userDetailsMap = new Map(users.map(u => [
      u.uid,
      {
        institute: u.institute || 'N/A',
        department: u.department || 'N/A',
        faculty: u.faculty || 'N/A'
      }
    ]));

    // Filter finally accepted claims: 'Accepted', 'Submitted to Accounts', 'Payment Completed'
    let acceptedClaims = filteredIncentiveClaims.filter(c =>
      ['Accepted', 'Submitted to Accounts', 'Payment Completed'].includes(c.status || '')
    );

    // If Principal, only show claims from their own institute
    if (isPrincipal && user?.institute) {
      acceptedClaims = acceptedClaims.filter(c => {
        const uDetails = userDetailsMap.get(c.uid);
        return uDetails && uDetails.institute === user.institute;
      });
    }

    // If CRO, only show claims from their faculties
    if (isCro && user?.faculties && user.faculties.length > 0) {
      acceptedClaims = acceptedClaims.filter(c => {
        const uDetails = userDetailsMap.get(c.uid);
        return user.faculties?.includes(c.faculty || '') || user.faculties?.includes(uDetails?.faculty || '');
      });
    }

    const aggregation: Record<string, { name: string; count: number; amount: number }> = {};

    acceptedClaims.forEach(claim => {
      const uDetails = userDetailsMap.get(claim.uid);

      let name = 'N/A';
      if (groupType === 'institute') {
        name = uDetails?.institute || 'N/A';
      } else if (groupType === 'faculty') {
        name = claim.faculty || uDetails?.faculty || 'N/A';
      } else if (groupType === 'department') {
        name = uDetails?.department || 'N/A';
      }

      if (!aggregation[name]) {
        aggregation[name] = { name, count: 0, amount: 0 };
      }

      const rawAmt = claim.finalApprovedAmount !== undefined && claim.finalApprovedAmount !== null
        ? claim.finalApprovedAmount
        : (claim.calculatedIncentive || 0);
      const amt = Number(rawAmt);
      const parsedAmt = isNaN(amt) ? 0 : amt;

      aggregation[name].count += 1;
      aggregation[name].amount += parsedAmt;
    });

    let items = Object.values(aggregation);

    if (incentiveGroupSearch) {
      const search = incentiveGroupSearch.toLowerCase();
      items = items.filter(item => item.name.toLowerCase().includes(search));
    }

    items.sort((a, b) => b.amount - a.amount);

    let maxAmt = 0;
    let maxCnt = 0;
    const computedGrandTotal = { count: 0, amount: 0 };

    items.forEach(item => {
      if (item.amount > maxAmt) maxAmt = item.amount;
      if (item.count > maxCnt) maxCnt = item.count;
      computedGrandTotal.count += item.count;
      computedGrandTotal.amount += item.amount;
    });

    return {
      incentiveGroupData: items,
      maxGroupAmount: maxAmt || 1,
      maxGroupCount: maxCnt || 1,
      grandTotalGroup: computedGrandTotal,
      activeGroupType: groupType
    };
  }, [filteredIncentiveClaims, users, incentiveGroupType, incentiveGroupSearch, user]);

  const top10Claimants = useMemo(() => {
    const userTotals = new Map<string, number>();

    // We only consider claims with status: 'Accepted', 'Submitted to Accounts', 'Payment Completed'
    const eligibleClaims = filteredIncentiveClaims.filter(c =>
      ['Accepted', 'Submitted to Accounts', 'Payment Completed'].includes(c.status)
    );

    eligibleClaims.forEach(claim => {
      const rawAmt = claim.finalApprovedAmount !== undefined && claim.finalApprovedAmount !== null
        ? claim.finalApprovedAmount
        : (claim.calculatedIncentive || 0);
      const parsedAmt = Number(rawAmt);
      const val = isNaN(parsedAmt) ? 0 : parsedAmt;
      userTotals.set(claim.uid, (userTotals.get(claim.uid) || 0) + val);
    });

    const mapped = Array.from(userTotals.entries()).map(([uid, total]) => {
      const userObj = users.find(u => u.uid === uid);
      return {
        uid,
        name: userObj?.name || eligibleClaims.find(c => c.uid === uid)?.userName || 'Unknown User',
        misId: userObj?.misId || eligibleClaims.find(c => c.uid === uid)?.misId || '',
        campus: userObj?.campus || '',
        total,
      };
    });

    return mapped
      .filter(item => item.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filteredIncentiveClaims, users]);

  const filteredEmrProjects = useMemo(() => {
    let base = emrProjects;
    if (user?.role === 'CRO' && facultyFilter !== 'all') {
      base = base.filter(p => p.faculty === facultyFilter);
    }
    if (globalDateRange.start && globalDateRange.end) {
      const startDate = startOfMonth(parseISO(globalDateRange.start));
      const endDate = endOfMonth(parseISO(globalDateRange.end));
      base = base.filter(p => {
        const date = p.sanctionDate ? parseISO(p.sanctionDate) : ((p as any).timestamp ? new Date((p as any).timestamp) : null);
        return date && date >= startDate && date <= endDate;
      });
    }
    return base;
  }, [emrProjects, user, facultyFilter, globalDateRange]);

  const handleAnalyzeCollaborations = useCallback(async () => {
    try {
      setIsAnalyzingInstitutes(true);

      const rawOrgs: string[] = [];
      filteredIncentiveClaims.forEach(claim => {
        // High-accuracy: Check if PDF parsing verified collaborations and stored them
        if ((claim.aiVerification as any)?.collaboratingInstitutions && Array.isArray((claim.aiVerification as any).collaboratingInstitutions) && (claim.aiVerification as any).collaboratingInstitutions.length > 0) {
          ((claim.aiVerification as any).collaboratingInstitutions as any[]).forEach((org: any) => {
            if (org && org.trim()) {
              rawOrgs.push(org.trim());
            }
          });
        } else {
          // Fallback to manual entry
          claim.authors?.forEach(author => {
            if (author.isExternal && author.organization && author.organization.trim()) {
              rawOrgs.push(author.organization.trim());
            }
          });
        }
      });
      filteredProjects.forEach(project => {
        project.coPiDetails?.forEach(copi => {
          if (copi.isExternal && copi.organization && copi.organization.trim()) {
            rawOrgs.push(copi.organization.trim());
          }
        });
      });

      if (rawOrgs.length === 0) {
        toast({
          title: "No external organizations found",
          description: "There are no external co-authors or co-PIs with organization names listed.",
          variant: "destructive"
        });
        setCollaborationInstitutes([]);
        return;
      }

      const res = await getTopCollaboratingInstitutesGemini(rawOrgs);
      if (res.success && res.institutes) {
        setCollaborationInstitutes(res.institutes);
        toast({
          title: "AI Analysis Complete",
          description: `Successfully analyzed ${rawOrgs.length} records and extracted top institutions!`,
        });
      } else {
        toast({
          title: "Analysis failed",
          description: res.error || "Could not analyze the records.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      console.error("Failed to analyze collaborations:", err);
      toast({
        title: "Error",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzingInstitutes(false);
    }
  }, [filteredIncentiveClaims, filteredProjects, toast]);

  // --- Drill-down map: institution name → list of matched entries ---
  const institutionDrilldownMap = useMemo(() => {
    const map: Record<string, Array<{
      type: 'claim' | 'project';
      id: string;
      claimId?: string;
      title: string;
      doi?: string;
      relevantLink?: string;
      linkCount: number;
      matchedOrg: string;
      journalName?: string;
      submitterName?: string;
    }>> = {};

    filteredIncentiveClaims.forEach(claim => {
      // High-accuracy: Check if PDF parsing verified collaborations and stored them
      if ((claim.aiVerification as any)?.collaboratingInstitutions && Array.isArray((claim.aiVerification as any).collaboratingInstitutions) && (claim.aiVerification as any).collaboratingInstitutions.length > 0) {
        ((claim.aiVerification as any).collaboratingInstitutions as any[]).forEach((org: any) => {
          const trimmed = org.trim();
          if (trimmed) {
            if (!map[trimmed]) map[trimmed] = [];
            const links = [claim.doi, claim.scopusLink, claim.wosLink, claim.relevantLink].filter(Boolean);
            map[trimmed].push({
              type: 'claim',
              id: claim.id,
              claimId: claim.claimId,
              title: claim.paperTitle || claim.patentTitle || claim.claimType || 'Untitled',
              doi: claim.doi,
              relevantLink: claim.relevantLink || claim.scopusLink || claim.wosLink,
              linkCount: links.length,
              matchedOrg: trimmed,
              journalName: claim.journalName,
              submitterName: claim.userName,
            });
          }
        });
      } else {
        // Fallback to manual entry
        claim.authors?.forEach(author => {
          if (author.isExternal && author.organization && author.organization.trim()) {
            const org = author.organization.trim();
            if (!map[org]) map[org] = [];
            const links = [claim.doi, claim.scopusLink, claim.wosLink, claim.relevantLink].filter(Boolean);
            map[org].push({
              type: 'claim',
              id: claim.id,
              claimId: claim.claimId,
              title: claim.paperTitle || claim.patentTitle || claim.claimType || 'Untitled',
              doi: claim.doi,
              relevantLink: claim.relevantLink || claim.scopusLink || claim.wosLink,
              linkCount: links.length,
              matchedOrg: org,
              journalName: claim.journalName,
              submitterName: claim.userName,
            });
          }
        });
      }
    });

    filteredProjects.forEach(project => {
      project.coPiDetails?.forEach(copi => {
        if (copi.isExternal && copi.organization && copi.organization.trim()) {
          const org = copi.organization.trim();
          if (!map[org]) map[org] = [];
          map[org].push({
            type: 'project',
            id: project.id,
            claimId: (project as any).interestId,
            title: (project as any).callTitle || (project as any).title || 'EMR Project',
            relevantLink: (project as any).proposalUrl || (project as any).proofUrl,
            linkCount: (project as any).proposalUrl ? 1 : 0,
            matchedOrg: org,
            submitterName: (project as any).userName,
          });
        }
      });
    });

    return map;
  }, [filteredIncentiveClaims, filteredProjects]);

  // Given an AI-normalized institution name, find all matching raw-org entries
  const getDrilldownEntries = useCallback((institutionName: string) => {
    // Collect all keys in the map whose name partially matches the normalized name (case-insensitive)
    // Also match if the normalized name contains/starts with the raw org or vice versa
    const normalized = institutionName.toLowerCase();
    const results: typeof institutionDrilldownMap[string] = [];
    const seen = new Set<string>(); // dedupe by claim id

    Object.entries(institutionDrilldownMap).forEach(([rawOrg, entries]) => {
      const raw = rawOrg.toLowerCase();
      // Simple overlap: raw org words appear in normalized name or vice versa
      const rawWords = raw.split(/[\s,.-]+/).filter(w => w.length > 3);
      const isMatch = rawWords.some(w => normalized.includes(w)) || normalized.includes(raw) || raw.includes(normalized.slice(0, Math.min(normalized.length, 12)));
      if (isMatch) {
        entries.forEach(e => {
          const key = `${e.type}-${e.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push(e);
          }
        });
      }
    });
    return results;
  }, [institutionDrilldownMap]);

  // --- Top Journals Aggregation & Articles List ---
  const topJournalsData = useMemo(() => {
    const map = new Map<string, {
      journalName: string;
      count: number;
      articles: Array<{
        id: string;
        title: string;
        doi?: string;
        monthYear: string;
        puAuthors: string[];
        claimId?: string;
        scopusLink?: string;
        wosLink?: string;
        claim?: IncentiveClaim;
      }>;
    }>();

    // 1. Process Incentive Claims
    filteredIncentiveClaims.forEach(claim => {
      if (['Draft', 'Not Approved', 'Rejected'].includes(claim.status || '')) {
        return;
      }

      const rawJournal = (claim.journalName || claim.apcJournalDetails || (claim as any).journalDetails || '').trim();
      if (!rawJournal) return;

      const normalizedKey = rawJournal.toLowerCase().replace(/\s+/g, ' ');

      if (!map.has(normalizedKey)) {
        map.set(normalizedKey, {
          journalName: rawJournal,
          count: 0,
          articles: [],
        });
      }

      const group = map.get(normalizedKey)!;

      // Extract PU Internal Authors
      let puAuthors: string[] = [];
      if (Array.isArray(claim.authors) && claim.authors.length > 0) {
        const internal = claim.authors.filter(a => a.isExternal === false || (!a.isExternal && a.name));
        if (internal.length > 0) {
          puAuthors = internal.map(a => a.name);
        } else {
          puAuthors = claim.authors.map(a => a.name);
        }
      } else if (claim.userName) {
        puAuthors = [claim.userName];
      }

      const title = claim.paperTitle || claim.apcPaperTitle || claim.publicationTitle || 'Untitled Paper';

      let monthYear = 'N/A';
      if (claim.publicationMonth && claim.publicationYear) {
        monthYear = `${claim.publicationMonth} ${claim.publicationYear}`;
      } else if (claim.publicationYear) {
        monthYear = `${claim.publicationYear}`;
      } else if (claim.submissionDate) {
        try {
          monthYear = format(parseISO(claim.submissionDate), 'MMM yyyy');
        } catch {
          monthYear = 'N/A';
        }
      }

      const cleanDoi = claim.doi ? claim.doi.trim().toLowerCase() : null;
      const cleanTitle = title.trim().toLowerCase();

      // Find claim ID of primary author who filled the form first
      let primaryClaimId = claim.claimId || claim.id;
      if (claim.originalClaimId) {
        const orig = incentiveClaims.find(c => c.id === claim.originalClaimId);
        if (orig) {
          primaryClaimId = orig.claimId || orig.id;
        } else if (claim.originalClaimId) {
          primaryClaimId = claim.originalClaimId;
        }
      }

      const exists = group.articles.some(a =>
        (cleanDoi && a.doi && a.doi.trim().toLowerCase() === cleanDoi) ||
        (a.title.trim().toLowerCase() === cleanTitle)
      );

      if (!exists) {
        group.articles.push({
          id: claim.id,
          title,
          doi: claim.doi,
          monthYear,
          puAuthors,
          claimId: primaryClaimId,
          scopusLink: claim.scopusLink,
          wosLink: claim.wosLink,
          claim,
        });
        group.count = group.articles.length;
      }
    });

    // 2. Process Scopus Top Publications
    topScopusPubs.forEach(pub => {
      const rawJournal = (pub.journalName || '').trim();
      if (!rawJournal) return;

      const normalizedKey = rawJournal.toLowerCase().replace(/\s+/g, ' ');

      if (!map.has(normalizedKey)) {
        map.set(normalizedKey, {
          journalName: rawJournal,
          count: 0,
          articles: [],
        });
      }

      const group = map.get(normalizedKey)!;

      const cleanDoi = pub.doi ? pub.doi.trim().toLowerCase() : null;
      const cleanTitle = (pub.title || '').trim().toLowerCase();

      const exists = group.articles.some(a =>
        (cleanDoi && a.doi && a.doi.trim().toLowerCase() === cleanDoi) ||
        (a.title.trim().toLowerCase() === cleanTitle)
      );

      if (!exists) {
        let monthYear = pub.publicationYear || 'N/A';
        if (pub.coverDate) {
          try {
            monthYear = format(parseISO(pub.coverDate), 'MMM yyyy');
          } catch {
            monthYear = pub.publicationYear || 'N/A';
          }
        }

        let puAuthors: string[] = [];
        if (pub.authors) {
          puAuthors = pub.authors.split(',').map(s => s.trim()).filter(Boolean);
        } else {
          puAuthors = ['Parul University Researcher'];
        }

        group.articles.push({
          id: pub.eid || pub.doi || Math.random().toString(),
          title: pub.title || 'Untitled Publication',
          doi: pub.doi,
          monthYear,
          puAuthors,
          scopusLink: pub.scopusUrl,
        });
        group.count = group.articles.length;
      }
    });

    const list = Array.from(map.values());
    list.sort((a, b) => b.count - a.count);
    return list;
  }, [filteredIncentiveClaims, incentiveClaims, topScopusPubs]);

  const displayTopJournals = useMemo(() => {
    if (!topJournalSearch.trim()) return topJournalsData;
    const query = topJournalSearch.toLowerCase().trim();
    return topJournalsData.filter(j => j.journalName.toLowerCase().includes(query));
  }, [topJournalsData, topJournalSearch]);


  const monthYearOptions = useMemo(() => {
    if (scopedProjects.length === 0) return [];

    const dates = scopedProjects
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
  }, [scopedProjects]);

  const imrGrantByInstituteData = useMemo(() => {
    if (!filteredProjects) return [];

    let awardedProjects = filteredProjects.filter(p =>
      p.grant &&
      p.grant.totalAmount > 0 &&
      p.institute &&
      ['Sanctioned', 'In Progress', 'Completed'].includes(p.status)
    );

    return Object.entries(
      awardedProjects.reduce((acc, project) => {
        const groupKey = project.institute!;
        acc[groupKey] = (acc[groupKey] || 0) + project.grant!.totalAmount;
        return acc;
      }, {} as Record<string, number>)
    ).map(([institute, amount]) => ({ institute, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredProjects]);

  const handleExportImrGrants = useCallback(async () => {
    if (imrGrantByInstituteData.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Data',
        description: 'There is no IMR grant data to export.',
      });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('IMR Grants by Institute');

    worksheet.columns = [
      { header: 'Institute', key: 'institute', width: 40 },
      { header: 'Total Sanctioned Amount (INR)', key: 'amount', width: 30 },
    ];

    imrGrantByInstituteData.forEach(item => {
      worksheet.addRow(item);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const rangeSuffix = globalDateRange.start && globalDateRange.end
      ? `_${globalDateRange.start}_to_${globalDateRange.end}`
      : '';
    a.download = `IMR_Grants_By_Institute${rangeSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);

    const rangeDesc = globalDateRange.start && globalDateRange.end
      ? ` (${format(parseISO(globalDateRange.start), 'MMM yyyy')} - ${format(parseISO(globalDateRange.end), 'MMM yyyy')})`
      : '';
    toast({ title: 'Export Started', description: `Downloading grant data for ${imrGrantByInstituteData.length} institutes${rangeDesc}.` });
  }, [imrGrantByInstituteData, toast, globalDateRange]);

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
        doc.setFont("helvetica", "bold");
        doc.text(title, margin, yPos);
        yPos += 8;

        const dataUrl = await toPng(ref.current, {
          backgroundColor: imageBgColor,
          pixelRatio: 2,
          filter: (node) => {
            if (
              node.tagName === 'BUTTON' ||
              node.tagName === 'SELECT' ||
              (node.classList && (node.classList.contains('no-export') || node.classList.contains('export-btn')))
            ) {
              return false;
            }
            return true;
          }
        });
        doc.addImage(dataUrl, 'PNG', margin, yPos, contentWidth, imgHeight);
        yPos += imgHeight + 15;
      };

      const addChartAndTable = async (
        ref: React.RefObject<HTMLDivElement>,
        title: string,
        headers: string[][],
        body: any[][]
      ) => {
        if (!ref.current) return;

        const imgHeight = (ref.current.clientHeight * contentWidth) / ref.current.clientWidth;
        const estTableHeight = 15 + body.length * 7;
        const totalHeightNeeded = imgHeight + estTableHeight + 25;

        if (yPos + totalHeightNeeded > (pageHeight - margin * 2)) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(title, margin, yPos);
        yPos += 6;

        const dataUrl = await toPng(ref.current, {
          backgroundColor: imageBgColor,
          pixelRatio: 2,
          filter: (node) => {
            if (
              node.tagName === 'BUTTON' ||
              node.tagName === 'SELECT' ||
              (node.classList && (node.classList.contains('no-export') || node.classList.contains('export-btn')))
            ) {
              return false;
            }
            return true;
          }
        });
        doc.addImage(dataUrl, 'PNG', margin, yPos, contentWidth, imgHeight);
        yPos += imgHeight + 8;

        autoTable(doc, {
          startY: yPos,
          head: headers,
          body: body,
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [26, 115, 232], textColor: 255, fontStyle: 'bold' },
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
      };

      // --- PDF Header ---
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text('R&D Portal Analytics Report', pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // --- Stat Cards ---
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text('Key Metrics', margin, yPos);
      yPos += 8;
      autoTable(doc, {
        startY: yPos,
        head: [['Metric', 'Value', 'Description']],
        body: statCards.map(card => [card.title, card.value, card.description]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [26, 115, 232], textColor: 255, fontStyle: 'bold' },
      });
      yPos = (doc as any).lastAutoTable.finalY + 20;

      // --- IMR & EMR Section ---
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text('IMR & EMR Project Analytics', margin, yPos);
      yPos += 12;

      // Status Chart
      const statusTotal = statusDistributionData.reduce((sum, item) => sum + item.value, 0);
      await addChartAndTable(
        statusChartRef,
        'IMR Project Status Distribution',
        [['Status', 'Project Count', 'Percentage']],
        statusDistributionData.map(item => [
          item.name,
          item.value.toString(),
          statusTotal > 0 ? `${((item.value / statusTotal) * 100).toFixed(1)}%` : '0.0%'
        ])
      );

      // Project Type Chart
      const typeTotal = projectTypeDistributionData.reduce((sum, item) => sum + item.value, 0);
      await addChartAndTable(
        projectTypeChartRef,
        'IMR Projects by Type',
        [['Disciplinary Category', 'Project Count', 'Percentage']],
        projectTypeDistributionData.map(item => [
          item.name,
          item.value.toString(),
          typeTotal > 0 ? `${((item.value / typeTotal) * 100).toFixed(1)}%` : '0.0%'
        ])
      );

      // Submissions over time
      await addChartAndTable(
        submissionsTimeChartRef,
        'IMR Submissions Over Time',
        [['Month', 'Submissions Count']],
        submissionsData.map(item => [item.month, item.submissions.toString()])
      );

      // Yearly submissions/sanctions
      await addChartAndTable(
        submissionsYearChartRef,
        globalDateRange.start && globalDateRange.end ? 'Monthly IMR Submissions & Sanctions' : 'Yearly IMR Submissions & Sanctions',
        [[globalDateRange.start && globalDateRange.end ? 'Month' : 'Year', 'Submissions Count', 'Sanctions Count']],
        submissionsByYearData.map(item => [
          item.year.toString(),
          item.submissions.toString(),
          item.sanctions.toString()
        ])
      );

      await addChartAndTable(
        projectsByGroupChartRef,
        `Projects by ${aggregationLabel}`,
        [[aggregationLabel, 'Project Count']],
        projectsByGroupData.map((item: any) => [item.group, item.projects.toString()])
      );

      // Funding agencies
      await addChartAndTable(
        fundingByAgencyChartRef,
        'Top 5 EMR Funding Agencies',
        [['Funding Agency', 'Sanctioned Amount']],
        fundingByAgencyData.map(item => [item.agency, `₹${item.amount.toLocaleString('en-IN')}`])
      );

      // Institute grants
      await addChartAndTable(
        imrGrantByInstituteChartRef,
        'IMR Grant Amount by Institute',
        [['Institute', 'Sanctioned Amount']],
        imrGrantByInstituteData.map(item => [item.institute, `₹${item.amount.toLocaleString('en-IN')}`])
      );

      // --- Publication & Incentive Section ---
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text('Publication & Incentive Analytics', margin, yPos);
      yPos += 12;

      // --- Institute / Faculty / Department Incentive Claim Summary in PDF ---
      if (incentiveGroupData.length > 0) {
        let groupLabel = 'Institute';
        if (activeGroupType === 'faculty') groupLabel = 'Faculty';
        else if (activeGroupType === 'department') groupLabel = 'Department';

        const groupHeaders = [[groupLabel, 'Claims Count', 'Approved Amount']];
        const groupBody = incentiveGroupData.map(item => [
          item.name,
          item.count.toString(),
          `₹${item.amount.toLocaleString('en-IN')}`
        ]);
        groupBody.push([
          'Total',
          grandTotalGroup.count.toString(),
          `₹${grandTotalGroup.amount.toLocaleString('en-IN')}`
        ]);

        await addChartAndTable(
          incentiveGroupChartRef,
          `${groupLabel} Wise Incentive Claims Summary`,
          groupHeaders,
          groupBody
        );
      }

      // Incentive Category Chart
      const incTotal = incentiveAmountData.reduce((sum, item) => sum + item.value, 0);
      await addChartAndTable(
        incentiveAmountChartRef,
        'Incentive Amounts by Category',
        [['Incentive Category', 'Approved Amount', 'Percentage']],
        incentiveAmountData.map(item => [
          item.name,
          `₹${item.value.toLocaleString('en-IN')}`,
          incTotal > 0 ? `${((item.value / incTotal) * 100).toFixed(1)}%` : '0.0%'
        ])
      );

      // Journal Quartile Chart
      const qTotal = quarterlyDistributionData.reduce((sum, item) => sum + item.count, 0);
      await addChartAndTable(
        publicationChartRef,
        'Publications by Journal Quartile',
        [['Journal Quartile', 'Publication Count', 'Percentage']],
        quarterlyDistributionData.map(item => [
          item.quartile,
          item.count.toString(),
          qTotal > 0 ? `${((item.count / qTotal) * 100).toFixed(1)}%` : '0.0%'
        ])
      );

      // Monthly publications
      await addChartAndTable(
        monthlyPublicationChartRef,
        'Monthly Publication Distribution',
        [['Month', 'Publication Count']],
        monthlyDistributionData.map(item => [item.month, item.count.toString()])
      );

      // Stage 1 Approver performance
      await addChartAndTable(
        stage1ApproverChartRef,
        'Stage 1 Approver Performance',
        [['Stage 1 Approver Name', 'Applications Reviewed']],
        stage1ApproverData.map(item => [item.name, item.count.toString()])
      );

      // Average Wait Time
      await addChartAndTable(
        waitTimeChartRef,
        'Average Wait Time by Stage',
        [['Workflow Stage', 'Average Wait Time', 'Processed Count']],
        averageStageWaitTimesData.map(item => [item.stage, `${item.days} days`, item.count.toString()])
      );

      // Submissions vs Approvals
      await addChartAndTable(
        submissionVsApprovalChartRef,
        'Incentive Submissions vs. Approvals',
        [['Month', 'Submitted Claims', 'Approved Claims']],
        submissionsVsApprovalsData.map(item => [item.month, item.submissions.toString(), item.approvals.toString()])
      );

      // Collaboration Profile
      const colTotal = interdisciplinaryData.chartData.reduce((sum, item) => sum + item.value, 0);
      await addChartAndTable(
        collaborationChartRef,
        'Research Collaboration Profile',
        [['Collaboration Profile', 'Count', 'Percentage']],
        interdisciplinaryData.chartData.map(item => [
          item.name,
          item.value.toString(),
          colTotal > 0 ? `${((item.value / colTotal) * 100).toFixed(1)}%` : '0.0%'
        ])
      );

      // Auto-Calc Accuracy
      if (autoCalcStats.totalClaims > 0) {
        await addImageToPdf(autoCalcAccuracyChartRef, 'Auto-Calculation Accuracy & Performance');

        // Global Table
        if (yPos > 240) { doc.addPage(); yPos = 20; }
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text('Global Auto-Calculation Performance', margin, yPos);
        yPos += 6;

        autoTable(doc, {
          startY: yPos,
          head: [['Verification Type', 'Claim Count', 'Percentage']],
          body: [
            ['System Auto-Calculation Matched', autoCalcStats.exactMatches.toString(), `${autoCalcStats.accuracyRate}%`],
            ['Manually Adjusted', autoCalcStats.manualAdjustments.toString(), `${autoCalcStats.adjustmentRate}%`]
          ],
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [26, 115, 232], textColor: 255, fontStyle: 'bold' },
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;

        // Category-wise Table
        if (yPos > 240) { doc.addPage(); yPos = 20; }
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text('Category-Wise Auto-Calculation Accuracy', margin, yPos);
        yPos += 6;

        autoTable(doc, {
          startY: yPos,
          head: [['Claim Category', 'Matches', 'Total Claims', 'Accuracy Rate (%)']],
          body: autoCalcStats.categoryAccuracyList.map(item => [
            item.category,
            item.exactMatches.toString(),
            item.totalClaims.toString(),
            `${item.accuracyRate}%`
          ]),
          theme: 'grid',
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [26, 115, 232], textColor: 255, fontStyle: 'bold' },
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;
      }

      // ROI Analysis
      await addChartAndTable(
        researchRoiChartRef,
        'Research Productivity & ROI Analysis',
        [['Group', 'Total Funding (Lakhs INR)', 'Outputs Count']],
        researchRoiData.map(item => [item.group, `₹${item.funds.toLocaleString('en-IN')}L`, item.output.toString()])
      );

      // Emerging Topics
      await addChartAndTable(
        emergingTopicsChartRef,
        'Emerging Research Topics Explorer',
        [['Research Subdomain', 'Parent Domain', 'Publication Count']],
        emergingTopicsFlatData.map(item => [item.name, item.domain, item.value.toString()])
      );

      // --- System & AI Section (if applicable) ---
      if (user?.role === 'Super-admin') {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text('System & AI Analytics', margin, yPos);
        yPos += 12;

        // Domains
        await addChartAndTable(
          fieldOfStudyChartRef,
          'Field of Studies by Domain',
          [['Field of Study Domain', 'Claim Count']],
          fieldOfStudyData.map(item => [item.field, item.count.toString()])
        );

        // Subdomains
        await addChartAndTable(
          fieldOfStudySubdomainChartRef,
          'Top Subdomains',
          [['Research Subdomain', 'Claim Count']],
          fieldOfStudySubdomainData.map(item => {
            const parts = item.subdomain.split(' • ');
            return [parts[1] || parts[0], item.count.toString()];
          })
        );

        // Active Users
        await addChartAndTable(
          activeUsersChartRef,
          'Daily Active Users',
          [['Date', 'Unique Active Users']],
          dailyActiveUsersData.map(item => [item.date, item.users.toString()])
        );

        // Drilldown
        if (fieldOfStudyDrilldown.length > 0) {
          if (yPos > 240) { doc.addPage(); yPos = 20; }
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.text('Claim-Level Domain Drilldown', margin, yPos);
          yPos += 8;
          autoTable(doc, {
            startY: yPos,
            head: [['Claim ID', 'Title', 'Domain', 'Subdomain', 'Confidence']],
            body: fieldOfStudyDrilldown.map(row => [row.claimId, row.title, row.domain, row.subdomain, `${row.confidence}%`]),
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [26, 115, 232], textColor: 255, fontStyle: 'bold' },
            columnStyles: { 1: { cellWidth: 80 } },
          });
          yPos = (doc as any).lastAutoTable.finalY + 15;
        }
      }



      // --- Add page numbers ---
      const pageCount = doc.internal.pages.length - 1;
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

  const handleExportGroupExcel = useCallback(async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Incentive Claims Summary");

      // Set up title & description rows
      let label = 'Institute';
      if (activeGroupType === 'faculty') label = 'Faculty';
      else if (activeGroupType === 'department') label = 'Department';
      worksheet.addRow([`${label} Wise Incentive Claims Summary`]);
      worksheet.addRow([`Report Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`]);
      worksheet.addRow([`Filtering: Finally Accepted Claims Only`]);
      worksheet.addRow([]); // Blank row

      // Headers start at row 5
      const headers = [label, 'Claims Count', 'Approved Amount'];
      const headerRow = worksheet.addRow(headers);

      // Stylize headers
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E3A8A' } // Deep blue background
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
      worksheet.getRow(5).height = 24;

      // Add data rows
      incentiveGroupData.forEach(item => {
        worksheet.addRow([item.name, item.count, item.amount]);
      });

      // Add grand total row
      const grandTotalRow = ['Total', grandTotalGroup.count, grandTotalGroup.amount];
      worksheet.addRow(grandTotalRow);

      // Formatting cells (row 6 to last row)
      const lastRowIndex = worksheet.rowCount;

      for (let r = 6; r <= lastRowIndex; r++) {
        const row = worksheet.getRow(r);
        const isGrandTotal = r === lastRowIndex;

        row.eachCell((cell, colIndex) => {
          const isLabelCol = colIndex === 1;
          const isCountCol = colIndex === 2;
          const isAmountCol = colIndex === 3;

          cell.alignment = {
            vertical: 'middle',
            horizontal: isLabelCol ? 'left' : 'center'
          };

          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };

          if (isGrandTotal) {
            cell.font = { bold: true };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFE0E7FF' } // Indigo light accent
            };
          }

          if (isAmountCol && typeof cell.value === 'number') {
            cell.numFmt = '"₹"##,##,##0';
          }
        });
      }

      // Auto-fit column widths
      (worksheet.columns as any[]).forEach((column: any, colIdx: number) => {
        let maxLen = 0;
        if (column && typeof column.eachCell === 'function') {
          column.eachCell({ includeEmpty: true }, (cell: any) => {
            const val = cell.value ? cell.value.toString() : '';
            if (cell.row && (typeof cell.row === 'number' ? cell.row > 4 : (cell.row.number && cell.row.number > 4))) {
              if (val.length > maxLen) maxLen = val.length;
            }
          });
        }
        column.width = colIdx === 0 ? Math.max(maxLen + 3, 30) : Math.max(maxLen + 4, 16);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Incentive_Claims_Summary_by_${label}_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({ title: "Export Succeeded", description: "The Excel summary has been downloaded." });
    } catch (err: any) {
      console.error("Export summary failed:", err);
      toast({ variant: 'destructive', title: "Export Failed", description: err.message || "An error occurred during Excel export." });
    }
  }, [activeGroupType, incentiveGroupData, grandTotalGroup, toast]);


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
    const logsCollection = collection(db, 'system_logs');
    let projectsQuery, emrQuery, claimsQuery;

    const sevenDaysAgo = startOfDay(subDays(new Date(), 6));
    // Query using the Date object (sevenDaysAgo) instead of the ISO string to match Firestore's Timestamp type
    const logsQuery = query(logsCollection, where('message', '==', 'User logged in'), where('timestamp', '>=', sevenDaysAgo));

    const isPrincipal = user.designation === 'Principal';
    const isCro = user.role === 'CRO';
    const isHod = user.designation === 'HOD';
    const isSpecialPitUser = user.email === 'pit@paruluniversity.ac.in';
    const isGoaHead = user.designation === 'Head of Goa Campus';
    const isAuthority =
      (user.authorityFaculties && user.authorityFaculties.length > 0) ||
      (user.authorityInstitutes && user.authorityInstitutes.length > 0) ||
      (user.authorityDepartments && user.authorityDepartments.length > 0);

    const callsCollection = collection(db, 'fundingCalls');
    const callsQuery = query(callsCollection);

    if (isCro && user.faculties && user.faculties.length > 0) {
      projectsQuery = query(projectsCollection, where('faculty', 'in', user.faculties));
      emrQuery = query(emrCollection, where('faculty', 'in', user.faculties));
      claimsQuery = query(claimsCollection, where('faculty', 'in', user.faculties));
    } else if (isAuthority) {
      if (user.authorityFaculties && user.authorityFaculties.length > 0) {
        projectsQuery = query(projectsCollection, where('faculty', 'in', user.authorityFaculties));
        emrQuery = query(emrCollection, where('faculty', 'in', user.authorityFaculties));
        claimsQuery = query(claimsCollection, where('faculty', 'in', user.authorityFaculties));
      } else if (user.authorityInstitutes && user.authorityInstitutes.length > 0) {
        projectsQuery = query(projectsCollection, where('institute', 'in', user.authorityInstitutes));
        emrQuery = query(emrCollection, where('institute', 'in', user.authorityInstitutes));
        claimsQuery = query(claimsCollection, where('faculty', '==', user.faculty || ''));
      } else if (user.authorityDepartments && user.authorityDepartments.length > 0) {
        projectsQuery = query(projectsCollection, where('departmentName', 'in', user.authorityDepartments));
        emrQuery = query(emrCollection, where('department', 'in', user.authorityDepartments));
        claimsQuery = query(claimsCollection, where('faculty', '==', user.faculty || ''));
      } else {
        projectsQuery = query(projectsCollection);
        emrQuery = query(emrCollection);
        claimsQuery = query(claimsCollection);
      }
    } else if (isGoaHead) {
      projectsQuery = query(projectsCollection, where('campus', '==', 'Goa'));
      emrQuery = query(emrCollection, where('campus', '==', 'Goa'));
      claimsQuery = query(claimsCollection, where('campus', '==', 'Goa'));
    } else if (isHod && user.department && user.institute) {
      projectsQuery = query(projectsCollection, where('departmentName', '==', user.department), where('institute', '==', user.institute));
      emrQuery = query(emrCollection, where('department', '==', user.department));
      claimsQuery = query(claimsCollection, where('faculty', '==', user.faculty)); // HODs are faculty-scoped for claims
    } else if (isSpecialPitUser) {
      projectsQuery = query(projectsCollection, where('institute', 'in', ['Parul Institute of Technology', 'Parul Institute of Technology-Diploma studies']));
      emrQuery = query(emrCollection, where('institute', 'in', ['Parul Institute of Technology', 'Parul Institute of Technology-Diploma studies']));
      claimsQuery = query(claimsCollection, where('faculty', '==', 'Faculty of Engineering & Technology'));
    } else if (isPrincipal && user.institute) {
      projectsQuery = query(projectsCollection, where('institute', '==', user.institute));
      emrQuery = query(emrCollection, where('faculty', '==', user.faculty));
      claimsQuery = query(claimsCollection, where('faculty', '==', user.faculty));
    } else {
      projectsQuery = query(projectsCollection);
      emrQuery = query(emrCollection);
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

    const usersCollection = collection(db, 'users');
    const unsubscribeUsers = onSnapshot(usersCollection, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), uid: doc.id } as any as User)));
    }, (error) => { console.error("Error fetching users in analytics:", error); });

    const unsubscribeProjects = onSnapshot(projectsQuery, (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
      setLoading(false);
    }, (error) => { console.error("Error fetching project data:", error); setLoading(false); });

    const unsubscribeEmr = onSnapshot(emrQuery, (snapshot) => {
      setEmrProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest)));
    }, (error) => { console.error("Error fetching EMR data:", error); });

    const unsubscribeCalls = onSnapshot(callsQuery, (snapshot) => {
      setFundingCalls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall)));
    }, (error) => { console.error("Error fetching funding calls in analytics:", error); });

    // Fetch incentive claims via server action
    fetchAllClaimsAction(user).then(claims => {
      setIncentiveClaims(claims);
    }).catch(err => console.error("Error fetching claims in analytics:", err));

    // Fetch cached collaborations
    getCachedCollaborationsAction().then(res => {
      if (res.success && res.institutes) {
        setCollaborationInstitutes(res.institutes);
      }
    }).catch(err => console.error("Error fetching cached collaborations:", err));

    let unsubscribeLogs = () => { };
    if (user.role === 'Super-admin') {
      const source = process.env.NEXT_PUBLIC_LOGS_SOURCE || 'firestore';
      if (source === 'firestore') {
        unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
          setLoginLogs(snapshot.docs.map(doc => {
            const data = doc.data();
            let dateValue: Date;
            if (data.timestamp && typeof data.timestamp.toDate === 'function') {
              dateValue = data.timestamp.toDate();
            } else if (data.timestamp instanceof Date) {
              dateValue = data.timestamp;
            } else if (typeof data.timestamp === 'string' || typeof data.timestamp === 'number') {
              dateValue = new Date(data.timestamp);
            } else {
              dateValue = new Date();
            }
            return {
              id: doc.id,
              ...data,
              timestamp: dateValue.toISOString()
            };
          }));
        }, (error) => { console.error("Error fetching log data:", error); });
      } else {
        const logsRef = rtdbRef(db_rtdb, 'system_logs');
        unsubscribeLogs = rtdbOnValue(logsRef, (snapshot) => {
          if (snapshot.exists()) {
            const val = snapshot.val();
            const loadedLogs = Object.entries(val).map(([id, data]: any) => ({
              id,
              ...data,
            }));
            const filtered = loadedLogs.filter((log: any) => {
              if (log.message !== 'User logged in') return false;
              if (!log.timestamp) return false;
              return log.timestamp >= sevenDaysAgo.toISOString();
            });
            setLoginLogs(filtered);
          } else {
            setLoginLogs([]);
          }
        }, (error) => {
          console.error("Error fetching RTDB logs in analytics:", error);
        });
      }
    }

    return () => {
      unsubscribeProjects();
      unsubscribeEmr();
      unsubscribeLogs();
      unsubscribeUsers();
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



  useEffect(() => {
    if (scopedProjects.length > 0) {
      const years = new Set(
        scopedProjects.map(p => getYear(parseISO(p.submissionDate)))
      );
      setAvailableYears(Array.from(years).sort((a, b) => b - a).map(String));
    }
  }, [scopedProjects]);



  const grantYearOptions = useMemo(() => {
    const years = ['all', '25-26'];
    if (availableYears.length > 0) {
      years.push(...availableYears);
    }
    return [...new Set(years)]; // Remove duplicates
  }, [availableYears]);



  const submissionsData = useMemo(() => {
    const freshProjects = filteredProjects.filter(p => p.status !== 'Revision Submitted');

    if (globalDateRange.start && globalDateRange.end) {
      const startDate = startOfMonth(parseISO(globalDateRange.start));
      const endDate = endOfMonth(parseISO(globalDateRange.end));

      const months: { name: string; start: Date; end: Date }[] = [];
      let current = startDate;
      let countLimit = 0;
      while (current <= endDate && countLimit < 120) {
        months.push({
          name: format(current, 'MMM yyyy'),
          start: startOfMonth(current),
          end: endOfMonth(current)
        });
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        countLimit++;
      }

      return months.map(month => {
        const count = freshProjects.filter(p => {
          const submissionDate = parseISO(p.submissionDate);
          return submissionDate >= month.start && submissionDate <= month.end;
        }).length;
        return { month: month.name, submissions: count };
      });
    }

    if (timeRange === 'last6months') {
      const last6Months = Array.from({ length: 6 }, (_, i) => {
        const d = subMonths(new Date(), i);
        return { name: format(d, 'MMM'), start: startOfMonth(d), end: endOfMonth(d) };
      }).reverse();

      return last6Months.map(month => {
        const count = freshProjects.filter(p => {
          const submissionDate = parseISO(p.submissionDate);
          return submissionDate >= month.start && submissionDate <= month.end;
        }).length;
        return { month: month.name, submissions: count };
      });
    }

    const year = parseInt(timeRange, 10);
    const months = Array.from({ length: 12 }, (_, i) => format(new Date(year, i, 1), 'MMM'));
    return months.map((monthName, monthIndex) => {
      const count = freshProjects.filter(p => {
        const submissionDate = parseISO(p.submissionDate);
        return getYear(submissionDate) === year && submissionDate.getMonth() === monthIndex;
      }).length;
      return { month: monthName, submissions: count };
    });

  }, [filteredProjects, timeRange, globalDateRange]);

  const submissionsConfig = {
    submissions: { label: 'Submissions', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  const sanctionsConfig = {
    sanctions: { label: 'Sanctions', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  const submissionsVsSanctionsConfig = {
    submissions: { label: 'Submissions', color: 'hsl(var(--primary))' },
    sanctions: { label: 'Sanctions', color: 'hsl(142.1 76.2% 36.3%)' },
  } satisfies ChartConfig;

  const submissionsByYearData = useMemo(() => {
    if (filteredProjects.length === 0) return [];

    if (globalDateRange.start && globalDateRange.end) {
      const startDate = startOfMonth(parseISO(globalDateRange.start));
      const endDate = endOfMonth(parseISO(globalDateRange.end));

      const months: { name: string; start: Date; end: Date }[] = [];
      let current = startDate;
      let countLimit = 0;
      while (current <= endDate && countLimit < 120) {
        months.push({
          name: format(current, 'MMM yyyy'),
          start: startOfMonth(current),
          end: endOfMonth(current)
        });
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        countLimit++;
      }

      return months.map(month => {
        const submissionsCount = filteredProjects.filter(p => {
          const submissionDate = parseISO(p.submissionDate);
          return submissionDate >= month.start && submissionDate <= month.end && p.status !== 'Revision Submitted';
        }).length;

        const sanctionsCount = filteredProjects.filter(p => {
          const submissionDate = parseISO(p.submissionDate);
          return submissionDate >= month.start && submissionDate <= month.end &&
            ['Sanctioned', 'In Progress', 'Completed'].includes(p.status) && p.grant;
        }).length;

        return { year: month.name, submissions: submissionsCount, sanctions: sanctionsCount };
      });
    }

    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 5;

    const data: Record<string, { year: string; submissions: number; sanctions: number }> = {};
    for (let year = startYear; year <= currentYear; year++) {
      data[year] = { year: year.toString(), submissions: 0, sanctions: 0 };
    }

    filteredProjects.forEach(p => {
      const year = getYear(parseISO(p.submissionDate));
      if (year >= startYear && year <= currentYear) {
        if (p.status !== 'Revision Submitted') {
          data[year].submissions += 1;
        }
        if (['Sanctioned', 'In Progress', 'Completed'].includes(p.status) && p.grant) {
          data[year].sanctions += 1;
        }
      }
    });

    return Object.values(data).sort((a, b) => parseInt(a.year) - parseInt(b.year));
  }, [filteredProjects, globalDateRange]);

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
      .sort((a: any, b: any) => b.projects - a.projects);
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

  const emrAnalyticsData = useMemo(() => {
    // Status distribution for EMR
    const statusCounts: Record<string, number> = {};
    filteredEmrProjects.forEach(p => {
      const st = p.status || 'Registered';
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    });

    const statusChartData = Object.entries(statusCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const statusChartConfig: ChartConfig = {};
    statusChartData.forEach((item, index) => {
      statusChartConfig[item.name] = {
        label: item.name,
        color: COLORS[index % COLORS.length],
      };
    });

    // Submissions vs Sanctions over years for EMR
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 5;
    const yearlyMap: Record<string, { year: string; registrations: number; sanctions: number }> = {};

    for (let yr = startYear; yr <= currentYear; yr++) {
      yearlyMap[yr] = { year: yr.toString(), registrations: 0, sanctions: 0 };
    }

    filteredEmrProjects.forEach(p => {
      const regDateStr = p.registeredAt || p.proposalSubmissionDate;
      if (regDateStr) {
        const yr = getYear(parseISO(regDateStr));
        if (yr >= startYear && yr <= currentYear) {
          yearlyMap[yr].registrations += 1;
        }
      }
      if (p.status === 'Sanctioned' || p.status === 'Process Complete') {
        const sancDateStr = p.sanctionDate || regDateStr;
        if (sancDateStr) {
          const yr = getYear(parseISO(sancDateStr));
          if (yr >= startYear && yr <= currentYear) {
            yearlyMap[yr].sanctions += 1;
          }
        }
      }
    });

    const submissionsVsSanctionsData = Object.values(yearlyMap).sort((a, b) => parseInt(a.year) - parseInt(b.year));

    // Agency summary table & chart
    const agencyMap: Record<string, { agency: string; callCount: number; regCount: number; sanctionedCount: number; amount: number }> = {};

    fundingCalls.forEach(call => {
      const ag = call.agency || 'Other';
      if (!agencyMap[ag]) {
        agencyMap[ag] = { agency: ag, callCount: 0, regCount: 0, sanctionedCount: 0, amount: 0 };
      }
      agencyMap[ag].callCount += 1;
    });

    filteredEmrProjects.forEach(p => {
      const ag = p.agency || 'Other';
      if (!agencyMap[ag]) {
        agencyMap[ag] = { agency: ag, callCount: 0, regCount: 0, sanctionedCount: 0, amount: 0 };
      }
      agencyMap[ag].regCount += 1;
      if (p.status === 'Sanctioned' || p.status === 'Process Complete') {
        agencyMap[ag].sanctionedCount += 1;
        if (p.durationAmount) {
          const match = p.durationAmount.match(/Amount:\s*([\d,]+)/);
          if (match) {
            agencyMap[ag].amount += parseInt(match[1].replace(/,/g, ''), 10);
          }
        }
      }
    });

    const agencyData = Object.values(agencyMap)
      .filter(item => item.callCount > 0 || item.regCount > 0 || item.amount > 0)
      .sort((a, b) => b.regCount - a.regCount);

    const totalRecommended = filteredEmrProjects.filter(p => ['Recommended', 'Endorsement Signed', 'Submitted to Agency'].includes(p.status)).length;
    const totalSanctioned = filteredEmrProjects.filter(p => ['Sanctioned', 'Process Complete'].includes(p.status)).length;
    const totalSanctionedAmt = agencyData.reduce((sum, item) => sum + item.amount, 0);

    return {
      statusChartData,
      statusChartConfig,
      submissionsVsSanctionsData,
      agencyData,
      summary: {
        totalCalls: fundingCalls.length,
        totalAnnouncedCalls: fundingCalls.filter(c => c.isAnnounced).length,
        totalRegistrations: filteredEmrProjects.length,
        totalRecommended,
        totalSanctioned,
        totalSanctionedAmt,
      }
    };
  }, [filteredEmrProjects, fundingCalls]);


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
    const claimsByCategory = filteredIncentiveClaims
      .reduce((acc, claim) => {
        let type = claim.claimType || 'Other';
        if (type === 'Books') {
          type = claim.bookApplicationType || 'Book';
        }
        const parsedAmt = Number(claim.finalApprovedAmount || 0);
        if (parsedAmt > 0) {
          acc[type] = (acc[type] || 0) + parsedAmt;
        }
        return acc;
      }, {} as Record<string, number>);

    const chartData = Object.entries(claimsByCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const totalAmount = chartData.reduce((sum, item) => sum + item.value, 0);

    return { incentiveAmountData: chartData, totalIncentiveAmount: totalAmount };
  }, [filteredIncentiveClaims]);

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
    // Filter research paper claims with publication data (Stage 3 and further stage approved claims only)
    const researchPaperClaims = filteredIncentiveClaims.filter(
      claim => claim.claimType === 'Research Papers' &&
        claim.journalClassification &&
        claim.publicationMonth &&
        claim.publicationYear &&
        ['Pending Stage 3 Approval', 'Pending Stage 4 Approval', 'Accepted', 'Submitted to Accounts', 'Payment Completed'].includes(claim.status)
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

  const stage1ApproverData = useMemo(() => {
    const approverCounts: Record<string, number> = {};
    filteredIncentiveClaims.forEach(claim => {
      const stage1 = claim.approvals?.find(a => a?.stage === 1);
      if (stage1 && stage1.approverName) {
        const name = stage1.approverName;
        approverCounts[name] = (approverCounts[name] || 0) + 1;
      }
    });

    return Object.entries(approverCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredIncentiveClaims]);

  const getDaysDifference = (startStr: string | undefined, endStr: string | undefined) => {
    if (!startStr) return null;
    const start = new Date(startStr);
    const end = endStr ? new Date(endStr) : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffTime = end.getTime() - start.getTime();
    return Math.max(0, diffTime / (1000 * 60 * 60 * 24));
  };

  const averageStageWaitTimesData = useMemo(() => {
    const stageTimes: Record<string, number[]> = {
      'Stage 1 Approver': [],
      'Stage 2 Approver': [],
      'Stage 3 Approver': [],
      'Stage 4 Approver': [],
    };

    filteredIncentiveClaims.forEach(claim => {
      if (!claim.submissionDate || claim.status === 'Draft') return;

      const s1 = claim.approvals?.find(a => a?.stage === 1);
      const s2 = claim.approvals?.find(a => a?.stage === 2);
      const s3 = claim.approvals?.find(a => a?.stage === 3);
      const s4 = claim.approvals?.find(a => a?.stage === 4);

      // Stage 1 Wait Time
      if (claim.status === 'Pending Stage 1 Approval' || claim.status === 'Pending') {
        const days = getDaysDifference(claim.submissionDate, undefined);
        if (days !== null) stageTimes['Stage 1 Approver'].push(days);
      } else if (s1?.timestamp) {
        const days = getDaysDifference(claim.submissionDate, s1.timestamp);
        if (days !== null) stageTimes['Stage 1 Approver'].push(days);
      }

      // Stage 2 Wait Time
      if (s1?.timestamp) {
        if (claim.status === 'Pending Stage 2 Approval') {
          const days = getDaysDifference(s1.timestamp, undefined);
          if (days !== null) stageTimes['Stage 2 Approver'].push(days);
        } else if (s2?.timestamp) {
          const days = getDaysDifference(s1.timestamp, s2.timestamp);
          if (days !== null) stageTimes['Stage 2 Approver'].push(days);
        }
      }

      // Stage 3 Wait Time
      if (s2?.timestamp) {
        if (claim.status === 'Pending Stage 3 Approval') {
          const days = getDaysDifference(s2.timestamp, undefined);
          if (days !== null) stageTimes['Stage 3 Approver'].push(days);
        } else if (s3?.timestamp) {
          const days = getDaysDifference(s2.timestamp, s3.timestamp);
          if (days !== null) stageTimes['Stage 3 Approver'].push(days);
        }
      }

      // Stage 4 Wait Time
      if (s3?.timestamp) {
        if (claim.status === 'Pending Stage 4 Approval') {
          const days = getDaysDifference(s3.timestamp, undefined);
          if (days !== null) stageTimes['Stage 4 Approver'].push(days);
        } else if (s4?.timestamp) {
          const days = getDaysDifference(s3.timestamp, s4.timestamp);
          if (days !== null) stageTimes['Stage 4 Approver'].push(days);
        }
      }
    });

    return Object.entries(stageTimes).map(([stage, times]) => {
      const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      return {
        stage,
        days: parseFloat(avg.toFixed(1)),
        count: times.length,
      };
    });
  }, [filteredIncentiveClaims]);

  const waitTimeChartConfig = {
    days: {
      label: 'Average Wait Time (Days)',
      color: 'hsl(var(--destructive))',
    },
  } satisfies ChartConfig;

  const submissionsVsApprovalsData = useMemo(() => {
    const monthlyStats: Record<string, { submissions: number; approvals: number; date: Date }> = {};

    filteredIncentiveClaims.forEach(claim => {
      // 1. Process Submissions
      if (claim.submissionDate && claim.status !== 'Draft') {
        const subDate = new Date(claim.submissionDate);
        if (!isNaN(subDate.getTime())) {
          const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][subDate.getMonth()];
          const key = `${monthName} ${subDate.getFullYear()}`;
          if (!monthlyStats[key]) {
            monthlyStats[key] = { submissions: 0, approvals: 0, date: new Date(subDate.getFullYear(), subDate.getMonth(), 1) };
          }
          monthlyStats[key].submissions += 1;
        }
      }

      // 2. Process Approvals (Stage 4 approved ones)
      const s4Approval = claim.approvals?.find(a => a?.stage === 4 && a?.status === 'Approved');
      if (s4Approval?.timestamp) {
        const appDate = new Date(s4Approval.timestamp);
        if (!isNaN(appDate.getTime())) {
          const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][appDate.getMonth()];
          const key = `${monthName} ${appDate.getFullYear()}`;
          if (!monthlyStats[key]) {
            monthlyStats[key] = { submissions: 0, approvals: 0, date: new Date(appDate.getFullYear(), appDate.getMonth(), 1) };
          }
          monthlyStats[key].approvals += 1;
        }
      }
    });

    // Sort chronologically
    return Object.entries(monthlyStats)
      .map(([month, data]) => ({
        month,
        submissions: data.submissions,
        approvals: data.approvals,
        date: data.date,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [filteredIncentiveClaims]);

  const subVsAppChartConfig = {
    submissions: {
      label: 'Submitted Claims',
      color: 'hsl(var(--primary))',
    },
    approvals: {
      label: 'Approved',
      color: 'hsl(142.1 76.2% 36.3%)',
    },
  } satisfies ChartConfig;

  const researchRoiData = useMemo(() => {
    const roiMap: Record<string, { group: string; funds: number; output: number }> = {};

    const getKey = (item: any, isProject = false) => {
      if (projectsByGroupType === 'imr' || isProject) {
        return item[aggregationKey as keyof typeof item] as string | undefined;
      }
      return item[aggregationKey === 'departmentName' ? 'department' : aggregationKey] as string | undefined;
    };

    // 1. Process IMR projects (funding)
    filteredProjects.forEach(project => {
      const groupKey = getKey(project, true);
      if (!groupKey) return;

      if (!roiMap[groupKey]) {
        roiMap[groupKey] = { group: groupKey, funds: 0, output: 0 };
      }

      if (project.grant && project.grant.totalAmount > 0 && ['Sanctioned', 'In Progress', 'Completed'].includes(project.status)) {
        roiMap[groupKey].funds += project.grant.totalAmount / 100000;
      }
    });

    // 2. Process EMR projects (funding)
    filteredEmrProjects.forEach(project => {
      const groupKey = getKey(project, false);
      if (!groupKey) return;

      if (!roiMap[groupKey]) {
        roiMap[groupKey] = { group: groupKey, funds: 0, output: 0 };
      }

      const amountMatch = project.durationAmount?.match(/Amount:\s*([\d,]+)/);
      if (amountMatch) {
        const amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
        roiMap[groupKey].funds += amount / 100000;
      }
    });

    // 3. Process Incentive Claims (incentive funding and output counts)
    filteredIncentiveClaims.forEach(claim => {
      let groupKey = claim.faculty || '';
      if (aggregationKey === 'institute') {
        const claimUser = users.find(u => u.uid === claim.uid);
        groupKey = claimUser?.institute || '';
      } else if (aggregationKey === 'departmentName') {
        const claimUser = users.find(u => u.uid === claim.uid);
        groupKey = claimUser?.department || '';
      }

      if (!groupKey) return;

      if (!roiMap[groupKey]) {
        roiMap[groupKey] = { group: groupKey, funds: 0, output: 0 };
      }

      const claimApprovedAmt = Number(claim.finalApprovedAmount || 0);
      if (claimApprovedAmt > 0) {
        roiMap[groupKey].funds += claimApprovedAmt / 100000;
      }

      if (['Research Papers', 'Patents', 'Books'].includes(claim.claimType) && claim.status !== 'Draft' && claim.status !== 'Not Approved') {
        roiMap[groupKey].output += 1;
      }
    });

    return Object.values(roiMap)
      .sort((a, b) => b.funds - a.funds)
      .map(item => ({
        ...item,
        funds: parseFloat(item.funds.toFixed(2)),
      }));
  }, [filteredProjects, filteredEmrProjects, filteredIncentiveClaims, aggregationKey, users, projectsByGroupType]);

  const roiKpiStats = useMemo(() => {
    const q1Claims = filteredIncentiveClaims.filter(claim =>
      claim.claimType === 'Research Papers' &&
      claim.journalClassification === 'Q1' &&
      Number(claim.finalApprovedAmount || 0) > 0
    );
    const totalQ1Amount = q1Claims.reduce((sum, c) => sum + Number(c.finalApprovedAmount || 0), 0);
    const avgCostPerQ1 = q1Claims.length > 0 ? Math.round(totalQ1Amount / q1Claims.length) : 0;
    return {
      q1Count: q1Claims.length,
      avgCostPerQ1,
    };
  }, [filteredIncentiveClaims]);



  const interdisciplinaryData = useMemo(() => {
    let singleCount = 0;
    let intraCount = 0;
    let interCount = 0;
    let externalCount = 0;

    filteredIncentiveClaims.forEach(claim => {
      if (claim.status === 'Draft' || claim.status === 'Not Approved') return;

      const authors = claim.authors || [];
      if (authors.length <= 1) {
        singleCount += 1;
        return;
      }

      const hasExternal = authors.some(a => a.isExternal);
      if (hasExternal) {
        externalCount += 1;
        return;
      }

      const claimantFaculty = claim.faculty || '';
      let isInterdisciplinary = false;

      authors.forEach(author => {
        if (author.uid && author.uid !== claim.uid) {
          const authorUser = users.find(u => u.uid === author.uid);
          if (authorUser && authorUser.faculty && authorUser.faculty !== claimantFaculty) {
            isInterdisciplinary = true;
          }
        }
      });

      if (isInterdisciplinary) {
        interCount += 1;
      } else {
        intraCount += 1;
      }
    });

    filteredProjects.forEach(project => {
      if (project.status === 'Draft' || (project.status as string) === 'Rejected') return;

      const coPis = project.coPiDetails || [];
      if (coPis.length === 0) {
        singleCount += 1;
        return;
      }

      const hasExternal = coPis.some(cp => cp.isExternal);
      if (hasExternal) {
        externalCount += 1;
        return;
      }

      const piFaculty = project.faculty || '';
      let isInterdisciplinary = false;

      coPis.forEach(copi => {
        if (copi.uid) {
          const copiUser = users.find(u => u.uid === copi.uid);
          if (copiUser && copiUser.faculty && copiUser.faculty !== piFaculty) {
            isInterdisciplinary = true;
          }
        }
      });

      if (isInterdisciplinary) {
        interCount += 1;
      } else {
        intraCount += 1;
      }
    });

    const total = singleCount + intraCount + interCount + externalCount;
    const interdisciplinaryRate = total > 0 ? parseFloat((((interCount + externalCount) / total) * 100).toFixed(1)) : 0;

    return {
      total,
      singleCount,
      intraCount,
      interCount,
      externalCount,
      interdisciplinaryRate,
      chartData: [
        { name: 'Single Investigator', value: singleCount, percentage: total > 0 ? parseFloat(((singleCount / total) * 100).toFixed(1)) : 0 },
        { name: 'Intra-Faculty Collaboration', value: intraCount, percentage: total > 0 ? parseFloat(((intraCount / total) * 100).toFixed(1)) : 0 },
        { name: 'Inter-Faculty (Interdisciplinary)', value: interCount, percentage: total > 0 ? parseFloat(((interCount / total) * 100).toFixed(1)) : 0 },
        { name: 'External Collaboration', value: externalCount, percentage: total > 0 ? parseFloat(((externalCount / total) * 100).toFixed(1)) : 0 },
      ]
    };
  }, [filteredIncentiveClaims, filteredProjects, users]);

  const researchRoiConfig = {
    funds: {
      label: 'Total Funds Invested (₹ Lakhs)',
      color: 'hsl(var(--primary))',
    },
    output: {
      label: 'Research Output Count',
      color: 'hsl(142.1 76.2% 36.3%)',
    },
  } satisfies ChartConfig;

  const interdisciplinaryConfig = {
    value: {
      label: 'Collaborations',
    },
  } satisfies ChartConfig;

  const INTER_COLORS = [
    mutedTextColor,
    'hsl(217.2 91.2% 59.8%)',
    'hsl(262.1 83.3% 57.8%)',
    'hsl(142.1 76.2% 36.3%)',
  ];

  const autoCalcStats = useMemo(() => {
    // Filter claims that have been approved at Stage 4
    const stage4ApprovedClaims = filteredIncentiveClaims.filter(claim => {
      if (claim.status === 'Draft' || claim.status === 'Not Approved') return false;
      const s4Approval = claim.approvals?.find(a => a?.stage === 4 && a?.status === 'Approved');
      return s4Approval !== undefined && s4Approval !== null && s4Approval.approvedAmount !== undefined && s4Approval.approvedAmount !== null;
    });

    let exactMatches = 0;
    let manualAdjustments = 0;
    let totalAutoCalculatedSum = 0;
    let totalForwardedSum = 0;

    const categoryGroups: Record<string, { exactMatches: number; totalClaims: number }> = {};

    stage4ApprovedClaims.forEach(claim => {
      const s4Approval = claim.approvals!.find(a => a?.stage === 4 && a?.status === 'Approved')!;
      const autoIncentive = claim.calculatedIncentive || 0;
      const forwardedAmount = s4Approval.approvedAmount || 0;
      let category = claim.claimType || 'General';
      if (category === 'Books') {
        category = claim.bookApplicationType || 'Book';
      }

      totalAutoCalculatedSum += autoIncentive;
      totalForwardedSum += forwardedAmount;

      if (!categoryGroups[category]) {
        categoryGroups[category] = { exactMatches: 0, totalClaims: 0 };
      }

      categoryGroups[category].totalClaims++;
      if (autoIncentive === forwardedAmount) {
        exactMatches++;
        categoryGroups[category].exactMatches++;
      } else {
        manualAdjustments++;
      }
    });

    const totalClaims = stage4ApprovedClaims.length;
    const accuracyRate = totalClaims > 0 ? parseFloat(((exactMatches / totalClaims) * 100).toFixed(1)) : 100;
    const adjustmentRate = totalClaims > 0 ? parseFloat(((manualAdjustments / totalClaims) * 100).toFixed(1)) : 0;
    const avgAutoCalculated = totalClaims > 0 ? Math.round(totalAutoCalculatedSum / totalClaims) : 0;
    const avgForwarded = totalClaims > 0 ? Math.round(totalForwardedSum / totalClaims) : 0;

    const categoryAccuracyList = Object.entries(categoryGroups).map(([category, stats]) => {
      const rate = stats.totalClaims > 0 ? parseFloat(((stats.exactMatches / stats.totalClaims) * 100).toFixed(1)) : 100;
      return {
        category,
        exactMatches: stats.exactMatches,
        totalClaims: stats.totalClaims,
        accuracyRate: rate
      };
    }).sort((a, b) => b.accuracyRate - a.accuracyRate || b.totalClaims - a.totalClaims);

    return {
      totalClaims,
      exactMatches,
      manualAdjustments,
      accuracyRate,
      adjustmentRate,
      avgAutoCalculated,
      avgForwarded,
      categoryAccuracyList,
      chartData: [
        { name: 'System Auto-Calculation Matched', value: exactMatches, percentage: accuracyRate },
        { name: 'Manually Adjusted', value: manualAdjustments, percentage: adjustmentRate },
      ]
    };
  }, [filteredIncentiveClaims]);

  const autoCalcChartConfig = {
    value: {
      label: 'Claims',
    },
  } satisfies ChartConfig;

  const AUTO_CALC_COLORS = [
    'hsl(142.1 76.2% 36.3%)', // Emerald green
    'hsl(38 92% 50%)',       // Amber
  ];

  const collaborationData = useMemo(() => {
    let singleAuthorCount = 0;
    let internalCollabCount = 0;
    let externalCollabCount = 0;

    filteredIncentiveClaims.forEach(claim => {
      if (claim.status === 'Draft') return;
      const authors = claim.authors || [];
      if (authors.length <= 1) {
        singleAuthorCount += 1;
      } else {
        const hasExternal = authors.some(a => a.isExternal);
        if (hasExternal) {
          externalCollabCount += 1;
        } else {
          internalCollabCount += 1;
        }
      }
    });

    filteredProjects.forEach(project => {
      if (project.status === 'Draft') return;
      const coPis = project.coPiDetails || [];
      if (coPis.length === 0) {
        singleAuthorCount += 1;
      } else {
        const hasExternal = coPis.some(cp => cp.isExternal);
        if (hasExternal) {
          externalCollabCount += 1;
        } else {
          internalCollabCount += 1;
        }
      }
    });

    const total = singleAuthorCount + internalCollabCount + externalCollabCount;

    return [
      { name: 'Single Investigator', value: singleAuthorCount, percentage: total > 0 ? parseFloat(((singleAuthorCount / total) * 100).toFixed(1)) : 0 },
      { name: 'Internal Collaboration', value: internalCollabCount, percentage: total > 0 ? parseFloat(((internalCollabCount / total) * 100).toFixed(1)) : 0 },
      { name: 'External Collaboration', value: externalCollabCount, percentage: total > 0 ? parseFloat(((externalCollabCount / total) * 100).toFixed(1)) : 0 },
    ];
  }, [filteredIncentiveClaims, filteredProjects]);

  const collaborationConfig = {
    value: {
      label: 'Publications & Projects',
    },
  } satisfies ChartConfig;

  const COLLAB_COLORS = [
    'hsl(var(--primary))',
    'hsl(217.2 91.2% 59.8%)',
    'hsl(142.1 76.2% 36.3%)'
  ];

  const stage1ApproverConfig = useMemo(() => {
    const config: ChartConfig = {
      count: {
        label: 'Applications Reviewed',
        color: 'hsl(var(--primary))',
      },
    };
    return config;
  }, []);

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
    fieldOfStudyAllAnalyzed,
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

    const analyzed = filteredIncentiveClaims
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

    // De-duplicate by title (case-insensitive, alpha-numeric normalized) to count unique publications
    const seenTitles = new Set<string>();
    const uniqueAnalyzed: typeof analyzed = [];
    for (const item of analyzed) {
      const norm = item.title.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      if (norm && !seenTitles.has(norm)) {
        seenTitles.add(norm);
        uniqueAnalyzed.push(item);
      }
    }

    const byDomain = uniqueAnalyzed.reduce((acc, item) => {
      acc[item.domain] = (acc[item.domain] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bySubdomain = uniqueAnalyzed.reduce((acc, item) => {
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

    const sortedDrilldownUncapped = uniqueAnalyzed
      .sort((a, b) => {
        const byDate = new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime();
        if (byDate !== 0) return byDate;
        return b.confidence - a.confidence;
      });

    const sortedDrilldown = sortedDrilldownUncapped.slice(0, 40);

    const avgConfidence = uniqueAnalyzed.length > 0
      ? Math.round(uniqueAnalyzed.reduce((sum, row) => sum + row.confidence, 0) / uniqueAnalyzed.length)
      : 0;

    return {
      fieldOfStudyData: domainData,
      fieldOfStudyConfig: domainConfig,
      fieldOfStudySubdomainData: subdomainData,
      fieldOfStudySubdomainConfig: subdomainConfig,
      fieldOfStudyDrilldown: sortedDrilldown,
      fieldOfStudyAllAnalyzed: sortedDrilldownUncapped,
      fieldOfStudySummary: {
        classifiedClaims: uniqueAnalyzed.length,
        uniqueDomains: domainData.length,
        uniqueSubdomains: Object.keys(bySubdomain).length,
        avgConfidence,
      },
    };
  }, [filteredIncentiveClaims]);

  const emergingTopicsFlatData = useMemo(() => {
    return fieldOfStudySubdomainData.map(item => {
      const parts = item.subdomain.split(' • ');
      return {
        name: parts[1] || parts[0] || 'General',
        domain: parts[0],
        value: item.count,
      };
    });
  }, [fieldOfStudySubdomainData]);

  const subdomainPublications = useMemo(() => {
    if (!selectedSubdomain) return [];
    return (fieldOfStudyAllAnalyzed || [])
      .filter(item =>
        item.subdomain === selectedSubdomain ||
        `${item.domain} • ${item.subdomain}` === selectedSubdomain ||
        (selectedSubdomain.includes(' • ') && selectedSubdomain.split(' • ')[1] === item.subdomain)
      )
      .slice(0, 10);
  }, [selectedSubdomain, fieldOfStudyAllAnalyzed]);

  useEffect(() => {
    if (emergingTopicsFlatData.length > 0 && !selectedSubdomain) {
      const firstTopic = emergingTopicsFlatData[0];
      setSelectedSubdomain(`${firstTopic.domain} • ${firstTopic.name}`);
    }
  }, [emergingTopicsFlatData, selectedSubdomain]);

  const { totalImrGrantAmount, totalImrGrantsAwarded, totalEmrProjects } = useMemo(() => {
    const awardedProjects = filteredProjects.filter(p =>
      p.grant &&
      p.grant.totalAmount > 0 &&
      ['Sanctioned', 'In Progress', 'Completed'].includes(p.status)
    );
    const totalAmount = awardedProjects.reduce((sum, p) => sum + p.grant!.totalAmount, 0);
    const emrSanctionedCount = filteredEmrProjects.filter(p => p.status === 'Sanctioned' || p.status === 'Process Complete').length;
    return {
      totalImrGrantAmount: totalAmount,
      totalImrGrantsAwarded: awardedProjects.length,
      totalEmrProjects: emrSanctionedCount
    };
  }, [filteredProjects, filteredEmrProjects]);

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
    {
      title: 'Auto-Calc Accuracy',
      value: autoCalcStats.totalClaims > 0 ? `${autoCalcStats.accuracyRate}%` : 'Calculating',
      icon: CheckCheck,
      description: autoCalcStats.totalClaims > 0
        ? `${autoCalcStats.exactMatches} of ${autoCalcStats.totalClaims} approved claims matched.`
        : '',
      loading: loading
    },
    {
      title: 'Avg Q1 Incentive Cost',
      value: `₹${roiKpiStats.avgCostPerQ1.toLocaleString('en-IN')}`,
      icon: TrendingUp,
      description: `Based on ${roiKpiStats.q1Count} Q1 publications.`,
      loading: loading
    },
  ];


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
      <style>{`
        /* Force black font color for Card Titles, Headers and Descriptions during PNG export */
        [style*="--is-exporting"] h3,
        [style*="--is-exporting"] .card-title,
        [style*="--is-exporting"] .text-foreground {
          color: #000000 !important;
          font-size: 22px !important;
          font-weight: 700 !important;
        }
        [style*="--is-exporting"] p,
        [style*="--is-exporting"] .card-description,
        [style*="--is-exporting"] .text-muted-foreground {
          color: #27272a !important;
          font-size: 14px !important;
          font-weight: 500 !important;
        }
        /* Make chart labels and texts (ticks, labels) black and larger */
        [style*="--is-exporting"] text,
        [style*="--is-exporting"] .recharts-text {
          fill: #000000 !important;
          color: #000000 !important;
          font-size: 14px !important;
          font-weight: 600 !important;
        }
        /* Specifically target Cartesian axis ticks */
        [style*="--is-exporting"] .recharts-cartesian-axis-tick text {
          fill: #000000 !important;
          font-size: 13px !important;
          font-weight: 600 !important;
        }
        /* Specifically target LabelList texts */
        [style*="--is-exporting"] .recharts-label-list text {
          fill: #000000 !important;
          font-size: 14px !important;
          font-weight: 700 !important;
        }
        /* Make legends black and larger */
        [style*="--is-exporting"] .recharts-legend-item-text {
          color: #000000 !important;
          font-size: 13px !important;
          font-weight: 600 !important;
        }
        /* Make pie chart labels black and larger */
        [style*="--is-exporting"] .recharts-pie-label-text {
          fill: #000000 !important;
          font-size: 13px !important;
          font-weight: 600 !important;
        }
        .card-total-text {
          color: var(--card-total-color, hsl(var(--muted-foreground))) !important;
          font-size: var(--card-total-size, 0.875rem) !important;
          font-weight: 700 !important;
        }
        /* Make card footer totals black and larger in exported images */
        [style*="--is-exporting"] .card-total-text,
        [style*="--is-exporting"] .justify-center.border-t span,
        [style*="--is-exporting"] [class*="card-footer"] span {
          color: #000000 !important;
          font-size: 20px !important;
          font-weight: 700 !important;
        }
      `}</style>
      <PageHeader title={getPageTitle()} description={getPageDescription()}>
        <div className="flex flex-wrap items-center gap-3">
          {/* Global Date Range Filter */}
          <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-lg border shadow-sm">
            <Calendar className="h-4 w-4 text-primary ml-1" />
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-1">Filter Range:</span>
              <Select
                value={globalDateRange.start || ''}
                onValueChange={(value) => {
                  setGlobalDateRange(prev => ({
                    ...prev,
                    start: value,
                    end: prev.end && prev.end < value ? null : prev.end
                  }));
                }}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs border-none bg-transparent hover:bg-muted focus:ring-0">
                  <SelectValue placeholder="Start" />
                </SelectTrigger>
                <SelectContent>
                  {monthYearOptions.map(option => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground font-light">—</span>
              <Select
                value={globalDateRange.end || ''}
                onValueChange={(value) => {
                  setGlobalDateRange(prev => ({
                    ...prev,
                    end: value,
                    start: prev.start && prev.start > value ? null : prev.start,
                  }));
                }}
              >
                <SelectTrigger className="h-8 w-[110px] text-xs border-none bg-transparent hover:bg-muted focus:ring-0">
                  <SelectValue placeholder="End" />
                </SelectTrigger>
                <SelectContent>
                  {monthYearOptions.map(option => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(globalDateRange.start || globalDateRange.end) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => setGlobalDateRange({ start: null, end: null })}
                  title="Clear Range"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          <Button onClick={handleGenerateReport} disabled={isGeneratingReport} variant="outline" className="h-10 border-primary/20 hover:border-primary/50">
            {isGeneratingReport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Download PDF Report
          </Button>

          {isCro && (
            <Button onClick={() => setIsExportDialogOpen(true)} variant="outline" className="h-10 border-emerald-500/20 hover:border-emerald-500/50 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
              <Download className="mr-2 h-4 w-4" />
              Export Incentives
            </Button>
          )}

          {isCro && user.faculties && user.faculties.length > 1 && (
            <Select value={facultyFilter} onValueChange={(value) => { setFacultyFilter(value); }}>
              <SelectTrigger className="h-10 w-full sm:w-[240px]">
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
          <Card ref={statusChartRef}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-card">
              <div><CardTitle>IMR Project Status Distribution</CardTitle><CardDescription>Summary of all IMR projects by status.</CardDescription></div>
              <Button variant="outline" size="sm" onClick={() => handleExport(statusChartRef, 'project_status_distribution')}><Download className="mr-2 h-4 w-4" /> Export</Button>
            </CardHeader>
            <CardContent><div className="p-4 bg-card"><ChartContainer config={statusDistributionConfig} className="h-[250px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><ChartTooltip content={<ChartTooltipContent nameKey="value" formatter={(value) => value.toLocaleString()} />} /><Pie data={statusDistributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} isAnimationActive={false}>{statusDistributionData.map((entry, index) => (<Cell key={`cell-${index}`} fill={statusDistributionConfig[entry.name]?.color || '#8884d8'} />))}</Pie></PieChart></ResponsiveContainer></ChartContainer></div></CardContent>
            <CardFooter className="justify-center border-t pt-4"><span className="text-sm font-semibold text-muted-foreground card-total-text">Total Projects: {statusDistributionData.reduce((sum, item) => sum + item.value, 0)}</span></CardFooter>
          </Card>
          <Card ref={projectTypeChartRef}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-card">
              <div><CardTitle>IMR Projects by Type</CardTitle><CardDescription>Distribution by disciplinary category.</CardDescription></div>
              <Button variant="outline" size="sm" onClick={() => handleExport(projectTypeChartRef, 'project_type_distribution')}><Download className="mr-2 h-4 w-4" /> Export</Button>
            </CardHeader>
            <CardContent><div className="p-4 bg-card"><ChartContainer config={projectTypeDistributionConfig} className="h-[250px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><ChartTooltip content={<ChartTooltipContent nameKey="value" formatter={(value) => value.toLocaleString()} />} /><Pie data={projectTypeDistributionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} isAnimationActive={false}>{projectTypeDistributionData.map((entry, index) => (<Cell key={`cell-${index}`} fill={projectTypeDistributionConfig[entry.name]?.color || '#8884d8'} />))}</Pie></PieChart></ResponsiveContainer></ChartContainer></div></CardContent>
            <CardFooter className="justify-center border-t pt-4"><span className="text-sm font-semibold text-muted-foreground card-total-text">Total Projects: {projectTypeDistributionData.reduce((sum, item) => sum + item.value, 0)}</span></CardFooter>
          </Card>
        </div>
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
          <Card ref={submissionsTimeChartRef}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <div>
                  <CardTitle>IMR Submissions Over Time</CardTitle>
                  <CardDescription>
                    {globalDateRange.start && globalDateRange.end
                      ? `Monthly project submissions from ${format(parseISO(globalDateRange.start), 'MMM yyyy')} to ${format(parseISO(globalDateRange.end), 'MMM yyyy')}.`
                      : timeRange === 'last6months'
                        ? 'Monthly project submissions for the last 6 months.'
                        : `Monthly project submissions for ${timeRange}.`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {!(globalDateRange.start && globalDateRange.end) && (
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
                  )}
                  <Button variant="outline" size="icon" onClick={() => handleExport(submissionsTimeChartRef, 'submissions_over_time')}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent><div className="p-4 bg-card"><ChartContainer config={submissionsConfig} className="h-[300px] w-full"><LineChart accessibilityLayer data={submissionsData}><CartesianGrid vertical={false} /><XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fill: mutedTextColor }} /><YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} tick={{ fill: mutedTextColor }} /><ChartTooltip cursor={false} content={<ChartTooltipContent />} /><Line dataKey="submissions" type="monotone" stroke="var(--color-submissions)" strokeWidth={2} dot={true} isAnimationActive={false} /></LineChart></ChartContainer></div></CardContent>
            <CardFooter className="justify-center border-t pt-4"><span className="text-sm font-semibold text-muted-foreground card-total-text">Total Fresh Submissions: {submissionsData.reduce((sum, item) => sum + item.submissions, 0)}</span></CardFooter>
          </Card>
          <Card ref={submissionsYearChartRef}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <div>
                  <CardTitle>{globalDateRange.start && globalDateRange.end ? 'Monthly IMR Submissions & Sanctions' : 'Yearly IMR Submissions & Sanctions'}</CardTitle>
                  <CardDescription>
                    {globalDateRange.start && globalDateRange.end
                      ? `Total IMR submissions vs. sanctions per month from ${format(parseISO(globalDateRange.start), 'MMM yyyy')} to ${format(parseISO(globalDateRange.end), 'MMM yyyy')}.`
                      : `Total IMR submissions vs. sanctions over the last 6 years.`}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => handleExport(submissionsYearChartRef, 'submissions_vs_sanctions')} title="Export Chart">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-card">
                <ChartContainer config={submissionsVsSanctionsConfig} className="h-[300px] w-full">
                  <BarChart data={submissionsByYearData}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} tick={{ fill: mutedTextColor }} />
                    <YAxis allowDecimals={false} tick={{ fill: mutedTextColor }} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="submissions" name="Submissions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="sanctions" name="Sanctions" fill="hsl(142.1 76.2% 36.3%)" radius={[4, 4, 0, 0]} />
                    <Legend />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
            <CardFooter className="justify-center border-t pt-4">
              <span className="text-sm font-semibold text-muted-foreground card-total-text">
                Total Submissions: {submissionsByYearData.reduce((sum, item) => sum + item.submissions, 0)} | Total Sanctions: {submissionsByYearData.reduce((sum, item) => sum + item.sanctions, 0)}
              </span>
            </CardFooter>
          </Card>
        </div>
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
          <Card ref={projectsByGroupChartRef}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div><CardTitle>Projects by {aggregationLabel}</CardTitle><CardDescription>Total projects submitted by each {aggregationLabel.toLowerCase()}.</CardDescription></div>
                <div className="flex items-center gap-2"><Select value={projectsByGroupType} onValueChange={(value) => setProjectsByGroupType(value as 'imr' | 'emr')}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="imr">IMR Submissions</SelectItem><SelectItem value="emr">EMR Sanctions</SelectItem></SelectContent></Select><Button variant="outline" size="icon" onClick={() => handleExport(projectsByGroupChartRef, 'projects_by_group')}><Download className="h-4 w-4" /></Button></div>
              </div>
            </CardHeader>
            <CardContent><div className="p-4 bg-card"><ChartContainer config={projectsByGroupConfig} className="h-[400px] w-full"><BarChart accessibilityLayer data={projectsByGroupData} layout="vertical" margin={{ left: 30, right: 30 }}><CartesianGrid horizontal={false} /><YAxis dataKey="group" type="category" tickLine={false} tickMargin={10} axisLine={false} width={250} tick={{ fontSize: 12, width: 240, whiteSpace: 'normal', textAnchor: 'end', fill: textColor } as any} interval={0} /><XAxis dataKey="projects" type="number" hide allowDecimals={false} /><Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} /><Bar dataKey="projects" layout="vertical" fill="var(--color-projects)" radius={4} isAnimationActive={false}><LabelList dataKey="projects" position="right" offset={8} fill={textColor} fontSize={12} /></Bar></BarChart></ChartContainer></div></CardContent>
            <CardFooter className="justify-center border-t pt-4"><span className="text-sm font-semibold text-muted-foreground card-total-text">Total Projects: {projectsByGroupData.reduce((sum, item: any) => sum + item.projects, 0)}</span></CardFooter>
          </Card>
          <Card ref={fundingByAgencyChartRef}>
            <CardHeader>
              <div className="flex items-center justify-between"><CardTitle>Top 5 EMR Funding Agencies</CardTitle><Button variant="outline" size="icon" onClick={() => handleExport(fundingByAgencyChartRef, 'top_funding_agencies')}><Download className="h-4 w-4" /></Button></div>
              <CardDescription>Total sanctioned amount from the top 5 external funding agencies.</CardDescription>
            </CardHeader>
            <CardContent><div className="p-4 bg-card"><ChartContainer config={fundingByAgencyConfig} className="h-[400px] w-full"><BarChart data={fundingByAgencyData} layout="vertical" margin={{ left: 100, right: 60 }}><CartesianGrid horizontal={false} /><YAxis dataKey="agency" type="category" tickLine={false} tickMargin={10} axisLine={false} tick={{ fontSize: 12, fill: mutedTextColor }} /><XAxis dataKey="amount" type="number" hide /><ChartTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />} /><Bar dataKey="amount" layout="vertical" fill="var(--color-amount)" radius={4}><LabelList dataKey="amount" position="right" offset={8} fill={textColor} fontSize={12} formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`} /></Bar></BarChart></ChartContainer></div></CardContent>
            <CardFooter className="justify-center border-t pt-4"><span className="text-sm font-semibold text-muted-foreground card-total-text">Total Funding (Top 5): ₹{fundingByAgencyData.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-IN')}</span></CardFooter>
          </Card>
        </div>
        <div>
          <Card ref={imrGrantByInstituteChartRef}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-primary" />IMR Grant Amount by Institute
                  </CardTitle>
                  <CardDescription>Total sanctioned Intra-Mural Research grant amounts per institute.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportImrGrants}
                    disabled={loading || imrGrantByInstituteData.length === 0}
                    className="flex items-center gap-1 border-emerald-500/20 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  >
                    <Download className="h-4 w-4" />
                    Export Excel
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {imrGrantByInstituteData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                  No IMR grant data available.
                </div>
              ) : (
                <div className="overflow-auto border rounded-xl max-h-[400px] relative scrollbar-thin shadow-inner bg-card">
                  <Table className="border-collapse text-xs w-full">
                    <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-20 shadow-[0_1px_0_0_rgba(0,0,0,0.1)]">
                      <TableRow>
                        <TableHead className="font-bold border-b py-3 px-4 text-left">
                          Institute Name
                        </TableHead>
                        <TableHead className="font-bold border-b py-3 px-4 text-right w-[200px]">
                          Total Sanctioned IMR Grant
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {imrGrantByInstituteData.map((item) => (
                        <TableRow key={item.institute} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-semibold border-b py-2.5 px-4 text-left">
                            {item.institute}
                          </TableCell>
                          <TableCell className="border-b py-2.5 px-4 text-right font-bold text-foreground/90">
                            ₹{item.amount.toLocaleString('en-IN')}
                          </TableCell>
                        </TableRow>
                      ))}

                      {/* Total Row */}
                      <TableRow className="bg-muted/40 hover:bg-muted/50 font-bold border-t-2">
                        <TableCell className="py-3 px-4 text-left font-bold">
                          Grand Total
                        </TableCell>
                        <TableCell className="py-3 px-4 text-right font-extrabold">
                          ₹{imrGrantByInstituteData.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-IN')}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-center border-t pt-4"><span className="text-sm font-semibold text-muted-foreground card-total-text">Total Grant Amount: ₹{imrGrantByInstituteData.reduce((sum, item) => sum + item.amount, 0).toLocaleString('en-IN')}</span></CardFooter>
          </Card>
        </div>
      </div>

      {/* --- Extramural Research (EMR) Comprehensive Analytics Section --- */}
      <div className="mt-12 space-y-6 border-t pt-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Megaphone className="h-6 w-6 text-primary" />
              Extramural Research (EMR) Analytics
            </h2>
            <p className="text-sm text-muted-foreground">
              Comprehensive analytics on EMR funding calls, interest registrations, recommendations, and sanctions (just like IMR calls).
            </p>
          </div>
        </div>

        {/* EMR Overview KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <p className="text-xs uppercase font-medium text-muted-foreground">Total EMR Calls</p>
              <p className="text-2xl font-bold text-primary">{emrAnalyticsData.summary.totalCalls}</p>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{emrAnalyticsData.summary.totalAnnouncedCalls} announced calls</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <p className="text-xs uppercase font-medium text-muted-foreground">Total Registrations</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{emrAnalyticsData.summary.totalRegistrations}</p>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">EMR applicant registrations</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <p className="text-xs uppercase font-medium text-muted-foreground">Recommended</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{emrAnalyticsData.summary.totalRecommended}</p>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Proposals endorsed / recommended</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <p className="text-xs uppercase font-medium text-muted-foreground">Sanctioned EMR Projects</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{emrAnalyticsData.summary.totalSanctioned}</p>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Projects with external sanction</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <p className="text-xs uppercase font-medium text-muted-foreground">Total Sanctioned Grant</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                ₹{emrAnalyticsData.summary.totalSanctionedAmt.toLocaleString('en-IN')}
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">From external funding agencies</p>
            </CardContent>
          </Card>
        </div>

        {/* EMR Charts Grid */}
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
          {/* EMR Submissions & Sanctions Trend */}
          <Card ref={emrTrendChartRef}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>EMR Registrations vs. Sanctions</CardTitle>
                  <CardDescription>Comparison of EMR interest registrations vs. sanctioned projects over the last 6 years.</CardDescription>
                </div>
                <Button variant="outline" size="icon" onClick={() => handleExport(emrTrendChartRef, 'emr_registrations_vs_sanctions')} title="Export Chart">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-card">
                <ChartContainer config={submissionsVsSanctionsConfig} className="h-[300px] w-full">
                  <BarChart data={emrAnalyticsData.submissionsVsSanctionsData}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} tick={{ fill: mutedTextColor }} />
                    <YAxis allowDecimals={false} tick={{ fill: mutedTextColor }} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="registrations" name="Registrations" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="sanctions" name="Sanctions" fill="hsl(142.1 76.2% 36.3%)" radius={[4, 4, 0, 0]} />
                    <Legend />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
            <CardFooter className="justify-center border-t pt-4">
              <span className="text-sm font-semibold text-muted-foreground card-total-text">
                Total Registrations: {emrAnalyticsData.submissionsVsSanctionsData.reduce((sum, item) => sum + item.registrations, 0)} | Total Sanctions: {emrAnalyticsData.submissionsVsSanctionsData.reduce((sum, item) => sum + item.sanctions, 0)}
              </span>
            </CardFooter>
          </Card>

          {/* EMR Application Status Distribution */}
          <Card ref={emrStatusChartRef}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>EMR Application Status Distribution</CardTitle>
                  <CardDescription>Breakdown of all EMR applications by current stage.</CardDescription>
                </div>
                <Button variant="outline" size="icon" onClick={() => handleExport(emrStatusChartRef, 'emr_status_distribution')} title="Export Chart">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-card">
                {emrAnalyticsData.statusChartData.length > 0 ? (
                  <ChartContainer config={emrAnalyticsData.statusChartConfig} className="h-[300px] w-full">
                    <PieChart>
                      <Pie
                        data={emrAnalyticsData.statusChartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={45}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        isAnimationActive={false}
                      >
                        {emrAnalyticsData.statusChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltipContent />} />
                      <Legend content={<ChartLegendContent />} />
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No EMR status data available.
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="justify-center border-t pt-4">
              <span className="text-sm font-semibold text-muted-foreground card-total-text">
                Total EMR Applications Tracked: {emrAnalyticsData.summary.totalRegistrations}
              </span>
            </CardFooter>
          </Card>
        </div>

        {/* EMR Funding Agency Breakdown Table */}
        <Card ref={emrAgencyTableRef}>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  EMR Funding Agency Analytics
                </CardTitle>
                <CardDescription>Overview of funding calls, interest registrations, and sanctioned grant amounts by agency.</CardDescription>
              </div>
              <Button variant="outline" size="icon" onClick={() => handleExport(emrAgencyTableRef, 'emr_agency_analytics')} title="Export Image">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {emrAnalyticsData.agencyData.length > 0 ? (
              <div className="overflow-auto border rounded-xl max-h-[400px] relative scrollbar-thin shadow-inner bg-card">
                <Table className="border-collapse text-xs w-full">
                  <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-20 shadow-[0_1px_0_0_rgba(0,0,0,0.1)]">
                    <TableRow>
                      <TableHead className="font-bold border-b py-3 px-4 text-left">Agency Name</TableHead>
                      <TableHead className="font-bold border-b py-3 px-4 text-center">Calls Created</TableHead>
                      <TableHead className="font-bold border-b py-3 px-4 text-center">Registrations</TableHead>
                      <TableHead className="font-bold border-b py-3 px-4 text-center">Sanctioned</TableHead>
                      <TableHead className="font-bold border-b py-3 px-4 text-right">Sanctioned Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emrAnalyticsData.agencyData.map(item => (
                      <TableRow key={item.agency} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-semibold border-b py-2.5 px-4 text-left">{item.agency}</TableCell>
                        <TableCell className="border-b py-2.5 px-4 text-center">{item.callCount}</TableCell>
                        <TableCell className="border-b py-2.5 px-4 text-center">{item.regCount}</TableCell>
                        <TableCell className="border-b py-2.5 px-4 text-center font-semibold text-emerald-600 dark:text-emerald-400">{item.sanctionedCount}</TableCell>
                        <TableCell className="border-b py-2.5 px-4 text-right font-bold">
                          {item.amount > 0 ? `₹${item.amount.toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-bold border-t-2">
                      <TableCell className="py-3 px-4 text-left">Grand Total</TableCell>
                      <TableCell className="py-3 px-4 text-center">{emrAnalyticsData.summary.totalCalls}</TableCell>
                      <TableCell className="py-3 px-4 text-center">{emrAnalyticsData.summary.totalRegistrations}</TableCell>
                      <TableCell className="py-3 px-4 text-center text-emerald-600 dark:text-emerald-400">{emrAnalyticsData.summary.totalSanctioned}</TableCell>
                      <TableCell className="py-3 px-4 text-right font-extrabold">
                        ₹{emrAnalyticsData.summary.totalSanctionedAmt.toLocaleString('en-IN')}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="h-[150px] flex items-center justify-center text-muted-foreground text-sm">
                No EMR agency data available.
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-center border-t pt-4">
            <span className="text-sm font-semibold text-muted-foreground card-total-text">
              Total Agencies Tracked: {emrAnalyticsData.agencyData.length} | Total Grant: ₹{emrAnalyticsData.summary.totalSanctionedAmt.toLocaleString('en-IN')}
            </span>
          </CardFooter>
        </Card>
      </div>

      {/* --- Publication & Incentive Section --- */}
      <div className="mt-12 space-y-8">
        <h2 className="text-2xl font-bold tracking-tight">Publication & Incentive Analytics</h2>

        {/* --- Institute / Faculty / Department Incentive Claim Summary --- */}
        <Card ref={incentiveGroupChartRef} className="mt-6 flex flex-col w-full">
          <CardHeader className="flex flex-row items-center justify-between pb-2 bg-card">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Incentive Claims Summary by {activeGroupType === 'institute' ? 'Institute' : (activeGroupType === 'faculty' ? 'Faculty' : 'Department')}
              </CardTitle>
              <CardDescription>
                Summary of claim counts and total approved amounts for finally accepted claims.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 no-export">
              {/* Switch controls - Only show for Super-admin/Admin users */}
              {user?.designation !== 'Principal' && user?.role !== 'CRO' && (
                <div className="flex items-center bg-muted p-1 rounded-lg mr-2">
                  <Button
                    variant={incentiveGroupType === 'institute' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 text-xs px-3"
                    onClick={() => { setIncentiveGroupType('institute'); setIncentiveGroupSearch(''); }}
                  >
                    Institute-Wise
                  </Button>
                  <Button
                    variant={incentiveGroupType === 'faculty' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 text-xs px-3"
                    onClick={() => { setIncentiveGroupType('faculty'); setIncentiveGroupSearch(''); }}
                  >
                    Faculty-Wise
                  </Button>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportGroupExcel}
                className="flex items-center gap-1 border-emerald-500/20 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
              >
                <Download className="h-4 w-4" />
                Export Excel
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleExport(incentiveGroupChartRef, `incentive_claims_by_${activeGroupType}`)}
                title="Export Image"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Search filter controls */}
            <div className="flex items-center justify-between gap-4 no-export">
              <div className="relative w-full sm:w-[320px]">
                <input
                  type="text"
                  value={incentiveGroupSearch}
                  onChange={(e) => setIncentiveGroupSearch(e.target.value)}
                  placeholder={`Search ${activeGroupType === 'institute' ? 'institute' : (activeGroupType === 'faculty' ? 'faculty' : 'department')}...`}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {incentiveGroupSearch && (
                  <button
                    onClick={() => setIncentiveGroupSearch('')}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="text-xs text-muted-foreground font-medium">
                Showing {incentiveGroupData.length} entries
              </div>
            </div>

            {/* Composed Chart Visual */}
            <div className="p-4 bg-muted/10 border rounded-xl">
              {incentiveGroupData.length === 0 ? (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                  No claims data available to chart.
                </div>
              ) : (
                <ChartContainer
                  config={{
                    amount: { label: 'Amount (₹)', color: 'hsl(var(--primary))' },
                    count: { label: 'Claims Count', color: 'hsl(var(--accent))' }
                  }}
                  className="h-[320px] w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={incentiveGroupData.slice(0, 10)} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: mutedTextColor }}
                        interval={0}
                        angle={-35}
                        textAnchor="end"
                        height={70}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 10, fill: mutedTextColor }}
                        tickFormatter={(value) => `₹${(value / 100000).toFixed(1)}L`}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 10, fill: mutedTextColor }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        content={<ChartTooltipContent formatter={(value, name) => {
                          if (name === 'amount') return `₹${Number(value).toLocaleString('en-IN')}`;
                          return value;
                        }} />}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="amount"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                        name="Total Amount"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="count"
                        stroke="hsl(var(--accent))"
                        strokeWidth={2.5}
                        name="Claims Count"
                        dot={{ fill: 'hsl(var(--accent))', r: 4 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </div>

            {/* List Data Table */}
            <div className="overflow-auto border rounded-xl max-h-[350px] relative scrollbar-thin shadow-inner bg-card">
              <Table className="border-collapse text-xs w-full">
                <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-20 shadow-[0_1px_0_0_rgba(0,0,0,0.1)]">
                  <TableRow>
                    <TableHead className="font-bold border-b py-3 px-4 text-left">
                      {activeGroupType === 'institute' ? 'Institute Name' : (activeGroupType === 'faculty' ? 'Faculty Name' : 'Department Name')}
                    </TableHead>
                    <TableHead className="font-bold border-b py-3 px-4 text-center w-[150px]">
                      Accepted Claims Count
                    </TableHead>
                    <TableHead className="font-bold border-b py-3 px-4 text-right w-[200px]">
                      Total Approved Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incentiveGroupData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        No records match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    incentiveGroupData.map((item) => (
                      <TableRow key={item.name} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-semibold border-b py-2.5 px-4 text-left">
                          {item.name}
                        </TableCell>
                        <TableCell className="border-b py-2.5 px-4 text-center font-medium">
                          {item.count}
                        </TableCell>
                        <TableCell className="border-b py-2.5 px-4 text-right font-bold text-foreground/90">
                          ₹{item.amount.toLocaleString('en-IN')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}

                  {/* Total Row */}
                  {incentiveGroupData.length > 0 && (
                    <TableRow className="bg-muted/40 hover:bg-muted/50 font-bold border-t-2">
                      <TableCell className="py-3 px-4 text-left font-bold">
                        Grand Total
                      </TableCell>
                      <TableCell className="py-3 px-4 text-center font-bold">
                        {grandTotalGroup.count}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-right font-extrabold">
                        ₹{grandTotalGroup.amount.toLocaleString('en-IN')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 bg-muted/10 p-3 rounded-lg border">
              <Info className="h-4 w-4 shrink-0 text-primary" />
              <span>
                Finally accepted claims include those marked as Accepted, Submitted to Accounts, or Payment Completed. Submitting user institutes are mapped from registration records.
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
          <Card ref={incentiveAmountChartRef}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-card"><div><CardTitle>Incentive Amounts by Category</CardTitle><CardDescription>Total sanctioned amount per claim type.</CardDescription></div><Button variant="outline" size="icon" onClick={() => handleExport(incentiveAmountChartRef, 'incentive_amounts')}><Download className="h-4 w-4" /></Button></CardHeader>
            <CardContent><div className="p-4 bg-card"><ChartContainer config={incentiveAmountConfig} className="h-[300px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={(value) => `₹${Number(value).toLocaleString('en-IN')}`} />} /><Pie data={incentiveAmountData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => { const RADIAN = Math.PI / 180; const radius = innerRadius + (outerRadius - innerRadius) * 0.5; const x = cx + radius * Math.cos(-midAngle * RADIAN); const y = cy + radius * Math.sin(-midAngle * RADIAN); return (<text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central"> {`${(percent * 100).toFixed(0)}%`} </text>); }}>{incentiveAmountData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Legend content={<ChartLegendContent nameKey="name" />} /></PieChart></ResponsiveContainer></ChartContainer></div></CardContent>
            <CardFooter className="justify-center border-t pt-4"><span className="text-sm font-semibold text-muted-foreground card-total-text">Total Incentives: ₹{totalIncentiveAmount.toLocaleString('en-IN')}</span></CardFooter>
          </Card>
          <Card ref={publicationChartRef}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 bg-card"><div><CardTitle>Publications by Journal Quartile</CardTitle><CardDescription>Distribution of articles across Q1-Q4 journals.</CardDescription></div><Button variant="outline" size="icon" onClick={() => handleExport(publicationChartRef, 'publication_quartile_distribution')}><Download className="h-4 w-4" /></Button></CardHeader>
            <CardContent><div className="p-4 bg-card"><ChartContainer config={quartileChartConfig} className="h-[300px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={quarterlyDistributionData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="quartile" tick={{ fill: mutedTextColor }} /><YAxis allowDecimals={false} tick={{ fill: mutedTextColor }} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" fill="hsl(var(--primary))" radius={4}><LabelList dataKey="count" position="top" offset={8} fill={textColor} fontSize={12} /></Bar></BarChart></ResponsiveContainer></ChartContainer></div></CardContent>
            <CardFooter className="justify-center border-t pt-4"><span className="text-sm font-semibold text-muted-foreground card-total-text">Total Publications: {quarterlyDistributionData.reduce((sum, item) => sum + item.count, 0)}</span></CardFooter>
          </Card>

          {/* Most Cited Scopus Articles (Parul University Goa) Card */}
          <Card className="lg:col-span-2 shadow-sm border rounded-xl overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 bg-card border-b">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
                  Most Cited Scopus Articles
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>Top cited publications indexed in Scopus authored by Parul University Goa researchers</span>
                  {isLiveScopusData ? (
                    <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-medium">
                      Live Scopus API
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10 font-medium">
                      Database Aggregated
                    </Badge>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <Select
                  value={scopusYearFilter}
                  onValueChange={(val) => {
                    setScopusYearFilter(val);
                    loadTopScopusPubs(val);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs min-w-[210px] w-auto font-medium bg-background">
                    <SelectValue placeholder="All Years" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all">All Years / All Time</SelectItem>
                    <SelectItem value="AY-2024-2025" className="font-semibold text-primary">
                      AY 2025–26 (June 2025 – May 2026)
                    </SelectItem>
                    <SelectItem value="2026">CY 2026</SelectItem>
                    <SelectItem value="2025">CY 2025</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadTopScopusPubs()}
                  disabled={isLoadingTopScopus}
                  className="h-8 text-xs font-medium"
                >
                  <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isLoadingTopScopus && "animate-spin")} />
                  {isLoadingTopScopus ? "Refreshing..." : "Refresh Scopus Data"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingTopScopus && topScopusPubs.length === 0 ? (
                <div className="space-y-3 p-6">
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ) : topScopusPubs.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground p-6">
                  <BookCopy className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm font-medium">No Scopus publications found.</p>
                  <p className="text-xs text-muted-foreground mt-1">Check that SCOPUS_API_KEY is configured on the server or sync user profiles.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="w-[60px] text-center font-bold">#</TableHead>
                        <TableHead>Publication Title & Details</TableHead>
                        <TableHead className="min-w-[220px]">Authors</TableHead>
                        <TableHead className="min-w-[180px]">Journal / Source</TableHead>
                        <TableHead className="w-[90px] text-center">Year</TableHead>
                        <TableHead className="w-[110px] text-right font-bold pr-4">Citations</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topScopusPubs.map((pub, index) => {
                        const linkUrl = pub.scopusUrl || (pub.doi ? `https://doi.org/${pub.doi}` : null);
                        return (
                          <TableRow key={pub.eid || index} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="text-center font-extrabold text-sm text-muted-foreground">
                              {index === 0 ? "🥇 1" : index === 1 ? "🥈 2" : index === 2 ? "🥉 3" : `${index + 1}`}
                            </TableCell>
                            <TableCell className="min-w-[280px] max-w-[450px] whitespace-normal break-words">
                              {linkUrl ? (
                                <a
                                  href={linkUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-primary hover:underline text-sm leading-snug whitespace-normal break-words inline-block"
                                  title="Open in Scopus"
                                >
                                  {pub.title}
                                </a>
                              ) : (
                                <div className="font-semibold text-foreground text-sm leading-snug whitespace-normal break-words">
                                  {pub.title}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground min-w-[240px] max-w-[400px] whitespace-normal break-words leading-relaxed">
                              <div className="font-medium text-foreground/90 leading-snug">
                                {pub.authors || "Parul University Goa Researchers"}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-foreground/80 min-w-[180px] max-w-[280px] whitespace-normal break-words leading-relaxed font-medium">
                              {pub.journalName || "N/A"}
                            </TableCell>
                            <TableCell className="text-center text-xs font-mono">
                              {pub.publicationYear || (pub.coverDate ? pub.coverDate.substring(0, 4) : "N/A")}
                            </TableCell>
                            <TableCell className="text-right pr-4">
                              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-bold px-2.5 py-0.5 text-xs">
                                🔥 {pub.citationCount ?? 0}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            {topScopusTotalResults > 0 && (
              <CardFooter className="justify-between border-t py-3 px-6 text-xs text-muted-foreground bg-muted/20">
                <span>Showing Top {topScopusPubs.length} cited articles</span>
                <span>Total Indexed Articles: <strong>{topScopusTotalResults.toLocaleString()}</strong></span>
              </CardFooter>
            )}
          </Card>

          {/* Top 10 Incentive Claimants Card */}
          <Card className="lg:col-span-2 shadow-sm border rounded-xl overflow-hidden">
            <CardHeader className="pb-3 bg-card border-b">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <CardTitle className="text-lg font-bold text-foreground">Top 10 Incentive Claimants</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Highest earning researchers based on finally accepted incentive claims (Accepted, Submitted to Accounts, or Payment Completed).
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {top10Claimants.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground p-6">
                  <Trophy className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm font-medium">No claimants found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="w-[80px] text-center font-bold">Rank</TableHead>
                        <TableHead>Claimant Name</TableHead>
                        <TableHead>MIS ID</TableHead>
                        <TableHead className="text-right font-bold pr-6">Total Approved Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {top10Claimants.map((claimant, index) => {
                        const profileLink = claimant.campus === 'Goa'
                          ? `/goa/${claimant.misId}`
                          : `/profile/${claimant.misId}`;
                        return (
                          <TableRow key={claimant.uid} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="text-center font-extrabold text-sm text-muted-foreground">
                              {index === 0 ? "🥇 1" : index === 1 ? "🥈 2" : index === 2 ? "🥉 3" : `${index + 1}`}
                            </TableCell>
                            <TableCell className="font-semibold">
                              {claimant.misId ? (
                                <Link
                                  href={profileLink}
                                  className="text-primary hover:underline font-semibold"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {claimant.name}
                                </Link>
                              ) : (
                                <span>{claimant.name}</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{claimant.misId || 'N/A'}</TableCell>
                            <TableCell className="text-right pr-6 font-bold text-green-600 dark:text-green-400">
                              ₹{claimant.total.toLocaleString('en-IN')}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Journals for Published Articles Card */}
          <Card className="lg:col-span-2 shadow-sm border rounded-xl overflow-hidden">
            <CardHeader className="pb-3 bg-card border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl text-primary shrink-0">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold text-foreground">Top Journals for Published Articles</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Top journals where Parul University research articles are published. Click any journal to view article details.
                  </CardDescription>
                </div>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search journal name..."
                  value={topJournalSearch}
                  onChange={(e) => setTopJournalSearch(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-xl shadow-sm"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {displayTopJournals.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground p-6">
                  <BookCopy className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm font-medium">No journals found matching your search.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="w-[80px] text-center font-bold">Rank</TableHead>
                        <TableHead>Journal Name</TableHead>
                        <TableHead className="text-center font-bold">Published Articles</TableHead>
                        <TableHead className="w-[140px] text-right pr-6">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayTopJournals.slice(0, 15).map((journal, index) => (
                        <TableRow
                          key={journal.journalName || index}
                          className="hover:bg-primary/5 transition-colors cursor-pointer group"
                          onClick={() => setSelectedJournalForDrilldown(journal)}
                        >
                          <TableCell className="text-center font-extrabold text-sm text-muted-foreground">
                            {index === 0 ? "🥇 1" : index === 1 ? "🥈 2" : index === 2 ? "🥉 3" : `${index + 1}`}
                          </TableCell>
                          <TableCell className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            <span className="line-clamp-2">{journal.journalName}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-primary/10 text-primary hover:bg-primary/20 font-bold px-3 py-1 text-xs rounded-full">
                              📄 {journal.count} {journal.count === 1 ? 'Article' : 'Articles'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Button variant="ghost" size="sm" className="h-8 text-xs font-semibold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all rounded-lg">
                              View Articles <ChevronRight className="h-3.5 w-3.5 ml-1" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            {displayTopJournals.length > 0 && (
              <CardFooter className="justify-between border-t py-3 px-6 text-xs text-muted-foreground bg-muted/20">
                <span>Showing top {Math.min(15, displayTopJournals.length)} of {displayTopJournals.length} journals</span>
                <span className="font-medium text-primary">Click any row to open article details</span>
              </CardFooter>
            )}
          </Card>

          {false && (
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Stage 1 Approver Performance</CardTitle>
                  <CardDescription>Applications reviewed by each Stage 1 approver.</CardDescription>
                </div>
                <Button variant="outline" size="icon" onClick={() => handleExport(stage1ApproverChartRef, 'stage1_approver_performance')}>
                  <Download className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <div ref={stage1ApproverChartRef} className="p-4 bg-card">
                  <ChartContainer config={stage1ApproverConfig} className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stage1ApproverData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: mutedTextColor }} />
                        <YAxis allowDecimals={false} tick={{ fill: mutedTextColor }} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="count" position="top" offset={8} fill={textColor} fontSize={12} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              </CardContent>
            </Card>
          )}
          {false && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    Average Wait Time by Approval Stage
                  </CardTitle>
                  <CardDescription>
                    Average number of days applications spend in each workflow stage.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleExport(waitTimeChartRef, 'average_wait_times_by_stage')}
                  title="Export Chart"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                <div ref={waitTimeChartRef} className="p-4 bg-card">
                  <ChartContainer config={waitTimeChartConfig} className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={averageStageWaitTimesData}
                        layout="vertical"
                        margin={{ left: 10, right: 30, top: 10, bottom: 10 }}
                      >
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                        <YAxis
                          dataKey="stage"
                          type="category"
                          tickLine={false}
                          axisLine={false}
                          width={180}
                          tick={{ fontSize: 11, fill: mutedTextColor }}
                        />
                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 12, fill: mutedTextColor }}
                          label={{
                            value: 'Average Days',
                            position: 'insideBottom',
                            offset: -5,
                            fontSize: 12,
                            fill: mutedTextColor,
                          }}
                        />
                        <ChartTooltip
                          cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                          content={
                            <ChartTooltipContent
                              formatter={(value, name, props) => (
                                <div className="flex flex-col gap-1">
                                  <span className="font-semibold text-foreground">
                                    {value} Days avg.
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    Based on {props.payload.count} applications
                                  </span>
                                </div>
                              )}
                            />
                          }
                        />
                        <Bar
                          dataKey="days"
                          fill="hsl(var(--destructive))"
                          radius={[0, 4, 4, 0]}
                          barSize={20}
                        >
                          <LabelList
                            dataKey="days"
                            position="right"
                            offset={8}
                            fill={textColor}
                            className="font-medium"
                            fontSize={11}
                            formatter={(value: number) => `${value}d`}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 mt-6">
          <Card ref={monthlyPublicationChartRef}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Monthly Publication Distribution</CardTitle>
                <CardDescription>Number of articles published by month and year.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleExport(monthlyPublicationChartRef, 'publication_monthly_distribution')}
              >
                <Download className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-card">
                <ChartContainer config={monthlyChartConfig} className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyDistributionData} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="month"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tick={{ fontSize: 12, fill: mutedTextColor }}
                      />
                      <YAxis allowDecimals={false} tick={{ fill: mutedTextColor }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', r: 4 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </CardContent>
            <CardFooter className="justify-center border-t pt-4"><span className="text-sm font-semibold text-muted-foreground card-total-text">Total Publications: {monthlyDistributionData.reduce((sum, item) => sum + item.count, 0)}</span></CardFooter>
          </Card>
          <Card ref={submissionVsApprovalChartRef}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Incentive Submissions vs. Approvals
                </CardTitle>
                <CardDescription>
                  Comparison of claims submitted vs. claims approved at Stage 4.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleExport(submissionVsApprovalChartRef, 'incentive_submissions_vs_approvals')}
                title="Export Chart"
              >
                <Download className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-card">
                <ChartContainer config={subVsAppChartConfig} className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={submissionsVsApprovalsData} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="month"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tick={{ fontSize: 11, fill: mutedTextColor }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: mutedTextColor }}
                      />
                      <ChartTooltip
                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                        content={<ChartTooltipContent />}
                      />
                      <Bar
                        dataKey="submissions"
                        name="Submitted Claims"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="approvals"
                        name="Approved"
                        fill="hsl(142.1 76.2% 36.3%)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </CardContent>
            <CardFooter className="justify-center border-t pt-4"><span className="text-sm font-semibold text-muted-foreground card-total-text">Total Submitted: {submissionsVsApprovalsData.reduce((sum, item) => sum + item.submissions, 0)} | Total Approved: {submissionsVsApprovalsData.reduce((sum, item) => sum + item.approvals, 0)}</span></CardFooter>
          </Card>
          <Card ref={autoCalcAccuracyChartRef}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCheck className="h-5 w-5 text-primary" />
                  Auto-Calculation Accuracy & Performance
                </CardTitle>
                <CardDescription>
                  Comparison of system auto-calculated incentives vs. final amounts approved by Stage 4.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleExport(autoCalcAccuracyChartRef, 'auto_calculation_accuracy')}
                title="Export Chart"
              >
                <Download className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-card">
                {autoCalcStats.totalClaims === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-muted rounded-xl bg-muted/20 h-[300px]">
                    <CheckCheck className="h-12 w-12 text-muted-foreground/60 mb-3 animate-pulse" />
                    <p className="text-sm font-medium text-foreground mb-1">No Data Available</p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      There are currently no incentive claims approved at Stage 4 to analyze system calculation correctness.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                    <div className="md:col-span-6 h-[260px] w-full">
                      <ChartContainer config={autoCalcChartConfig} className="h-full w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <ChartTooltip
                              cursor={false}
                              content={
                                <ChartTooltipContent
                                  hideLabel
                                  formatter={(value, name, props) => (
                                    <div className="flex flex-col gap-1">
                                      <span className="font-semibold text-foreground">
                                        {props.payload.name}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {value} claims ({props.payload.percentage}%)
                                      </span>
                                    </div>
                                  )}
                                />
                              }
                            />
                            <Pie
                              data={autoCalcStats.chartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={85}
                              paddingAngle={4}
                            >
                              {autoCalcStats.chartData.map((entry, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={AUTO_CALC_COLORS[index % AUTO_CALC_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Legend verticalAlign="bottom" height={36} />
                          </PieChart>
                        </ResponsiveContainer>
                      </ChartContainer>
                    </div>
                    <div className="md:col-span-6 space-y-4">
                      <div className="p-4 bg-muted/40 border rounded-xl flex flex-col items-center text-center">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          System Auto-Calc Accuracy
                        </span>
                        <span className="text-4xl font-extrabold text-green-600 dark:text-green-400 mt-1">
                          {autoCalcStats.accuracyRate}%
                        </span>
                        <p className="text-xs text-muted-foreground mt-2 max-w-[220px]">
                          System-calculated amounts were verified and forwarded without any modification by the approvals team.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="border p-3 rounded-lg flex flex-col justify-between">
                          <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                            Exact Matches
                          </span>
                          <span className="text-xl font-bold text-foreground mt-1">
                            {autoCalcStats.exactMatches} <span className="text-xs font-normal text-muted-foreground">claims</span>
                          </span>
                        </div>
                        <div className="border p-3 rounded-lg flex flex-col justify-between">
                          <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                            Manually Adjusted
                          </span>
                          <span className="text-xl font-bold text-foreground mt-1">
                            {autoCalcStats.manualAdjustments} <span className="text-xs font-normal text-muted-foreground">claims</span>
                          </span>
                        </div>
                      </div>
                      <div className="pt-2 border-t text-[11px] text-muted-foreground space-y-1 bg-muted/10 p-2 rounded-lg">
                        <div className="flex justify-between">
                          <span>Average System Auto-Calculated Value:</span>
                          <span className="font-semibold text-foreground">₹{autoCalcStats.avgAutoCalculated.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Average Stage 4 Approved Value:</span>
                          <span className="font-semibold text-foreground">₹{autoCalcStats.avgForwarded.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCheck className="h-5 w-5 text-primary" />
                  Category-Wise Auto-Calc Accuracy
                </CardTitle>
                <CardDescription>
                  Auto-calculation accuracy rates broken down by claim category.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center">
              {autoCalcStats.totalClaims === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-muted rounded-xl bg-muted/20 h-[300px]">
                  <CheckCheck className="h-12 w-12 text-muted-foreground/60 mb-3 animate-pulse" />
                  <p className="text-sm font-medium text-foreground mb-1">No Data Available</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    There are currently no incentive claims approved at Stage 4 to analyze category-wise calculation correctness.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 my-2">
                  {autoCalcStats.categoryAccuracyList.map((item) => {
                    let progressColor = "bg-green-500";
                    let textColor = "text-green-600 dark:text-green-400";
                    if (item.accuracyRate < 70) {
                      progressColor = "bg-rose-500";
                      textColor = "text-rose-600 dark:text-rose-400";
                    } else if (item.accuracyRate < 90) {
                      progressColor = "bg-amber-500";
                      textColor = "text-amber-600 dark:text-amber-400";
                    }

                    return (
                      <div key={item.category} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground truncate max-w-[200px]" title={item.category}>
                            {item.category}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground font-light text-[10px]">
                              {item.exactMatches}/{item.totalClaims} matched
                            </span>
                            <span className={`font-bold ${textColor}`}>
                              {item.accuracyRate}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                            style={{ width: `${item.accuracyRate}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          <Card ref={collaborationChartRef} className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5 text-primary" />
                  Interdisciplinary Collaboration Profile
                </CardTitle>
                <CardDescription>
                  Share of publications and projects crossing different departments, faculties, or with external institutions.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleExport(collaborationChartRef, 'interdisciplinary_collaboration_profile')}
                title="Export Chart"
              >
                <Download className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 bg-muted/40 p-3 border rounded-xl">
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Interdisciplinary Rate</span>
                    <span className="text-xl font-extrabold text-primary">{interdisciplinaryData.interdisciplinaryRate}%</span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">Of all research involves cross-faculty or external collaboration.</span>
                  </div>
                </div>
                <div className="p-4 bg-card h-[280px] w-full">
                  <ChartContainer config={interdisciplinaryConfig} className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <ChartTooltip
                          cursor={false}
                          content={
                            <ChartTooltipContent
                              hideLabel
                              formatter={(value, name, props) => (
                                <div className="flex flex-col gap-1">
                                  <span className="font-semibold text-foreground">
                                    {props.payload.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {value} entries ({props.payload.percentage}%)
                                  </span>
                                </div>
                              )}
                            />
                          }
                        />
                        <Pie
                          data={interdisciplinaryData.chartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={85}
                          paddingAngle={4}
                        >
                          {interdisciplinaryData.chartData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={INTER_COLORS[index % INTER_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              </div>
            </CardContent>
          </Card>
          {false && (
            <Card className="flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary animate-pulse" />
                    Top Collaborating Institutions (AI Inferred)
                  </CardTitle>
                  <CardDescription>
                    Gemini AI normalized list of top collaborating institutions and research centers.
                  </CardDescription>
                </div>
                {collaborationInstitutes.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAnalyzeCollaborations}
                    disabled={isAnalyzingInstitutes}
                    className="flex items-center gap-2"
                  >
                    {isAnalyzingInstitutes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Loader2 className="h-4 w-4" />}
                    Re-Analyze
                  </Button>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-center">
                {collaborationInstitutes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-muted rounded-xl bg-muted/20">
                    <Award className="h-12 w-12 text-muted-foreground/60 mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">No AI Analysis Performed Yet</p>
                    <p className="text-xs text-muted-foreground max-w-sm mb-4">
                      Analyze co-authorship and project details using Google Gemini to extract and standardize external institutes.
                    </p>
                    <Button
                      onClick={handleAnalyzeCollaborations}
                      disabled={isAnalyzingInstitutes}
                      className="flex items-center gap-2 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white shadow-lg transition-all"
                    >
                      {isAnalyzingInstitutes ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Analyzing with Gemini...
                        </>
                      ) : (
                        <>
                          <Loader2 className="h-4 w-4" />
                          Analyze Collaborations
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">Rank</TableHead>
                          <TableHead>Institution</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead className="text-right">Co-Authored Entries</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {collaborationInstitutes.slice(0, 5).map((inst, index) => (
                          <TableRow key={index} className="hover:bg-muted/40 transition-colors">
                            <TableCell className="font-semibold text-primary">{index + 1}</TableCell>
                            <TableCell className="font-medium text-foreground max-w-[200px] truncate" title={inst.name}>
                              {inst.name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[11px] font-normal">
                                {inst.country}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <button
                                onClick={() => setSelectedInstDrilldown(inst.name)}
                                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline hover:text-primary/80 transition-colors cursor-pointer"
                                title={`View papers linked to ${inst.name}`}
                              >
                                {inst.count}
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {/* Drill-down Dialog */}
                    <Dialog open={!!selectedInstDrilldown} onOpenChange={(o) => !o && setSelectedInstDrilldown(null)}>
                      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                        <DialogHeader className="shrink-0">
                          <DialogTitle className="flex items-center gap-2 text-base">
                            <Building2 className="h-4 w-4 text-primary" />
                            {selectedInstDrilldown}
                          </DialogTitle>
                          <DialogDescription className="text-xs">
                            All co-authored entries where an external author/co-PI is affiliated with this institution.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto mt-2">
                          {(() => {
                            const entries = selectedInstDrilldown ? getDrilldownEntries(selectedInstDrilldown as string) : [];
                            if (entries.length === 0) {
                              return (
                                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                  <Info className="h-8 w-8 mb-2 opacity-50" />
                                  <p className="text-sm">No matching records found in current data.</p>
                                  <p className="text-xs mt-1 text-center max-w-xs">The AI may have normalized multiple raw names into this institution. Try re-analyzing to update.</p>
                                </div>
                              );
                            }
                            return (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-[130px]">Claim / Project ID</TableHead>
                                    <TableHead>Title</TableHead>
                                    <TableHead>Journal</TableHead>
                                    <TableHead>Submitter</TableHead>
                                    <TableHead className="text-center w-[100px]">Links</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {entries.map((entry, idx) => (
                                    <TableRow key={idx} className="hover:bg-muted/30 transition-colors">
                                      <TableCell className="font-mono text-xs text-muted-foreground">
                                        <div className="flex flex-col gap-0.5">
                                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full w-fit ${entry.type === 'claim' ? 'bg-blue-500/10 text-blue-600' : 'bg-amber-500/10 text-amber-600'
                                            }`}>{entry.type === 'claim' ? 'Paper' : 'Project'}</span>
                                          <span>{entry.claimId || entry.id.slice(0, 8)}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-xs font-medium max-w-[220px]">
                                        <p className="line-clamp-2" title={entry.title}>{entry.title}</p>
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                                        {entry.journalName || '—'}
                                      </TableCell>
                                      <TableCell className="text-xs text-muted-foreground">
                                        {entry.submitterName || '—'}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          {entry.doi && (
                                            <a href={`https://doi.org/${entry.doi}`} target="_blank" rel="noopener noreferrer"
                                              className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-0.5"
                                              title={`DOI: ${entry.doi}`}>
                                              DOI <ExternalLink className="h-2.5 w-2.5" />
                                            </a>
                                          )}
                                          {entry.relevantLink && (
                                            <a href={entry.relevantLink} target="_blank" rel="noopener noreferrer"
                                              className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors flex items-center gap-0.5"
                                              title="View paper/proof">
                                              Link <ExternalLink className="h-2.5 w-2.5" />
                                            </a>
                                          )}
                                          {!entry.doi && !entry.relevantLink && (
                                            <span className="text-[10px] text-muted-foreground">—</span>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            );
                          })()}
                        </div>
                        <div className="shrink-0 pt-3 border-t text-[10px] text-muted-foreground">
                          Entries are matched from current filtered data using raw co-author organization names.
                        </div>
                      </DialogContent>
                    </Dialog>

                    {collaborationInstitutes.length > 5 && (
                      <p className="text-[10px] text-muted-foreground text-center mt-3">
                        Showing top 5 of {collaborationInstitutes.length} AI classified institutes.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* --- Research Productivity & ROI Analysis Card --- */}
          <Card ref={researchRoiChartRef} className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                  Research Productivity & "ROI" Analysis
                </CardTitle>
                <CardDescription>
                  Dual-axis comparison of total funding (IMR + EMR + Incentives in ₹ Lakhs) and research output count.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleExport(researchRoiChartRef, 'research_productivity_roi_analysis')}
                title="Export Chart"
              >
                <Download className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 bg-muted/40 p-3 border rounded-xl">
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Average Cost per Q1 Publication</span>
                    <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">
                      ₹{roiKpiStats.avgCostPerQ1.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">Calculated using approved incentive amounts.</span>
                  </div>
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 font-bold px-2 py-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> ROI Oriented
                  </Badge>
                </div>
                <div className="h-[280px] w-full">
                  <ChartContainer config={researchRoiConfig} className="h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={researchRoiData} margin={{ top: 10, right: 5, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="group" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11, fill: mutedTextColor }} />
                        <YAxis yAxisId="left" tickLine={false} axisLine={false} label={{ value: '₹ Lakhs', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: mutedTextColor } }} tick={{ fontSize: 10, fill: mutedTextColor }} />
                        <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} label={{ value: 'Outputs', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 10, fill: mutedTextColor } }} tick={{ fontSize: 10, fill: mutedTextColor }} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar yAxisId="left" dataKey="funds" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Total Funds (₹ Lakhs)" />
                        <Line yAxisId="right" type="monotone" dataKey="output" stroke="hsl(142.1 76.2% 36.3%)" strokeWidth={2.5} dot={{ fill: 'hsl(142.1 76.2% 36.3%)', r: 4 }} name="Outputs Count" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* --- Emerging Research Topics Explorer Card --- */}
        <Card ref={emergingTopicsChartRef} className="mt-6 flex flex-col w-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Emerging Research Topics Explorer
              </CardTitle>
              <CardDescription>
                Dynamic clustering of active publications and claims by research subdomain, with AI classification details.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleExport(emergingTopicsChartRef, 'emerging_research_topics')}
              title="Export Chart"
            >
              <Download className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Subdomain list (hot topics) */}
                <div className="lg:col-span-4 flex flex-col">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Emerging Subdomains</span>
                  <div className="max-h-[380px] overflow-y-auto pr-2 space-y-2 scrollbar-thin">
                    {emergingTopicsFlatData.length === 0 ? (
                      <div className="text-center py-8 text-xs text-muted-foreground">No active subdomains found.</div>
                    ) : (
                      emergingTopicsFlatData.map((item, index) => {
                        const fullName = `${item.domain} • ${item.name}`;
                        const isSelected = selectedSubdomain === fullName || selectedSubdomain === item.name;
                        return (
                          <button
                            key={index}
                            onClick={() => setSelectedSubdomain(fullName)}
                            className={`w-full text-left p-3 rounded-xl border transition-all duration-200 flex items-start justify-between gap-3 ${isSelected
                              ? 'bg-primary/10 border-primary shadow-sm scale-[1.01]'
                              : 'bg-card hover:bg-muted/40 hover:scale-[1.005] border-muted'
                              }`}
                          >
                            <div className="space-y-1">
                              <span className={`text-xs font-bold block ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                                {item.name}
                              </span>
                              <Badge variant="outline" className="text-[10px] py-0 px-1 font-normal opacity-80">
                                {item.domain}
                              </Badge>
                            </div>
                            <Badge variant={isSelected ? 'default' : 'secondary'} className="text-[10px] font-semibold shrink-0">
                              {item.value} papers
                            </Badge>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Column: Drilldown Publications details */}
                <div className="lg:col-span-8 flex flex-col border-t lg:border-t-0 lg:border-l lg:pl-6 pt-4 lg:pt-0">
                  <div className="flex items-center justify-between border-b pb-2 mb-4">
                    <div>
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Selected Subdomain Insights</span>
                      <span className="text-sm font-bold text-foreground">
                        {selectedSubdomain ? selectedSubdomain.split(' • ')[1] || selectedSubdomain : 'Select a subdomain'}
                      </span>
                    </div>
                    {selectedSubdomain && (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 font-bold border-amber-200">
                        Active Area
                      </Badge>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-center min-h-[300px]">
                    {!selectedSubdomain ? (
                      <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full">
                        <Zap className="h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm font-medium">Select an Emerging Hot Topic</p>
                        <p className="text-xs text-muted-foreground/80 max-w-sm mt-1">
                          Click on any subdomain on the left to explore recent publication entries, classification scores, and keywords.
                        </p>
                      </div>
                    ) : subdomainPublications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground h-full">
                        <Info className="h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm font-medium">No Recent Publications Found</p>
                        <p className="text-xs text-muted-foreground/80 max-w-sm mt-1">
                          No publication details are indexed for this subdomain cluster in the selected filters.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 overflow-y-auto max-h-[330px] pr-2 scrollbar-thin">
                        {subdomainPublications.map((pub) => (
                          <div key={pub.id} className="p-3 border rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors flex flex-col gap-1.5">
                            <div className="flex items-start justify-between gap-4">
                              <span className="text-xs font-bold text-foreground line-clamp-1" title={pub.title}>
                                {pub.title}
                              </span>
                              <Badge variant={pub.confidence >= 75 ? 'default' : pub.confidence >= 55 ? 'secondary' : 'outline'} className="text-[10px] font-bold shrink-0">
                                {pub.confidence}% Conf.
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-muted-foreground font-medium">
                              <span className="flex items-center gap-1 font-semibold text-primary">
                                ID: {pub.claimId}
                              </span>
                              {pub.matchedKeywords.length > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-muted-foreground font-normal">Keywords:</span>
                                  {pub.matchedKeywords.map((kw, i) => (
                                    <Badge key={i} variant="outline" className="text-[9px] py-0 px-1 select-none">
                                      {kw}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>


      </div>

      {/* --- System & AI Analytics Section --- */}
      {false && user?.role === 'Super-admin' && (
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
            <Card ref={fieldOfStudyChartRef}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Field of Studies by Domain</CardTitle>
                    <CardDescription>Primary domain distribution inferred from claim titles.</CardDescription>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => handleExport(fieldOfStudyChartRef, 'field_of_studies_domain_distribution')}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {fieldOfStudyData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    No domain data available.
                  </div>
                ) : (
                  <div className="overflow-auto border rounded-xl max-h-[420px] relative scrollbar-thin shadow-inner bg-card">
                    <Table className="border-collapse text-xs w-full">
                      <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-20 shadow-[0_1px_0_0_rgba(0,0,0,0.1)]">
                        <TableRow>
                          <TableHead className="font-bold border-b py-3 px-4 text-left">
                            Domain Field
                          </TableHead>
                          <TableHead className="font-bold border-b py-3 px-4 text-center w-[120px]">
                            Claims Count
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fieldOfStudyData.map((item) => (
                          <TableRow key={item.field} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-semibold border-b py-2.5 px-4 text-left">
                              {item.field}
                            </TableCell>
                            <TableCell className="border-b py-2.5 px-4 text-center font-bold text-foreground/90">
                              {item.count}
                            </TableCell>
                          </TableRow>
                        ))}

                        {/* Total Row */}
                        <TableRow className="bg-muted/40 hover:bg-muted/50 font-bold border-t-2">
                          <TableCell className="py-3 px-4 text-left font-bold">
                            Grand Total
                          </TableCell>
                          <TableCell className="py-3 px-4 text-center font-extrabold">
                            {fieldOfStudyData.reduce((sum, item) => sum + item.count, 0)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table >
                  </div >
                )
                }
              </CardContent >
            </Card >

            <Card ref={fieldOfStudySubdomainChartRef}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Top Subdomains</CardTitle>
                    <CardDescription>Most frequent granular research areas (top 12).</CardDescription>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => handleExport(fieldOfStudySubdomainChartRef, 'field_of_studies_subdomain_distribution')}>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {fieldOfStudySubdomainData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    No subdomain data available.
                  </div>
                ) : (
                  <div className="overflow-auto border rounded-xl max-h-[420px] relative scrollbar-thin shadow-inner bg-card">
                    <Table className="border-collapse text-xs w-full">
                      <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-20 shadow-[0_1px_0_0_rgba(0,0,0,0.1)]">
                        <TableRow>
                          <TableHead className="font-bold border-b py-3 px-4 text-left">
                            Subdomain Area
                          </TableHead>
                          <TableHead className="font-bold border-b py-3 px-4 text-center w-[120px]">
                            Claims Count
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fieldOfStudySubdomainData.map((item) => (
                          <TableRow key={item.subdomain} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="font-semibold border-b py-2.5 px-4 text-left">
                              {item.subdomain}
                            </TableCell>
                            <TableCell className="border-b py-2.5 px-4 text-center font-bold text-foreground/90">
                              {item.count}
                            </TableCell>
                          </TableRow>
                        ))}

                        {/* Total Row */}
                        <TableRow className="bg-muted/40 hover:bg-muted/50 font-bold border-t-2">
                          <TableCell className="py-3 px-4 text-left font-bold">
                            Grand Total
                          </TableCell>
                          <TableCell className="py-3 px-4 text-center font-extrabold">
                            {fieldOfStudySubdomainData.reduce((sum, item) => sum + item.count, 0)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div >
          <Card className="mt-6"><CardHeader><CardTitle>Claim-Level Domain Drilldown</CardTitle><CardDescription>Recent claims with inferred domain, subdomain, confidence, and matched title signals.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Claim ID</TableHead><TableHead>Claim Type</TableHead><TableHead>Title</TableHead><TableHead>Domain</TableHead><TableHead>Subdomain</TableHead><TableHead>Confidence</TableHead><TableHead>Matched Signals</TableHead></TableRow></TableHeader><TableBody>{fieldOfStudyDrilldown.map((row) => (<TableRow key={row.id}><TableCell className="font-medium"><button onClick={() => { const claim = filteredIncentiveClaims.find(c => c.id === row.id); if (claim) { setSelectedClaimForDetails(claim); } else { toast({ variant: 'destructive', title: 'Claim Not Found', description: `Could not find claim object for ID ${row.claimId}` }); } }} className="text-primary hover:underline font-semibold cursor-pointer text-left">{row.claimId}</button></TableCell><TableCell>{row.claimType}</TableCell><TableCell className="max-w-[320px] truncate" title={row.title}>{row.title}</TableCell><TableCell>{row.domain}</TableCell><TableCell>{row.subdomain}</TableCell><TableCell><Badge variant={row.confidence >= 75 ? 'default' : row.confidence >= 55 ? 'secondary' : 'outline'}>{row.confidence}%</Badge></TableCell><TableCell className="max-w-[240px] truncate" title={row.matchedKeywords.join(', ')}>{row.matchedKeywords.length > 0 ? row.matchedKeywords.join(', ') : 'No explicit signal'}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
          <Card ref={activeUsersChartRef}>
            <CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Daily Active Users</CardTitle><CardDescription>Unique user logins over the past 7 days.</CardDescription></div><Button variant="outline" size="icon" onClick={() => handleExport(activeUsersChartRef, 'daily_active_users')}><Download className="h-4 w-4" /></Button></CardHeader>
            <CardContent><div className="p-4 bg-card"><ChartContainer config={dailyActiveUsersConfig} className="h-[300px] w-full"><BarChart accessibilityLayer data={dailyActiveUsersData}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tick={{ fill: mutedTextColor }} /><YAxis tick={{ fill: mutedTextColor }} /><ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} /><Bar dataKey="users" fill="var(--color-users)" radius={8} /></BarChart></ChartContainer></div></CardContent>
          </Card>
        </div >
      )}
      <ExportClaimsDialog
        isOpen={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        filteredClaims={filteredIncentiveClaims}
        users={users}
        toast={toast}
        facultyFilter={facultyFilter}
      />
      {/* Journal Article Drilldown Dialog */}
      <Dialog
        open={selectedJournalForDrilldown !== null}
        onOpenChange={(open) => { if (!open) setSelectedJournalForDrilldown(null); }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="p-6 pb-4 bg-muted/30 border-b">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-xl font-bold text-foreground leading-snug flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary shrink-0" />
                  {selectedJournalForDrilldown?.journalName}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Total Published Articles: <strong className="text-foreground font-bold">{selectedJournalForDrilldown?.count}</strong>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6">
            {!selectedJournalForDrilldown || selectedJournalForDrilldown.articles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium">No articles available for this journal.</p>
              </div>
            ) : (
              <div className="border rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-muted/60">
                    <TableRow>
                      <TableHead className="w-[50px] text-center font-bold">#</TableHead>
                      <TableHead className="min-w-[280px]">Paper / Article Title</TableHead>
                      <TableHead className="min-w-[160px]">DOI</TableHead>
                      <TableHead className="min-w-[140px]">Month & Year of Publication</TableHead>
                      <TableHead className="min-w-[200px]">Author Names (from PU)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedJournalForDrilldown.articles.map((article, idx) => {
                      const doiUrl = article.doi
                        ? (article.doi.startsWith('http') ? article.doi : `https://doi.org/${article.doi}`)
                        : article.scopusLink || article.wosLink;

                      return (
                        <TableRow key={article.id || idx} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-center font-bold text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-semibold text-sm leading-snug text-foreground py-3">
                            <div>
                              {article.claim ? (
                                <button
                                  onClick={() => {
                                    setSelectedJournalForDrilldown(null);
                                    setSelectedClaimForDetails(article.claim!);
                                  }}
                                  className="text-left font-semibold text-primary hover:underline text-sm leading-snug block"
                                  title="Click to view full claim details"
                                >
                                  {article.title}
                                </button>
                              ) : (
                                <span className="font-semibold text-foreground text-sm leading-snug block">{article.title}</span>
                              )}

                              {article.claimId && (
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-2 py-0.5 text-[10px] font-mono font-bold tracking-tight">
                                    Claim ID: {article.claimId}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {article.doi ? (
                              <a
                                href={doiUrl!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1 font-mono text-xs break-all"
                              >
                                {article.doi}
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            ) : article.scopusLink ? (
                              <a
                                href={article.scopusLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1 font-mono text-xs"
                              >
                                View Link
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-foreground/80">
                            <Badge variant="outline" className="bg-muted/40 font-mono text-xs">
                              <Calendar className="h-3 w-3 mr-1 text-muted-foreground" />
                              {article.monthYear}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-wrap gap-1">
                              {article.puAuthors.length > 0 ? (
                                article.puAuthors.map((authorName, aIdx) => (
                                  <Badge key={aIdx} variant="secondary" className="bg-primary/10 text-primary border-primary/20 font-medium text-[11px]">
                                    {authorName}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 bg-muted/20 border-t justify-end">
            <Button variant="outline" onClick={() => setSelectedJournalForDrilldown(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClaimDetailsDialog
        claim={selectedClaimForDetails}
        open={!!selectedClaimForDetails}
        onOpenChange={() => setSelectedClaimForDetails(null)}
        currentUser={user}
        claimant={selectedClaimForDetails ? (users.find(u => u.uid === selectedClaimForDetails.uid) || null) : null}
      />
    </div >
  );
}

const CLAIM_TYPES = [
  'Research Papers',
  'Patents',
  'Conference Presentations',
  'Book',
  'Book Chapter',
  'Membership of Professional Bodies',
  'Seed Money for APC',
  'Award',
  'EMR Sanction Project',
  'Workshop/FDP/Training'
];

function ExportClaimsDialog({
  isOpen,
  onOpenChange,
  filteredClaims,
  users,
  toast,
  facultyFilter
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filteredClaims: IncentiveClaim[];
  users: User[];
  toast: any;
  facultyFilter: string;
}) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'Approved',
    'Pending approval',
    'Pending for Bank',
    'Submitted to bank'
  ]);
  const [selectedClaimTypes, setSelectedClaimTypes] = useState<string[]>(CLAIM_TYPES);
  const [isExporting, setIsExporting] = useState(false);

  const handleToggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleToggleClaimType = (type: string) => {
    setSelectedClaimTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const handleExportClick = async () => {
    if (selectedCategories.length === 0) {
      toast({ variant: 'destructive', title: "Selection Required", description: "Please select at least one status category to export." });
      return;
    }
    if (selectedClaimTypes.length === 0) {
      toast({ variant: 'destructive', title: "Selection Required", description: "Please select at least one incentive category to export." });
      return;
    }

    setIsExporting(true);
    try {
      const statusMap: Record<string, string[]> = {
        'Approved': ['Payment Completed'],
        'Pending approval': ['Pending', 'Pending Stage 1 Approval', 'Pending Stage 2 Approval', 'Pending Stage 3 Approval', 'Pending Stage 4 Approval', 'On Hold'],
        'Pending for Bank': ['Accepted'],
        'Submitted to bank': ['Submitted to Accounts']
      };

      const selectedStatuses = selectedCategories.flatMap(cat => statusMap[cat] || []);
      const claimsToExport = filteredClaims.filter(claim => {
        const matchesStatus = selectedStatuses.includes(claim.status);
        if (!matchesStatus) return false;

        return selectedClaimTypes.some(type => {
          if (type === 'Book') {
            return claim.claimType === 'Books' && claim.bookApplicationType === 'Book';
          }
          if (type === 'Book Chapter') {
            return claim.claimType === 'Books' && claim.bookApplicationType === 'Book Chapter';
          }
          return claim.claimType === type;
        });
      });

      if (claimsToExport.length === 0) {
        toast({ variant: 'destructive', title: "No Data", description: "No claims found matching the selected categories, claim types, and filters." });
        return;
      }

      const userDetailsMap = new Map(users.map(u => [u.uid, { misId: u.misId || '', designation: u.designation || '', department: u.department || '', institute: u.institute || '' }]));

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Claims");

      // Define columns (excluding Beneficiary Name, Account Number, Bank Name, and IFSC Code)
      const columns = [
        { header: 'Claim ID', key: 'claimId', width: 15 },
        { header: 'Employee Name', key: 'userName', width: 25 },
        { header: 'Email', key: 'userEmail', width: 30 },
        { header: 'MIS ID', key: 'misId', width: 15 },
        { header: 'Designation', key: 'designation', width: 20 },
        { header: 'Institute', key: 'institute', width: 25 },
        { header: 'Employee Department', key: 'employeeDepartment', width: 25 },
        { header: 'Faculty', key: 'faculty', width: 20 },
        { header: 'Dept. of First/Corr. Author', key: 'firstAuthorDepartment', width: 30 },
        { header: 'Claim Type', key: 'claimType', width: 20 },
        { header: 'Article Type', key: 'articleType', width: 20 },
        { header: 'Paper Title', key: 'paperTitle', width: 40 },
        { header: 'Publication Month', key: 'publicationMonth', width: 18 },
        { header: 'Publication Year', key: 'publicationYear', width: 18 },
        { header: 'Indexing Type', key: 'indexingType', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Final Approved Amount', key: 'finalApprovedAmount', width: 20 },
        { header: 'Submission Date', key: 'submissionDate', width: 15 },
        { header: 'Quartile', key: 'quartile', width: 12 },
        { header: 'Scopus Link', key: 'scopusLink', width: 35 },
      ];
      worksheet.columns = columns;

      claimsToExport.forEach(claim => {
        const userDetails = userDetailsMap.get(claim.uid);

        // Resolve Department of First/Corresponding Author
        let firstAuthorDepartment = '';
        if (claim.authors && claim.authors.length > 0) {
          const targetAuthor = claim.authors.find(a =>
            a.role === 'First Author' ||
            a.role === 'First & Corresponding Author' ||
            a.role === 'Corresponding Author' ||
            a.role === 'First & Presenting Author'
          ) || claim.authors[0];

          if (targetAuthor && targetAuthor.uid) {
            const authorUser = users.find(u => u.uid === targetAuthor.uid);
            firstAuthorDepartment = authorUser?.department || '';
          }
        }
        // Fallback to claimant's department if first author's department is empty
        if (!firstAuthorDepartment) {
          firstAuthorDepartment = userDetails?.department || '';
        }

        worksheet.addRow({
          claimId: claim.claimId || '',
          userName: claim.userName || '',
          userEmail: claim.userEmail || '',
          misId: userDetails?.misId || '',
          designation: userDetails?.designation || '',
          institute: userDetails?.institute || 'N/A',
          employeeDepartment: userDetails?.department || 'N/A',
          faculty: claim.faculty || '',
          firstAuthorDepartment: firstAuthorDepartment || 'N/A',
          claimType: claim.claimType === 'Books' ? (claim.bookApplicationType || 'Book') : (claim.claimType || ''),
          articleType: claim.claimType === 'Research Papers' ? (claim.publicationType || 'N/A') : 'N/A',
          paperTitle: claim.paperTitle || claim.patentTitle || claim.conferencePaperTitle || claim.publicationTitle || claim.professionalBodyName || claim.apcPaperTitle || claim.awardTitle || claim.emrProjectName || claim.workshopName || 'N/A',
          publicationMonth: claim.publicationMonth || 'N/A',
          publicationYear: claim.publicationYear || 'N/A',
          indexingType: claim.indexType ? claim.indexType.toUpperCase() : 'N/A',
          status: claim.status || '',
          finalApprovedAmount: claim.finalApprovedAmount || 0,
          submissionDate: claim.submissionDate ? new Date(claim.submissionDate).toLocaleDateString() : '',
          quartile: claim.claimType === 'Research Papers' ? (claim.journalClassification || '') : '',
          scopusLink: claim.scopusLink || '',
        });
      });

      // Format headers
      worksheet.getRow(1).height = 30;
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Format data cells
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.height = 24;
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });
        }
      });

      const fileBaseName = facultyFilter === 'all' ? 'All_Assigned_Faculties' : facultyFilter;
      const sanitizedFileName = fileBaseName
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
      const filename = `${sanitizedFileName}_incentivedata.xlsx`;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({ title: "Export Started", description: `Downloading ${claimsToExport.length} claims.` });
      onOpenChange(false);
    } catch (error) {
      console.error('Error exporting claims:', error);
      toast({ variant: 'destructive', title: 'Export Failed', description: 'An error occurred during Excel export.' });
    } finally {
      setIsExporting(false);
    }
  };

  const categories = [
    { id: 'Approved', label: 'Approved (Payment Completed)' },
    { id: 'Pending approval', label: 'Pending approval' },
    { id: 'Pending for Bank', label: 'Pending for Bank (Accepted)' },
    { id: 'Submitted to bank', label: 'Submitted to Bank (Submitted to Accounts)' }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl text-foreground">
        <DialogHeader>
          <DialogTitle>Export Claims to Excel</DialogTitle>
          <DialogDescription>
            Choose which status categories and claim types should be included in the exported spreadsheet.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Status Categories</h4>
            <div className="space-y-3">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={`cat-${cat.id}`}
                    checked={selectedCategories.includes(cat.id)}
                    onCheckedChange={() => handleToggleCategory(cat.id)}
                  />
                  <Label htmlFor={`cat-${cat.id}`} className="text-xs font-medium cursor-pointer">
                    {cat.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Incentive Categories</h4>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-2 scrollbar-thin">
              {CLAIM_TYPES.map(type => (
                <div key={type} className="flex items-center space-x-3">
                  <Checkbox
                    id={`type-${type}`}
                    checked={selectedClaimTypes.includes(type)}
                    onCheckedChange={() => handleToggleClaimType(type)}
                  />
                  <Label htmlFor={`type-${type}`} className="text-xs font-medium cursor-pointer">
                    {type}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleExportClick} disabled={isExporting}>
            {isExporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting...</> : 'Export Excel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
