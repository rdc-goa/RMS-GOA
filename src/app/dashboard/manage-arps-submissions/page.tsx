'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Settings2, CalendarCheck, Save, Download, Calculator, Lock, RefreshCw, Trash2 } from 'lucide-react';
import { type User } from '@/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import {
  getPolicyRules,
  updatePolicyRules,
  getArpsEvaluationCycles,
  updateArpsEvaluationCycle,
  generateArpsStatisticsReport,
  saveArpsOverride,
  deleteArpsOverride,
  calculateArpsForUser,
} from '@/app/arps-actions';
import { generatePdfDocument } from '@/lib/arps-pdf';
import { DEFAULT_POLICY_RULES } from '@/lib/arps-defaults';
import { Badge } from '@/components/ui/badge';

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

  // Overrides State
  const [overridingUser, setOverridingUser] = useState<string | null>(null);
  const [overrideValue, setOverrideValue] = useState<string>('');
  const [savingOverride, setSavingOverride] = useState(false);

  // Deadline State
  const [finalDateValue, setFinalDateValue] = useState<string>('');

  const router = useRouter();
  const { toast } = useToast();

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const yr = currentYear - i;
    return `${yr - 1}-${yr}`;
  });

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
    } else {
      setFinalDateValue('');
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

  const handleDownloadDetailedReport = async (stat: any) => {
    setDownloadingPdfFor(stat.uid);
    try {
      const result = await calculateArpsForUser(stat.uid, selectedYear);
      if (!result.success || !result.data) {
        toast({ variant: 'destructive', title: 'Calculation Failed', description: result.error || 'Could not fetch detailed data.' });
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
        institute: '', 
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

  // CSV Export
  const exportToCSV = () => {
    if (statistics.length === 0) return;
    const headers = ['Faculty Name', 'MIS ID', 'Department', 'Total ARPS Score', 'Band Grade', 'Annual Increment (INR)', 'Publications', 'Patents', 'Consultancy', 'EMR', 'Activities'];
    const rows = statistics.map(s => [
      `"${s.name}"`,
      `"${s.misId}"`,
      `"${s.department}"`,
      s.totalArps.toFixed(2),
      `"${s.grade}"`,
      s.annualIncrement,
      s.publicationsCount,
      s.patentsCount,
      s.consultancyCount,
      s.emrCount,
      s.activitiesCount
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
            <Card className="shadow-lg border-t-4 border-t-indigo-500">
              <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between border-b pb-6 gap-4">
                <div>
                  <CardTitle className="text-xl">Evaluation Cycle: {selectedYear}</CardTitle>
                  <CardDescription>
                    Status: <Badge className={cycles[selectedYear]?.status === 'frozen' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}>
                      {cycles[selectedYear]?.status === 'frozen' ? 'Frozen / Finalized' : 'Active Evaluation'}
                    </Badge>
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 border rounded-md px-2 py-1 bg-muted/30">
                    <Label className="text-xs font-semibold whitespace-nowrap">Lock Deadline:</Label>
                    <Input 
                      type="datetime-local" 
                      className="h-8 text-xs w-[180px]"
                      value={finalDateValue}
                      onChange={(e) => setFinalDateValue(e.target.value)}
                    />
                    <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={saveFinalDate} disabled={cycleSaving || finalDateValue === (cycles[selectedYear]?.finalDate || '')}>
                      Save Date
                    </Button>
                  </div>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="text-sm bg-background border border-input rounded-md px-3 py-2"
                  >
                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <Button variant="outline" onClick={() => loadStatistics()} disabled={loadingStats}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${loadingStats ? 'animate-spin' : ''}`} /> Refresh
                  </Button>
                  <Button variant="outline" className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" onClick={exportToCSV}>
                    <Download className="h-4 w-4 mr-2" /> Export CSV
                  </Button>
                  {cycles[selectedYear]?.status === 'frozen' ? (
                    <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700" disabled={cycleSaving} onClick={() => updateCycleStatus('active')}>
                      <CalendarCheck className="h-4 w-4 mr-2" /> Re-open Cycle
                    </Button>
                  ) : (
                    <Button variant="destructive" disabled={cycleSaving} onClick={() => updateCycleStatus('frozen')}>
                      <Lock className="h-4 w-4 mr-2" /> Freeze & Finalize Cycle
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-wider border-b">
                      <th className="px-6 py-4">Faculty Name</th>
                      <th className="px-6 py-4">Final Score (ARPS)</th>
                      <th className="px-6 py-4">Grade</th>
                      <th className="px-6 py-4">Increment (₹)</th>
                      <th className="px-6 py-4 text-center">Pubs</th>
                      <th className="px-6 py-4 text-center">Patents</th>
                      <th className="px-6 py-4 text-center">EMR</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loadingStats ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                          <p className="text-muted-foreground mt-4">Computing final scores...</p>
                        </td>
                      </tr>
                    ) : statistics.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                          No faculty found or no submissions approved for this cycle.
                        </td>
                      </tr>
                    ) : (
                      statistics.map(stat => (
                        <tr key={stat.uid} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-foreground">{stat.name}</div>
                            <div className="text-[10px] text-muted-foreground">{stat.department || 'N/A'} | {stat.misId}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-lg font-extrabold text-primary">{stat.totalArps.toFixed(2)}</div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge className="bg-slate-700 text-white font-mono">{stat.grade}</Badge>
                          </td>
                          <td className="px-6 py-4 font-mono font-medium text-emerald-600">
                            ₹{stat.annualIncrement.toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4 text-center text-muted-foreground font-medium">{stat.publicationsCount}</td>
                          <td className="px-6 py-4 text-center text-muted-foreground font-medium">{stat.patentsCount}</td>
                          <td className="px-6 py-4 text-center text-muted-foreground font-medium">{stat.emrCount}</td>
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
                                <Button size="sm" variant="outline" className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50" title="Download Detailed Report" onClick={() => handleDownloadDetailedReport(stat)} disabled={downloadingPdfFor === stat.uid}>
                                  {downloadingPdfFor === stat.uid ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                                  Download PDF
                                </Button>
                                <Button size="sm" variant="outline" className="text-xs" onClick={() => { setOverridingUser(stat.uid); setOverrideValue(stat.totalArps.toString()); }}>
                                  Override Score
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" title="Clear Override" onClick={() => handleClearOverride(stat.uid)} disabled={savingOverride}>
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

                  {/* Publications */}
                  <div>
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

                  {/* Patents & Increments */}
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
    </div>
  );
}
