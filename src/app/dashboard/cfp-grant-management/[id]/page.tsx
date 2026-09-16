'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/config';
import { doc, onSnapshot } from 'firebase/firestore';
import { updateCfpGrant } from '@/app/actions';
import type { CfpSubmission, User, GrantPhase, Transaction } from '@/types';
import { uploadFileToApi } from '@/lib/upload-client';
import { getDefaultModulesForRole } from '@/lib/modules';
import { format, parseISO } from 'date-fns';
import { Coins, Plus, Calendar, ShieldCheck, FileCheck, CheckCircle2 } from 'lucide-react';

export default function CfpGrantManagementPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [submission, setSubmission] = useState<CfpSubmission | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Installment creation state
  const [totalGrant, setTotalGrant] = useState(0);
  const [phaseName, setPhaseName] = useState('');
  const [phaseAmount, setPhaseAmount] = useState(0);
  
  // Utilization transaction states
  const [transactionAmount, setTransactionAmount] = useState(0);
  const [transactionVendor, setTransactionVendor] = useState('');
  const [transactionDesc, setTransactionDesc] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const isPI = currentUser.email === submission.piEmail;

    if (!hasAdminPermission && !isPI) {
      toast({
        title: 'Access Denied',
        description: "You don't have permission to manage this grant.",
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
        if (data.grant?.totalAmount) setTotalGrant(data.grant.totalAmount);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id]);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'Super-admin';

  // Initialize total sanctioned grant
  const handleSaveTotalGrant = async () => {
    if (totalGrant <= 0) return;
    try {
      const grantData = {
        totalAmount: totalGrant,
        status: "Awarded",
        phases: submission?.grant?.phases || []
      };
      await updateCfpGrant(id, grantData);
      toast({ title: 'Total Grant Saved!' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  // Add Installment phase
  const handleAddPhase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phaseName || phaseAmount <= 0) return;
    setIsSubmitting(true);
    try {
      const newPhase: GrantPhase = {
        id: String(Date.now()),
        name: phaseName,
        amount: phaseAmount,
        status: "Pending Disbursement",
        transactions: []
      };

      const updatedPhases = [...(submission?.grant?.phases || []), newPhase];
      const grantData = {
        totalAmount: totalGrant || phaseAmount,
        status: "In Progress",
        phases: updatedPhases
      };

      const result = await updateCfpGrant(id, grantData);
      if (result.success) {
        toast({ title: 'Installment Phase Added!' });
        setPhaseName('');
        setPhaseAmount(0);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Failed to add', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Disburse Installment (Admin only)
  const handleDisbursePhase = async (phaseId: string) => {
    try {
      const updatedPhases = (submission?.grant?.phases || []).map(p => {
        if (p.id === phaseId) {
          return {
            ...p,
            status: "Disbursed" as const,
            disbursementDate: new Date().toISOString()
          };
        }
        return p;
      });

      const grantData = {
        ...submission?.grant,
        phases: updatedPhases
      };

      await updateCfpGrant(id, grantData);
      toast({ title: 'Installment Disbursed!' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Disbursement Failed', description: error.message });
    }
  };

  // Log utilization transaction (PI only)
  const handleLogTransaction = async (phaseId: string) => {
    if (transactionAmount <= 0 || !transactionVendor || !transactionDesc || !invoiceFile) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please fill all transaction fields and attach invoice PDF.' });
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload Invoice
      const uploadRes = await uploadFileToApi(invoiceFile);
      if (!uploadRes.success || !uploadRes.url) {
        throw new Error(uploadRes.error || 'Failed to upload invoice.');
      }

      const newTx: Transaction = {
        id: String(Date.now()),
        phaseId,
        dateOfTransaction: new Date().toISOString(),
        amount: transactionAmount,
        vendorName: transactionVendor,
        isGstRegistered: false,
        description: transactionDesc,
        invoiceUrl: uploadRes.url
      };

      const updatedPhases = (submission?.grant?.phases || []).map(p => {
        if (p.id === phaseId) {
          return {
            ...p,
            status: "Utilization Submitted" as const,
            utilizationSubmissionDate: new Date().toISOString(),
            transactions: [...(p.transactions || []), newTx]
          };
        }
        return p;
      });

      const grantData = {
        ...submission?.grant,
        phases: updatedPhases
      };

      const result = await updateCfpGrant(id, grantData);
      if (result.success) {
        toast({ title: 'Utilization Invoice Saved!' });
        setTransactionAmount(0);
        setTransactionVendor('');
        setTransactionDesc('');
        setInvoiceFile(null);
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Log utilization failed', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
      <PageHeader
        title="CFP Grant Management"
        description={`Manage installments, disburse budgets, and track utilizations for: ${submission?.title}`}
        backButtonHref={`/dashboard/cfp-proposal/${id}`}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
        
        {/* Left Side: Installments list, transactions logs */}
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Coins className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
            Budget Installment Phases
          </h3>

          {submission?.grant?.phases && submission.grant.phases.length > 0 ? (
            <div className="space-y-6">
              {submission.grant.phases.map((phase) => (
                <Card key={phase.id} className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden">
                  <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-900/60 flex flex-row justify-between items-center">
                    <div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">{phase.name}</CardTitle>
                      <CardDescription className="text-slate-600 dark:text-slate-400 text-xs">Sanctioned Installment: ₹{phase.amount}</CardDescription>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase border ${
                      phase.status === 'Disbursed'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        : phase.status === 'Utilization Submitted'
                        ? 'bg-blue-500/10 border-blue-500/20 text-blue-500 dark:text-blue-400'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                    }`}>
                      {phase.status}
                    </span>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4">
                    {/* Disbursed Timeline Info */}
                    {phase.disbursementDate && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                        Disbursed on: {format(parseISO(phase.disbursementDate), 'dd MMM yyyy')}
                      </p>
                    )}

                    {/* Action buttons based on status */}
                    {phase.status === 'Pending Disbursement' && isAdmin && (
                      <Button onClick={() => handleDisbursePhase(phase.id)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-9">
                        Confirm Disbursement
                      </Button>
                    )}

                    {/* Log Utilization (PI role) */}
                    {phase.status === 'Disbursed' && (
                      <div className="border border-dashed border-slate-200 dark:border-white/10 p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/10 space-y-4">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1">
                          <Plus className="h-4 w-4 text-primary" /> Log Utilization Invoice
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <Input placeholder="Invoice Amount" type="number" value={transactionAmount || ''} onChange={(e) => setTransactionAmount(Number(e.target.value))} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs h-9" />
                          <Input placeholder="Vendor / Recipient" value={transactionVendor} onChange={(e) => setTransactionVendor(e.target.value)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs h-9" />
                        </div>
                        <Textarea placeholder="Describe item or service utilized..." value={transactionDesc} onChange={(e) => setTransactionDesc(e.target.value)} rows={2} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs" />
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Attach Invoice Proof (PDF)</label>
                          <Input type="file" accept=".pdf" onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs" />
                        </div>
                        <Button onClick={() => handleLogTransaction(phase.id)} disabled={isSubmitting} className="bg-primary hover:bg-primary/95 text-white text-xs font-bold h-8">
                          {isSubmitting ? 'Logging...' : 'Submit Utilization Report'}
                        </Button>
                      </div>
                    )}

                    {/* Utilization logs list */}
                    {phase.transactions && phase.transactions.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <h5 className="text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">Logged Utilization Invoices</h5>
                        {phase.transactions.map((tx) => (
                          <div key={tx.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900/20 border border-slate-100 dark:border-white/5 rounded-2xl">
                            <div>
                              <p className="text-xs font-bold text-slate-900 dark:text-white">₹{tx.amount} to {tx.vendorName}</p>
                              <p className="text-[10px] text-slate-600 dark:text-slate-400">{tx.description}</p>
                            </div>
                            <Button asChild variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10">
                              <a href={tx.invoiceUrl} target="_blank" rel="noopener noreferrer">
                                <FileCheck className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="p-10 border border-dashed border-slate-200 dark:border-white/10 rounded-3xl text-center text-slate-600 dark:text-slate-400 font-semibold bg-slate-50 dark:bg-slate-950/10 text-xs">
              No installment phases configured yet.
            </div>
          )}
        </div>

        {/* Right Side: Setup budgets (Admin only) */}
        <div className="space-y-6">
          <Card className="border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/45 backdrop-blur-xl shadow-md dark:shadow-2xl rounded-3xl relative overflow-hidden h-fit">
            <CardHeader className="border-b border-slate-100 dark:border-slate-900 pb-4">
              <CardTitle className="text-base text-slate-900 dark:text-white">Sanctioned Grant Settings</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Total Sanctioned Grant Amount</label>
                <div className="flex gap-2">
                  <Input type="number" value={totalGrant || ''} onChange={(e) => setTotalGrant(Number(e.target.value))} disabled={!isAdmin} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white" />
                  {isAdmin && (
                    <Button onClick={handleSaveTotalGrant} className="bg-primary hover:bg-primary/95 text-white font-bold">
                      Save
                    </Button>
                  )}
                </div>
              </div>

              {isAdmin && (
                <form onSubmit={handleAddPhase} className="space-y-4 border-t border-slate-100 dark:border-slate-900 pt-4">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1">
                    <Plus className="h-4 w-4 text-emerald-500 dark:text-emerald-400" /> Configure Installment Phase
                  </h4>
                  <div className="space-y-2">
                    <Input placeholder="Phase Name (e.g. Installment 1)" value={phaseName} onChange={(e) => setPhaseName(e.target.value)} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs h-9" />
                    <Input placeholder="Installment Amount" type="number" value={phaseAmount || ''} onChange={(e) => setPhaseAmount(Number(e.target.value))} className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-900 dark:text-white text-xs h-9" />
                  </div>
                  <Button type="submit" disabled={isSubmitting} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-9">
                    Add Installment Phase
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
