
'use client';

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import type { Project, User, GrantPhase, Transaction } from "@/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { addGrantPhase, addTransaction, updatePhaseStatus, deleteTransaction, updateTransaction } from "@/app/actions"
import { generateInstallmentOfficeNoting } from "@/app/document-actions"
import React, { useState } from "react"
import {
  DollarSign,
  Banknote,
  FileText,
  CheckCircle,
  PlusCircle,
  AlertCircle,
  BadgeCent,
  ChevronDown,
  Download,
  Loader2,
  Trash2,
  Edit,
} from "lucide-react"
import * as XLSX from "xlsx"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "../ui/textarea"
import { Label } from "../ui/label"
import { Switch } from "../ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Alert, AlertDescription, AlertTitle } from "../ui/alert"
import Link from "next/link"
import { Badge } from "../ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu"
import { format, parseISO, isValid } from "date-fns"
import { Separator } from "../ui/separator"
import { uploadFileToApi, validateFile } from "@/lib/upload-client"


interface GrantManagementProps {
  project: Project
  user: User
  onUpdate: (updatedProject: Project) => void
}

// File is now uploaded directly via API, no need for DataUrl conversion

export function GrantManagement({ project, user, onUpdate }: GrantManagementProps) {
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAddPhaseOpen, setIsAddPhaseOpen] = useState(false)
  const [isTransactionOpen, setIsTransactionOpen] = useState(false)
  const [currentPhaseId, setCurrentPhaseId] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false);
  const [phaseForNoting, setPhaseForNoting] = useState<GrantPhase | null>(null);
  const [transactionToEdit, setTransactionToEdit] = useState<{phaseId: string, transaction: Transaction} | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<{phaseId: string, transaction: Transaction} | null>(null);

  const grant = project.grant
  
  const canAddPhase = (user.role === "admin" || user.role === "Super-admin") && (project.isBulkUploaded || (grant && grant.totalAmount > 0));

  const totalDisbursed = grant?.phases?.reduce((acc, phase) => acc + phase.amount, 0) || 0;
  const remainingAmount = (grant?.totalAmount || 0) - totalDisbursed;

  const addPhaseSchema = z.object({
    installmentRefNumber: z.string().min(3, "Installment Ref. No. is required."),
    amount: z.coerce.number().positive("Amount must be a positive number.").max(remainingAmount, `Amount cannot exceed the remaining balance of ₹${remainingAmount.toLocaleString('en-IN')}.`),
  })
  
  const notingFormSchema = z.object({
    installmentRefNumber: z.string().min(3, "Installment Ref. No. is required."),
  });

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ACCEPTED_FILE_TYPES = ["application/pdf"];

  const transactionSchema = z
    .object({
      dateOfTransaction: z.string().min(1, "Transaction date is required."),
      amount: z.coerce.number().positive("Amount must be a positive number."),
      vendorName: z.string().min(2, "Vendor name is required."),
      isGstRegistered: z.boolean().default(false),
      gstNumber: z.string().optional(),
      description: z.string().min(10, "Description is required."),
      invoice: z.any().optional(),
    })
    .refine(
      (data) => {
        if (data.isGstRegistered) {
          return !!data.gstNumber && data.gstNumber.length > 0
        }
        return true
      },
      {
        message: "GST number is required for registered vendors.",
        path: ["gstNumber"],
      },
    )
  

  const canChangeStatus = user.role === "admin" || user.role === "Super-admin"
  const isPI = user.uid === project.pi_uid || user.email === project.pi_email
  const isCoPi = project.coPiUids?.includes(user.uid) || false;
  const isSuperAdmin = user.role === 'Super-admin';

  const phaseForm = useForm<z.infer<typeof addPhaseSchema>>({
    resolver: zodResolver(addPhaseSchema),
    defaultValues: { installmentRefNumber: "", amount: 0 },
  })
  
  const notingForm = useForm<z.infer<typeof notingFormSchema>>({
    resolver: zodResolver(notingFormSchema),
    defaultValues: { installmentRefNumber: "" },
  });

  const transactionForm = useForm<z.infer<typeof transactionSchema>>({
    resolver: zodResolver(transactionSchema),
  })

  // Pre-fill form when editing
  React.useEffect(() => {
    if (transactionToEdit) {
      transactionForm.reset({
        dateOfTransaction: format(parseISO(transactionToEdit.transaction.dateOfTransaction), 'yyyy-MM-dd'),
        amount: transactionToEdit.transaction.amount,
        vendorName: transactionToEdit.transaction.vendorName,
        isGstRegistered: transactionToEdit.transaction.isGstRegistered,
        gstNumber: transactionToEdit.transaction.gstNumber,
        description: transactionToEdit.transaction.description,
        invoice: undefined, // Clear file input
      });
      setCurrentPhaseId(transactionToEdit.phaseId);
      setIsTransactionOpen(true);
    } else {
      transactionForm.reset({
        dateOfTransaction: "",
        amount: 0,
        vendorName: "",
        isGstRegistered: false,
        gstNumber: "",
        description: "",
        invoice: undefined,
      });
    }
  }, [transactionToEdit, transactionForm]);

  const handleExportTransactions = (phase: GrantPhase) => {
    if (!phase.transactions || phase.transactions.length === 0) {
      toast({
        variant: "destructive",
        title: "No Data",
        description: "There are no transactions in this phase to export.",
      })
      return
    }

    const dataToExport = phase.transactions.map((t: Transaction) => ({
      "Transaction Date": new Date(t.dateOfTransaction).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      "Vendor Name": t.vendorName,
      "Amount (₹)": t.amount,
      "GST Registered": t.isGstRegistered ? "Yes" : "No",
      "GST Number": t.gstNumber || "N/A",
      "Description": t.description,
      "Invoice URL": t.invoiceUrl || "N/A",
    }))

    const worksheet = XLSX.utils.json_to_sheet(dataToExport)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions")
    XLSX.writeFile(workbook, `${project.title.replace(/\s+/g, "_")}_${phase.name.replace(/\s+/g, "_")}_Transactions.xlsx`)
  }
  
  const handleDownloadNoting = async (phase: GrantPhase, installmentRefNumber: string) => {
    if (!phase.amount) {
        toast({ variant: 'destructive', title: 'Missing Data', description: 'This phase is missing the amount needed to generate the note.' });
        return;
    }
    setIsDownloading(true);
    try {
        const result = await generateInstallmentOfficeNoting(project.id, { installmentRefNumber, amount: phase.amount });

        if (result.success && result.fileData) {
            const byteCharacters = atob(result.fileData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Office_Note_Installment_${project.pi.replace(/\s/g, '_')}.docx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast({ title: "Download Started" });
            setPhaseForNoting(null);
        } else {
            throw new Error(result.error || "Failed to generate document.");
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Download Failed', description: error.message });
    } finally {
        setIsDownloading(false);
    }
  };


  const handleAddPhase = async (values: z.infer<typeof addPhaseSchema>) => {
    setIsSubmitting(true);
    try {
      const result = await addGrantPhase(project.id, {
          installmentRefNumber: values.installmentRefNumber,
          amount: values.amount
      });
      if (result.success && result.updatedProject) {
        onUpdate(result.updatedProject);
        toast({ title: "Success", description: "New grant phase added." });
        phaseForm.reset();
        setIsAddPhaseOpen(false);
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error || "Failed to add new phase." });
      }
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Failed to add new phase." });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleTransactionSubmit = async (values: Partial<z.infer<typeof transactionSchema>>, isDraft: boolean = false) => {
    if (!grant || !currentPhaseId) return;

    // For final submission, validate all fields
    if (!isDraft) {
        const validationResult = transactionSchema.safeParse(values);
        if (!validationResult.success) {
            // @ts-ignore
            Object.keys(validationResult.error.formErrors.fieldErrors).forEach((key: keyof z.infer<typeof transactionSchema>) => {
                const message = validationResult.error.formErrors.fieldErrors[key]?.[0];
                if (message) {
                    transactionForm.setError(key, { type: 'manual', message });
                }
            });
            return;
        }
    }

    setIsSubmitting(true);
    try {
        const invoiceFile = (values.invoice as FileList)?.[0];
        let invoiceUrl: string | undefined;
        let invoiceFileName: string | undefined;
        
        // Upload file to new API endpoint if provided
        if (invoiceFile) {
            // Validate file before upload
            const validation = validateFile(invoiceFile);
            if (!validation.valid) {
                throw new Error(validation.error || "File validation failed");
            }

            // Upload file to API
            const uploadResult = await uploadFileToApi(invoiceFile);
            if (!uploadResult.success) {
                throw new Error(uploadResult.error || "Failed to upload invoice");
            }
            invoiceUrl = uploadResult.url;
            invoiceFileName = invoiceFile.name;
        }
        
        const finalValues = {
            dateOfTransaction: values.dateOfTransaction || '',
            amount: values.amount || 0,
            vendorName: values.vendorName || '',
            isGstRegistered: values.isGstRegistered || false,
            gstNumber: values.gstNumber || '',
            description: values.description || '',
        };
        
        let result;
        if (transactionToEdit) {
            // Update existing transaction
            result = await updateTransaction(project.id, transactionToEdit.phaseId, transactionToEdit.transaction.id, {
                ...finalValues,
                isDraft,
                invoiceUrl,
                invoiceFileName,
            });
        } else {
            // Add new transaction
            result = await addTransaction(project.id, currentPhaseId, {
                ...finalValues,
                isDraft,
                invoiceUrl,
                invoiceFileName,
            });
        }

        if (result.success && result.updatedProject) {
            onUpdate(result.updatedProject);
            toast({ title: "Success", description: `Transaction ${transactionToEdit ? 'updated' : 'added'} successfully.` });
            if (!isDraft) {
                closeTransactionDialog();
            }
        } else {
            throw new Error(result.error || `Failed to ${transactionToEdit ? 'update' : 'add'} transaction.`);
        }
    } catch (error: any) {
        console.error(`Client error in handleTransactionSubmit:`, error);
        toast({ variant: "destructive", title: "Error", description: error.message || `Failed to ${transactionToEdit ? 'update' : 'add'} transaction.` });
    } finally {
        setIsSubmitting(false);
    }
  };


  const handleDeleteTransaction = async () => {
    if (!transactionToDelete) return;
    setIsSubmitting(true);
    try {
        const result = await deleteTransaction(project.id, transactionToDelete.phaseId, transactionToDelete.transaction.id);
        if (result.success && result.updatedProject) {
            onUpdate(result.updatedProject);
            toast({ title: 'Transaction Deleted', description: 'The transaction has been removed.' });
            setTransactionToDelete(null);
        } else {
            throw new Error(result.error || "Failed to delete transaction.");
        }
    } catch (error: any) {
        console.error("Client error in handleDeleteTransaction:", error);
        toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to delete transaction.' });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handlePhaseStatusUpdate = async (phaseId: string, newStatus: GrantPhase["status"]) => {
    if (!grant || !project.id) return;
    setIsSubmitting(true);
    try {
      const result = await updatePhaseStatus(project.id, phaseId, newStatus);
      if (result.success && result.updatedProject) {
        onUpdate(result.updatedProject);
        toast({ title: "Success", description: `Phase status updated to ${newStatus}.` });
      } else {
        toast({ variant: "destructive", title: "Error", description: result.error || "Failed to update phase status." });
      }
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Failed to update phase status." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeTransactionDialog = () => {
    setIsTransactionOpen(false);
    setCurrentPhaseId(null);
    setTransactionToEdit(null);
    transactionForm.reset();
  }
  
  const getPhaseBadgeVariant = (status: GrantPhase['status']) => {
    switch (status) {
        case 'Disbursed':
        case 'Completed':
            return 'default';
        case 'Utilization Submitted':
            return 'default';
        default:
            return 'secondary';
    }
  };

  if (!grant) return null

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            <CardTitle>Grant Management</CardTitle>
          </div>
          {canAddPhase && (grant.phases?.length || 0) < 5 && remainingAmount > 0 && (
            <Dialog open={isAddPhaseOpen} onOpenChange={setIsAddPhaseOpen}>
              <DialogTrigger asChild>
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Grant Phase
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Grant Phase</DialogTitle>
                  <DialogDescription>
                    Define a new disbursement phase for this project.
                    <br />
                    <span className="font-semibold text-foreground">Remaining Grant Amount: ₹{remainingAmount.toLocaleString('en-IN')}</span>
                  </DialogDescription>
                </DialogHeader>
                <Form {...phaseForm}>
                  <form
                    id="add-phase-form"
                    onSubmit={phaseForm.handleSubmit(handleAddPhase)}
                    className="space-y-4 py-4"
                  >
                     <FormField
                      name="installmentRefNumber"
                      control={phaseForm.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Installment Ref. No.</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., RDC/CP/IMR/133" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="amount"
                      control={phaseForm.control}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (₹)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} min="0" onWheel={(e) => (e.target as HTMLElement).blur()} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button type="submit" form="add-phase-form" disabled={isSubmitting}>
                    {isSubmitting ? "Adding..." : "Add Phase"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
        <CardDescription className="mt-2">
          Total grant amount:{" "}
          <span className="font-bold text-foreground">₹{(grant.totalAmount || 0).toLocaleString("en-IN")}</span> |
          Sanction No: <span className="font-bold text-foreground">{grant.sanctionNumber || "N/A"}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {(grant.phases || []).map((phase, index) => {
          const totalUtilized = phase.transactions?.reduce((acc, t) => acc + Number(t?.amount || 0), 0) || 0;
          const utilizationPercentage = phase.amount > 0 ? (totalUtilized / phase.amount) * 100 : 0;
          const hasReachedThreshold = utilizationPercentage >= 80;
          const hasRemainingGrant = remainingAmount > 0 || (index < (grant.phases.length - 1));
          
          const canRequestNextPhase = isPI && phase.status === "Disbursed" && hasReachedThreshold && hasRemainingGrant;
          const canManageExpenses = (isPI || isCoPi || isSuperAdmin) && phase.status === 'Disbursed';
          
          const previousPhase = index > 0 ? grant.phases[index - 1] : null;
          const showOfficeNoteButton = (user.role === "admin" || user.role === 'Super-admin') && index > 0 && previousPhase && ['Utilization Submitted', 'Completed'].includes(previousPhase.status);

          return (
            <React.Fragment key={`${phase.id}-${index}`}>
              <Card className="bg-muted/30">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{phase.name}</CardTitle>
                      <CardDescription className="mt-1">
                        Amount:{" "}
                        <span className="font-semibold text-foreground">₹{phase.amount.toLocaleString("en-IN")}</span>
                        {phase.installmentRefNumber && ` | Ref: ${phase.installmentRefNumber}`}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getPhaseBadgeVariant(phase.status)}>{phase.status}</Badge>
                      {canChangeStatus && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={isSubmitting}>
                              Change Status <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              onClick={() => handlePhaseStatusUpdate(phase.id, "Pending Disbursement")}
                              disabled={phase.status === "Pending Disbursement"}
                            >
                              Pending Disbursement
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handlePhaseStatusUpdate(phase.id, "Disbursed")}
                              disabled={phase.status === "Disbursed"}
                            >
                              Disbursed
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handlePhaseStatusUpdate(phase.id, "Completed")}
                              disabled={phase.status === "Completed"}
                            >
                              Completed
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {showOfficeNoteButton && (
                        <Button variant="outline" size="sm" onClick={() => setPhaseForNoting(phase)}>
                          <Download className="mr-2 h-4 w-4" /> Office Note
                        </Button>
                      )}
                    </div>
                  </div>
                  {phase.disbursementDate && (
                    <p className="text-sm text-muted-foreground">
                      Disbursed on: {format(parseISO(phase.disbursementDate), "dd/MM/yyyy")}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Allocated</p>
                        <p className="font-semibold">₹{phase.amount.toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <BadgeCent className="h-4 w-4 text-blue-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Utilized ({utilizationPercentage.toFixed(2)}%)</p>
                        <p className="font-semibold">₹{totalUtilized.toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-orange-600" />
                      <div>
                        <p className="text-sm text-muted-foreground">Remaining</p>
                        <p className="font-semibold">₹{(phase.amount - totalUtilized).toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Transactions ({phase.transactions?.length || 0})
                      </h4>
                      <div className="flex items-center gap-2">
                        {canManageExpenses && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setCurrentPhaseId(phase.id)
                              setIsTransactionOpen(true)
                            }}
                          >
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Expense
                          </Button>
                        )}
                        {(phase.transactions?.length || 0) > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExportTransactions(phase)}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Export
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {(phase.transactions?.length || 0) > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Vendor</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>GST</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Invoice</TableHead>
                              {(isPI || isCoPi || isSuperAdmin) && <TableHead className="text-right">Action</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {phase.transactions?.map((transaction) => {
                                const dateString = transaction.dateOfTransaction;
                                const date = dateString ? parseISO(dateString) : null;
                                return (
                                <TableRow key={transaction.id} className={transaction.isDraft ? 'bg-yellow-100 dark:bg-yellow-900/20' : ''}>
                                  <TableCell>{date && isValid(date) ? format(date, "dd/MM/yyyy") : dateString}</TableCell>
                                  <TableCell>{transaction.vendorName}</TableCell>
                                  <TableCell>₹{transaction.amount.toLocaleString("en-IN")}</TableCell>
                                  <TableCell>
                                    {transaction.isGstRegistered ? (
                                      <span className="text-green-600">Yes ({transaction.gstNumber})</span>
                                    ) : (
                                      <span className="text-muted-foreground">No</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="whitespace-pre-wrap max-w-xs">{transaction.description}</TableCell>
                                  <TableCell>
                                    {transaction.invoiceUrl ? (
                                      <Link
                                        href={transaction.invoiceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline"
                                      >
                                        View Invoice
                                      </Link>
                                    ) : (
                                      <span className="text-muted-foreground">N/A</span>
                                    )}
                                  </TableCell>
                                  {canManageExpenses && (
                                    <TableCell className="text-right">
                                      <div className="flex justify-end gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTransactionToEdit({phaseId: phase.id, transaction})}>
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTransactionToDelete({phaseId: phase.id, transaction})}>
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  )}
                                </TableRow>
                            )})}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                       <div className="text-center py-8">
                          <p className="text-muted-foreground">No transactions recorded for this phase.</p>
                      </div>
                    )}
                  </div>
                

                 {canRequestNextPhase && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={() => handlePhaseStatusUpdate(phase.id, 'Utilization Submitted')}
                      disabled={isSubmitting}
                    >
                      Submit Utilization & Request Next Phase
                    </Button>
                  </div>
                )}

                {totalUtilized > phase.amount && (
                  <Alert className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Over-utilization Warning</AlertTitle>
                    <AlertDescription>
                      This phase has been over-utilized by ₹{(totalUtilized - phase.amount).toLocaleString("en-IN")}.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
            {index < ((grant.phases || []).length - 1) && <Separator key={`${phase.id}-separator`} />}
            </React.Fragment>
          );
        })}

        <Dialog open={isTransactionOpen} onOpenChange={closeTransactionDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{transactionToEdit ? 'Edit' : 'Add'} Transaction</DialogTitle>
              <DialogDescription>Record a new expense for this grant phase.</DialogDescription>
            </DialogHeader>
            <Form {...transactionForm}>
              <form
                id="add-transaction-form"
                className="space-y-4 py-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    name="dateOfTransaction"
                    control={transactionForm.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transaction Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="amount"
                    control={transactionForm.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount (₹)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} min="0" onWheel={(e) => (e.target as HTMLElement).blur()} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  name="vendorName"
                  control={transactionForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vendor Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter vendor/supplier name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center space-x-2">
                  <Switch
                    id="gst-registered"
                    checked={transactionForm.watch("isGstRegistered")}
                    onCheckedChange={(checked) => transactionForm.setValue("isGstRegistered", checked)}
                  />
                  <Label htmlFor="gst-registered">Vendor is GST registered</Label>
                </div>

                {transactionForm.watch("isGstRegistered") && (
                  <FormField
                    name="gstNumber"
                    control={transactionForm.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>GST Number</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Enter GST number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  name="description"
                  control={transactionForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Describe the purchase/expense" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  name="invoice"
                  control={transactionForm.control}
                  render={({ field: { onChange, value, ...field } }) => (
                    <FormItem>
                      <FormLabel>Invoice (PDF)</FormLabel>
                      {transactionToEdit?.transaction.invoiceUrl && <p className="text-xs text-muted-foreground">Current invoice: <a href={transactionToEdit.transaction.invoiceUrl} target="_blank" rel="noopener noreferrer" className="underline">View</a>. Uploading a new file will replace it.</p>}
                      <FormControl>
                        <Input
                          type="file"
                          accept=".pdf"
                          onChange={(e) => onChange(e.target.files)}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>Below 5 MB</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
            <DialogFooter>
                <Button variant="outline" onClick={() => handleTransactionSubmit(transactionForm.getValues(), true)} disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save as Draft'}
                </Button>
                <div>
                    <Button variant="ghost" onClick={closeTransactionDialog}>Cancel</Button>
                    <Button onClick={() => handleTransactionSubmit(transactionForm.getValues())} disabled={isSubmitting}>
                        {isSubmitting ? "Saving..." : (transactionToEdit ? 'Save Changes' : 'Add Transaction')}
                    </Button>
                </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!transactionToDelete} onOpenChange={() => setTransactionToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will permanently delete the transaction of ₹{transactionToDelete?.transaction.amount.toLocaleString('en-IN')} for "{transactionToDelete?.transaction.vendorName}". This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteTransaction} className="bg-destructive hover:bg-destructive/90" disabled={isSubmitting}>
                        {isSubmitting ? "Deleting..." : "Confirm Delete"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!phaseForNoting} onOpenChange={() => setPhaseForNoting(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Generate Office Note for {phaseForNoting?.name}</DialogTitle>
                    <DialogDescription>Please provide the installment reference number for this new phase to generate the office noting document.</DialogDescription>
                </DialogHeader>
                 <Form {...notingForm}>
                    <form id="noting-form" onSubmit={notingForm.handleSubmit((data) => handleDownloadNoting(phaseForNoting!, data.installmentRefNumber))} className="py-4">
                        <FormField
                            name="installmentRefNumber"
                            control={notingForm.control}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New Installment Reference Number</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="e.g., RDC/IMR/2024/002-2" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="noting-form" disabled={isDownloading}>
                        {isDownloading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Generating...</> : <><Download className="mr-2 h-4 w-4"/> Download</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  );
}
