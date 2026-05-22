"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { db } from "@/lib/config"
import type { User, IncentiveClaim } from "@/types"
import { uploadFileToApi } from "@/lib/upload-client"
import { Loader2, AlertCircle, Info, Edit, Trash2, CheckCircle2, FileText, X, Globe, MapPin, Calendar, Award, Search, ChevronDown } from "lucide-react"
import { submitIncentiveClaimViaApi } from "@/lib/incentive-claim-client"
import { getIncentiveClaimByIdAction } from "@/app/actions"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const awardSchema = z.object({
  awardTitle: z.string().min(3, "Award title is required."),
  awardingBody: z.string().min(2, "Awarding body is required."),
  awardStature: z.enum(["National", "International"], { required_error: "Stature of awarding body is required." }),
  awardBodyType: z.enum(["Government", "NGO (Non-Governmental Organization)", "Any Other"], { required_error: "Type of awarding body is required." }),
  awardCategory: z.enum(["International Award", "National Award", "Best Research Paper Award"], { required_error: "Award category is required." }),
  isPaidAward: z.boolean({ required_error: "Please specify if this was a paid award." }),
  membershipNumber: z.string().optional(),
  amountPaid: z.coerce.number().min(0, "Amount must be 0 or greater.").optional(),
  paymentDate: z.string().optional(),
  awardDate: z.string().min(1, "Date of award is required."),
  awardProof: z.array(z.string()).min(1, "At least one proof document is required.").max(10, "Maximum 10 files allowed."),
  awardLocale: z.string().optional(),
  awardSelfDeclaration: z.boolean().refine((val) => val === true, {
    message: "You must confirm the self-declaration.",
  }),
})
  .refine(
    (data) => {
      const today = new Date().toISOString().split("T")[0];
      return !data.awardDate || data.awardDate <= today;
    },
    { message: "Award date cannot be in the future.", path: ["awardDate"] }
  )
  .refine(
    (data) => {
      const today = new Date().toISOString().split("T")[0];
      return !data.paymentDate || data.paymentDate <= today;
    },
    { message: "Payment date cannot be in the future.", path: ["paymentDate"] }
  );

type AwardFormValues = z.infer<typeof awardSchema>

function ReviewDetails({
  data,
  onEdit,
  isSubmitting,
  showLogic,
  setShowLogic,
  getAwardLogicBreakdown
}: {
  data: AwardFormValues
  onEdit: () => void
  isSubmitting: boolean
  showLogic: boolean
  setShowLogic: (s: boolean) => void
  getAwardLogicBreakdown: (data: AwardFormValues) => { label: string, value: string }[]
}) {
  return (
    <Card className="max-w-4xl mx-auto shadow-xl border-t-4 border-t-primary">
      <CardHeader className="bg-muted/30">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-2xl flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-primary" /> Review Your Application
            </CardTitle>
            <CardDescription>Please verify all details before final submission.</CardDescription>
          </div>
          <Button variant="outline" onClick={onEdit} disabled={isSubmitting}>
            Edit Form
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Award Status & Info</p>
              <div className="space-y-1">
                <p className="font-medium text-base">
                  {data.awardTitle}
                </p>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                  <span>
                    {data.awardStature} - {data.awardBodyType}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Awarding Body</p>
              <p className="font-medium">{data.awardingBody}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Location: {data.awardLocale}</p>
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Date Received</p>
              <p className="font-medium leading-none flex items-center gap-2"><Calendar className="h-3.5 w-3.5" /> {data.awardDate}</p>
            </div>
            {data.membershipNumber && (
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Membership ID</p>
                <p className="font-medium">{data.membershipNumber}</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Financial Summary</p>
              <div className="space-y-4">
                <div className="bg-primary p-6 rounded-[2rem] text-primary-foreground shadow-xl shadow-primary/20 relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 bg-white/10 w-24 h-24 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-500"></div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">Estimated Incentive</p>
                  <p className="text-[11px] opacity-70 mb-4 leading-tight font-medium">Based on the provided details, your tentative incentive claim will be:</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black tracking-tighter">
                      ₹{(() => {
                        const base = data.awardCategory === 'International Award' ? 15000 :
                          data.awardCategory === 'National Award' ? 5000 :
                            data.awardCategory === 'Best Research Paper Award' ? 2000 : 0;
                        return (data.isPaidAward ? 0 : base).toLocaleString("en-IN");
                      })()}
                    </span>
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
                        {getAwardLogicBreakdown(data).map((step, idx) => (
                          <div key={idx} className="flex justify-between items-start py-1 border-b last:border-0 border-primary-foreground/10">
                            <span className="opacity-80 pr-2">{step.label}</span>
                            <span className={idx === (getAwardLogicBreakdown(data).length - 1) ? "font-bold text-green-200 shrink-0" : "font-semibold shrink-0"}>{step.value}</span>
                          </div>
                        ))}

                        <div className="text-[9px] italic mt-2 !pt-2 text-center border-t border-primary-foreground/10 opacity-70">
                          *Paid awards are not honored. Honorarium is fixed based on University policy.
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {data.paymentDate && (
                  <div className="bg-muted/30 p-3 rounded-xl border border-muted-foreground/10 flex justify-between items-center text-[10px] text-muted-foreground italic">
                    <span>Target Disbursement:</span>
                    <span className="font-bold">{data.paymentDate}</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider mb-1">Attached Documentation</p>
              <div className="grid grid-cols-1 gap-2 mt-1">
                {data.awardProof.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-xl border bg-background/50 shadow-sm transition-all hover:bg-background">
                    <div className="bg-primary/10 p-2 rounded-lg">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium text-xs truncate">Document {idx + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function AwardForm({ user }: { user: User }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [step, setStep] = useState<"edit" | "review">("edit")
  const [uploading, setUploading] = useState(false)
  const [bankDetailsMissing, setBankDetailsMissing] = useState(false)
  const [orcidOrMisIdMissing, setOrcidOrMisIdMissing] = useState(false)
  const [isLoadingDraft, setIsLoadingDraft] = useState(true)
  const [showLogic, setShowLogic] = useState(false)

  const getAwardLogicBreakdown = (data: Partial<AwardFormValues>) => {
    const steps: { label: string, value: string }[] = [];

    let baseAmount = 0;
    if (data.awardCategory === 'International Award') baseAmount = 15000;
    else if (data.awardCategory === 'National Award') baseAmount = 5000;
    else if (data.awardCategory === 'Best Research Paper Award') baseAmount = 2000;

    steps.push({ label: '1. Award Category', value: data.awardCategory || 'Pending' });
    steps.push({ label: '2. Policy Honorarium', value: `₹${baseAmount.toLocaleString('en-IN')}` });

    if (data.isPaidAward) {
      steps.push({ label: '3. Paid Award Check', value: 'Disqualified (Paid)' });
      steps.push({ label: '4. Final Incentive', value: '₹0' });
    } else {
      steps.push({ label: '3. Paid Award Check', value: 'Verified (Not Paid)' });
      steps.push({ label: '4. Final Incentive', value: `₹${baseAmount.toLocaleString('en-IN')}` });
    }
    return steps;
  };

  const form = useForm<AwardFormValues>({
    resolver: zodResolver(awardSchema),
    defaultValues: {
      awardTitle: "",
      awardingBody: "",
      awardStature: undefined,
      awardBodyType: undefined,
      awardCategory: undefined,
      isPaidAward: false,
      awardLocale: "",
      membershipNumber: "",
      amountPaid: 0,
      paymentDate: "",
      awardDate: "",
      awardProof: [],
      awardSelfDeclaration: false,
    },
  })

  useEffect(() => {
    if (user) {
      setBankDetailsMissing(!user.bankDetails)
      setOrcidOrMisIdMissing(!user.orcidId || !user.misId)
    }
    setIsLoadingDraft(false)
  }, [user])

  useEffect(() => {
    const claimId = searchParams.get('claimId')
    if (claimId && user) {
      const fetchDraft = async () => {
        setIsLoadingDraft(true)
        try {
          const result = await getIncentiveClaimByIdAction(claimId)
          if (result.success && result.data) {
            const draftData = result.data as any
            form.reset({
              ...draftData,
              awardProof: [],
              awardSelfDeclaration: draftData.awardSelfDeclaration || false,
            })
          } else {
            toast({ variant: "destructive", title: result.error || "Draft Not Found" })
          }
        } catch (error) {
          console.error("Error fetching draft:", error)
          toast({ variant: "destructive", title: "Error Loading Draft" })
        } finally {
          setIsLoadingDraft(false)
        }
      }
      fetchDraft()
    }
  }, [searchParams, user, form, toast])

  const numberToWords = (num: number): string => {
    if (num === 0) return "";
    if (isNaN(num)) return "";
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const format = (n: number, suffix: string) => {
      if (n === 0) return '';
      let str = '';
      if (n > 19) { str += b[Math.floor(n / 10)] + ' ' + a[n % 10]; } else { str += a[n]; }
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const currentFiles = form.getValues("awardProof") || []
    if (currentFiles.length + files.length > 10) {
      toast({ variant: "destructive", title: "Too many files", description: "Maximum 10 files allowed." })
      return
    }
    setUploading(true)
    try {
      const uploadedUrls: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (file.size > MAX_FILE_SIZE) {
          toast({ variant: "destructive", title: "File too large", description: `${file.name} exceeds 10MB limit.` })
          continue
        }
        const result = await uploadFileToApi(file, { path: `incentives/${user.uid}/award` })
        if (result.success && result.url) { uploadedUrls.push(result.url) }
      }
      if (uploadedUrls.length > 0) {
        form.setValue("awardProof", [...currentFiles, ...uploadedUrls])
        toast({ title: "Success", description: `${uploadedUrls.length} file(s) uploaded.` })
      }
    } catch (error) {
      console.error("Upload error:", error)
      toast({ variant: "destructive", title: "Upload failed", description: "Failed to upload files." })
    } finally { setUploading(false) }
  }

  const removeFile = (index: number) => {
    const currentFiles = form.getValues("awardProof") || []
    form.setValue("awardProof", currentFiles.filter((_, i) => i !== index))
  }

  const saveDraft = async () => {
    setIsSubmitting(true)
    try {
      const values = form.getValues()
      const claimId = searchParams.get('claimId')
      const draftData: Omit<IncentiveClaim, "id" | "claimId"> = {
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty || "N/A",
        claimType: "Award",
        status: "Draft",
        submissionDate: new Date().toISOString(),
        benefitMode: "Incentive",
        awardTitle: values.awardTitle,
        awardingBody: values.awardingBody,
        awardStature: values.awardStature,
        awardBodyType: values.awardBodyType,
        awardLocale: values.awardLocale,
        awardCategory: values.awardCategory,
        isPaidAward: values.isPaidAward,
        membershipNumber: values.membershipNumber,
        amountPaid: values.amountPaid,
        paymentDate: values.paymentDate,
        awardDate: values.awardDate,
        awardProofUrls: values.awardProof,
        awardSelfDeclaration: values.awardSelfDeclaration,
      }
      const result = await submitIncentiveClaimViaApi(draftData, claimId || undefined)
      if (result.success) {
        toast({ title: "Draft Saved!", description: "You can continue editing from the 'Incentive Claim' page." })
        router.push("/dashboard/incentive-claim")
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to save draft." })
    } finally { setIsSubmitting(false) }
  }

  const onSubmit = async (values: AwardFormValues) => {
    if (step === "edit") {
      const isValid = await form.trigger()
      if (isValid) setStep("review")
      return
    }

    if (bankDetailsMissing || orcidOrMisIdMissing) {
      toast({ variant: "destructive", title: "Profile Incomplete", description: "Please complete your profile before submitting." })
      return
    }

    setIsSubmitting(true)
    try {
      const claimId = searchParams.get('claimId')
      const claimData: Omit<IncentiveClaim, "id" | "claimId"> = {
        uid: user.uid,
        userName: user.name,
        userEmail: user.email,
        faculty: user.faculty || "N/A",
        claimType: "Award",
        status: "Pending",
        submissionDate: new Date().toISOString(),
        benefitMode: "Incentive",
        awardTitle: values.awardTitle,
        awardingBody: values.awardingBody,
        awardStature: values.awardStature,
        awardBodyType: values.awardBodyType,
        awardLocale: values.awardLocale,
        awardCategory: values.awardCategory,
        isPaidAward: values.isPaidAward,
        membershipNumber: values.membershipNumber,
        amountPaid: values.amountPaid,
        paymentDate: values.paymentDate,
        awardDate: values.awardDate,
        awardProofUrls: values.awardProof,
        awardSelfDeclaration: values.awardSelfDeclaration,
      }
      const result = await submitIncentiveClaimViaApi(claimData, claimId || undefined)
      if (result.success) {
        toast({ title: "Success", description: "Your incentive claim has been submitted." })
        router.push("/dashboard/incentive-claim?tab=my-claims")
      } else { throw new Error(result.error || "Failed to submit claim") }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to submit claim." })
    } finally { setIsSubmitting(false) }
  }

  if (isLoadingDraft) return <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>

  if (step === "review") {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <ReviewDetails
          data={form.getValues()}
          onEdit={() => setStep("edit")}
          isSubmitting={isSubmitting}
          showLogic={showLogic}
          setShowLogic={setShowLogic}
          getAwardLogicBreakdown={getAwardLogicBreakdown}
        />
        <div className="flex justify-end max-w-4xl mx-auto gap-4">
          <Button variant="ghost" onClick={() => setStep("edit")} disabled={isSubmitting}>Modify Details</Button>
          <Button size="lg" onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting} className="px-10 font-bold shadow-lg shadow-primary/25">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Confirm Submission
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto pb-20">
      <Card className="shadow-2xl border-t-4 border-t-primary overflow-hidden">
        <CardHeader className="bg-primary/5 pb-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-3xl font-bold tracking-tight text-primary uppercase">Award Assistance</CardTitle>
            </div>
            <div className="bg-primary/10 p-3 rounded-2xl shadow-inner">
              <Calendar className="h-10 w-10 text-primary" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-8 bg-card">
          <Form {...form}>
            <form className="space-y-10">
              {(bankDetailsMissing || orcidOrMisIdMissing) && (
                <Alert variant="destructive" className="rounded-2xl border-2">
                  <AlertCircle className="h-5 w-5" />
                  <AlertTitle className="font-bold">Profile Update Required</AlertTitle>
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <span>
                        Your Profile details (Bank, ORCID, MIS) must be complete to apply.
                        <Button asChild variant="link" className="text-destructive font-black underline p-0 h-auto ml-2">
                          <Link href="/dashboard/settings">Settings</Link>
                        </Button>
                      </span>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Alert className="bg-primary/5 border-primary/20 rounded-2xl ring-1 ring-primary/10">
                <Info className="h-5 w-5 text-primary" />
                <AlertTitle className="text-primary font-bold">Assistance Highlights</AlertTitle>
                <AlertDescription>
                  <div className="text-[11px] leading-relaxed space-y-1 mt-1">
                    <p>• <strong>Verification</strong>: Claims must reflect the entire official title and body of the award.</p>
                    <p>• <strong>Eligibility</strong>: University-approved awards only. Misreporting may lead to disqualification.</p>
                    <p>• <strong>Documentation</strong>: Mandatory PDF proof required. Any omission will lead to rejection.</p>
                  </div>
                </AlertDescription>
              </Alert>

              <section className="space-y-6">
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-primary font-bold text-lg">
                    <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                    Award Information
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="awardTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Title of the Award</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter the full name of the award" {...field} className="h-12 text-lg shadow-sm" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <FormField
                    control={form.control}
                    name="awardingBody"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Awarding Body</FormLabel>
                        <FormControl>
                          <Input placeholder="Organization that gave the award" {...field} className="h-12 shadow-sm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="awardDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Date Received</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} max={new Date().toISOString().split("T")[0]} className="h-12 shadow-sm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <FormField
                    control={form.control}
                    name="awardStature"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-base font-semibold">Award Stature</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-6 mt-2">
                            <Label htmlFor="stature-nat" className="flex items-center space-x-3 bg-muted/40 px-5 py-2.5 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                              <RadioGroupItem value="National" id="stature-nat" />
                              <span className="font-bold text-sm">National</span>
                            </Label>
                            <Label htmlFor="stature-int" className="flex items-center space-x-3 bg-muted/40 px-5 py-2.5 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                              <RadioGroupItem value="International" id="stature-int" />
                              <span className="font-bold text-sm">International</span>
                            </Label>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="awardBodyType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Type of Awarding Body</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12 shadow-sm">
                              <SelectValue placeholder="Select body type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Government">Government</SelectItem>
                            <SelectItem value="NGO (Non-Governmental Organization)">NGO</SelectItem>
                            <SelectItem value="Any Other">Any Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <FormField
                    control={form.control}
                    name="awardCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Award Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12 shadow-sm">
                              <SelectValue placeholder="Select award category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="International Award">International Award (Reputed Body/Fellowship)</SelectItem>
                            <SelectItem value="National Award">National Award (Govt/Well Recognized Body)</SelectItem>
                            <SelectItem value="Best Research Paper Award">Best Research Paper Award (In Conferences)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isPaidAward"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-base font-semibold">Was this a Paid Award?</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={(val) => field.onChange(val === "true")}
                            value={field.value?.toString()}
                            className="flex gap-6 mt-2"
                          >
                            <Label htmlFor="paid-no" className="flex items-center space-x-3 bg-muted/40 px-5 py-2.5 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                              <RadioGroupItem value="false" id="paid-no" />
                              <span className="font-bold text-sm">No</span>
                            </Label>
                            <Label htmlFor="paid-yes" className="flex items-center space-x-3 bg-muted/40 px-5 py-2.5 rounded-xl border border-muted-foreground/10 hover:bg-muted transition-all cursor-pointer [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5">
                              <RadioGroupItem value="true" id="paid-yes" />
                              <span className="font-bold text-sm">Yes (Paid)</span>
                            </Label>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>


                <FormField
                  control={form.control}
                  name="awardLocale"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-semibold">Locale of the Awarding Body</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter location/locale" {...field} className="h-12 shadow-sm" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              <Separator className="bg-muted-foreground/5" />

              <section className="space-y-6">
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-primary font-bold text-lg">
                    <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                    Metadata & Financials
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <FormField
                    control={form.control}
                    name="membershipNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Membership Number</FormLabel>
                        <FormControl>
                          <Input placeholder="If available" {...field} className="h-12 shadow-sm" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="amountPaid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Cash Prize Received (INR)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">₹</span>
                            <Input type="number" {...field} value={field.value ?? ""} className="h-12 pl-8 text-lg shadow-sm font-bold" />
                          </div>
                        </FormControl>
                        {field.value !== undefined && field.value > 0 && (
                          <p className="text-[10px] font-medium text-primary mt-1 italic tracking-wide lowercase">{numberToWords(Number(field.value))}</p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              <Separator className="bg-muted-foreground/5" />

              {(form.watch("awardCategory") || form.watch("isPaidAward")) && (
                <Alert className="mt-8 bg-primary/5 border-primary/20 py-6 rounded-3xl transition-all animate-in zoom-in-95 border-l-4 border-l-primary shadow-sm hover:shadow-md mb-8">
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> Estimated Incentive Amount
                    </p>
                    <h4 className="text-4xl font-black text-foreground tracking-tight py-1">
                      ₹{(() => {
                        const vals = form.getValues();
                        const base = vals.awardCategory === 'International Award' ? 15000 :
                          vals.awardCategory === 'National Award' ? 5000 :
                            vals.awardCategory === 'Best Research Paper Award' ? 2000 : 0;
                        return (vals.isPaidAward ? 0 : base).toLocaleString("en-IN");
                      })()}
                    </h4>
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
                          {getAwardLogicBreakdown(form.getValues()).map((step, idx) => (
                            <div key={idx} className="flex justify-between items-start py-1 border-b last:border-0 border-muted">
                              <span className="text-muted-foreground pr-2">{step.label}</span>
                              <span className={idx === (getAwardLogicBreakdown(form.getValues()).length - 1) ? "font-bold text-green-600 shrink-0" : "font-semibold shrink-0"}>{step.value}</span>
                            </div>
                          ))}

                          <div className="text-[9px] text-muted-foreground italic mt-2 !pt-2 text-center border-t border-muted opacity-70">
                            *Awards with a cash component generally receive a direct 100% equivalent claim match pending verification.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Alert>
              )}

              <section className="space-y-8">
                <div className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center gap-2 text-primary font-bold text-lg">
                    <div className="h-8 w-1.5 bg-primary rounded-full"></div>
                    Official Verification
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="awardProof"
                  render={() => (
                    <FormItem className="space-y-4">
                      <FormLabel className="text-base font-semibold flex items-center gap-2">Attach Official Proof (PDF) <Badge variant="outline" className="text-[9px] h-4">Mandatory</Badge></FormLabel>
                      <FormControl>
                        <div className="grid w-full items-center gap-1.5 pointer-events-auto">
                          <Input
                            type="file"
                            accept=".pdf"
                            multiple
                            className="h-20 border-dashed border-2 cursor-pointer bg-muted/10 hover:bg-muted/20 file:rounded-xl file:text-xs file:font-bold file:bg-primary/10 file:text-primary file:border-none file:h-12 file:px-6 file:mr-6 transition-all"
                            onChange={handleFileUpload}
                            disabled={isSubmitting || uploading}
                          />
                        </div>
                      </FormControl>
                      <FormDescription className="text-[10px] italic">Upload up to 10 verified PDFs. Max 10MB each.</FormDescription>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                        {form.watch("awardProof").map((url, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3.5 bg-background rounded-2xl border border-primary/5 shadow-sm transition-all hover:border-primary/30 group">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="bg-primary/5 p-2 rounded-xl group-hover:bg-primary/10 transition-colors">
                                <FileText className="h-4 w-4 text-primary shrink-0" />
                              </div>
                              <span className="text-xs font-semibold truncate lowercase italic">verified_proof_{idx + 1}.pdf</span>
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(idx)} className="text-destructive/40 hover:text-destructive hover:bg-destructive/10 h-10 w-10 p-0 rounded-xl">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="awardSelfDeclaration"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-5 space-y-0 rounded-3xl border border-primary/10 bg-primary/5 p-8 transition-all hover:bg-primary/10 ring-1 ring-primary/5">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="h-6 w-6 rounded-lg shadow-inner data-[state=checked]:bg-primary"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-tight">
                        <FormLabel className="text-sm font-bold text-primary italic uppercase tracking-wider">Final Declaration</FormLabel>
                        <p className="text-xs font-medium text-muted-foreground/80 leading-relaxed">
                          I hereby solemnly confirm that the award details provided are accurate and I have not previously claimed any incentive for this recognition.
                        </p>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
              </section>
            </form>
          </Form>
        </CardContent>

        <div className="p-8 bg-muted/10 border-t flex flex-col md:flex-row items-center justify-between gap-6 backdrop-blur-xl bg-background/50 sticky bottom-0 z-50">
          <Button
            type="button"
            variant="ghost"
            onClick={saveDraft}
            disabled={isSubmitting}
            className="rounded-2xl h-14 px-10 font-black uppercase tracking-widest hover:bg-primary/5 hover:text-primary transition-all group"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Edit className="mr-2 h-4 w-4 group-hover:-rotate-12 transition-transform" />}
            Save Progress
          </Button>
          <div className="flex w-full md:w-auto gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="flex-1 md:flex-none rounded-2xl h-14 px-10 font-bold border-muted-foreground/10 hover:bg-muted transition-all"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={form.handleSubmit(onSubmit)}
              disabled={isSubmitting || bankDetailsMissing}
              className="flex-1 md:flex-none rounded-2xl h-14 px-14 shadow-2xl shadow-primary/30 font-black uppercase tracking-widest bg-primary hover:bg-primary/90 transition-all active:scale-95 group"
            >
              Proceed to Review
              <Search className="ml-2 h-5 w-5 group-hover:scale-110 transition-transform" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
