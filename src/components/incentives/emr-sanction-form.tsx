"use client"

import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import type { User, IncentiveClaim, Author, CoPiDetails } from '@/types'
import { uploadFileToApi } from '@/lib/upload-client'
import { Loader2, AlertCircle, Plus, Trash2, Info, FileText, CheckCircle2, ChevronDown } from 'lucide-react'
import { calculateEmrSanctionIncentive } from "@/app/incentive-calculation"
import { submitIncentiveClaimViaApi } from "@/lib/incentive-claim-client"
import { getIncentiveClaimByIdAction } from "@/app/actions"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { AuthorSearch } from "./author-search"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const emrSanctionSchema = z.object({
  emrProjectName: z.string().min(5, "Project name is required."),
  wasRoutedThroughRdc: z.enum(["yes", "no"], { required_error: "Please select if it was routed through RDC." }),
  sanctionFrom: z.string().min(2, "Sanctioning authority is required."),
  authors: z.array(z.object({
    name: z.string(),
    email: z.string().email(),
    uid: z.string().optional().nullable(),
    role: z.string(),
    isExternal: z.boolean(),
    status: z.string(),
    organization: z.string().optional()
  })).default([]),
  externalCoPis: z.array(z.object({
    name: z.string().min(2, "Name is required."),
    organization: z.string().min(2, "Institute is required."),
    email: z.string().email("Invalid email format."),
  })).default([]),
  sanctionAmount: z.coerce.number().positive("Sanction amount must be greater than zero."),
  sanctionDate: z.string().min(1, "Date of sanction is required."),
  sanctionProof: z.any()
    .refine((files) => !files || files.length === 0 || Array.from(files as FileList).every((file) => file.size <= MAX_FILE_SIZE), 'File must be less than 10 MB.')
})
  .refine(
    (data) => {
      const today = new Date().toISOString().split("T")[0];
      return !data.sanctionDate || data.sanctionDate <= today;
    },
    { message: "Date of sanction cannot be in the future.", path: ["sanctionDate"] }
  );

type EmrSanctionFormValues = z.infer<typeof emrSanctionSchema>

export function EmrSanctionForm({ user }: { user: User }) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [uploading, setUploading] = useState(false)
  const [extName, setExtName] = useState("")
  const [extInst, setExtInst] = useState("")
  const [extEmail, setExtEmail] = useState("")

  const form = useForm<EmrSanctionFormValues>({
    resolver: zodResolver(emrSanctionSchema),
    defaultValues: {
      emrProjectName: "",
      wasRoutedThroughRdc: undefined,
      sanctionFrom: "",
      authors: [],
      externalCoPis: [],
      sanctionAmount: 0,
      sanctionDate: "",
    },
  })

  // Utility to convert number to words (Indian numbering system)
  const numberToWords = (num: number): string => {
    if (num === 0) return "";
    if (isNaN(num)) return "";
    
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const format = (n: number, suffix: string) => {
      if (n === 0) return '';
      let str = '';
      if (n > 19) {
        str += b[Math.floor(n / 10)] + ' ' + a[n % 10];
      } else {
        str += a[n];
      }
      if (suffix) str += suffix + ' ';
      return str;
    };

    let n = Math.floor(num);
    let res = '';
    res += format(Math.floor(n / 10000000), 'Crore');
    res += format(Math.floor((n / 100000) % 100), 'Lakh');
    res += format(Math.floor((n / 1000) % 100), 'Thousand');
    res += format(Math.floor((n / 100) % 10), 'Hundred');
    
    const lastTwo = n % 100;
    if (n > 100 && lastTwo > 0) res += 'and ';
    res += format(lastTwo, '');

    return res.trim() + " Rupees Only";
  };

  const { fields: internalCoPis, append: appendInternal, remove: removeInternal } = useFieldArray({
    control: form.control,
    name: "authors"
  })

  const { fields: externalCoPis, append: appendExternal, remove: removeExternal } = useFieldArray({
    control: form.control,
    name: "externalCoPis"
  })

  const [showLogic, setShowLogic] = useState(false)

  const getEmrSanctionLogicBreakdown = (data: Partial<EmrSanctionFormValues>) => {
    const steps: {label: string, value: string}[] = [];
    const sanctionAmt = data.sanctionAmount || 0;
    steps.push({ label: '1. Sanctioned Amount', value: `₹${sanctionAmt.toLocaleString('en-IN')}` });
    
    if (data.wasRoutedThroughRdc !== 'yes') {
      steps.push({ label: '2. RDC Routing Compliance', value: 'Not Routed (0%)' });
      steps.push({ label: '3. Final Estimation', value: '₹0' });
      return steps;
    }
    
    steps.push({ label: '2. Expected Incentive Rate', value: '1.0% of Sanction Value' });
    const finalAmount = Math.round(sanctionAmt * 0.01);
    steps.push({ label: '3. Estimated Project Incentive', value: `₹${finalAmount.toLocaleString('en-IN')}` });
    
    return steps;
  };

  const sanctionAmount = form.watch("sanctionAmount")
  const tentativeIncentive = useMemo(() => {
    return Math.round(sanctionAmount * 0.01)
  }, [sanctionAmount])

  const onSubmit = async (values: EmrSanctionFormValues) => {
    if (step === 'edit') {
      setStep('review')
      return
    }

    setIsSubmitting(true)
    try {
      let sanctionProofUrl = ""
      if (values.sanctionProof?.[0]) {
        setUploading(true)
        const uploadResult = await uploadFileToApi(values.sanctionProof[0], { path: `incentives/${user.uid}/emr-sanction` })
        setUploading(false)
        if (uploadResult.success && uploadResult.url) {
          sanctionProofUrl = uploadResult.url
        } else {
          throw new Error(uploadResult.error || "File upload failed")
        }
      } else {
          throw new Error("Proof of sanction is required.")
      }

      const claimData: Omit<IncentiveClaim, "id" | "claimId"> = {
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty || "N/A",
        claimType: "EMR Sanction Project",
        status: "Pending",
        submissionDate: new Date().toISOString(),
        benefitMode: "Monetary",
        emrProjectName: values.emrProjectName,
        wasRoutedThroughRdc: values.wasRoutedThroughRdc === "yes",
        sanctionFrom: values.sanctionFrom,
        sanctionAmount: values.sanctionAmount,
        sanctionDate: values.sanctionDate,
        authors: values.authors as Author[],
        externalCoPis: values.externalCoPis as CoPiDetails[],
        sanctionProofUrl: sanctionProofUrl,
        calculatedIncentive: tentativeIncentive,
      }

      const result = await submitIncentiveClaimViaApi(claimData)

      if (result.success) {
        toast({
          title: "Claim Submitted Successfully",
          description: "Your incentive claim for EMR Sanction Project has been submitted for review.",
        })
        router.push("/dashboard/incentive-claim?tab=my-claims")
      } else {
        throw new Error(result.error || "Failed to submit claim")
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit claim. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (step === 'review') {
    const values = form.getValues()
    return (
      <Card className="max-w-4xl mx-auto shadow-xl border-t-4 border-t-primary">
        <CardHeader className="bg-muted/30">
          <CardTitle className="text-2xl flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-primary" /> Review Your Application
          </CardTitle>
          <CardDescription>Please verify all details before final submission.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Project Information</p>
                <div className="space-y-1">
                  <p className="font-medium text-base leading-tight">{values.emrProjectName}</p>
                  <p className="text-xs text-muted-foreground">Sanctioning Body: {values.sanctionFrom}</p>
                </div>
              </div>
              
              <div className="flex gap-8">
                <div>
                  <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Sanction Date</p>
                  <p className="font-medium">{values.sanctionDate}</p>
                </div>
                <div>
                  <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">RDC Processed</p>
                  <Badge variant={values.wasRoutedThroughRdc === "yes" ? "default" : "secondary"} className="text-[9px] py-0 h-4">
                    {values.wasRoutedThroughRdc === "yes" ? "Routed via RDC" : "Direct Submission"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Financial Summary</p>
                <div className="space-y-4">
                  <div className="bg-muted/30 p-4 rounded-xl border border-muted-foreground/10 flex justify-between items-center text-xs">
                    <span className="text-muted-foreground italic">Sanctioned Amount:</span>
                    <span className="font-bold">₹{values.sanctionAmount.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="bg-primary p-6 rounded-[2rem] text-primary-foreground shadow-xl shadow-primary/20 relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 bg-white/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-500"></div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">Estimated Incentive</p>
                    <p className="text-[11px] opacity-70 mb-4 leading-tight font-medium">Based on 1% of the sanction amount, your tentative incentive claim will be:</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black tracking-tighter">₹{(values.wasRoutedThroughRdc === 'yes' ? tentativeIncentive : 0).toLocaleString('en-IN')}</span>
                      <span className="text-xs font-medium opacity-60">INR*</span>
                    </div>
                    <p className="text-[10px] mt-4 font-medium opacity-70 italic">*Subject to final verification by the technical committee.</p>
                    
                    <div className="mt-4 border-t border-primary/10 pt-4">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs font-bold w-full flex justify-between items-center text-primary-foreground hover:bg-primary-foreground/10"
                        onClick={() => setShowLogic(!showLogic)}
                        type="button"
                      >
                        View Calculation Logic
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showLogic ? 'rotate-180' : ''}`} />
                      </Button>
                      
                      {showLogic && (
                        <div className="mt-3 p-4 bg-background/10 rounded-xl border border-primary-foreground/10 space-y-2 text-xs font-medium animate-in slide-in-from-top-2 flex flex-col gap-1 text-primary-foreground">
                            {getEmrSanctionLogicBreakdown(values).map((step, idx) => (
                              <div key={idx} className="flex justify-between items-start py-1 border-b last:border-0 border-primary-foreground/10">
                                <span className="opacity-80 pr-2">{step.label}</span>
                                <span className={idx === (getEmrSanctionLogicBreakdown(values).length - 1) ? "font-bold text-green-200 shrink-0" : "font-semibold shrink-0"}>{step.value}</span>
                              </div>
                            ))}
                          
                          <div className="text-[9px] italic mt-2 !pt-2 text-center border-t border-primary-foreground/10 opacity-70">
                            *Logic matches official policy matrix evaluated by approvers during technical audit.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-2">Internal Co-PIs</p>
            {values.authors.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>ID/Campus</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {values.authors.map((pi, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{pi.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{(pi as any).misId || 'Internal'}</TableCell>
                        <TableCell>{pi.email}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : <p className="text-sm italic">None added</p>}
          </div>

          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-2">External Co-PIs</p>
            {values.externalCoPis.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Institute</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {values.externalCoPis.map((pi, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{pi.name}</TableCell>
                        <TableCell>{pi.organization}</TableCell>
                        <TableCell>{pi.email}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : <p className="text-sm italic">None added</p>}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between bg-muted/30 border-t pt-6">
          <Button variant="outline" onClick={() => setStep('edit')} disabled={isSubmitting}>
            Go Back
          </Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {uploading ? "Uploading Proof..." : "Submitting..."}
              </>
            ) : "Confirm & Submit Claim"}
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="max-w-4xl mx-auto shadow-2xl border-t-4 border-t-primary overflow-hidden">
      <CardHeader className="bg-primary/5 pb-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-3xl font-bold tracking-tight text-primary">EMR Sanction Project Claim</CardTitle>
            <CardDescription className="text-base">Submit your application for incentive claim on externally funded projects.</CardDescription>
          </div>
          <div className="bg-primary/10 p-3 rounded-2xl">
            <FileText className="h-10 w-10 text-primary" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-8 bg-card">
        <Form {...form}>
          <form className="space-y-8">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                Project Details
              </div>
              
              <FormField
                control={form.control}
                name="emrProjectName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Name of the Project</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter the full title of the sanctioned project" {...field} className="h-12 text-lg shadow-sm focus-visible:ring-primary" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <FormField
                  control={form.control}
                  name="sanctionFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Sanctioned By (Agency)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. DST, SERB, ISRO, ICMR" {...field} className="h-12 shadow-sm" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="wasRoutedThroughRdc"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel className="text-base font-semibold">Was the application routed through RDC?</FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className="flex gap-6 mt-2"
                        >
                          <Label 
                            htmlFor="rdc-yes" 
                            className="flex items-center space-x-3 bg-muted/50 px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                          >
                            <RadioGroupItem value="yes" id="rdc-yes" />
                            <span className="font-medium cursor-pointer flex-1">Yes</span>
                          </Label>
                          <Label 
                            htmlFor="rdc-no" 
                            className="flex items-center space-x-3 bg-muted/50 px-4 py-2 rounded-xl border hover:bg-muted transition-colors cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                          >
                            <RadioGroupItem value="no" id="rdc-no" />
                            <span className="font-medium cursor-pointer flex-1">No</span>
                          </Label>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <FormField
                  control={form.control}
                  name="sanctionAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Sanction Amount (INR)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span>
                          <Input 
                            type="number" 
                            placeholder="Enter total amount" 
                            {...field} 
                            className="h-12 pl-8 text-lg font-mono shadow-sm" 
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          />
                        </div>
                      </FormControl>
                      {field.value > 0 && (
                        <div className="mt-2 p-3 bg-muted/30 border border-muted-foreground/10 rounded-xl space-y-1">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Amount in Words</p>
                          <p className="text-xs font-medium italic lowercase first-letter:uppercase">{numberToWords(Number(field.value))}</p>
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sanctionDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Date of Sanction</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} max={new Date().toISOString().split("T")[0]} className="h-12 shadow-sm" />
                      </FormControl>
                      <FormDescription>As mentioned in the sanction letter/email.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <Separator className="my-8" />

            <section className="space-y-6">
               <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                Co-Investigators
              </div>

              <div className="space-y-4">
                <div className="bg-muted/20 p-6 rounded-2xl border border-dashed border-primary/30">
                  <AuthorSearch 
                    title="Search Internal Co-PIs" 
                    addButtonLabel="Add Internal Co-PI" 
                    authors={internalCoPis} 
                    onAdd={(author) => appendInternal(author)}
                    currentUserEmail={user.email}
                    availableRoles={["Co-PI"]}
                  />
                  
                  {internalCoPis.length > 0 && (
                    <div className="mt-4 space-y-2">
                       <p className="text-xs font-bold uppercase text-muted-foreground px-1">Added Internal Co-PIs</p>
                      {internalCoPis.map((field, index) => (
                        <div key={field.id} className="flex items-center justify-between bg-background p-3 rounded-xl border shadow-sm animate-in slide-in-from-left-2 transition-all">
                          <div>
                            <p className="font-semibold text-sm">{field.name}</p>
                            <p className="text-xs text-muted-foreground">{(field as any).misId || 'Internal'} • {field.email}</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeInternal(index)} className="text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

               <div className="space-y-4 mt-8">
                  <div className="bg-muted/20 p-6 rounded-2xl border border-dashed border-primary/30">
                    <p className="text-sm font-semibold flex items-center gap-2 mb-4">
                      <Plus className="h-4 w-4 text-primary" /> Add External Co-PI
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="space-y-1">
                        <Label htmlFor="ext-name-input" className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Name</Label>
                        <Input 
                          id="ext-name-input" 
                          placeholder="Full Name" 
                          className="h-10" 
                          value={extName}
                          onChange={(e) => setExtName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ext-inst-input" className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Institute Name</Label>
                        <Input 
                          id="ext-inst-input" 
                          placeholder="Institute Name" 
                          className="h-10" 
                          value={extInst}
                          onChange={(e) => setExtInst(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ext-email-input" className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Email Address</Label>
                        <div className="flex gap-2">
                          <Input 
                            id="ext-email-input" 
                            placeholder="Email Address" 
                            className="h-10 flex-1" 
                            value={extEmail}
                            onChange={(e) => setExtEmail(e.target.value)}
                          />
                          <Button 
                            type="button" 
                            className="h-10 px-4"
                            onClick={() => {
                              if(extName && extInst && extEmail) {
                                appendExternal({ name: extName, organization: extInst, email: extEmail })
                                setExtName("")
                                setExtInst("")
                                setExtEmail("")
                              } else {
                                toast({ variant: 'destructive', title: 'Fields missing', description: 'Please fill all external Co-PI fields.' })
                              }
                            }}
                          >Add</Button>
                        </div>
                      </div>
                    </div>

                    {externalCoPis.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold uppercase text-muted-foreground px-1">Added External Co-PIs</p>
                        {externalCoPis.map((field, index) => (
                          <div key={field.id} className="flex items-center justify-between bg-background p-3 rounded-xl border shadow-sm animate-in slide-in-from-left-2 transition-all">
                            <div>
                              <p className="font-semibold text-sm">{field.name}</p>
                              <p className="text-xs text-muted-foreground">{field.organization} • {field.email}</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeExternal(index)} className="text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
              </div>
            </section>

            <Separator className="my-8" />

            <section className="space-y-5">
              <div className="flex items-center gap-2 text-primary font-bold text-lg mb-4">
                <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                Documentation
              </div>
              
              <FormField
                control={form.control}
                name="sanctionProof"
                render={({ field: { onChange, value, ...rest } }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-base font-semibold">Proof of Sanction (PDF/ZIP)</FormLabel>
                    <FormControl>
                      <div className="grid w-full items-center gap-1.5">
                        <Input
                          type="file"
                          accept=".pdf,.zip"
                          className="h-12 border-dashed border-2 cursor-pointer hover:bg-muted/30 transition-colors file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                          onChange={(e) => onChange(e.target.files)}
                          {...rest}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>Maximum file size: 10MB. Upload the sanction letter or email confirmation.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            {form.watch("sanctionAmount") !== undefined && form.watch("sanctionAmount") > 0 && (
               <Alert className="mt-8 bg-primary/5 border-primary/20 py-6 rounded-3xl transition-all animate-in zoom-in-95 border-l-4 border-l-primary shadow-sm hover:shadow-md mb-8">
                 <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Estimated Incentive Amount
                    </p>
                    <h4 className="text-4xl font-black text-foreground tracking-tight py-1">₹{(form.watch("wasRoutedThroughRdc") === 'yes' ? tentativeIncentive : 0).toLocaleString('en-IN')}</h4>
                    <p className="text-[10px] text-muted-foreground font-medium italic">Tentative individual share*</p>
                    
                    <div className="mt-4 border-t border-primary/10 pt-4">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-xs font-bold w-full flex justify-between items-center text-primary hover:bg-primary/10"
                        onClick={() => setShowLogic(!showLogic)}
                        type="button"
                      >
                        View Calculation Logic
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${showLogic ? 'rotate-180' : ''}`} />
                      </Button>
                      
                      {showLogic && (
                        <div className="mt-3 p-4 bg-background rounded-xl border shadow-inner space-y-2 text-xs font-medium animate-in slide-in-from-top-2 flex flex-col gap-1">
                            {getEmrSanctionLogicBreakdown(form.getValues()).map((step, idx) => (
                              <div key={idx} className="flex justify-between items-start py-1 border-b last:border-0 border-muted">
                                <span className="text-muted-foreground pr-2">{step.label}</span>
                                <span className={idx === (getEmrSanctionLogicBreakdown(form.getValues()).length - 1) ? "font-bold text-green-600 shrink-0" : "font-semibold shrink-0"}>{step.value}</span>
                              </div>
                            ))}
                          
                          <div className="text-[9px] text-muted-foreground italic mt-2 !pt-2 text-center border-t border-muted opacity-70">
                            *Logic matches official policy matrix evaluated by approvers during technical audit.
                          </div>
                        </div>
                      )}
                    </div>
                 </div>
               </Alert>
            )}

          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex justify-end p-8 bg-muted/20 border-t gap-4">
        <Button variant="ghost" size="lg" onClick={() => router.back()} className="rounded-xl px-8 h-12 font-semibold">Cancel</Button>
        <Button size="lg" onClick={form.handleSubmit(onSubmit)} className="rounded-xl px-10 h-12 font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
          Review Application
        </Button>
      </CardFooter>
    </Card>
  )
}
