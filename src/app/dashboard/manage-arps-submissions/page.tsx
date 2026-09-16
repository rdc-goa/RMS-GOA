'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Settings2, CalendarCheck, Save, Download, Calculator, Lock, RefreshCw, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Clock, FileText, Plus } from 'lucide-react';
import { type User } from '@/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import {
  getPolicyRules,
  updatePolicyRules,
  getArpsEvaluationCycles,
  updateArpsEvaluationCycle,
  generateArpsStatisticsReport,
  saveArpsOverride,
  deleteArpsOverride,
  calculateArpsForUser,
  refreshArpsForUserAction,
  refreshArpsForAllUsersAction,
  toggleManualArpsSubmissionAction,
  getAllApprovedPublicationsForYear,
} from '@/app/arps-actions';
import { generatePdfDocument } from '@/lib/arps-pdf';
import { DEFAULT_POLICY_RULES } from '@/lib/arps-defaults';
import { Badge } from '@/components/ui/badge';
import JSZip from 'jszip';

export default function ManageArpsSubmissions() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('cycles');

  // Policy Engine State
  const [policyRules, setPolicyRules] = useState<any>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Cycle & Statistics State
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(`${currentYear - 1}-${currentYear.toString().slice(-2)}`);
  const [cycles, setCycles] = useState<any>({});
  const [statistics, setStatistics] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [downloadingPdfFor, setDownloadingPdfFor] = useState<string | null>(null);
  const [cycleSaving, setCycleSaving] = useState(false);
  const [exportingAllProgress, setExportingAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingUniqueExcel, setExportingUniqueExcel] = useState(false);

  // Overrides State
  const [overridingUser, setOverridingUser] = useState<string | null>(null);
  const [overrideValue, setOverrideValue] = useState<string>('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [togglingManualUser, setTogglingManualUser] = useState<string | null>(null);
  const [historyUser, setHistoryUser] = useState<any | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Deadline State
  const [finalDateValue, setFinalDateValue] = useState<string>('');
  const [presentationDeadlineValue, setPresentationDeadlineValue] = useState<string>('');
  const [createdCycles, setCreatedCycles] = useState<string[]>([]);
  const [creatingCycle, setCreatingCycle] = useState(false);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sort State
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const renderSortHeader = (label: string, key: string, align: 'left' | 'center' | 'right' = 'left') => {
    const isActive = sortKey === key;
    return (
      <th 
        className={`px-6 py-4 cursor-pointer select-none hover:bg-muted-foreground/10 transition-colors ${
          align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
        }`}
        onClick={() => handleSort(key)}
      >
        <div className={`flex items-center gap-1 ${
          align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'
        }`}>
          <span>{label}</span>
          {isActive ? (
            sortOrder === 'asc' ? (
              <ArrowUp className="h-3 w-3 text-primary inline-block" />
            ) : (
              <ArrowDown className="h-3 w-3 text-primary inline-block" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 text-muted-foreground/50 inline-block" />
          )}
        </div>
      </th>
    );
  };

  // Row Refreshing State
  const [refreshingRows, setRefreshingRows] = useState<Record<string, boolean>>({});

  const handleRefreshRow = async (uid: string) => {
    setRefreshingRows(prev => ({ ...prev, [uid]: true }));
    try {
      const res = await refreshArpsForUserAction(uid, selectedYear);
      if (res.success && res.data) {
        toast({ title: 'ARPS Refreshed', description: `Successfully calculated and saved score for this faculty member.` });
        
        // Update statistics in local state immediately
        setStatistics(prev => prev.map(s => {
          if (s.uid === uid) {
            return {
              ...s,
              totalArps: res.data!.totalArps,
              grade: res.data!.grade,
              annualIncrement: res.data!.annualIncrement,
              publicationsCount: res.data!.publicationsCount,
              patentsCount: res.data!.patentsCount,
              emrCount: res.data!.emrCount,
              consultancyCount: res.data!.consultancyCount,
              activitiesCount: res.data!.activitiesCount,
              rawScore: (res.data as any).rawScore ?? null,
              weightedScore: (res.data as any).weightedScore ?? null,
              publicationsRaw: (res.data as any).publicationsRaw ?? null,
              patentsRaw: (res.data as any).patentsRaw ?? null,
              emrRaw: (res.data as any).emrRaw ?? null,
              consultancyRaw: (res.data as any).consultancyRaw ?? null,
              activitiesRaw: (res.data as any).activitiesRaw ?? null,
              lastUpdated: res.data!.updatedAt
            };
          }
          return s;
        }));
      } else {
        toast({ variant: 'destructive', title: 'Refresh Failed', description: res.error || 'Failed to recalculate score.' });
      }
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'An unexpected error occurred.' });
    } finally {
      setRefreshingRows(prev => ({ ...prev, [uid]: false }));
    }
  };

  const [calculatingAll, setCalculatingAll] = useState(false);

  const handleCalculateAll = async () => {
    setCalculatingAll(true);
    try {
      const res = await refreshArpsForAllUsersAction(selectedYear);
      if (res.success) {
        toast({
          title: 'Calculation Complete',
          description: `Successfully recalculated scores for ${res.successCount} faculty members.${
            res.failureCount && res.failureCount > 0 ? ` Failed for ${res.failureCount} users.` : ''
          }`,
        });
        await loadStatistics();
      } else {
        toast({
          variant: 'destructive',
          title: 'Calculation Failed',
          description: res.error || 'Failed to recalculate scores.',
        });
      }
    } catch (err: any) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'An unexpected error occurred.',
      });
    } finally {
      setCalculatingAll(false);
    }
  };

  const router = useRouter();
  const { toast } = useToast();

  const yearOptions = useMemo(() => {
    return Array.from(new Set([
      ...createdCycles,
      ...Object.keys(cycles)
    ])).sort((a, b) => b.localeCompare(a));
  }, [cycles, createdCycles]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const u = JSON.parse(storedUser);
      if (u.role !== 'Super-admin') {
        toast({ variant: 'destructive', title: 'Unauthorized', description: 'Only Super Admins can access the ARPS Management portal.' });
        router.push('/dashboard');
      } else {
        setCurrentUser(u);
      }
    } else {
      router.push('/login');
    }
  }, [router]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [rulesRes, cyclesRes] = await Promise.all([
        getPolicyRules(),
        getArpsEvaluationCycles()
      ]);

      if (rulesRes.success) {
        setPolicyRules(rulesRes.rules);
      } else {
        setPolicyRules(DEFAULT_POLICY_RULES);
      }

      if (cyclesRes.success) {
        setCycles(cyclesRes.cycles);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadInitialData();
    }
  }, [currentUser]);

  const loadStatistics = async () => {
    setLoadingStats(true);
    try {
      const yearInt = parseInt(selectedYear.split('-')[1], 10);
      const res = await generateArpsStatisticsReport(selectedYear);
      if (res.success && res.data) {
        setStatistics(res.data);
      } else {
        toast({ variant: 'destructive', title: 'Load Failed', description: 'Failed to generate ARPS statistics report.' });
      }
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load report.' });
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'cycles' && currentUser) {
      loadStatistics();
    }
  }, [selectedYear, activeTab, currentUser]);

  useEffect(() => {
    if (cycles[selectedYear]) {
      setFinalDateValue(cycles[selectedYear].finalDate || '');
      setPresentationDeadlineValue(cycles[selectedYear].presentationDeadline || '');
    } else {
      setFinalDateValue('');
      setPresentationDeadlineValue('');
    }
  }, [selectedYear, cycles]);

  const handlePolicyChange = (category: string, field: string, value: number) => {
    setPolicyRules((prev: any) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  };

  const handleEmrTierChange = (type: 'sanctioned' | 'ongoing', index: number, field: 'pi' | 'copi', value: number) => {
    setPolicyRules((prev: any) => {
      const updatedTiers = [...(prev.emr?.[type] || [])];
      if (updatedTiers[index]) {
        updatedTiers[index] = {
          ...updatedTiers[index],
          [field]: value
        };
      }
      return {
        ...prev,
        emr: {
          ...prev.emr,
          [type]: updatedTiers
        }
      };
    });
  };

  const handleConsultancySlabChange = (index: number, value: number) => {
    setPolicyRules((prev: any) => {
      const updatedSlabs = [...(prev.consultancy?.slabs || [])];
      if (updatedSlabs[index]) {
        updatedSlabs[index] = {
          ...updatedSlabs[index],
          points: value
        };
      }
      return {
        ...prev,
        consultancy: {
          ...prev.consultancy,
          slabs: updatedSlabs
        }
      };
    });
  };

  const savePolicy = async () => {
    setSavingPolicy(true);
    try {
      const res = await updatePolicyRules(policyRules);
      if (res.success) {
        toast({ title: 'Policy Updated', description: 'Scoring rules updated successfully in RTDB.' });
      } else {
        toast({ variant: 'destructive', title: 'Update Failed', description: res.error });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingPolicy(false);
    }
  };

  const updateCycleStatus = async (status: 'active' | 'frozen') => {
    setCycleSaving(true);
    try {
      const payload = { status, finalized: status === 'frozen', finalDate: cycles[selectedYear]?.finalDate || null };
      const res = await updateArpsEvaluationCycle(selectedYear, payload);
      if (res.success) {
        setCycles((prev: any) => ({
          ...prev,
          [selectedYear]: payload
        }));
        toast({ title: 'Cycle Updated', description: `Cycle ${selectedYear} is now ${status}.` });
      } else {
        toast({ variant: 'destructive', title: 'Update Failed', description: res.error });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCycleSaving(false);
    }
  };

  const saveFinalDate = async () => {
    setCycleSaving(true);
    try {
      const currentCycle = cycles[selectedYear] || { status: 'active', finalized: false };
      const payload = { ...currentCycle, finalDate: finalDateValue || null };
      const res = await updateArpsEvaluationCycle(selectedYear, payload);
      if (res.success) {
        setCycles((prev: any) => ({
          ...prev,
          [selectedYear]: payload
        }));
        toast({ title: 'Deadline Saved', description: `Final submission date updated.` });
      } else {
        toast({ variant: 'destructive', title: 'Update Failed', description: res.error });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCycleSaving(false);
    }
  };

  const savePresentationDeadline = async () => {
    setCycleSaving(true);
    try {
      const currentCycle = cycles[selectedYear] || { status: 'active', finalized: false };
      const payload = { ...currentCycle, presentationDeadline: presentationDeadlineValue || null };
      const res = await updateArpsEvaluationCycle(selectedYear, payload);
      if (res.success) {
        setCycles((prev: any) => ({
          ...prev,
          [selectedYear]: payload
        }));
        toast({ title: 'Deadline Saved', description: `Presentation upload deadline updated.` });
      } else {
        toast({ variant: 'destructive', title: 'Update Failed', description: res.error });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCycleSaving(false);
    }
  };

  const getNextAcademicYear = () => {
    const years = Array.from(new Set([...Object.keys(cycles), ...yearOptions]));
    if (years.length === 0) return `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
    years.sort();
    const latestYear = years[years.length - 1];
    const match = latestYear.match(/^(\d{4})-\d{2}$/);
    if (match) {
      const startYear = parseInt(match[1], 10);
      const nextStart = startYear + 1;
      const nextEnd = nextStart + 1;
      return `${nextStart}-${nextEnd.toString().slice(-2)}`;
    }
    return `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
  };

  const handleCreateNextCycle = async () => {
    const nextYear = getNextAcademicYear();
    if (!confirm(`Are you sure you want to create a new ARPS evaluation cycle for the academic year ${nextYear}?`)) {
      return;
    }
    setCreatingCycle(true);
    try {
      const newCyclePayload = {
        status: 'active',
        finalized: false,
        finalDate: null,
        presentationDeadline: null
      };
      const res = await updateArpsEvaluationCycle(nextYear, newCyclePayload);
      if (res.success) {
        setCreatedCycles(prev => [...prev, nextYear]);
        setCycles((prev: any) => ({
          ...prev,
          [nextYear]: newCyclePayload
        }));
        setSelectedYear(nextYear);
        toast({ title: 'Cycle Created', description: `Successfully created evaluation cycle for ${nextYear}.` });
      } else {
        toast({ variant: 'destructive', title: 'Creation Failed', description: res.error });
      }
    } catch (error: any) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to create new cycle.' });
    } finally {
      setCreatingCycle(false);
    }
  };

  const handleApplyOverride = async (uid: string) => {
    const val = parseFloat(overrideValue);
    if (isNaN(val) || val < 0 || val > 100) {
      toast({ variant: 'destructive', title: 'Invalid Value', description: 'Score must be a number between 0 and 100.' });
      return;
    }
    setSavingOverride(true);
    try {
      const yearInt = parseInt(selectedYear.split('-')[1], 10);
      const res = await saveArpsOverride(uid, selectedYear, val);
      if (res.success) {
        toast({ title: 'Override Applied', description: `Final ARPS score set to ${val} for faculty.` });
        setOverridingUser(null);
        setOverrideValue('');
        loadStatistics(); // refresh stats
      } else {
        toast({ variant: 'destructive', title: 'Override Failed', description: res.error });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingOverride(false);
    }
  };

  const handleClearOverride = async (uid: string) => {
    setSavingOverride(true);
    try {
      const yearInt = parseInt(selectedYear.split('-')[1], 10);
      const res = await deleteArpsOverride(uid, selectedYear);
      if (res.success) {
        toast({ title: 'Override Cleared', description: 'ARPS score reverted to automatic calculation.' });
        loadStatistics(); // refresh stats
      } else {
        toast({ variant: 'destructive', title: 'Clear Failed', description: res.error });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingOverride(false);
    }
  };

  const handleToggleManualArps = async (uid: string, enabled: boolean) => {
    setTogglingManualUser(uid);
    try {
      const operatorName = currentUser?.name || 'Super Admin';
      const res = await toggleManualArpsSubmissionAction(uid, enabled, operatorName);
      if (res.success) {
        toast({
          title: enabled ? 'Access Granted' : 'Access Revoked',
          description: enabled
            ? 'ARPS submission window has been manually opened for this faculty member.'
            : 'ARPS submission window access has been revoked.',
        });
        const historyItem = {
          enabled,
          timestamp: new Date().toISOString(),
          changedBy: operatorName
        };
        setStatistics(prev => prev.map(s => s.uid === uid ? {
          ...s,
          manualArpsEnabled: enabled,
          manualArpsHistory: [...(s.manualArpsHistory || []), historyItem]
        } : s));
      } else {
        toast({ variant: 'destructive', title: 'Update Failed', description: res.error });
      }
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'An unexpected error occurred.' });
    } finally {
      setTogglingManualUser(null);
    }
  };

  const handleDownloadDetailedReport = async (stat: any) => {
    setDownloadingPdfFor(stat.uid);
    try {
      const result = await calculateArpsForUser(stat.uid, selectedYear);
      if (!result.success || !('data' in result)) {
        toast({ variant: 'destructive', title: 'Calculation Failed', description: (result as any).error || 'Could not fetch detailed data.' });
        return;
      }

      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      const mockUser = {
        name: stat.name,
        misId: stat.misId,
        department: stat.department,
        institute: stat.institute || 'N/A', 
        hIndex: stat.hIndex,
        i10Index: stat.i10Index,
        citationCount: stat.citationCount,
      };

      const doc = await generatePdfDocument(mockUser, result.data, selectedYear, jsPDF, autoTable);
      const safeName = (stat.name || 'faculty').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_');
      doc.save(`ARPS_Report_${safeName}_${selectedYear}.pdf`);
      toast({ title: 'Report Downloaded', description: 'Detailed PDF report generated successfully.' });
    } catch (err: any) {
      console.error('PDF generation error:', err);
      toast({ variant: 'destructive', title: 'Download Failed', description: err?.message || 'Error generating PDF.' });
    } finally {
      setDownloadingPdfFor(null);
    }
  };

  // Bulk PDF Export
  const handleExportAllPdfs = async () => {
    const targets = sortedAndFilteredStatistics;
    if (targets.length === 0) {
      toast({ variant: 'destructive', title: 'No Data', description: 'No faculty records to export.' });
      return;
    }

    setExportingAllProgress({ current: 0, total: targets.length });
    toast({ 
      title: 'Bulk Export Started', 
      description: `Generating and bundling PDFs for ${targets.length} faculty members into a ZIP archive.` 
    });

    try {
      const zip = new JSZip();
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      for (let i = 0; i < targets.length; i++) {
        const stat = targets[i];
        setExportingAllProgress({ current: i + 1, total: targets.length });
        
        try {
          const result = await calculateArpsForUser(stat.uid, selectedYear);
          if (result.success && 'data' in result) {
            const mockUser = {
              name: stat.name,
              misId: stat.misId,
              department: stat.department,
              institute: stat.institute || 'N/A', 
              hIndex: stat.hIndex,
              i10Index: stat.i10Index,
              citationCount: stat.citationCount,
            };

            const doc = await generatePdfDocument(mockUser, result.data, selectedYear, jsPDF, autoTable);
            const safeName = (stat.name || 'faculty').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '_');
            
            const pdfBlob = doc.output('blob');
            zip.file(`ARPS_Report_${safeName}_${selectedYear}.pdf`, pdfBlob);
          }
        } catch (err) {
          console.error(`Failed to export PDF for ${stat.name}:`, err);
        }
        
        // Brief pause to keep UI responsive
        await new Promise(r => setTimeout(r, 50));
      }

      // Generate and download zip
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ARPS_Reports_All_${selectedYear}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ 
        title: 'Bulk Export Complete', 
        description: `Successfully generated and downloaded a ZIP archive with all ${targets.length} reports.` 
      });
    } catch (err: any) {
      console.error('Bulk PDF generation error:', err);
      toast({ variant: 'destructive', title: 'Bulk Export Failed', description: err?.message || 'Error generating ZIP file.' });
    } finally {
      setExportingAllProgress(null);
    }
  };

  // Combined Single PDF Export
  const handleExportCombinedPdf = async () => {
    const targets = sortedAndFilteredStatistics;
    if (targets.length === 0) {
      toast({ variant: 'destructive', title: 'No Data', description: 'No faculty records to export.' });
      return;
    }

    setExportingAllProgress({ current: 0, total: targets.length });
    toast({ 
      title: 'Combined Export Started', 
      description: `Generating a single combined PDF document for ${targets.length} faculty members.` 
    });

    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);

      let doc: any = null;

      for (let i = 0; i < targets.length; i++) {
        const stat = targets[i];
        setExportingAllProgress({ current: i + 1, total: targets.length });
        
        try {
          const result = await calculateArpsForUser(stat.uid, selectedYear);
          if (result.success && 'data' in result) {
            const mockUser = {
              name: stat.name,
              misId: stat.misId,
              department: stat.department,
              institute: stat.institute || 'N/A', 
              hIndex: stat.hIndex,
              i10Index: stat.i10Index,
              citationCount: stat.citationCount,
            };

            if (!doc) {
              doc = await generatePdfDocument(mockUser, result.data, selectedYear, jsPDF, autoTable);
            } else {
              await generatePdfDocument(mockUser, result.data, selectedYear, jsPDF, autoTable, doc);
            }
          }
        } catch (err) {
          console.error(`Failed to export PDF for ${stat.name}:`, err);
        }
        
        // Brief pause to keep UI responsive
        await new Promise(r => setTimeout(r, 50));
      }

      if (doc) {
        doc.save(`ARPS_Reports_Combined_${selectedYear}.pdf`);
        toast({ 
          title: 'Combined Export Complete', 
          description: `Successfully generated and downloaded the combined PDF report.` 
        });
      } else {
        toast({ variant: 'destructive', title: 'Export Failed', description: 'No reports were generated.' });
      }
    } catch (err: any) {
      console.error('Combined PDF generation error:', err);
      toast({ variant: 'destructive', title: 'Export Failed', description: err?.message || 'Error generating PDF.' });
    } finally {
      setExportingAllProgress(null);
    }
  };

  // CSV Export
  const exportToCSV = () => {
    if (statistics.length === 0) return;
    const headers = ['Faculty Name', 'MIS ID', 'Department', 'Raw Score', 'Total ARPS Score', 'Band Grade', 'Annual Increment (INR)', 'Publications', 'Patents', 'Consultancy', 'EMR', 'Activities', 'H-Index', 'i10-Index', 'Citations'];
    const rows = statistics.map(s => [
      `"${s.name}"`,
      `"${s.misId}"`,
      `"${s.department}"`,
      s.rawScore !== null && s.rawScore !== undefined ? s.rawScore.toFixed(2) : '0.00',
      s.totalArps.toFixed(2),
      `"${s.grade}"`,
      s.annualIncrement,
      s.publicationsCount,
      s.patentsCount,
      s.consultancyCount,
      s.emrCount,
      s.activitiesCount,
      s.hIndex ?? 0,
      s.i10Index ?? 0,
      s.citationCount ?? 0
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ARPS_Report_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Excel Export
  const exportToExcel = async () => {
    if (statistics.length === 0) return;
    setExportingExcel(true);
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('ARPS Report');

      // Fetch publication details to bifurcate
      const pubsRes = await getAllApprovedPublicationsForYear(selectedYear);
      const pubMap: {
        [uid: string]: {
          researchArticles: number;
          reviewArticles: number;
          conferenceProceedings: number;
          book: number;
          bookChapter: number;
        }
      } = {};

      if (pubsRes.success && Array.isArray(pubsRes.publications)) {
        pubsRes.publications.forEach((pub: any) => {
          const uid = pub.uid;
          if (!uid) return;
          if (!pubMap[uid]) {
            pubMap[uid] = {
              researchArticles: 0,
              reviewArticles: 0,
              conferenceProceedings: 0,
              book: 0,
              bookChapter: 0,
            };
          }

          const pubType = pub.publicationType;
          const artType = pub.articleType;

          if (pubType === 'Journal') {
            if (artType === 'Review') {
              pubMap[uid].reviewArticles++;
            } else {
              pubMap[uid].researchArticles++;
            }
          } else if (pubType === 'Conference Proceedings') {
            pubMap[uid].conferenceProceedings++;
          } else if (pubType === 'Book Editor') {
            pubMap[uid].book++;
          } else if (pubType === 'Book Chapter') {
            pubMap[uid].bookChapter++;
          }
        });
      }

      // Add columns (for keys and widths)
      worksheet.columns = [
        { key: 'name', width: 44.86 },
        { key: 'email', width: 30 },
        { key: 'misId', width: 15 },
        { key: 'department', width: 35.86 },
        { key: 'rawScore', width: 15 },
        { key: 'totalArps', width: 18 },
        { key: 'grade', width: 12 },
        { key: 'publicationsRaw', width: 18 },
        { key: 'patentsRaw', width: 15 },
        { key: 'emrRaw', width: 18 },
        { key: 'consultancyRaw', width: 18 },
        { key: 'activitiesRaw', width: 22 },
        { key: 'researchArticles', width: 18 },
        { key: 'reviewArticles', width: 16 },
        { key: 'conferenceProceedings', width: 22 },
        { key: 'book', width: 12 },
        { key: 'bookChapter', width: 15 },
        { key: 'publications', width: 12 },
        { key: 'patents', width: 12 },
        { key: 'consultancy', width: 15 },
        { key: 'emr', width: 12 },
        { key: 'activities', width: 12 },
        { key: 'hIndex', width: 12 },
        { key: 'i10Index', width: 12 },
        { key: 'citationCount', width: 12 },
      ];

      // Add Row 1 (Top Header)
      worksheet.addRow([
        'Faculty Name',
        'Email',
        'MIS ID',
        'Department',
        'Raw Score',
        'Total ARPS Score',
        'Band Grade',
        'Raw Score Breakdown', // Column 8 (H1) - start of component raw scores group
        '', // Column 9 (I1)
        '', // Column 10 (J1)
        '', // Column 11 (K1)
        '', // Column 12 (L1)
        'Publications (Count)', // Column 13 (M1) - start of publications breakdown
        '', // Column 14 (N1)
        '', // Column 15 (O1)
        '', // Column 16 (P1)
        '', // Column 17 (Q1)
        '', // Column 18 (R1)
        'Patents', // Column 19 (S1)
        'Consultancy', // Column 20 (T1)
        'EMR', // Column 21 (U1)
        'Activities', // Column 22 (V1)
        'H-Index', // Column 23 (W1)
        'i10-Index', // Column 24 (X1)
        'Citations' // Column 25 (Y1)
      ]);

      // Add Row 2 (Sub Header)
      worksheet.addRow([
        '', // Column 1
        '', // Column 2
        '', // Column 3
        '', // Column 4
        '', // Column 5
        '', // Column 6
        '', // Column 7
        'Publications', // Column 8 (H) - component raw score sub-headers
        'Patents', // Column 9 (I)
        'EMR Projects', // Column 10 (J)
        'Consultancy', // Column 11 (K)
        'Academic & Students Guided', // Column 12 (L)
        'Research Articles', // Column 13 (M) - publications count sub-headers
        'Review Articles', // Column 14 (N)
        'Conf. Proceedings', // Column 15 (O)
        'Book', // Column 16 (P)
        'Book Chapter', // Column 17 (Q)
        'Total', // Column 18 (R)
        '', // Column 19
        '', // Column 20
        '', // Column 21
        '', // Column 22
        '', // Column 23
        '', // Column 24
        ''  // Column 25
      ]);

      // Merge cells vertically for non-grouped columns (Row 1 to Row 2)
      worksheet.mergeCells('A1:A2');
      worksheet.mergeCells('B1:B2');
      worksheet.mergeCells('C1:C2');
      worksheet.mergeCells('D1:D2');
      worksheet.mergeCells('E1:E2');
      worksheet.mergeCells('F1:F2');
      worksheet.mergeCells('G1:G2');
      worksheet.mergeCells('S1:S2'); // Patents count
      worksheet.mergeCells('T1:T2'); // Consultancy count
      worksheet.mergeCells('U1:U2'); // EMR count
      worksheet.mergeCells('V1:V2'); // Activities count
      worksheet.mergeCells('W1:W2'); // H-Index
      worksheet.mergeCells('X1:X2'); // i10-Index
      worksheet.mergeCells('Y1:Y2'); // Citations

      // Merge cells horizontally for group headers
      worksheet.mergeCells('H1:L1');  // Raw Score Breakdown
      worksheet.mergeCells('M1:R1');  // Publications (Count)

      // Add rows
      statistics.forEach(s => {
        const uPubs = pubMap[s.uid] || {
          researchArticles: 0,
          reviewArticles: 0,
          conferenceProceedings: 0,
          book: 0,
          bookChapter: 0,
        };

        worksheet.addRow({
          name: s.name,
          email: s.email || 'N/A',
          misId: s.misId,
          department: s.department,
          rawScore: s.rawScore !== null && s.rawScore !== undefined ? Number(s.rawScore) : 0,
          totalArps: Number(s.totalArps),
          grade: s.grade,
          publicationsRaw: s.publicationsRaw !== null && s.publicationsRaw !== undefined ? Number(s.publicationsRaw) : 0,
          patentsRaw: s.patentsRaw !== null && s.patentsRaw !== undefined ? Number(s.patentsRaw) : 0,
          emrRaw: s.emrRaw !== null && s.emrRaw !== undefined ? Number(s.emrRaw) : 0,
          consultancyRaw: s.consultancyRaw !== null && s.consultancyRaw !== undefined ? Number(s.consultancyRaw) : 0,
          activitiesRaw: s.activitiesRaw !== null && s.activitiesRaw !== undefined ? Number(s.activitiesRaw) : 0,
          researchArticles: uPubs.researchArticles,
          reviewArticles: uPubs.reviewArticles,
          conferenceProceedings: uPubs.conferenceProceedings,
          book: uPubs.book,
          bookChapter: uPubs.bookChapter,
          publications: Number(s.publicationsCount),
          patents: Number(s.patentsCount),
          consultancy: Number(s.consultancyCount),
          emr: Number(s.emrCount),
          activities: Number(s.activitiesCount),
          hIndex: Number(s.hIndex ?? 0),
          i10Index: Number(s.i10Index ?? 0),
          citationCount: Number(s.citationCount ?? 0)
        });
      });

      // Format row heights, borders, and wrap text/alignment to all cells
      worksheet.eachRow((row, rowNumber) => {
        row.height = rowNumber <= 2 ? 30 : 26;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          if (rowNumber <= 2) {
            cell.font = { bold: true };
          }
          if (colNumber === 1 || colNumber === 2 || colNumber === 4) {
            cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };
          } else {
            cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
          }
        });
      });

      // Write to buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ARPS_Report_${selectedYear}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: 'Excel Export Complete', description: 'Successfully generated and downloaded Excel sheet.' });
    } catch (err: any) {
      console.error('Excel generation error:', err);
      toast({ variant: 'destructive', title: 'Export Failed', description: err?.message || 'Error generating Excel file.' });
    } finally {
      setExportingExcel(false);
    }
  };

  // Excel Export for Unique Approved Publications (grouped/merged co-authored papers)
  const exportUniquePapersToExcel = async () => {
    setExportingUniqueExcel(true);
    try {
      const pubsRes = await getAllApprovedPublicationsForYear(selectedYear);
      if (!pubsRes.success || !Array.isArray(pubsRes.publications)) {
        toast({
          variant: 'destructive',
          title: 'Export Failed',
          description: pubsRes.error || 'Failed to fetch approved publications.'
        });
        return;
      }

      const publications = pubsRes.publications;

      // Helper to clean/extract raw DOI from URLs using regex
      const cleanDoi = (doiStr: string): string => {
        if (!doiStr) return '';
        const trimmed = doiStr.trim();
        // Regex extracts '10.' followed by digits, a slash, and the rest of the DOI (excluding query parameters/hash/spaces)
        const match = trimmed.match(/(10\.\d{4,}\/[^\s?#]+)/i);
        if (match && match[1]) {
          return match[1].trim();
        }
        return trimmed;
      };

      // Group publications by DOI or Title
      const groups: Record<string, {
        doi: string;
        paperTitle: string;
        journalClassification: string;
        articleType: string;
        publisherName: string;
        submissions: any[];
      }> = {};

      publications.forEach((pub: any) => {
        const rawDoi = (pub.doi || '').trim();
        const cleanedDoiVal = cleanDoi(rawDoi);
        const title = (pub.paperTitle || '').trim();
        
        let key = '';
        if (cleanedDoiVal) {
          key = `doi:${cleanedDoiVal.toLowerCase()}`;
        } else if (title) {
          key = `title:${title.toLowerCase().replace(/\s+/g, ' ')}`;
        } else {
          key = `id:${pub.id}`;
        }

        if (!groups[key]) {
          groups[key] = {
            doi: cleanedDoiVal || rawDoi || 'N/A',
            paperTitle: pub.paperTitle || 'Untitled',
            journalClassification: pub.journalClassification || 'N/A',
            articleType: pub.articleType || pub.publicationType || 'N/A',
            publisherName: pub.publisherName || pub.publisher || 'N/A',
            submissions: []
          };
        }
        groups[key].submissions.push(pub);
      });

      const uniquePapersList = Object.values(groups);

      // Sort the list alphabetically by paperTitle
      uniquePapersList.sort((a, b) => a.paperTitle.localeCompare(b.paperTitle));

      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Unique Approved Publications');

      // Set columns (Matches layout in screenshot: Faculty Name, Author Role, Quartile, DOI, Article Type, Article Title, Publisher)
      worksheet.columns = [
        { key: 'facultyName', width: 35 },
        { key: 'authorRole', width: 30 },
        { key: 'quartile', width: 12 },
        { key: 'doi', width: 30 },
        { key: 'articleType', width: 20 },
        { key: 'articleTitle', width: 60 },
        { key: 'publisher', width: 25 },
      ];

      // Add Headers Row
      worksheet.addRow([
        'Name of Faculty',
        'Author Role',
        'Quartile',
        'DOI',
        'Article Type',
        'Article Title',
        'Publisher'
      ]);

      let currentRowNum = 2; // Row 1 is header row

      uniquePapersList.forEach((paper) => {
        const N = paper.submissions.length;
        
        paper.submissions.forEach((sub: any) => {
          worksheet.addRow({
            facultyName: sub.userName || sub.faculty || 'N/A',
            authorRole: sub.authorPosition || 'N/A',
            quartile: paper.journalClassification || 'N/A',
            doi: paper.doi || 'N/A',
            articleType: paper.articleType || 'N/A',
            articleTitle: paper.paperTitle || 'N/A',
            publisher: paper.publisherName || 'N/A',
          });
        });

        if (N > 1) {
          // Merge cells for Quartile (Col 3), DOI (Col 4), Article Type (Col 5), Article Title (Col 6), Publisher (Col 7)
          worksheet.mergeCells(currentRowNum, 3, currentRowNum + N - 1, 3);
          worksheet.mergeCells(currentRowNum, 4, currentRowNum + N - 1, 4);
          worksheet.mergeCells(currentRowNum, 5, currentRowNum + N - 1, 5);
          worksheet.mergeCells(currentRowNum, 6, currentRowNum + N - 1, 6);
          worksheet.mergeCells(currentRowNum, 7, currentRowNum + N - 1, 7);
        }

        currentRowNum += N;
      });

      // Format row heights, borders, and wrap text/alignment to all cells
      worksheet.eachRow((row, rowNumber) => {
        row.height = rowNumber === 1 ? 30 : 26;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          if (rowNumber === 1) {
            cell.font = { bold: true };
          }
          if (colNumber === 1 || colNumber === 2 || colNumber === 6) {
            cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };
          } else {
            cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
          }
        });
      });

      // Write to buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ARPS_Unique_Publications_${selectedYear}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({ title: 'Unique Papers Export Complete', description: 'Successfully generated and downloaded unique papers Excel sheet.' });
    } catch (err: any) {
      console.error('Unique papers Excel generation error:', err);
      toast({ variant: 'destructive', title: 'Export Failed', description: err?.message || 'Error generating unique papers Excel file.' });
    } finally {
      setExportingUniqueExcel(false);
    }
  };

  // Filter and sort statistics based on search query and sort state
  const sortedAndFilteredStatistics = useMemo(() => {
    const filtered = statistics.filter(stat => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      
      return (
        stat.name.toLowerCase().includes(query) ||
        stat.misId.toLowerCase().includes(query) ||
        stat.department.toLowerCase().includes(query)
      );
    });

    if (!sortKey) return filtered;

    return [...filtered].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];

      // Handle null/undefined values
      if (aVal === null || aVal === undefined) aVal = sortOrder === 'asc' ? Infinity : -Infinity;
      if (bVal === null || bVal === undefined) bVal = sortOrder === 'asc' ? Infinity : -Infinity;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }

      // Default numeric sort
      return sortOrder === 'asc' 
        ? (aVal as number) - (bVal as number) 
        : (bVal as number) - (aVal as number);
    });
  }, [statistics, searchQuery, sortKey, sortOrder]);

  if (!currentUser) return null;

  return (
    <div className="container mx-auto py-10 px-4 md:px-8 space-y-8 max-w-7xl">
      <PageHeader
        title="Super Admin ARPS Management"
        description="Configure dynamic policy rules, freeze academic evaluation cycles, and override final faculty scores."
      />

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <span className="ml-4 text-muted-foreground">Loading ARPS management console...</span>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted p-1">
            <TabsTrigger value="cycles" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2">
              <CalendarCheck className="h-4 w-4" /> Cycle & Overrides
            </TabsTrigger>
            <TabsTrigger value="policy" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Scoring Policy Engine
            </TabsTrigger>
          </TabsList>

          {/* Pane 1: Cycles & Overrides */}
          <TabsContent value="cycles" className="space-y-6">
            <Card className="shadow-lg border-t-4 border-t-indigo-500 overflow-hidden bg-card/40 backdrop-blur-md">
              {/* Header Section: Title, Year Dropdown, and Refresh/Create Cycle */}
              <div className="p-6 border-b bg-muted/10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <CardTitle className="text-xl font-bold tracking-tight text-foreground">
                      Evaluation Cycle: {selectedYear}
                    </CardTitle>
                    <Badge className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full shadow-sm ${
                      cycles[selectedYear]?.status === 'frozen' 
                        ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30' 
                        : 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30'
                    }`}>
                      {cycles[selectedYear]?.status === 'frozen' ? 'Frozen / Finalized' : 'Active Evaluation'}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    Monitor progress, configure deadlines, and run bulk calculations or reports.
                  </CardDescription>
                </div>
                
                {/* Year Select & Navigation Controls */}
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Cycle Year:</Label>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                      <SelectTrigger className="h-9 text-xs w-[120px] font-semibold bg-background border border-input shadow-sm">
                        <SelectValue placeholder="Select Year" />
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
                  
                  <Button 
                    variant="outline" 
                    onClick={handleCreateNextCycle} 
                    disabled={creatingCycle}
                    className="h-9 border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900/30 dark:hover:bg-indigo-950/20 font-medium text-xs"
                    title={`Create Evaluation Cycle for next year (${getNextAcademicYear()})`}
                  >
                    {creatingCycle ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Create Next Cycle
                  </Button>

                  <Button variant="outline" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={() => loadStatistics()} disabled={loadingStats}>
                    <RefreshCw className={`h-4 w-4 ${loadingStats ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {/* Configuration Grid & Operations Container */}
              <div className="p-6 border-b bg-muted/5 space-y-6">
                {/* Grid for settings and controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Left Column: Submission Deadline */}
                  <div className="p-4 border rounded-xl bg-background/50 space-y-3 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-indigo-500/20 transition-all duration-300">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                        <Lock className="h-4 w-4" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Lock/Submission Deadline</h4>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Lock submissions for this cycle. Users cannot edit claims after this date.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Input 
                        type="datetime-local" 
                        className="h-8 text-xs w-full bg-background border border-input focus:ring-1 focus:ring-indigo-500 font-medium"
                        value={finalDateValue}
                        onChange={(e) => setFinalDateValue(e.target.value)}
                      />
                      <Button 
                        size="sm" 
                        className="h-8 px-3 shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-all text-xs" 
                        onClick={saveFinalDate} 
                        disabled={cycleSaving || finalDateValue === (cycles[selectedYear]?.finalDate || '')}
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  {/* Middle Column: Presentation Deadline */}
                  <div className="p-4 border rounded-xl bg-background/50 space-y-3 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-teal-500/20 transition-all duration-300">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400">
                        <FileText className="h-4 w-4" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Presentation Deadline</h4>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Lock presentation uploads. Users cannot submit or change presentation files.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Input 
                        type="datetime-local" 
                        className="h-8 text-xs w-full bg-background border border-input focus:ring-1 focus:ring-indigo-500 font-medium"
                        value={presentationDeadlineValue}
                        onChange={(e) => setPresentationDeadlineValue(e.target.value)}
                      />
                      <Button 
                        size="sm" 
                        className="h-8 px-3 shrink-0 bg-teal-600 hover:bg-teal-700 text-white font-semibold transition-all text-xs" 
                        onClick={savePresentationDeadline} 
                        disabled={cycleSaving || presentationDeadlineValue === (cycles[selectedYear]?.presentationDeadline || '')}
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  {/* Right Column: Cycle Status Control */}
                  <div className="p-4 border rounded-xl bg-background/50 space-y-3 flex flex-col justify-between shadow-sm hover:shadow-md hover:border-foreground/15 transition-all duration-300">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-foreground">
                        <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-xs font-bold uppercase tracking-wider">Evaluation Cycle Status</h4>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Freeze the cycle to permanently finalize all scores, or re-open it to allow recalculations.
                      </p>
                    </div>
                    <div className="mt-2">
                      {cycles[selectedYear]?.status === 'frozen' ? (
                        <Button 
                          variant="outline" 
                          className="h-8 w-full border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-900/30 dark:hover:bg-emerald-950/20 font-semibold transition-all text-xs shadow-sm" 
                          disabled={cycleSaving} 
                          onClick={() => updateCycleStatus('active')}
                        >
                          <CalendarCheck className="h-4 w-4 mr-2" /> Re-open Cycle
                        </Button>
                      ) : (
                        <Button 
                          variant="destructive" 
                          className="h-8 w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold transition-all text-xs shadow-sm" 
                          disabled={cycleSaving} 
                          onClick={() => updateCycleStatus('frozen')}
                        >
                          <Lock className="h-4 w-4 mr-2" /> Freeze & Finalize Cycle
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Operations & Exports Section */}
                <div className="pt-4 border-t space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Operations & Exports</h4>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="default"
                      className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] text-xs"
                      onClick={handleCalculateAll}
                      disabled={loadingStats || calculatingAll}
                    >
                      {calculatingAll ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Calculating...
                        </>
                      ) : (
                        <>
                          <Calculator className="h-4 w-4 mr-2" /> Calculate All Scores
                        </>
                      )}
                    </Button>

                    <div className="h-5 w-[1px] bg-border hidden sm:block mx-1" />

                    {/* Excel Exports group */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" className="h-9 text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-900/30 dark:hover:bg-emerald-950/20 font-semibold text-xs" onClick={exportToExcel} disabled={exportingExcel}>
                        {exportingExcel ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Exporting...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" /> Export Statistics
                          </>
                        )}
                      </Button>
                      <Button variant="outline" className="h-9 text-teal-700 border-teal-200 hover:bg-teal-50 dark:text-teal-400 dark:border-teal-900/30 dark:hover:bg-teal-950/20 font-semibold text-xs" onClick={exportUniquePapersToExcel} disabled={exportingUniqueExcel}>
                        {exportingUniqueExcel ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Exporting...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" /> Export Unique Papers
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="h-5 w-[1px] bg-border hidden sm:block mx-1" />

                    {/* PDF Exports group */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button 
                        variant="outline" 
                        className="h-9 text-blue-700 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-900/30 dark:hover:bg-blue-950/20 font-semibold text-xs" 
                        onClick={handleExportAllPdfs}
                        disabled={loadingStats || exportingAllProgress !== null}
                      >
                        {exportingAllProgress !== null ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Exporting ({exportingAllProgress.current}/{exportingAllProgress.total})
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" /> Export All PDFs (Zip)
                          </>
                        )}
                      </Button>
                      <Button 
                        variant="outline" 
                        className="h-9 text-violet-700 border-violet-200 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-900/30 dark:hover:bg-violet-950/20 font-semibold text-xs" 
                        onClick={handleExportCombinedPdf}
                        disabled={loadingStats || exportingAllProgress !== null}
                      >
                        {exportingAllProgress !== null ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Exporting ({exportingAllProgress.current}/{exportingAllProgress.total})
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-2" /> Download Combined PDF
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-b bg-muted/20">
                <Input
                  placeholder="Search by faculty name, email, MIS ID, or department..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full max-w-md"
                />
                {searchQuery && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing {sortedAndFilteredStatistics.length} of {statistics.length} faculty members
                  </p>
                )}
              </div>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-wider border-b">
                      {renderSortHeader('Faculty Name', 'name')}
                      {renderSortHeader('Grade', 'grade')}
                      {renderSortHeader('Increment (₹)', 'annualIncrement')}
                      {renderSortHeader('Raw Score', 'rawScore', 'center')}
                      {renderSortHeader('Weighted Score', 'weightedScore', 'center')}
                      {renderSortHeader('Final Score', 'totalArps', 'center')}
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loadingStats ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                          <p className="text-muted-foreground mt-4">Computing final scores...</p>
                        </td>
                      </tr>
                    ) : sortedAndFilteredStatistics.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                          {searchQuery ? `No faculty found matching "${searchQuery}".` : 'No faculty found or no submissions approved for this cycle.'}
                        </td>
                      </tr>
                    ) : (
                      sortedAndFilteredStatistics.map(stat => (
                        <tr key={stat.uid} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4">
                            <Link
                              href={stat.campus === 'Goa' ? `/goa/${stat.misId}` : `/profile/${stat.misId}`}
                              className="font-semibold text-foreground hover:underline hover:text-primary transition-colors block w-fit"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {stat.name}
                            </Link>
                            <div className="text-[10px] text-muted-foreground flex flex-col gap-0.5 mt-0.5">
                              <span>{stat.department || 'N/A'} | {stat.misId}</span>
                              {stat.lastUpdated && (
                                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded w-fit select-none mt-1 animate-pulse">
                                  Last Computed: {new Date(stat.lastUpdated).toLocaleString('en-IN')}
                                </span>
                              )}
                              {stat.manualArpsEnabled && (
                                <span className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded w-fit select-none mt-1">
                                  Manual Override Open
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge className="bg-slate-700 text-white font-mono">{stat.grade}</Badge>
                          </td>
                          <td className="px-6 py-4 font-mono font-medium text-emerald-600">
                            {(() => {
                              const incRules = {
                                factor: policyRules?.increments?.factor ?? 100,
                                fixedDME: policyRules?.increments?.fixedDME ?? 5000,
                                fixedME: policyRules?.increments?.fixedME ?? 10000,
                                fixedEE: policyRules?.increments?.fixedEE ?? 15000,
                                fixedSEE: policyRules?.increments?.fixedSEE ?? 25000
                              };

                              let fixedAmount = incRules.fixedDME;
                              if (stat.grade === 'SEE') fixedAmount = incRules.fixedSEE;
                              else if (stat.grade === 'EE') fixedAmount = incRules.fixedEE;
                              else if (stat.grade === 'ME') fixedAmount = incRules.fixedME;

                              const rawScoreVal = stat.rawScore ?? 0;
                              const scoreContribution = rawScoreVal * incRules.factor;

                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help border-b border-dashed border-emerald-500 pb-0.5 hover:text-emerald-500 transition-colors">
                                        ₹{stat.annualIncrement.toLocaleString('en-IN')}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="p-3 w-80 space-y-2 bg-slate-900 border border-slate-700 text-slate-100 shadow-xl rounded-lg z-[100]">
                                      <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Increment Calculation</div>
                                      <div className="text-xs space-y-1.5 font-sans">
                                        <div className="flex justify-between border-b pb-1">
                                          <span>Grade Band:</span>
                                          <span className="font-bold text-primary">{stat.grade}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Fixed Component:</span>
                                          <span className="font-mono">₹{fixedAmount.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                          <span>Variable Component:</span>
                                          <span className="text-right">
                                            <span className="font-mono font-bold">₹{scoreContribution.toLocaleString('en-IN')}</span>
                                            <div className="text-[10px] text-slate-400 mt-0.5">
                                              ({rawScoreVal.toFixed(2)} raw score × ₹{incRules.factor})
                                            </div>
                                          </span>
                                        </div>
                                        <div className="flex justify-between border-t pt-1 font-bold text-emerald-600 dark:text-emerald-400">
                                          <span>Total Increment:</span>
                                          <span className="font-mono">₹{stat.annualIncrement.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="text-[9px] text-slate-400 mt-1 text-center font-mono">
                                          Formula: Fixed({stat.grade}) + (Raw Score × {incRules.factor})
                                        </div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {stat.rawScore !== null && stat.rawScore !== undefined
                              ? <span className="font-mono font-medium text-muted-foreground">{Number(stat.rawScore).toFixed(2)}</span>
                              : <span className="text-xs text-muted-foreground/50 italic">—</span>}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {stat.weightedScore !== null && stat.weightedScore !== undefined
                              ? <span className="font-mono font-medium text-amber-600">{Number(stat.weightedScore).toFixed(2)}</span>
                              : <span className="text-xs text-muted-foreground/50 italic">—</span>}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-mono font-extrabold text-lg text-primary">{stat.totalArps.toFixed(2)}</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {overridingUser === stat.uid ? (
                                <div className="flex items-center justify-end gap-2">
                                  <Input
                                    type="number"
                                    className="w-20 h-8 text-xs"
                                    placeholder="Score"
                                    value={overrideValue}
                                    onChange={(e) => setOverrideValue(e.target.value)}
                                  />
                                  <Button size="sm" onClick={() => handleApplyOverride(stat.uid)} disabled={savingOverride} className="h-8">
                                    {savingOverride ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setOverridingUser(null)} className="h-8">Cancel</Button>
                                </div>
                            ) : (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-8 w-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                  title="Recalculate and Save ARPS score"
                                  onClick={() => handleRefreshRow(stat.uid)}
                                  disabled={refreshingRows[stat.uid]}
                                >
                                  {refreshingRows[stat.uid] ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="outline" 
                                  className="h-8 w-8 text-blue-600 border-blue-200 hover:bg-blue-50" 
                                  title="Download Detailed Report" 
                                  onClick={() => handleDownloadDetailedReport(stat)} 
                                  disabled={downloadingPdfFor === stat.uid}
                                >
                                  {downloadingPdfFor === stat.uid ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                </Button>
                                {stat.presentationUrl && (
                                  <Button 
                                    size="icon" 
                                    variant="outline" 
                                    className="h-8 w-8 text-teal-600 border-teal-200 hover:bg-teal-50" 
                                    title={`View Presentation: ${stat.presentationName || 'presentation'}`} 
                                    onClick={() => window.open(stat.presentationUrl, '_blank')}
                                  >
                                    <FileText className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant={stat.manualArpsEnabled ? "destructive" : "secondary"}
                                  className={`h-8 text-xs font-semibold ${stat.manualArpsEnabled ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                                  onClick={() => handleToggleManualArps(stat.uid, !stat.manualArpsEnabled)}
                                  disabled={togglingManualUser === stat.uid}
                                >
                                  {togglingManualUser === stat.uid ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1 inline" />
                                  ) : null}
                                  {stat.manualArpsEnabled ? "Lock" : "Unlock"}
                                </Button>
                                {stat.manualArpsHistory && stat.manualArpsHistory.length > 0 && (
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-8 w-8 text-amber-600 border-amber-200 hover:bg-amber-50"
                                    title="View Lock/Unlock History"
                                    onClick={() => { setHistoryUser(stat); setIsHistoryOpen(true); }}
                                  >
                                    <Clock className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  className="h-8 text-xs" 
                                  title="Override Score" 
                                  onClick={() => { setOverridingUser(stat.uid); setOverrideValue(stat.totalArps.toString()); }}
                                >
                                  Override
                                </Button>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="h-8 w-8 text-rose-500" 
                                  title="Clear Override" 
                                  onClick={() => handleClearOverride(stat.uid)} 
                                  disabled={savingOverride}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pane 2: Policy Engine */}
          <TabsContent value="policy" className="space-y-6">
            {policyRules ? (
              <Card className="shadow-lg border-t-4 border-t-primary">
                <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Calculator className="h-5 w-5 text-primary" /> Global Scoring Policy Rules
                    </CardTitle>
                    <CardDescription>Adjust component weightages, caps, and point multipliers dynamically.</CardDescription>
                  </div>
                  <Button onClick={savePolicy} disabled={savingPolicy}>
                    {savingPolicy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Policy Settings
                  </Button>
                </CardHeader>
                <CardContent className="p-6 space-y-10">
                  {/* Category Weightages & Caps */}
                  <div>
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">Global Caps & Weightages</h3>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                      {['publication', 'patent', 'consultancy', 'researchActivities', 'EMR'].map((key) => (
                        <div key={key} className="space-y-3 bg-muted/20 p-4 rounded-xl border">
                          <Label className="capitalize font-bold text-primary">{key.replace('research', 'Research ')}</Label>
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground">Weightage Factor (e.g. 0.8 = 80%)</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={policyRules.weightage[key]}
                              onChange={(e) => handlePolicyChange('weightage', key, parseFloat(e.target.value))}
                            />
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground">Maximum Point Cap</span>
                            <Input
                              type="number"
                              value={policyRules.caps[key]}
                              onChange={(e) => handlePolicyChange('caps', key, parseInt(e.target.value, 10))}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <hr className="my-6 border-muted-foreground/20" />

                  <Tabs defaultValue="publications" className="w-full">
                    <TabsList className="bg-muted p-1 mb-6 flex justify-start">
                      <TabsTrigger value="publications">Publications Settings</TabsTrigger>
                      <TabsTrigger value="patents">Patent & Increment Settings</TabsTrigger>
                      <TabsTrigger value="others">Others (Consultancy, EMR, Activities)</TabsTrigger>
                    </TabsList>

                    <TabsContent value="publications" className="space-y-6">
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">Publications Settings</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-1"><Label>Q1 Base Points</Label><Input type="number" value={policyRules.publications.q1} onChange={(e) => handlePolicyChange('publications', 'q1', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label>Q2 Base Points</Label><Input type="number" value={policyRules.publications.q2} onChange={(e) => handlePolicyChange('publications', 'q2', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label>Q3 Base Points</Label><Input type="number" value={policyRules.publications.q3} onChange={(e) => handlePolicyChange('publications', 'q3', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label>Q4 Base Points</Label><Input type="number" value={policyRules.publications.q4} onChange={(e) => handlePolicyChange('publications', 'q4', parseFloat(e.target.value))} /></div>
                          
                          <div className="space-y-1"><Label>Original Research Mult.</Label><Input type="number" step="0.1" value={policyRules.publications.originalResearchMultiplier} onChange={(e) => handlePolicyChange('publications', 'originalResearchMultiplier', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label>Review Q1/Q2 Mult.</Label><Input type="number" step="0.1" value={policyRules.publications.reviewQ1Q2Multiplier} onChange={(e) => handlePolicyChange('publications', 'reviewQ1Q2Multiplier', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label>Review Q3/Q4 Mult.</Label><Input type="number" step="0.1" value={policyRules.publications.reviewQ3Q4Multiplier} onChange={(e) => handlePolicyChange('publications', 'reviewQ3Q4Multiplier', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label>First/Corr Author Mult.</Label><Input type="number" step="0.1" value={policyRules.publications.firstCorrespondingMultiplier} onChange={(e) => handlePolicyChange('publications', 'firstCorrespondingMultiplier', parseFloat(e.target.value))} /></div>
                          
                          <div className="space-y-1"><Label>Book Chapter Base</Label><Input type="number" value={policyRules.publications.bookChapterBase} onChange={(e) => handlePolicyChange('publications', 'bookChapterBase', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label>Book Editor Base</Label><Input type="number" value={policyRules.publications.bookEditorBase} onChange={(e) => handlePolicyChange('publications', 'bookEditorBase', parseFloat(e.target.value))} /></div>
                          <div className="space-y-1"><Label>Conference Proc. Base</Label><Input type="number" value={policyRules.publications.conferenceProceedingsBase} onChange={(e) => handlePolicyChange('publications', 'conferenceProceedingsBase', parseFloat(e.target.value))} /></div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="patents" className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">Patent Settings</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1"><Label>Published Base</Label><Input type="number" value={policyRules.patents.publishedBase} onChange={(e) => handlePolicyChange('patents', 'publishedBase', parseFloat(e.target.value))} /></div>
                            <div className="space-y-1"><Label>Granted India Base</Label><Input type="number" value={policyRules.patents.grantedIndiaBase} onChange={(e) => handlePolicyChange('patents', 'grantedIndiaBase', parseFloat(e.target.value))} /></div>
                            <div className="space-y-1"><Label>Granted Int. Base</Label><Input type="number" value={policyRules.patents.grantedInternationalBase} onChange={(e) => handlePolicyChange('patents', 'grantedInternationalBase', parseFloat(e.target.value))} /></div>
                            <div className="space-y-1"><Label>PU Sole Mult.</Label><Input type="number" step="0.1" value={policyRules.patents.puSoleApplicantMultiplier} onChange={(e) => handlePolicyChange('patents', 'puSoleApplicantMultiplier', parseFloat(e.target.value))} /></div>
                          </div>
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">Increment Structure (₹)</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1"><Label>DME Fixed Amount</Label><Input type="number" value={policyRules.increments.fixedDME} onChange={(e) => handlePolicyChange('increments', 'fixedDME', parseInt(e.target.value, 10))} /></div>
                            <div className="space-y-1"><Label>ME Fixed Amount</Label><Input type="number" value={policyRules.increments.fixedME} onChange={(e) => handlePolicyChange('increments', 'fixedME', parseInt(e.target.value, 10))} /></div>
                            <div className="space-y-1"><Label>EE Fixed Amount</Label><Input type="number" value={policyRules.increments.fixedEE} onChange={(e) => handlePolicyChange('increments', 'fixedEE', parseInt(e.target.value, 10))} /></div>
                            <div className="space-y-1"><Label>SEE Fixed Amount</Label><Input type="number" value={policyRules.increments.fixedSEE} onChange={(e) => handlePolicyChange('increments', 'fixedSEE', parseInt(e.target.value, 10))} /></div>
                            <div className="space-y-1 col-span-2"><Label>Score Factor Multiplier (Total Score × Factor)</Label><Input type="number" value={policyRules.increments.factor} onChange={(e) => handlePolicyChange('increments', 'factor', parseFloat(e.target.value))} /></div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="others" className="space-y-8">
                      {/* Consultancy Settings */}
                      <div>
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">Consultancy Settings</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div>
                            <Label className="text-xs font-semibold block mb-2 text-muted-foreground">Revenue Slab Points</Label>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label className="text-xs">₹10k - ₹50k Slab</Label>
                                <Input type="number" value={policyRules.consultancy?.slabs?.[0]?.points ?? 10} onChange={(e) => handleConsultancySlabChange(0, parseInt(e.target.value, 10))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">₹50k - ₹100k Slab</Label>
                                <Input type="number" value={policyRules.consultancy?.slabs?.[1]?.points ?? 20} onChange={(e) => handleConsultancySlabChange(1, parseInt(e.target.value, 10))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">₹100k - ₹300k Slab</Label>
                                <Input type="number" value={policyRules.consultancy?.slabs?.[2]?.points ?? 30} onChange={(e) => handleConsultancySlabChange(2, parseInt(e.target.value, 10))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">₹300k - ₹500k Slab</Label>
                                <Input type="number" value={policyRules.consultancy?.slabs?.[3]?.points ?? 50} onChange={(e) => handleConsultancySlabChange(3, parseInt(e.target.value, 10))} />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <Label className="text-xs font-semibold block mb-2 text-muted-foreground">Large Project Calculations</Label>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label>Base Points (&gt;₹500k)</Label>
                                <Input type="number" value={policyRules.consultancy?.baseAbove500k ?? 50} onChange={(e) => handlePolicyChange('consultancy', 'baseAbove500k', parseFloat(e.target.value))} />
                              </div>
                              <div className="space-y-1">
                                <Label>Extra Step Amount (₹)</Label>
                                <Input type="number" value={policyRules.consultancy?.extraSlabStep ?? 50000} onChange={(e) => handlePolicyChange('consultancy', 'extraSlabStep', parseFloat(e.target.value))} />
                              </div>
                              <div className="space-y-1 col-span-2">
                                <Label>Extra Points per Step</Label>
                                <Input type="number" value={policyRules.consultancy?.extraSlabPoints ?? 10} onChange={(e) => handlePolicyChange('consultancy', 'extraSlabPoints', parseFloat(e.target.value))} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* EMR Project Settings */}
                      <div>
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">Extramural Research (EMR) Settings</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Sanctioned EMR */}
                          <div className="space-y-4">
                            <Label className="font-bold text-xs text-primary block">Sanctioned EMR Tiers</Label>
                            <div className="space-y-3">
                              {/* Tier 1 */}
                              <div className="bg-muted/10 p-3 rounded-lg border space-y-2">
                                <span className="text-xs font-semibold block">Tier 1 (₹20L - ₹50L)</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1"><Label className="text-[10px]">PI Points</Label><Input type="number" value={policyRules.emr?.sanctioned?.[0]?.pi ?? 50} onChange={(e) => handleEmrTierChange('sanctioned', 0, 'pi', parseFloat(e.target.value))} /></div>
                                  <div className="space-y-1"><Label className="text-[10px]">Co-PI Points</Label><Input type="number" value={policyRules.emr?.sanctioned?.[0]?.copi ?? 20} onChange={(e) => handleEmrTierChange('sanctioned', 0, 'copi', parseFloat(e.target.value))} /></div>
                                </div>
                              </div>
                              {/* Tier 2 */}
                              <div className="bg-muted/10 p-3 rounded-lg border space-y-2">
                                <span className="text-xs font-semibold block">Tier 2 (₹50L - ₹1Cr)</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1"><Label className="text-[10px]">PI Points</Label><Input type="number" value={policyRules.emr?.sanctioned?.[1]?.pi ?? 80} onChange={(e) => handleEmrTierChange('sanctioned', 1, 'pi', parseFloat(e.target.value))} /></div>
                                  <div className="space-y-1"><Label className="text-[10px]">Co-PI Points</Label><Input type="number" value={policyRules.emr?.sanctioned?.[1]?.copi ?? 30} onChange={(e) => handleEmrTierChange('sanctioned', 1, 'copi', parseFloat(e.target.value))} /></div>
                                </div>
                              </div>
                              {/* Tier 3 */}
                              <div className="bg-muted/10 p-3 rounded-lg border space-y-2">
                                <span className="text-xs font-semibold block">Tier 3 (&gt;₹1Cr)</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1"><Label className="text-[10px]">PI Points</Label><Input type="number" value={policyRules.emr?.sanctioned?.[2]?.pi ?? 100} onChange={(e) => handleEmrTierChange('sanctioned', 2, 'pi', parseFloat(e.target.value))} /></div>
                                  <div className="space-y-1"><Label className="text-[10px]">Co-PI Points</Label><Input type="number" value={policyRules.emr?.sanctioned?.[2]?.copi ?? 40} onChange={(e) => handleEmrTierChange('sanctioned', 2, 'copi', parseFloat(e.target.value))} /></div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Ongoing EMR */}
                          <div className="space-y-4">
                            <Label className="font-bold text-xs text-primary block">Ongoing EMR Tiers</Label>
                            <div className="space-y-3">
                              {/* Tier 1 */}
                              <div className="bg-muted/10 p-3 rounded-lg border space-y-2">
                                <span className="text-xs font-semibold block">Tier 1 (₹20L - ₹50L)</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1"><Label className="text-[10px]">PI Points</Label><Input type="number" value={policyRules.emr?.ongoing?.[0]?.pi ?? 25} onChange={(e) => handleEmrTierChange('ongoing', 0, 'pi', parseFloat(e.target.value))} /></div>
                                  <div className="space-y-1"><Label className="text-[10px]">Co-PI Points</Label><Input type="number" value={policyRules.emr?.ongoing?.[0]?.copi ?? 10} onChange={(e) => handleEmrTierChange('ongoing', 0, 'copi', parseFloat(e.target.value))} /></div>
                                </div>
                              </div>
                              {/* Tier 2 */}
                              <div className="bg-muted/10 p-3 rounded-lg border space-y-2">
                                <span className="text-xs font-semibold block">Tier 2 (₹50L - ₹1Cr)</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1"><Label className="text-[10px]">PI Points</Label><Input type="number" value={policyRules.emr?.ongoing?.[1]?.pi ?? 40} onChange={(e) => handleEmrTierChange('ongoing', 1, 'pi', parseFloat(e.target.value))} /></div>
                                  <div className="space-y-1"><Label className="text-[10px]">Co-PI Points</Label><Input type="number" value={policyRules.emr?.ongoing?.[1]?.copi ?? 15} onChange={(e) => handleEmrTierChange('ongoing', 1, 'copi', parseFloat(e.target.value))} /></div>
                                </div>
                              </div>
                              {/* Tier 3 */}
                              <div className="bg-muted/10 p-3 rounded-lg border space-y-2">
                                <span className="text-xs font-semibold block">Tier 3 (&gt;₹1Cr)</span>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1"><Label className="text-[10px]">PI Points</Label><Input type="number" value={policyRules.emr?.ongoing?.[2]?.pi ?? 50} onChange={(e) => handleEmrTierChange('ongoing', 2, 'pi', parseFloat(e.target.value))} /></div>
                                  <div className="space-y-1"><Label className="text-[10px]">Co-PI Points</Label><Input type="number" value={policyRules.emr?.ongoing?.[2]?.copi ?? 20} onChange={(e) => handleEmrTierChange('ongoing', 2, 'copi', parseFloat(e.target.value))} /></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Activities & Guidance */}
                      <div>
                        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b pb-2">Academic & Research Activities Settings</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <Label>Conf. Presentation (India)</Label>
                            <Input type="number" value={policyRules.activities?.conferencePresentationIndia ?? 1} onChange={(e) => handlePolicyChange('activities', 'conferencePresentationIndia', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>Conf. Presentation (Intl.)</Label>
                            <Input type="number" value={policyRules.activities?.conferencePresentationOutsideIndia ?? 2} onChange={(e) => handlePolicyChange('activities', 'conferencePresentationOutsideIndia', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>Convener Points</Label>
                            <Input type="number" value={policyRules.activities?.convener ?? 5} onChange={(e) => handlePolicyChange('activities', 'convener', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>Coordinator Points</Label>
                            <Input type="number" value={policyRules.activities?.coordinator ?? 2} onChange={(e) => handlePolicyChange('activities', 'coordinator', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>Expert Talk (In PU)</Label>
                            <Input type="number" value={policyRules.activities?.expertTalkInPu ?? 2} onChange={(e) => handlePolicyChange('activities', 'expertTalkInPu', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>Expert Talk (Outside PU)</Label>
                            <Input type="number" value={policyRules.activities?.expertTalkOutsidePu ?? 5} onChange={(e) => handlePolicyChange('activities', 'expertTalkOutsidePu', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>Participation (In PU)</Label>
                            <Input type="number" value={policyRules.activities?.participationInPu ?? 1} onChange={(e) => handlePolicyChange('activities', 'participationInPu', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>Participation (Outside PU)</Label>
                            <Input type="number" value={policyRules.activities?.participationOutsidePu ?? 2} onChange={(e) => handlePolicyChange('activities', 'participationOutsidePu', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>Membership Points</Label>
                            <Input type="number" value={policyRules.activities?.membership ?? 2} onChange={(e) => handlePolicyChange('activities', 'membership', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>EMR Team Member</Label>
                            <Input type="number" value={policyRules.activities?.emrTeamMember ?? 2} onChange={(e) => handlePolicyChange('activities', 'emrTeamMember', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>PhD Guided (Completed)</Label>
                            <Input type="number" value={policyRules.activities?.phdCompleted ?? 20} onChange={(e) => handlePolicyChange('activities', 'phdCompleted', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>PhD Guided (Ongoing)</Label>
                            <Input type="number" value={policyRules.activities?.phdOngoing ?? 10} onChange={(e) => handlePolicyChange('activities', 'phdOngoing', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>PG Guided (Completed)</Label>
                            <Input type="number" value={policyRules.activities?.pgCompleted ?? 10} onChange={(e) => handlePolicyChange('activities', 'pgCompleted', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1">
                            <Label>PG Guided (Ongoing)</Label>
                            <Input type="number" value={policyRules.activities?.pgOngoing ?? 5} onChange={(e) => handlePolicyChange('activities', 'pgOngoing', parseFloat(e.target.value))} />
                          </div>
                          <div className="space-y-1 col-span-2">
                            <Label className="text-amber-600 dark:text-amber-400 font-bold">Subcategory Capping Max Points</Label>
                            <Input type="number" value={policyRules.activities?.subcategoryCap ?? 10} onChange={(e) => handlePolicyChange('activities', 'subcategoryCap', parseFloat(e.target.value))} />
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>


                </CardContent>
              </Card>
            ) : (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Manual Override Lock/Unlock History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Override History: {historyUser?.name}</DialogTitle>
            <DialogDescription>
              Detailed logs of manual ARPS submission window lock/unlock updates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto pr-2">
            {historyUser?.manualArpsHistory && historyUser.manualArpsHistory.length > 0 ? (
              <div className="border rounded-lg divide-y">
                {historyUser.manualArpsHistory.map((h: any, i: number) => (
                  <div key={i} className="p-3 text-sm flex flex-col gap-1 hover:bg-muted/30 transition-colors">
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${h.enabled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300'}`}>
                        {h.enabled ? 'Unlocked Access' : 'Locked Access'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.timestamp).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Changed by: <span className="font-semibold text-foreground">{h.changedBy || 'Super Admin'}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No history records found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
