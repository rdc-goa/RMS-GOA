
"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { db, auth } from "@/lib/config"
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore"
import {
  uploadFileToServer,
  checkHODUniqueness,
  getSystemSettings,
  updateSystemSettings,
  checkMisIdExists,
} from "@/app/server-actions"
import type { User, SystemSettings, CroAssignment, ApproverSetting, ApiIntegrations, DefaultModules } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import {
  onAuthStateChanged,
  type User as FirebaseUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "firebase/auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Banknote, Bot, ShieldCheck, Plus, X, Award, CalendarIcon, Clock, Mail, FileText, Blocks, Search, Loader2 } from "lucide-react"
import { Combobox } from "@/components/ui/combobox"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { ALL_MODULES } from '@/lib/modules';

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email(),
  campus: z.string().optional(),
  faculty: z.string().min(1, "Please select a faculty."),
  institute: z.string().min(1, "Please select an institute."),
  department: z.string().optional(),
  designation: z.string().min(2, "Designation is required."),
  misId: z.string().min(1, "MIS ID is required."),
  orcidId: z.string().optional(),
  scopusId: z.string().optional(),
  vidwanId: z.string().optional(),
  googleScholarId: z.string().optional(),
  phoneNumber: z.string().optional(),
})
type ProfileFormValues = z.infer<typeof profileSchema>

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
type PasswordFormValues = z.infer<typeof passwordSchema>

const bankDetailsSchema = z.object({
  beneficiaryName: z.string().min(2, "Beneficiary's name is required."),
  accountNumber: z.string().min(5, "A valid account number is required."),
  bankName: z.string().min(1, "Please select a bank."),
  branchName: z.string().min(2, "Branch name is required."),
  city: z.string().min(2, "City is required."),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code format."),
})
type BankDetailsFormValues = z.infer<typeof bankDetailsSchema>

const croAssignmentSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  faculty: z.string().min(1, "Please select a faculty."),
  campus: z.string().min(1, "Please select a campus."),
})
type CroAssignmentFormValues = z.infer<typeof croAssignmentSchema>

const goaFaculties = [
  "Faculty of Engineering, IT & CS",
  "Faculty of Management Studies",
  "Faculty of Pharmacy",
  "Faculty of Applied and Health Sciences",
  "Faculty of Nursing",
  "Faculty of Physiotherapy",
  "University Office",
]

const campuses = ["Goa"]

const goaInstitutes = [
  "Parul College of Applied and Health Sciences",
  "Parul College of Engineering",
  "Parul College of Information Technology & Computer Science",
  "Parul College of Management",
  "Parul College of Nursing",
  "Parul College of Pharmacy",
  "Parul College of Physiotherapy",
  "University Office",
]

const salaryBanks = ["AU Bank", "HDFC Bank", "Central Bank of India"]

const incentiveClaimTypes = [
  "Research Papers",
  "Patents",
  "Conference Presentations",
  "Books",
  "Membership of Professional Bodies",
  "Seed Money for APC",
]

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(file)
  })
}

export default function SettingsPage() {
  const { toast } = useToast()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false)
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)
  const [isSubmittingBank, setIsSubmittingBank] = useState(false)
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [departments, setDepartments] = useState<string[]>([])
  const departmentOptions = departments.map((dept) => ({ label: dept, value: dept }))
  const isPrincipal = useMemo(() => user?.designation === "Principal", [user])
  const isCro = useMemo(() => user?.role === "CRO", [user])

  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [newAllowedDomain, setNewAllowedDomain] = useState("")
  const [isPrefilling, setIsPrefilling] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      email: "",
      campus: "",
      faculty: "",
      institute: "",
      department: "",
      designation: "",
      misId: "",
      orcidId: "",
      scopusId: "",
      vidwanId: "",
      googleScholarId: "",
      phoneNumber: "",
    },
  })

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  const bankForm = useForm<BankDetailsFormValues>({
    resolver: zodResolver(bankDetailsSchema),
    defaultValues: {
      beneficiaryName: "",
      accountNumber: "",
      bankName: "",
      branchName: "",
      city: "",
      ifscCode: "",
    },
  })

  const croAssignmentForm = useForm<CroAssignmentFormValues>({
    resolver: zodResolver(croAssignmentSchema),
    defaultValues: {
      email: "",
      faculty: "",
      campus: "Goa",
    },
  })

  const dummyForm = useForm() // For the incentive approvers section

  const selectedCampusForCro = croAssignmentForm.watch("campus")
  const facultyOptionsForCro = goaFaculties

  useEffect(() => {
    // When campus changes, reset faculty if it's not in the new list
    const currentFaculty = croAssignmentForm.getValues("faculty")
    if (currentFaculty && !facultyOptionsForCro.includes(currentFaculty)) {
      croAssignmentForm.setValue("faculty", "")
    }
  }, [selectedCampusForCro, facultyOptionsForCro, croAssignmentForm])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userDocRef = doc(db, "users", firebaseUser.uid)
        const userDocSnap = await getDoc(userDocRef)
        if (userDocSnap.exists()) {
          const appUser = { uid: firebaseUser.uid, ...userDocSnap.data() } as User
          setUser(appUser)
          setPreviewUrl(appUser.photoURL || null)

          if (appUser.role === "Super-admin") {
            const settings = await getSystemSettings()
            setSystemSettings(settings)
          }

          profileForm.reset({
            name: appUser.name || "",
            email: appUser.email || "",
            campus: "Goa",
            faculty: appUser.faculty || "",
            institute: appUser.institute || "",
            department: appUser.department || "",
            designation: appUser.designation || "",
            misId: appUser.misId || "",
            orcidId: appUser.orcidId || "",
            scopusId: appUser.scopusId || "",
            vidwanId: appUser.vidwanId || "",
            googleScholarId: appUser.googleScholarId || "",
            phoneNumber: appUser.phoneNumber || "",
          })
          if (appUser.bankDetails) {
            bankForm.reset(appUser.bankDetails)
          }
        }
      }
      setLoading(false)
    })

    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedCampus = profileForm.watch("campus")

  useEffect(() => {
    async function fetchDepartments() {
      const endpoint = selectedCampus === "Goa" ? "/api/get-goa-departments" : "/api/get-departments"
      try {
        const res = await fetch(endpoint)
        const result = await res.json()
        if (result.success) {
          setDepartments(result.data)
          // If current department is not in the new list, reset it
          const currentDepartment = profileForm.getValues("department")
          if (currentDepartment && !result.data.includes(currentDepartment)) {
            profileForm.setValue("department", "")
          }
        }
      } catch (error) {
        console.error(`Failed to fetch departments from ${endpoint}`, error)
      }
    }
    fetchDepartments()
  }, [selectedCampus, profileForm])

  useEffect(() => {
    const currentInstitute = profileForm.getValues("institute")
    if (currentInstitute && !goaInstitutes.includes(currentInstitute)) {
      profileForm.setValue("institute", "")
    }
  }, [profileForm])

  const handlePrefillData = async () => {
      const misId = profileForm.getValues('misId');
      if (!misId || !user?.email) {
          toast({ variant: 'destructive', title: 'MIS ID Required', description: 'Please enter your MIS ID to fetch data.' });
          return;
      };
      setIsPrefilling(true);
      try {
          const res = await fetch(`/api/get-staff-data?misId=${misId}&userEmailForFileCheck=${user.email}`);
          const result = await res.json();
          if (result.success && result.data.length > 0) {
              profileForm.reset({ ...profileForm.getValues(), ...result.data[0] });
              toast({ title: 'Profile Pre-filled', description: 'Your information has been pre-filled. Please review and save.' });
          } else {
             toast({ variant: 'destructive', title: 'Not Found', description: "Could not find your details using that MIS ID. Please enter them manually." });
          }
      } catch (error) {
          console.error("Failed to fetch prefill data", error);
          toast({ variant: 'destructive', title: 'Error', description: "Could not fetch your data. Please try again or enter manually." });
      } finally {
          setIsPrefilling(false);
      }
  };

  async function onProfileSubmit(data: ProfileFormValues) {
    if (!user) return
    setIsSubmittingProfile(true)
    try {
      if (data.designation === "HOD" && data.department && data.institute) {
        const hodCheck = await checkHODUniqueness(data.department, data.institute, user.uid)
        if (hodCheck.exists) {
          toast({
            variant: "destructive",
            title: "HOD Already Exists",
            description:
              "An HOD for this department and institute is already assigned. Please check internally or raise a query on the help page.",
            duration: 10000,
          })
          setIsSubmittingProfile(false)
          return
        }
      }
      if (data.misId && data.campus) {
        const misIdCheck = await checkMisIdExists(data.misId, user.uid, data.campus)
        if (misIdCheck.exists) {
          profileForm.setError("misId", {
            type: "manual",
            message: "This MIS ID is already registered for this campus.",
          })
          setIsSubmittingProfile(false)
          return
        }
      }

      const userDocRef = doc(db, "users", user.uid)
      const { email, ...updateData } = data
      for (const key in updateData) {
        if ((updateData as any)[key] === undefined) {
          ;(updateData as any)[key] = ""
        }
      }
      await updateDoc(userDocRef, updateData as any)
      const updatedUser = { ...user, ...updateData }
      localStorage.setItem("user", JSON.stringify(updatedUser))
      setUser(updatedUser)
      toast({ title: "Profile updated successfully!" })
    } catch (error: any) {
      console.error("Profile update error:", error)
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "Could not update your profile.",
      })
    } finally {
      setIsSubmittingProfile(false)
    }
  }

  async function onBankDetailsSubmit(data: BankDetailsFormValues) {
    if (!user) return;
    setIsSubmittingBank(true);
    try {
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, { bankDetails: data });
        // The user object in state will be updated on the next full page refresh or re-login.
        // This avoids stringify errors with server timestamps if we were to use them.
        toast({ title: 'Bank details updated successfully!' });
    } catch (error: any) {
        console.error("Bank details update error:", error);
        toast({ variant: 'destructive', title: 'Update Failed', description: 'Could not update your bank details.' });
    } finally {
        setIsSubmittingBank(false);
    }
  }

  async function onPasswordSubmit(data: PasswordFormValues) {
    setIsSubmittingPassword(true)

    const currentUser = auth.currentUser
    if (!currentUser || !currentUser.email) {
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "Could not find the current user. Please log in again.",
      })
      setIsSubmittingPassword(false)
      return
    }
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, data.currentPassword)
      await reauthenticateWithCredential(currentUser, credential)
      await updatePassword(currentUser, data.newPassword)
      toast({ title: "Password updated successfully!" })
      passwordForm.reset()
    } catch (error: any) {
      console.error("Password update error:", error)
      if (error.code === "auth/invalid-credential") {
        passwordForm.setError("currentPassword", {
          type: "manual",
          message: "The current password you entered is incorrect.",
        })
      } else if (error.code === "auth/requires-recent-login") {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "For security, please log out and sign in again before changing your password.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: "Could not update your password. Please try again.",
        })
      }
    } finally {
      setIsSubmittingPassword(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      setProfilePicFile(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  const handlePictureUpdate = async () => {
    if (!profilePicFile || !user) return
    setIsUploading(true)
    try {
      const dataUrl = await fileToDataUrl(profilePicFile)
      const path = `profile-pictures/${user.uid}`
      const result = await uploadFileToServer(dataUrl, path)
      if (!result.success || !result.url) {
        throw new Error(result.error || "Upload failed")
      }
      const photoURL = result.url
      const userDocRef = doc(db, "users", user.uid)
      await updateDoc(userDocRef, { photoURL })
      const updatedUser = { ...user, photoURL }
      setUser(updatedUser)
      localStorage.setItem("user", JSON.stringify(updatedUser))
      toast({ title: "Profile picture updated!" })
      setProfilePicFile(null)
    } catch (error) {
      console.error("Error updating profile picture: ", error)
      toast({ variant: "destructive", title: "Update Failed", description: "Could not update your profile picture." })
    } finally {
      setIsUploading(false)
    }
  }

  const handleSystemSettingsSave = async (newSettings: SystemSettings) => {
    setIsSavingSettings(true)
    const result = await updateSystemSettings(newSettings)
    if (result.success) {
      setSystemSettings(newSettings)
      toast({ title: "System settings updated." })
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error })
    }
    setIsSavingSettings(false)
  }

  const handleDefaultModuleChange = async (
    role: keyof DefaultModules,
    moduleId: string,
    checked: boolean
  ) => {
    if (!systemSettings) return;

    const currentModules = systemSettings.defaultModules?.[role] || [];
    const newModules = checked
      ? [...currentModules, moduleId]
      : currentModules.filter(id => id !== moduleId);
      
    const newDefaultModules = { ...systemSettings.defaultModules, [role]: newModules };
    await handleSystemSettingsSave({ ...systemSettings, defaultModules: newDefaultModules });
  };


  const handleApiIntegrationToggle = async (api: keyof ApiIntegrations, enabled: boolean) => {
    if (!systemSettings) return
    const newApiSettings = { ...systemSettings.apiIntegrations, [api]: enabled }
    await handleSystemSettingsSave({ ...systemSettings, apiIntegrations: newApiSettings })
  }

  const handle2faToggle = async (enabled: boolean) => {
    if (!systemSettings) return
    await handleSystemSettingsSave({ ...systemSettings, is2faEnabled: enabled })
  }

  const addAllowedDomain = async () => {
    if (!systemSettings || !newAllowedDomain.trim()) return

    const domain = newAllowedDomain.trim().startsWith("@") ? newAllowedDomain.trim() : `@${newAllowedDomain.trim()}`
    const currentDomains = systemSettings.allowedDomains || []

    if (currentDomains.includes(domain)) {
      toast({
        variant: "destructive",
        title: "Domain exists",
        description: "This domain is already in the allowed list.",
      })
      return
    }

    await handleSystemSettingsSave({ ...systemSettings, allowedDomains: [...currentDomains, domain] })
    setNewAllowedDomain("")
  }

  const removeAllowedDomain = async (domainToRemove: string) => {
    if (!systemSettings) return
    const currentDomains = systemSettings.allowedDomains || []
    await handleSystemSettingsSave({
      ...systemSettings,
      allowedDomains: currentDomains.filter((d) => d !== domainToRemove),
    })
  }

  const addCroAssignment = async (values: CroAssignmentFormValues) => {
    if (!systemSettings) return

    const newAssignment: CroAssignment = {
      email: values.email.toLowerCase(),
      faculty: values.faculty,
      campus: values.campus,
    }

    const currentAssignments = systemSettings.croAssignments || []
    if (currentAssignments.some((c) => c.email === newAssignment.email)) {
      toast({ variant: "destructive", title: "Email exists", description: "This email is already assigned." })
      return
    }

    await handleSystemSettingsSave({ ...systemSettings, croAssignments: [...currentAssignments, newAssignment] })
    croAssignmentForm.reset()
  }

  const removeCroAssignment = async (emailToRemove: string) => {
    if (!systemSettings) return
    const currentAssignments = systemSettings.croAssignments || []
    await handleSystemSettingsSave({
      ...systemSettings,
      croAssignments: currentAssignments.filter((c) => c.email !== emailToRemove),
    })
  }

  const handleApproverChange = async (stage: 1 | 2 | 3 | 4, email: string) => {
    if (!systemSettings) return
    const approvers = systemSettings.incentiveApprovers || []
    const otherApprovers = approvers.filter((a) => a.stage !== stage)
    const newApprovers: ApproverSetting[] = [...otherApprovers]

    // Find the previous approver for this stage to remove their access
    const previousApproverEmail = approvers.find((a) => a.stage === stage)?.email

    if (email) {
      newApprovers.push({ stage, email })
    }
    newApprovers.sort((a, b) => a.stage - b.stage)

    await handleSystemSettingsSave({ ...systemSettings, incentiveApprovers: newApprovers })

    // After saving, update user permissions
    const usersRef = collection(db, "users")

    // Remove permissions from old approver
    if (previousApproverEmail) {
      const oldApproverQuery = query(usersRef, where("email", "==", previousApproverEmail))
      const oldApproverSnapshot = await getDocs(oldApproverQuery)
      if (!oldApproverSnapshot.empty) {
        const userDoc = oldApproverSnapshot.docs[0]
        const userData = userDoc.data() as User
        const updatedModules = (userData.allowedModules || []).filter(
          (m) => !m.startsWith("incentive-approver-") && m !== "incentive-approvals",
        )
        await updateDoc(userDoc.ref, { allowedModules: updatedModules })
      }
    }

    // Add permissions to new approver
    if (email) {
      const newApproverQuery = query(usersRef, where("email", "==", email))
      const newApproverSnapshot = await getDocs(newApproverQuery)
      if (!newApproverSnapshot.empty) {
        const userDoc = newApproverSnapshot.docs[0]
        const userData = userDoc.data() as User
        const approverModule = `incentive-approver-${stage}`
        const updatedModules = userData.allowedModules || []
        if (!updatedModules.includes(approverModule)) updatedModules.push(approverModule)
        if (!updatedModules.includes("incentive-approvals")) updatedModules.push("incentive-approvals")
        await updateDoc(userDoc.ref, { allowedModules: updatedModules })
      }
    }
  }

  const handleIncentiveTypeToggle = async (type: string, enabled: boolean) => {
    if (!systemSettings) return
    const currentSettings = systemSettings.enabledIncentiveTypes || {}
    const newSettings = { ...currentSettings, [type]: enabled }
    await handleSystemSettingsSave({ ...systemSettings, enabledIncentiveTypes: newSettings })
  }

  const handleWorkflowChange = async (claimType: string, stage: number, isChecked: boolean) => {
    if (!systemSettings) return
    const currentWorkflows = systemSettings.incentiveApprovalWorkflows || {}
    const currentStages = currentWorkflows[claimType] || [1, 2, 3, 4] // Default to all if not set

    let newStages
    if (isChecked) {
      newStages = [...new Set([...currentStages, stage])].sort((a, b) => a - b)
    } else {
      newStages = currentStages.filter((s) => s !== stage)
    }

    const newWorkflows = { ...currentWorkflows, [claimType]: newStages }
    await handleSystemSettingsSave({ ...systemSettings, incentiveApprovalWorkflows: newWorkflows })
  }

  const handleImrMidTermReviewChange = async (months: number) => {
    if (!systemSettings) return
    await handleSystemSettingsSave({ ...systemSettings, imrMidTermReviewMonths: months })
  }

  const handleImrEvaluationDaysChange = async (days: number) => {
    if (!systemSettings) return
    await handleSystemSettingsSave({ ...systemSettings, imrEvaluationDays: days })
  }

  const handleTemplateUrlChange = async (
    templateKey: keyof NonNullable<SystemSettings["templateUrls"]>,
    url: string,
  ) => {
    if (!systemSettings) return
    const newTemplateUrls = { ...systemSettings.templateUrls, [templateKey]: url }
    await handleSystemSettingsSave({ ...systemSettings, templateUrls: newTemplateUrls })
  }

  const templateFields: { key: keyof NonNullable<SystemSettings["templateUrls"]>; label: string }[] = [
    { key: "INCENTIVE_RESEARCH_PAPER", label: "Incentive - Research Paper" },
    { key: "INCENTIVE_PATENT", label: "Incentive - Patent" },
    { key: "INCENTIVE_CONFERENCE", label: "Incentive - Conference" },
    { key: "INCENTIVE_BOOK_PUBLICATION", label: "Incentive - Book Publication" },
    { key: "INCENTIVE_BOOK_CHAPTER", label: "Incentive - Book Chapter" },
    { key: "INCENTIVE_MEMBERSHIP", label: "Incentive - Membership" },
    { key: "IMR_RECOMMENDATION", label: "IMR Recommendation Form" },
    { key: "IMR_INSTALLMENT_NOTING", label: "IMR Installment Office Noting" },
    { key: "IMR_OFFICE_NOTING", label: "IMR Initial Office Noting" },
    { key: "INCENTIVE_PAYMENT_SHEET", label: "Incentive Payment Sheet" },
    { key: "IMR_SANCTION_ORDER", label: "IMR Sanction Order" },
  ]

  const isAcademicInfoLocked = isCro || isPrincipal

  const defaultModuleRoles: (keyof DefaultModules)[] = ['faculty', 'CRO', 'Evaluator', 'Principal', 'HOD', 'IQAC'];

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Settings" description="Manage your account settings and preferences." />
        <div className="mt-8 space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Update your personal information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Skeleton className="h-10 w-24" />
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>Change your password.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Skeleton className="h-10 w-32" />
            </CardFooter>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Settings" description="Manage your account settings and preferences." />
      <div className="mt-8 space-y-8">
        {user?.role === "Super-admin" && systemSettings && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck />
                <CardTitle>System Settings</CardTitle>
              </div>
              <CardDescription>Global settings for the application. Changes affect all users.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
               <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <Blocks className="h-5 w-5" />
                    <Label className="text-base">Default Modules for New Users</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                    Configure the default sidebar modules that are enabled for newly registered users of each role.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {defaultModuleRoles.map(role => (
                        <div key={role} className="p-4 border rounded-lg">
                            <h4 className="font-semibold text-base mb-3">{role} Defaults</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                {ALL_MODULES.map(module => {
                                    const defaultForRole = systemSettings.defaultModules?.[role] || [];
                                    const isChecked = defaultForRole.includes(module.id);
                                    return (
                                        <div key={`${role}-${module.id}`} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`${role}-${module.id}`}
                                                checked={isChecked}
                                                onCheckedChange={(checked) => handleDefaultModuleChange(role, module.id, !!checked)}
                                                disabled={isSavingSettings}
                                            />
                                            <Label htmlFor={`${role}-${module.id}`} className="text-sm font-normal">{module.label}</Label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  <Label className="text-base">API Integrations</Label>
                </div>
                <p className="text-sm text-muted-foreground">Enable or disable external data fetching services.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="scopus-toggle">Scopus</Label>
                    <Switch
                      id="scopus-toggle"
                      checked={systemSettings.apiIntegrations?.scopus !== false}
                      onCheckedChange={(c) => handleApiIntegrationToggle("scopus", c)}
                      disabled={isSavingSettings}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="wos-toggle">Web of Science</Label>
                    <Switch
                      id="wos-toggle"
                      checked={systemSettings.apiIntegrations?.wos !== false}
                      onCheckedChange={(c) => handleApiIntegrationToggle("wos", c)}
                      disabled={isSavingSettings}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="sci-toggle">ScienceDirect</Label>
                    <Switch
                      id="sci-toggle"
                      checked={systemSettings.apiIntegrations?.sci !== false}
                      onCheckedChange={(c) => handleApiIntegrationToggle("sci", c)}
                      disabled={isSavingSettings}
                    />
                  </div>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Two-Factor Authentication (2FA)</Label>
                  <p className="text-sm text-muted-foreground">
                    {systemSettings.is2faEnabled ? "Enabled" : "Disabled"} - Require users to verify their identity with
                    an email OTP upon login.
                  </p>
                </div>
                <Switch
                  checked={systemSettings.is2faEnabled}
                  onCheckedChange={handle2faToggle}
                  disabled={isSavingSettings}
                />
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  <Label className="text-base">Template Management</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Provide the direct download URLs for the DOCX templates used to generate office notings and other
                  documents.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  {templateFields.map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`template-${key}`} className="text-sm">
                        {label}
                      </Label>
                      <Input
                        id={`template-${key}`}
                        placeholder="https://..."
                        defaultValue={systemSettings.templateUrls?.[key] || ""}
                        onBlur={(e) => handleTemplateUrlChange(key, e.target.value)}
                        disabled={isSavingSettings}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  <Label className="text-base">IMR Mid-term Review Window</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Set the number of months after a grant is awarded that a project becomes eligible for a mid-term
                  review.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-24"
                    defaultValue={systemSettings.imrMidTermReviewMonths || 6}
                    onBlur={(e) => handleImrMidTermReviewChange(Number.parseInt(e.target.value, 10) || 6)}
                    disabled={isSavingSettings}
                    min="1"
                  />
                  <span className="text-sm text-muted-foreground">months</span>
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  <Label className="text-base">IMR Evaluation Window</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Set the number of days evaluators have to submit their feedback after the scheduled meeting date. Set
                  to 0 to only allow same-day evaluations.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-24"
                    defaultValue={systemSettings.imrEvaluationDays || 0}
                    onBlur={(e) => handleImrEvaluationDaysChange(Number.parseInt(e.target.value, 10) || 0)}
                    disabled={isSavingSettings}
                    min="0"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  <Label className="text-base">Incentive Claim Management</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enable or disable specific types of incentive claims for all users.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {incentiveClaimTypes.map((type) => (
                    <div key={type} className="flex items-center space-x-2">
                      <Switch
                        id={`incentive-${type.replace(/\s+/g, "-")}`}
                        checked={systemSettings.enabledIncentiveTypes?.[type] !== false}
                        onCheckedChange={(checked) => handleIncentiveTypeToggle(type, checked)}
                        disabled={isSavingSettings}
                      />
                      <Label htmlFor={`incentive-${type.replace(/\s+/g, "-")}`}>{type}</Label>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  <Label className="text-base">Incentive Approval Workflow</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Select which approval stages are required for each claim type. The first selected stage will be the
                  starting point.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim Type</TableHead>
                      <TableHead className="text-center">Stage 1</TableHead>
                      <TableHead className="text-center">Stage 2</TableHead>
                      <TableHead className="text-center">Stage 3</TableHead>
                      <TableHead className="text-center">Stage 4</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incentiveClaimTypes.map((type) => {
                      const workflow = systemSettings.incentiveApprovalWorkflows?.[type] || [1, 2, 3, 4]
                      return (
                        <TableRow key={type}>
                          <TableCell className="font-medium">{type}</TableCell>
                          {[1, 2, 3, 4].map((stage) => (
                            <TableCell key={stage} className="text-center">
                              <Checkbox
                                checked={workflow.includes(stage)}
                                onCheckedChange={(checked) => handleWorkflowChange(type, stage, !!checked)}
                                disabled={isSavingSettings}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  <Label className="text-base">Do Not Disturb (DND) Email</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  The email address entered here will be excluded from all automated system email notifications.
                </p>
                <Input
                  placeholder="dnd.user@paruluniversity.ac.in"
                  defaultValue={systemSettings.dndEmail || ""}
                  onBlur={(e) => handleSystemSettingsSave({ ...systemSettings, dndEmail: e.target.value })}
                  disabled={isSavingSettings}
                />
              </div>
              <Separator />
              <div className="space-y-4">
                <Label className="text-base">Allowed Email Domains</Label>
                <p className="text-sm text-muted-foreground">
                  Users with these email domains can register and access the portal.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="@newcampus.paruluniversity.ac.in"
                    value={newAllowedDomain}
                    onChange={(e) => setNewAllowedDomain(e.target.value)}
                  />
                  <Button onClick={addAllowedDomain} disabled={isSavingSettings || !newAllowedDomain.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(systemSettings.allowedDomains || []).map((domain) => (
                    <Badge key={domain} variant="secondary" className="flex items-center gap-1">
                      {domain}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => removeAllowedDomain(domain)}
                        disabled={isSavingSettings}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  <Label className="text-base">Utilization Report Email Recipient</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  The email address that will receive a notification when a PI submits a utilization report and requests
                  the next grant phase.
                </p>
                <Input
                  placeholder="finance.rdc@paruluniversity.ac.in"
                  defaultValue={systemSettings.utilizationNotificationEmail || ""}
                  onBlur={(e) =>
                    handleSystemSettingsSave({ ...systemSettings, utilizationNotificationEmail: e.target.value })
                  }
                  disabled={isSavingSettings}
                />
              </div>
              <Separator />
              <div className="space-y-4">
                <Label className="text-base">IQAC Email Address</Label>
                <p className="text-sm text-muted-foreground">
                  The user who signs up with this email will be automatically assigned the IQAC role.
                </p>
                <Input
                  placeholder="iqac@paruluniversity.ac.in"
                  defaultValue={systemSettings.iqacEmail || ""}
                  onBlur={(e) => handleSystemSettingsSave({ ...systemSettings, iqacEmail: e.target.value })}
                  disabled={isSavingSettings}
                />
              </div>
              <Separator />
              <div className="space-y-4">
                <Form {...dummyForm}>
                  <Label className="text-base">Incentive Approval Workflow</Label>
                  <p className="text-sm text-muted-foreground">
                    Define the email addresses for the four stages of incentive claim approval.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[1, 2, 3, 4].map((stage) => {
                      const approver = systemSettings.incentiveApprovers?.find((a) => a.stage === stage)
                      return (
                        <div key={stage} className="p-4 border rounded-lg space-y-3">
                          <FormItem>
                            <FormLabel>Stage {stage} Approver Email</FormLabel>
                            <Input
                              type="email"
                              placeholder={`approver.stage${stage}@paruluniversity.ac.in`}
                              defaultValue={approver?.email || ""}
                              onBlur={(e) => handleApproverChange(stage as 1 | 2 | 3 | 4, e.target.value)}
                              disabled={isSavingSettings}
                            />
                          </FormItem>
                        </div>
                      )
                    })}
                  </div>
                </Form>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Profile Picture</CardTitle>
            <CardDescription>Update your profile picture.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={previewUrl || user?.photoURL || undefined} alt={user?.name || ""} />
              <AvatarFallback>{user?.name?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Input
                id="picture"
                type="file"
                onChange={handleFileChange}
                accept="image/png, image/jpeg"
                className="max-w-xs"
              />
              <p className="text-xs text-muted-foreground">PNG or JPG. 2MB max.</p>
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button onClick={handlePictureUpdate} disabled={isUploading || !profilePicFile}>
              {isUploading ? "Uploading..." : "Save Picture"}
            </Button>
          </CardFooter>
        </Card>

        <Form {...profileForm}>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Update your personal information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="flex items-end gap-2">
                    <FormField
                      control={profileForm.control}
                      name="misId"
                      render={({ field }) => (
                        <FormItem className="flex-grow">
                          <FormLabel>MIS ID</FormLabel>
                          <FormControl>
                            <Input placeholder="Your MIS ID" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <Button type="button" variant="outline" onClick={handlePrefillData} disabled={isPrefilling || !profileForm.getValues('misId')}>
                        {isPrefilling ? <Loader2 className="h-4 w-4 animate-spin"/> : <Search className="h-4 w-4"/>}
                         <span className="ml-2 hidden sm:inline">Fetch Data</span>
                     </Button>
                  </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={profileForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Your name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="Your email" {...field} disabled />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  name="campus"
                  control={profileForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campus</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={user?.email?.endsWith("@goa.paruluniversity.ac.in")}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your campus" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {campuses.map((campus) => (
                            <SelectItem key={campus} value={campus}>
                              {campus}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="faculty"
                  control={profileForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Faculty</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isAcademicInfoLocked}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your faculty" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {goaFaculties.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="institute"
                  control={profileForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institute</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isAcademicInfoLocked}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your institute" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {goaInstitutes.map((i, index) => (
                            <SelectItem key={`${i}-${index}`} value={i}>
                              {i}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Combobox
                        options={departmentOptions}
                        value={field.value || ""}
                        onChange={field.onChange}
                        placeholder="Select your department"
                        searchPlaceholder="Search departments..."
                        emptyPlaceholder="No department found. If you feel this is a error, please drop a mail to helpdesk.rdc@paruluniversity.ac.in"
                        disabled={isAcademicInfoLocked}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="designation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Designation</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Professor" {...field} disabled={isPrincipal} />
                      </FormControl>
                      {isPrincipal && <FormDescription>The 'Principal' designation cannot be changed.</FormDescription>}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="e.g. 9876543210" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Separator />
                <h3 className="text-md font-semibold pt-2">Academic & Researcher IDs</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={profileForm.control}
                    name="orcidId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ORCID iD</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., 0000-0001-2345-6789" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="scopusId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scopus ID (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Your Scopus Author ID" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={profileForm.control}
                  name="vidwanId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vidwan ID (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Your Vidwan-ID" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="googleScholarId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google Scholar ID (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Your Google Scholar Profile ID" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isSubmittingProfile}>
                  {isSubmittingProfile ? "Saving..." : "Save Changes"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </Form>

        <Form {...bankForm}>
          <form onSubmit={bankForm.handleSubmit(onBankDetailsSubmit)}>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Banknote />
                  <CardTitle>Salary Bank Account Details</CardTitle>
                </div>
                <CardDescription>
                  This information is required for grant disburssal. These details would be only visible to admin if
                  your project is approved.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  name="beneficiaryName"
                  control={bankForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Beneficiary Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Name as per bank records" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="accountNumber"
                  control={bankForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number</FormLabel>
                      <FormControl>
                        <Input placeholder="Your bank account number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="bankName"
                  control={bankForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Name</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your bank" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {salaryBanks.map((b) => (
                            <SelectItem key={b} value={b}>
                              {b}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    name="branchName"
                    control={bankForm.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Branch Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Akota" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="city"
                    control={bankForm.control}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Vadodara" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  name="ifscCode"
                  control={bankForm.control}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IFSC Code</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., HDFC0000001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isSubmittingBank}>
                  {isSubmittingBank ? "Saving..." : "Save Bank Details"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </Form>

        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
            <Card>
              <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>Change your password. Please enter your current password to confirm.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="currentPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Separator />
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter className="border-t px-6 py-4">
                <Button type="submit" disabled={isSubmittingPassword}>
                  {isSubmittingPassword ? "Updating..." : "Update Password"}
                </Button>
              </CardFooter>
            </Card>
          </form>
        </Form>
      </div>
    </div>
  )
}
