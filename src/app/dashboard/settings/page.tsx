

"use client"

import type React from "react"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { db, auth } from "@/lib/config"
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore"
import {
  uploadFileToServer,
  checkHODUniqueness,
  getSystemSettings,
  updateSystemSettings,
  checkMisIdExists,
} from "@/app/actions"
import type { User, SystemSettings, CroAssignment, ApproverSetting, ApiIntegrations, FacultyMatrixItem, InstituteMatrixItem, DepartmentMatrixItem } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import {
  onAuthStateChanged,
  type User as FirebaseUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "firebase/auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Banknote, Bot, Loader2, ShieldCheck, Plus, X, Award, Upload, Image as ImageIcon, Calendar as CalendarIcon, Clock, Mail, BellOff, FileText, FileSpreadsheet, GraduationCap, School, Building, GitBranch, ChevronRight, ChevronDown, Trash2, Search, RotateCcw } from "lucide-react"
import { Combobox } from "@/components/ui/combobox"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import NextImage from 'next/image';
import { useDepartments } from "@/hooks/use-staff-data";
import { getFacultiesFromMatrix, getInstitutesForFacultyFromMatrix, getDepartmentsForInstituteFromMatrix, normalizeFacultyMatrix } from "@/lib/academic-data";
import { Checkbox } from "@/components/ui/checkbox";

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
  hIndex: z.coerce.number().optional(),
  i10Index: z.coerce.number().optional(),
  citationCount: z.coerce.number().optional(),
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
  ifscCode: z.string().toUpperCase().regex(/^(AUBL|HDFC|CBIN)0[A-Z0-9]{6}$/, "Only AU, HDFC, or Central Bank IFSC codes are permitted."),
})
type BankDetailsFormValues = z.infer<typeof bankDetailsSchema>



const faculties = [
  "Faculty of Engineering, IT & CS",
  "Faculty of Management Studies",
  "Faculty of Pharmacy",
  "Faculty of Applied and Health Sciences",
  "Faculty of Hotel Management",
  "Faculty of Nursing",
  "Faculty of Physiotherapy",
  "University Office"
]

const goaFaculties = [
  "Faculty of Engineering, IT & CS",
  "Faculty of Management Studies",
  "Faculty of Pharmacy",
  "Faculty of Applied and Health Sciences",
  "Faculty of Hotel Management",
  "Faculty of Nursing",
  "Faculty of Physiotherapy",
  "University Office"
];

const campuses = ["Goa"];

const institutes = [
  "Parul College of Applied and Health Sciences",
  "Parul College of Engineering",
  "Parul College of Information Technology & Computer Science",
  "Parul College of Management",
  "Parul College of Nursing",
  "Parul College of Pharmacy",
  "Parul College of Physiotherapy",
  "University Office"
]

const goaInstitutes = [
  "Parul College of Applied and Health Sciences",
  "Parul College of Engineering",
  "Parul College of Information Technology & Computer Science",
  "Parul College of Management",
  "Parul College of Hotel Management",
  "Parul College of Nursing",
  "Parul College of Pharmacy",
  "Parul College of Physiotherapy",
  "University Office"
];


export const defaultGoaMatrix: FacultyMatrixItem[] = [
  {
    id: "fac-goa-eng-it",
    name: "Faculty of Engineering, IT & CS",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-pce",
        name: "Parul College of Engineering",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-cse", name: "Computer Science & Engineering", authorityEmail: "" },
          { id: "dept-goa-civil", name: "Civil Engineering", authorityEmail: "" },
          { id: "dept-goa-mech", name: "Mechanical Engineering", authorityEmail: "" },
          { id: "dept-goa-elec", name: "Electrical Engineering", authorityEmail: "" },
          { id: "dept-goa-ece", name: "Electronics & Communication Engineering", authorityEmail: "" }
        ]
      },
      {
        id: "inst-goa-itcs",
        name: "Parul College of Information Technology & Computer Science",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-it", name: "Information Technology", authorityEmail: "" },
          { id: "dept-goa-mca", name: "Computer Applications", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-mgmt",
    name: "Faculty of Management Studies",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-mgmt",
        name: "Parul College of Management",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-mgmt-studies", name: "Management Studies", authorityEmail: "" },
          { id: "dept-goa-bba", name: "Business Administration", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-hotel",
    name: "Faculty of Hotel Management",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-hotel",
        name: "Parul College of Hotel Management",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-hotel-mgmt", name: "Hotel Management & Catering Technology", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-pharmacy",
    name: "Faculty of Pharmacy",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-pharmacy",
        name: "Parul College of Pharmacy",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-pharmacy", name: "Pharmacy", authorityEmail: "" },
          { id: "dept-goa-pharmaceutics", name: "Pharmaceutics", authorityEmail: "" },
          { id: "dept-goa-pharmacology", name: "Pharmacology", authorityEmail: "" },
          { id: "dept-goa-pharm-chem", name: "Pharmaceutical Chemistry", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-health",
    name: "Faculty of Applied and Health Sciences",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-health",
        name: "Parul College of Applied and Health Sciences",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-app-sci", name: "Applied Sciences", authorityEmail: "" },
          { id: "dept-goa-clt", name: "Clinical Lab Technology", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-nursing",
    name: "Faculty of Nursing",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-nursing",
        name: "Parul College of Nursing",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-nursing", name: "Nursing", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-physio",
    name: "Faculty of Physiotherapy",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-physio",
        name: "Parul College of Physiotherapy",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-physio", name: "Physiotherapy", authorityEmail: "" }
        ]
      }
    ]
  },
  {
    id: "fac-goa-office",
    name: "University Office",
    authorityEmail: "",
    institutes: [
      {
        id: "inst-goa-univ-office",
        name: "University Office",
        authorityEmail: "",
        departments: [
          { id: "dept-goa-admin", name: "Administration", authorityEmail: "" },
          { id: "dept-goa-rdc", name: "Research & Development Cell", authorityEmail: "" }
        ]
      }
    ]
  }
];

const salaryBanks = ["AU Bank", "HDFC Bank", "Central Bank of India"]

const incentiveClaimTypes = [
  'Research Papers',
  'Patents',
  'Conference Presentations',
  'Books',
  'Membership of Professional Bodies',
  'Seed Money for APC',
  'Award',
  'EMR Sanction Project',
  'Workshop/FDP/Training'
];

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
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [matrixData, setMatrixData] = useState<FacultyMatrixItem[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})
  const [matrixSearchQuery, setMatrixSearchQuery] = useState("")
  const [newAllowedDomain, setNewAllowedDomain] = useState("")

  useEffect(() => {
    if (systemSettings?.facultyMatrix && systemSettings.facultyMatrix.length > 0) {
      const normalized = normalizeFacultyMatrix(systemSettings.facultyMatrix);
      if (systemSettings.principalEmails) {
        normalized.forEach(fac => {
          (fac.institutes || []).forEach(inst => {
            if (!inst.authorityEmail && systemSettings.principalEmails?.[inst.name]) {
              inst.authorityEmail = systemSettings.principalEmails[inst.name];
            }
          });
        });
      }
      setMatrixData(normalized);
    } else if (systemSettings && (!systemSettings.facultyMatrix || systemSettings.facultyMatrix.length === 0)) {
      const defaultWithPrincipals = JSON.parse(JSON.stringify(defaultGoaMatrix));
      if (systemSettings.principalEmails) {
        defaultWithPrincipals.forEach((fac: any) => {
          (fac.institutes || []).forEach((inst: any) => {
            if (!inst.authorityEmail && systemSettings.principalEmails?.[inst.name]) {
              inst.authorityEmail = systemSettings.principalEmails[inst.name];
            }
          });
        });
      }
      setMatrixData(defaultWithPrincipals);
    }
  }, [systemSettings]);

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
      hIndex: 0,
      i10Index: 0,
      citationCount: 0,
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
    mode: "onChange",
    defaultValues: {
      beneficiaryName: "",
      accountNumber: "",
      bankName: "",
      branchName: "",
      city: "",
      ifscCode: "",
    },
  })



  const dummyForm = useForm(); // For the incentive approvers section

  const isPrincipal = useMemo(() => user?.designation === "Principal", [user])
  const isCro = useMemo(() => user?.role === "CRO", [user])
  const isAcademicInfoLocked = isCro || isPrincipal
  const selectedCampus = profileForm.watch('campus');
  const { departments: allDepartments } = useDepartments(selectedCampus);
  const departments = useMemo(() => allDepartments, [allDepartments]);
  const departmentOptions = departments.map((dept) => ({ label: dept, value: dept }))

  const selectedFaculty = profileForm.watch('faculty');
  const selectedInstitute = profileForm.watch('institute');

  const matrixFacultyOptions = useMemo(() => {
    return getFacultiesFromMatrix(systemSettings?.facultyMatrix);
  }, [systemSettings?.facultyMatrix]);

  const matrixInstituteOptions = useMemo(() => {
    if (!selectedFaculty) return [];
    return getInstitutesForFacultyFromMatrix(selectedFaculty, systemSettings?.facultyMatrix).map(i => ({
      label: i.label,
      value: i.value
    }));
  }, [systemSettings?.facultyMatrix, selectedFaculty]);

  const matrixDepartmentOptions = useMemo(() => {
    if (!selectedInstitute) return [];
    return getDepartmentsForInstituteFromMatrix(selectedInstitute, systemSettings?.facultyMatrix).map(dept => ({
      label: dept,
      value: dept
    }));
  }, [systemSettings?.facultyMatrix, selectedInstitute]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#scopus-metrics') {
      setTimeout(() => {
        const el = document.getElementById('scopus-metrics');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.setAttribute('data-highlighted', 'true');
          setTimeout(() => el.removeAttribute('data-highlighted'), 3000);
        }
      }, 500);
    }
  }, []);

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
            if (settings?.facultyMatrix && settings.facultyMatrix.length > 0) {
              const normalized = normalizeFacultyMatrix(settings.facultyMatrix);
              if (settings.principalEmails) {
                normalized.forEach(fac => {
                  (fac.institutes || []).forEach(inst => {
                    if (!inst.authorityEmail && settings.principalEmails?.[inst.name]) {
                      inst.authorityEmail = settings.principalEmails[inst.name];
                    }
                  });
                });
              }
              setMatrixData(normalized)
            } else {
              const defaultWithPrincipals = JSON.parse(JSON.stringify(defaultGoaMatrix));
              if (settings?.principalEmails) {
                defaultWithPrincipals.forEach((fac: any) => {
                  (fac.institutes || []).forEach((inst: any) => {
                    if (!inst.authorityEmail && settings.principalEmails?.[inst.name]) {
                      inst.authorityEmail = settings.principalEmails[inst.name];
                    }
                  });
                });
              }
              setMatrixData(defaultWithPrincipals)
            }
          }

          profileForm.reset({
            name: appUser.name || "",
            email: appUser.email || "",
            campus: appUser.campus || "",
            faculty: appUser.faculty || "",
            institute: appUser.institute || "",
            department: appUser.department || "",
            designation: appUser.designation || "",
            misId: appUser.misId || "",
            orcidId: appUser.orcidId || "",
            scopusId: appUser.scopusId || "",
            hIndex: appUser.hIndex || 0,
            i10Index: appUser.i10Index || 0,
            citationCount: appUser.citationCount || 0,
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



  useEffect(() => {
    const currentInstitute = profileForm.getValues('institute');
    const appropriateInstitutes = selectedCampus === 'Goa' ? goaInstitutes : [...new Set(institutes)];
    if (currentInstitute && !appropriateInstitutes.includes(currentInstitute)) {
      profileForm.setValue('institute', '');
    }
  }, [selectedCampus, profileForm]);

  const ifscCodeWatcher = bankForm.watch('ifscCode');

  useEffect(() => {
    async function fetchIfscDetails() {
      if (ifscCodeWatcher && ifscCodeWatcher.length === 11) {
        try {
          const res = await fetch(`https://ifsc.razorpay.com/${ifscCodeWatcher.toUpperCase()}`);
          if (res.ok) {
            const data = await res.json();
            if (data.BRANCH) bankForm.setValue('branchName', data.BRANCH, { shouldValidate: true });
            if (data.CITY) bankForm.setValue('city', data.CITY, { shouldValidate: true });
          }
        } catch (error) {
          console.error("Failed to fetch IFSC details: ", error);
        }
      }
    }
    fetchIfscDetails();
  }, [ifscCodeWatcher, bankForm]);

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
        const misIdCheck = await checkMisIdExists(data.misId, user.uid, data.campus);
        if (misIdCheck.exists) {
          profileForm.setError("misId", {
            type: "manual",
            message: "This MIS ID is already registered for this campus.",
          });
          setIsSubmittingProfile(false);
          return;
        }
      }

      const userDocRef = doc(db, "users", user.uid)
      const { email, ...updateData } = data
      for (const key in updateData) {
        if ((updateData as any)[key] === undefined) {
          ; (updateData as any)[key] = ""
        }
      }
      await updateDoc(userDocRef, updateData as any)
      const updatedUser = { ...user, ...updateData } as User
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
    if (!user) return
    setIsSubmittingBank(true)
    try {
      const userDocRef = doc(db, "users", user.uid)
      await updateDoc(userDocRef, { bankDetails: data })
      const updatedUser = { ...user, bankDetails: data }
      localStorage.setItem("user", JSON.stringify(updatedUser))
      setUser(updatedUser)
      toast({ title: "Bank details updated successfully!" })
    } catch (error: any) {
      console.error("Bank details update error:", error)
      toast({ variant: "destructive", title: "Update Failed", description: "Could not update your bank details." })
    } finally {
      setIsSubmittingBank(false)
    }
  }


  async function onPasswordSubmit(data: PasswordFormValues) {
    setIsSubmittingPassword(true)

    const currentUser = auth.currentUser;
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
    setIsSavingSettings(true);
    const result = await updateSystemSettings(newSettings);
    if (result.success) {
      setSystemSettings(newSettings);
      toast({ title: 'System settings updated.' });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.error });
    }
    setIsSavingSettings(false);
  };

  const handleApiIntegrationToggle = async (api: keyof ApiIntegrations, enabled: boolean) => {
    if (!systemSettings) return;
    const newApiSettings = { ...systemSettings.apiIntegrations, [api]: enabled };
    await handleSystemSettingsSave({ ...systemSettings, apiIntegrations: newApiSettings });
  };

  const handle2faToggle = async (enabled: boolean) => {
    if (!systemSettings) return;
    await handleSystemSettingsSave({ ...systemSettings, is2faEnabled: enabled });
  };

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

    await handleSystemSettingsSave({ ...systemSettings, allowedDomains: [...currentDomains, domain] });
    setNewAllowedDomain("");
  }

  const removeAllowedDomain = async (domainToRemove: string) => {
    if (!systemSettings) return
    const currentDomains = systemSettings.allowedDomains || []
    await handleSystemSettingsSave({ ...systemSettings, allowedDomains: currentDomains.filter((d) => d !== domainToRemove) });
  }

  const toggleNodeExpanded = (id: string) => {
    setExpandedNodes(prev => {
      const current = matrixSearchQuery.trim() ? (prev[id] !== false) : !!prev[id];
      return { ...prev, [id]: !current };
    });
  }

  const filteredMatrixData = useMemo(() => {
    const sortMatrix = (items: FacultyMatrixItem[]): FacultyMatrixItem[] => {
      return [...items]
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: 'base' }))
        .map(fac => ({
          ...fac,
          institutes: [...(fac.institutes || [])]
            .sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: 'base' }))
            .map(inst => ({
              ...inst,
              departments: [...(inst.departments || [])].sort((a, b) =>
                (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: 'base' })
              )
            }))
        }));
    };

    if (!matrixSearchQuery.trim()) {
      return sortMatrix(matrixData);
    }

    const queryStr = matrixSearchQuery.toLowerCase();

    const filtered = matrixData
      .map(fac => {
        const facMatch = fac.name.toLowerCase().includes(queryStr) || (fac.authorityEmail && fac.authorityEmail.toLowerCase().includes(queryStr));

        if (facMatch) {
          return fac;
        }

        const matchingInstitutes = (fac.institutes || [])
          .map(inst => {
            const instMatch = inst.name.toLowerCase().includes(queryStr) || (inst.authorityEmail && inst.authorityEmail.toLowerCase().includes(queryStr));

            if (instMatch) {
              return inst;
            }

            const filteredDepts = (inst.departments || []).filter(dept =>
              dept.name.toLowerCase().includes(queryStr) || (dept.authorityEmail && dept.authorityEmail.toLowerCase().includes(queryStr))
            );

            if (filteredDepts.length > 0) {
              return { ...inst, departments: filteredDepts };
            }
            return null;
          })
          .filter((i): i is InstituteMatrixItem => i !== null);

        if (matchingInstitutes.length > 0) {
          return { ...fac, institutes: matchingInstitutes };
        }

        return null;
      })
      .filter((f): f is FacultyMatrixItem => f !== null);

    return sortMatrix(filtered);
  }, [matrixData, matrixSearchQuery]);

  useEffect(() => {
    if (matrixSearchQuery.trim()) {
      const newExpanded: Record<string, boolean> = {};
      filteredMatrixData.forEach(fac => {
        newExpanded[fac.id] = true;
        (fac.institutes || []).forEach(inst => {
          newExpanded[inst.id] = true;
        });
      });
      setExpandedNodes(prev => ({ ...prev, ...newExpanded }));
    }
  }, [matrixSearchQuery, filteredMatrixData]);

  const handleAddFaculty = () => {
    const newFaculty: FacultyMatrixItem = {
      id: `fac-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: "New Faculty",
      authorityEmail: "",
      institutes: []
    }
    setMatrixData(prev => [...prev, newFaculty])
  }

  const handleAddInstitute = (facultyId: string) => {
    const newInst: InstituteMatrixItem = {
      id: `inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: "New Institute",
      authorityEmail: "",
      departments: []
    }
    setMatrixData(prev => prev.map(f => {
      if (f.id === facultyId) {
        return { ...f, institutes: [...(f.institutes || []), newInst] }
      }
      return f
    }))
  }

  const handleAddDepartment = (facultyId: string, instituteId: string) => {
    const newDept: DepartmentMatrixItem = {
      id: `dept-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: "New Department",
      authorityEmail: ""
    }
    setMatrixData(prev => prev.map(f => {
      if (f.id === facultyId) {
        return {
          ...f,
          institutes: (f.institutes || []).map(i => {
            if (i.id === instituteId) {
              return { ...i, departments: [...(i.departments || []), newDept] }
            }
            return i
          })
        }
      }
      return f
    }))
  }

  const handleUpdateNode = (
    level: 'faculty' | 'institute' | 'department',
    path: { facultyId: string; instituteId?: string; departmentId?: string },
    updates: { name?: string; authorityEmail?: string }
  ) => {
    setMatrixData(prev => prev.map(f => {
      if (f.id === path.facultyId) {
        if (level === 'faculty') {
          return { ...f, ...updates }
        }
        return {
          ...f,
          institutes: (f.institutes || []).map(i => {
            if (i.id === path.instituteId) {
              if (level === 'institute') {
                return { ...i, ...updates }
              }
              return {
                ...i,
                departments: (i.departments || []).map(d => {
                  if (d.id === path.departmentId) {
                    return { ...d, ...updates }
                  }
                  return d
                })
              }
            }
            return i
          })
        }
      }
      return f
    }))
  }

  const handleDeleteNode = (
    level: 'faculty' | 'institute' | 'department',
    path: { facultyId: string; instituteId?: string; departmentId?: string }
  ) => {
    if (level === 'faculty') {
      setMatrixData(prev => prev.filter(f => f.id !== path.facultyId))
    } else if (level === 'institute') {
      setMatrixData(prev => prev.map(f => {
        if (f.id === path.facultyId) {
          return { ...f, institutes: (f.institutes || []).filter(i => i.id !== path.instituteId) }
        }
        return f
      }))
    } else if (level === 'department') {
      setMatrixData(prev => prev.map(f => {
        if (f.id === path.facultyId) {
          return {
            ...f,
            institutes: (f.institutes || []).map(i => {
              if (i.id === path.instituteId) {
                return { ...i, departments: (i.departments || []).filter(d => d.id !== path.departmentId) }
              }
              return i
            })
          }
        }
        return f
      }))
    }
  }

  const handleSaveMatrix = async () => {
    if (!systemSettings) return
    setIsSavingSettings(true)
    const normalized = normalizeFacultyMatrix(matrixData)

    // Synchronize institute authority emails as principalEmails
    const newPrincipalEmails: Record<string, string> = {};
    normalized.forEach(fac => {
      (fac.institutes || []).forEach(inst => {
        if (inst.name && inst.authorityEmail && inst.authorityEmail.trim()) {
          newPrincipalEmails[inst.name.trim()] = inst.authorityEmail.trim();
        }
      });
    });

    const result = await updateSystemSettings({
      ...systemSettings,
      facultyMatrix: normalized,
      principalEmails: newPrincipalEmails
    })
    if (result.success) {
      setMatrixData(normalized)
      setSystemSettings({ ...systemSettings, facultyMatrix: normalized, principalEmails: newPrincipalEmails })

      // Grant Stage 1 Principal approval modules to all configured principals
      try {
        const usersRef = collection(db, 'users');
        for (const email of Object.values(newPrincipalEmails)) {
          if (email) {
            const userQuery = query(usersRef, where("email", "==", email));
            const userSnapshot = await getDocs(userQuery);
            if (!userSnapshot.empty) {
              const userDoc = userSnapshot.docs[0];
              const userData = userDoc.data() as User;
              let updatedModules = userData.allowedModules || [];
              if (!updatedModules.includes('incentive-approver-1')) updatedModules.push('incentive-approver-1');
              if (!updatedModules.includes('incentive-approvals')) updatedModules.push('incentive-approvals');
              await updateDoc(userDoc.ref, { allowedModules: updatedModules });
            }
          }
        }
      } catch (err) {
        console.error("Error granting principal permissions:", err);
      }

      toast({ title: 'Academic Matrix & Principal emails saved successfully.' })
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.error })
    }
    setIsSavingSettings(false)
  }

  const handleResetToGoaDefaults = () => {
    setMatrixData(defaultGoaMatrix)
    toast({ title: 'Loaded Goa default matrix hierarchy', description: 'Review changes and click "Save Matrix Configuration" to apply.' })
  }



  const handleApproverChange = async (stage: 1 | 2 | 3 | 4, email: string) => {
    if (!systemSettings) return;
    const approvers = systemSettings.incentiveApprovers || [];
    const otherApprovers = approvers.filter(a => a.stage !== stage && a.stage <= 4);
    const newApprovers: ApproverSetting[] = [...otherApprovers];

    // Find the previous approver for this stage to remove their access
    const previousApproverEmail = approvers.find(a => a.stage === stage)?.email;

    if (email) {
      newApprovers.push({ stage, email });
    }
    newApprovers.sort((a, b) => a.stage - b.stage);

    await handleSystemSettingsSave({ ...systemSettings, incentiveApprovers: newApprovers });

    // After saving, update user permissions
    const usersRef = collection(db, 'users');

    // Remove permissions from old approver
    if (previousApproverEmail) {
      const oldApproverQuery = query(usersRef, where("email", "==", previousApproverEmail));
      const oldApproverSnapshot = await getDocs(oldApproverQuery);
      if (!oldApproverSnapshot.empty) {
        const userDoc = oldApproverSnapshot.docs[0];
        const userData = userDoc.data() as User;
        const updatedModules = (userData.allowedModules || []).filter(m => !m.startsWith('incentive-approver-') && m !== 'incentive-approvals');
        await updateDoc(userDoc.ref, { allowedModules: updatedModules });
      }
    }

    // Add permissions to new approver
    if (email) {
      const newApproverQuery = query(usersRef, where("email", "==", email));
      const newApproverSnapshot = await getDocs(newApproverQuery);
      if (!newApproverSnapshot.empty) {
        const userDoc = newApproverSnapshot.docs[0];
        const userData = userDoc.data() as User;
        const approverModule = `incentive-approver-${stage}`;
        let updatedModules = userData.allowedModules || [];
        if (!updatedModules.includes(approverModule)) updatedModules.push(approverModule);
        if (!updatedModules.includes('incentive-approvals')) updatedModules.push('incentive-approvals');
        await updateDoc(userDoc.ref, { allowedModules: updatedModules });
      }
    }
  };

  const handleIncentiveTypeToggle = async (type: string, enabled: boolean) => {
    if (!systemSettings) return;
    const currentSettings = systemSettings.enabledIncentiveTypes || {};
    const newSettings = { ...currentSettings, [type]: enabled };
    await handleSystemSettingsSave({ ...systemSettings, enabledIncentiveTypes: newSettings });
  };

  const handleWorkflowChange = async (claimType: string, stage: number, isChecked: boolean) => {
    if (!systemSettings) return;
    const currentWorkflows = systemSettings.incentiveApprovalWorkflows || {};
    const currentStages = (currentWorkflows[claimType] || [1, 2, 3, 4]).filter(s => s <= 4); // 4 stages only

    let newStages;
    if (isChecked) {
      newStages = [...new Set([...currentStages, stage])].filter(s => s <= 4).sort((a, b) => a - b);
    } else {
      newStages = currentStages.filter(s => s !== stage);
    }

    const newWorkflows = { ...currentWorkflows, [claimType]: newStages };
    await handleSystemSettingsSave({ ...systemSettings, incentiveApprovalWorkflows: newWorkflows });
  };

  const handleImrMidTermReviewChange = async (months: number) => {
    if (!systemSettings) return;
    await handleSystemSettingsSave({ ...systemSettings, imrMidTermReviewMonths: months });
  };

  const handleImrEvaluationDaysChange = async (days: number) => {
    if (!systemSettings) return;
    await handleSystemSettingsSave({ ...systemSettings, imrEvaluationDays: days });
  };

  const handleTemplateUrlChange = async (templateKey: keyof NonNullable<SystemSettings['templateUrls']>, url: string) => {
    if (!systemSettings) return;
    const newTemplateUrls = { ...systemSettings.templateUrls, [templateKey]: url };
    await handleSystemSettingsSave({ ...systemSettings, templateUrls: newTemplateUrls });
  };

  const templateFields: { key: keyof NonNullable<SystemSettings['templateUrls']>, label: string }[] = [
    { key: 'INCENTIVE_RESEARCH_PAPER', label: 'Incentive - Research Paper' },
    { key: 'INCENTIVE_PATENT', label: 'Incentive - Patent' },
    { key: 'INCENTIVE_CONFERENCE', label: 'Incentive - Conference' },
    { key: 'INCENTIVE_BOOK_PUBLICATION', label: 'Incentive - Book Publication' },
    { key: 'INCENTIVE_BOOK_CHAPTER', label: 'Incentive - Book Chapter' },
    { key: 'INCENTIVE_MEMBERSHIP', label: 'Incentive - Membership' },
    { key: 'IMR_RECOMMENDATION', label: 'IMR Recommendation Form' },
    { key: 'IMR_INSTALLMENT_NOTING', label: 'IMR Installment Office Noting' },
    { key: 'IMR_OFFICE_NOTING', label: 'IMR Initial Office Noting' },
    { key: 'INCENTIVE_PAYMENT_SHEET', label: 'Incentive Payment Sheet' },
    { key: 'IMR_SANCTION_ORDER', label: 'IMR Sanction Order' },
  ];




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

      <div className="mt-8">
        <Tabs defaultValue="account" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
            <TabsTrigger value="account">Account Settings</TabsTrigger>
            {user?.role === "Super-admin" && <TabsTrigger value="system">System Administration</TabsTrigger>}
          </TabsList>

          <TabsContent value="account" className="space-y-8">
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
                    <FormField name="campus" control={profileForm.control} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campus</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={user?.email?.endsWith('@goa.paruluniversity.ac.in')}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select your campus" /></SelectTrigger></FormControl>
                          <SelectContent>{campuses.map(campus => (<SelectItem key={campus} value={campus}>{campus}</SelectItem>))}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
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
                              {(selectedCampus === 'Goa' ? goaFaculties : faculties).map((f) => (
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
                              {[...new Set(selectedCampus === 'Goa' ? goaInstitutes : institutes)].map((i, index) => (
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
                        name="misId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>MIS ID</FormLabel>
                            <FormControl>
                              <Input placeholder="Your MIS ID" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                    </div>
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
                    <div id="scopus-metrics" className="grid grid-cols-1 md:grid-cols-3 gap-4 scroll-mt-24 p-2 -mx-2 rounded-lg transition-colors duration-500 data-[highlighted=true]:bg-amber-500/20">
                      <FormField
                        control={profileForm.control}
                        name="hIndex"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>H-Index (Scopus)</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="0" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={profileForm.control}
                        name="i10Index"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>i10 Index (Google Scholar)</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="0" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={profileForm.control}
                        name="citationCount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Citation Count (Scopus)</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="0" {...field} />
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
                      This information is required for monetary disbursals. These details would be only visible to RDC Admin Office.
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
          </TabsContent>

          {user?.role === "Super-admin" && systemSettings && (
            <TabsContent value="system">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <CardTitle>System Administration</CardTitle>
                  </div>
                  <CardDescription>Global configuration for the research portal.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="general" className="flex flex-col md:flex-row gap-6">
                    <TabsList className="flex flex-col h-auto bg-muted/50 p-1 md:w-48 justify-start">
                      <TabsTrigger value="general" className="w-full justify-start gap-2 h-10">General</TabsTrigger>
                      <TabsTrigger value="incentives" className="w-full justify-start gap-2 h-10">Incentives</TabsTrigger>
                      <TabsTrigger value="projects" className="w-full justify-start gap-2 h-10">Projects (IMR)</TabsTrigger>
                      <TabsTrigger value="matrix" className="w-full justify-start gap-2 h-10">Matrix Setup</TabsTrigger>
                      <TabsTrigger value="integrations" className="w-full justify-start gap-2 h-10">API & Templates</TabsTrigger>
                    </TabsList>

                    <div className="flex-grow">
                      <TabsContent value="general" className="mt-0 space-y-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/20">
                            <div className="space-y-0.5">
                              <Label className="text-base">Two-Factor Authentication (2FA)</Label>
                              <p className="text-sm text-muted-foreground">{systemSettings.is2faEnabled ? "Enabled" : "Disabled"} - Require email OTP upon login.</p>
                            </div>
                            <Switch checked={systemSettings.is2faEnabled} onCheckedChange={handle2faToggle} disabled={isSavingSettings} />
                          </div>

                          <div className="space-y-4 rounded-lg border p-4">
                            <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-muted-foreground" /><Label className="text-base">Control Emails</Label></div>
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <Label htmlFor="dnd-email" className="text-xs font-bold uppercase text-muted-foreground tracking-tighter">DND Email (Exclude from alerts)</Label>
                                <Input id="dnd-email" placeholder="dnd.user@paruluniversity.ac.in" value={systemSettings.dndEmail || ''} onChange={(e) => setSystemSettings(prev => prev ? { ...prev, dndEmail: e.target.value } : null)} onBlur={(e) => handleSystemSettingsSave({ ...systemSettings, dndEmail: e.target.value })} disabled={isSavingSettings} />
                              </div>
                              <div className="space-y-1">
                                <Label htmlFor="iqac-email" className="text-xs font-bold uppercase text-muted-foreground tracking-tighter">IQAC Role Designation Email</Label>
                                <Input id="iqac-email" placeholder="iqac@paruluniversity.ac.in" value={systemSettings?.iqacEmail || ''} onChange={(e) => handleSystemSettingsSave({ ...systemSettings, iqacEmail: e.target.value })} disabled={isSavingSettings} />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4 rounded-lg border p-4">
                            <Label className="text-base">Allowed Email Domains</Label>
                            <p className="text-sm text-muted-foreground">White-listed domains for registration.</p>
                            <div className="flex gap-2">
                              <Input placeholder="@paruluniversity.ac.in" value={newAllowedDomain} onChange={(e) => setNewAllowedDomain(e.target.value)} />
                              <Button onClick={addAllowedDomain} disabled={isSavingSettings || !newAllowedDomain.trim()}><Plus className="h-4 w-4" /></Button>
                            </div>
                            <div className="flex flex-wrap gap-2 pt-2">
                              {(systemSettings.allowedDomains || []).map((domain) => (
                                <Badge key={domain} variant="secondary" className="pl-2 pr-1 py-1 gap-1">
                                  {domain}
                                  <Button variant="ghost" size="icon" className="h-4 w-4 hover:bg-destructive hover:text-white rounded-full" onClick={() => removeAllowedDomain(domain)} disabled={isSavingSettings}><X className="h-3 w-3" /></Button>
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="incentives" className="mt-0 space-y-6">
                        <Card className="border-none shadow-none bg-transparent">
                          <CardHeader className="px-0 pt-0">
                            <CardTitle className="text-lg">Incentive Policy Management</CardTitle>
                            <CardDescription>Enable claim types and define approval stages.</CardDescription>
                          </CardHeader>
                          <CardContent className="px-0 space-y-8">
                            <div className="space-y-4">
                              <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Enabled Claim Types</Label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {incentiveClaimTypes.map(type => (
                                  <div key={type} className="flex items-center space-x-2 bg-muted/30 p-2 rounded-md border border-muted-foreground/10">
                                    <Switch id={`incentive-${type.replace(/\s+/g, '-')}`} checked={systemSettings.enabledIncentiveTypes?.[type] !== false} onCheckedChange={(checked) => handleIncentiveTypeToggle(type, checked)} disabled={isSavingSettings} />
                                    <Label htmlFor={`incentive-${type.replace(/\s+/g, '-')}`} className="text-xs truncate">{type}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Approval Workflow (Stages)</Label>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Configure active approval stages (1 to 4) for each incentive claim type.
                                </p>
                              </div>
                              <div className="overflow-hidden rounded-lg border border-muted-foreground/10">
                                <Table>
                                  <TableHeader className="bg-muted/50">
                                    <TableRow>
                                      <TableHead className="text-[10px] uppercase font-black">Type</TableHead>
                                      <TableHead className="text-center text-[10px] uppercase font-black">S1 (Respective)</TableHead>
                                      <TableHead className="text-center text-[10px] uppercase font-black">S2</TableHead>
                                      <TableHead className="text-center text-[10px] uppercase font-black">S3</TableHead>
                                      <TableHead className="text-center text-[10px] uppercase font-black">S4 (Final)</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {incentiveClaimTypes.map(type => {
                                      const workflow = (systemSettings.incentiveApprovalWorkflows?.[type] || [1, 2, 3, 4]).filter(s => s <= 4);
                                      return (
                                        <TableRow key={type}>
                                          <TableCell className="py-2 text-[11px] font-medium leading-none">{type}</TableCell>
                                          {[1, 2, 3, 4].map(stage => (
                                            <TableCell key={stage} className="text-center py-2"><Checkbox checked={workflow.includes(stage)} onCheckedChange={(checked) => handleWorkflowChange(type, stage, !!checked)} disabled={isSavingSettings} /></TableCell>
                                          ))}
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Global Approver Assignments</Label>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Stage 1 is dynamically routed to the claimant&apos;s respective Institute Head / Principal. The remaining 3 stages are configured below by Super Admin.
                                </p>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {[2, 3, 4].map(stage => {
                                  const approver = systemSettings?.incentiveApprovers?.find(a => a.stage === stage);
                                  return (
                                    <div key={stage} className="space-y-1.5 p-3 rounded-lg border bg-muted/10">
                                      <div className="flex items-center justify-between">
                                        <Label className="text-xs font-bold">Stage {stage} Admin Email</Label>
                                        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">Super Admin</Badge>
                                      </div>
                                      <Input type="email" className="h-8 text-xs" placeholder={`approver.stage${stage}@...`} value={approver?.email || ''} onChange={(e) => handleApproverChange(stage as 1 | 2 | 3 | 4, e.target.value)} disabled={isSavingSettings} />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>

                      <TabsContent value="projects" className="mt-0 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4 rounded-lg border p-4">
                            <div className="flex items-center gap-2 text-primary"><Clock className="h-5 w-5" /><Label className="text-base">Mid-term Review</Label></div>
                            <p className="text-xs text-muted-foreground">Project eligibility for halfway review.</p>
                            <div className="flex items-center gap-3">
                              <Input type="number" className="w-20" value={systemSettings?.imrMidTermReviewMonths || 6} onChange={(e) => handleImrMidTermReviewChange(parseInt(e.target.value, 10) || 6)} disabled={isSavingSettings} min="1" />
                              <span className="text-sm font-medium">Months</span>
                            </div>
                          </div>

                          <div className="space-y-4 rounded-lg border p-4">
                            <div className="flex items-center gap-2 text-primary"><CalendarIcon className="h-5 w-5" /><Label className="text-base">Evaluation Period</Label></div>
                            <p className="text-xs text-muted-foreground">Days allowed for evaluator feedback post-meeting.</p>
                            <div className="flex items-center gap-3">
                              <Input type="number" className="w-20" value={systemSettings?.imrEvaluationDays || 0} onChange={(e) => handleImrEvaluationDaysChange(parseInt(e.target.value, 10) || 0)} disabled={isSavingSettings} min="0" />
                              <span className="text-sm font-medium">Days</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-lg border p-4">
                          <div className="flex items-center gap-2 text-primary"><Mail className="h-5 w-5" /><Label className="text-base">Utilization Notifications</Label></div>
                          <p className="text-xs text-muted-foreground">Recipient for PI utilization report alerts.</p>
                          <Input placeholder="finance.rdc@paruluniversity.ac.in" value={systemSettings?.utilizationNotificationEmail || ''} onChange={(e) => handleSystemSettingsSave({ ...systemSettings, utilizationNotificationEmail: e.target.value })} disabled={isSavingSettings} />
                        </div>
                      </TabsContent>

                      <TabsContent value="matrix" className="mt-0 space-y-6">
                        <div className="space-y-4">
                          <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-muted/30 p-4 rounded-lg border">
                            <div className="space-y-1">
                              <h4 className="font-bold text-sm">Academic Hierarchy & Principals Matrix</h4>
                              <p className="text-xs text-muted-foreground">Configure Faculties, Institutes (Principals / Stage 1 Approvers), Departments, and level authorities.</p>
                            </div>
                            <div className="flex flex-wrap w-full sm:w-auto gap-2 items-center">
                              <div className="relative w-full sm:w-60">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Search matrix & principals..."
                                  value={matrixSearchQuery}
                                  onChange={(e) => setMatrixSearchQuery(e.target.value)}
                                  className="pl-8 h-9 text-xs"
                                />
                                {matrixSearchQuery && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-1 top-1 h-7 w-7 hover:bg-transparent"
                                    onClick={() => setMatrixSearchQuery("")}
                                  >
                                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1 h-9 text-xs shrink-0"
                                onClick={handleResetToGoaDefaults}
                              >
                                <RotateCcw className="h-3.5 w-3.5" /> Reset Goa Defaults
                              </Button>
                              <Button onClick={handleAddFaculty} size="sm" className="gap-1 h-9 text-xs shrink-0">
                                <Plus className="h-4 w-4" /> Add Faculty
                              </Button>
                            </div>
                          </div>

                          <div className="border rounded-lg divide-y bg-background max-h-[60vh] overflow-y-auto p-2 space-y-3">
                            {filteredMatrixData.length === 0 ? (
                              <div className="text-center py-10 space-y-3">
                                <p className="text-sm text-muted-foreground">No academic hierarchy found matching your criteria.</p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleResetToGoaDefaults}
                                  className="gap-1.5"
                                >
                                  <RotateCcw className="h-4 w-4" /> Load Goa Default Matrix
                                </Button>
                              </div>
                            ) : (
                              filteredMatrixData.map(fac => {
                                const isFacExpanded = matrixSearchQuery.trim() ? (expandedNodes[fac.id] !== false) : !!expandedNodes[fac.id];
                                return (
                                  <div key={fac.id} className="space-y-2 p-2 border rounded-md bg-muted/5">
                                    {/* Faculty Row */}
                                    <div className="flex items-center gap-3 p-2 bg-muted/40 rounded-md border shadow-sm">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0"
                                        onClick={() => toggleNodeExpanded(fac.id)}
                                      >
                                        {isFacExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                      </Button>
                                      <School className="h-4 w-4 text-primary shrink-0" />
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-grow">
                                        <Input
                                          placeholder="Faculty Name"
                                          value={fac.name}
                                          onChange={(e) => handleUpdateNode('faculty', { facultyId: fac.id }, { name: e.target.value })}
                                          className="h-8 text-xs font-semibold"
                                        />
                                        <Input
                                          placeholder="Faculty Authority Email"
                                          value={fac.authorityEmail || ''}
                                          onChange={(e) => handleUpdateNode('faculty', { facultyId: fac.id }, { authorityEmail: e.target.value })}
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                      <div className="flex gap-1.5 shrink-0">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-8 text-[11px] gap-1"
                                          onClick={() => {
                                            handleAddInstitute(fac.id);
                                            if (!isFacExpanded) toggleNodeExpanded(fac.id);
                                          }}
                                        >
                                          <Plus className="h-3 w-3" /> Add Institute
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                          onClick={() => handleDeleteNode('faculty', { facultyId: fac.id })}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>

                                    {/* Institutes (Only if Faculty is Expanded) */}
                                    {isFacExpanded && (
                                      <div className="pl-6 border-l-2 border-dashed ml-5 space-y-2">
                                        {(!fac.institutes || fac.institutes.length === 0) ? (
                                          <p className="text-xs text-muted-foreground p-2 italic">No institutes added yet.</p>
                                        ) : (
                                          fac.institutes.map(inst => {
                                            const isInstExpanded = matrixSearchQuery.trim() ? (expandedNodes[inst.id] !== false) : !!expandedNodes[inst.id];
                                            return (
                                              <div key={inst.id} className="space-y-1.5 p-1 bg-background rounded-md border">
                                                {/* Institute Row with Principal Integration */}
                                                <div className="flex items-center gap-3 p-2 bg-muted/10 rounded-md border shadow-sm">
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 shrink-0"
                                                    onClick={() => toggleNodeExpanded(inst.id)}
                                                  >
                                                    {isInstExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                  </Button>
                                                  <Building className="h-4 w-4 text-emerald-500 shrink-0" />
                                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-grow">
                                                    <Input
                                                      placeholder="Institute Name"
                                                      value={inst.name}
                                                      onChange={(e) => handleUpdateNode('institute', { facultyId: fac.id, instituteId: inst.id }, { name: e.target.value })}
                                                      className="h-8 text-xs font-semibold"
                                                    />
                                                    <div className="relative">
                                                      <Input
                                                        placeholder="Principal Email (Stage 1 Approver)"
                                                        value={inst.authorityEmail || ''}
                                                        onChange={(e) => handleUpdateNode('institute', { facultyId: fac.id, instituteId: inst.id }, { authorityEmail: e.target.value })}
                                                        className="h-8 text-xs pr-20"
                                                      />
                                                      <span className="absolute right-2 top-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded pointer-events-none">
                                                        Principal
                                                      </span>
                                                    </div>
                                                  </div>
                                                  <div className="flex gap-1.5 shrink-0">
                                                    <Button
                                                      type="button"
                                                      variant="outline"
                                                      size="sm"
                                                      className="h-8 text-[11px] gap-1"
                                                      onClick={() => {
                                                        handleAddDepartment(fac.id, inst.id);
                                                        if (!isInstExpanded) toggleNodeExpanded(inst.id);
                                                      }}
                                                    >
                                                      <Plus className="h-3 w-3" /> Add Department
                                                    </Button>
                                                    <Button
                                                      type="button"
                                                      variant="ghost"
                                                      size="icon"
                                                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                      onClick={() => handleDeleteNode('institute', { facultyId: fac.id, instituteId: inst.id })}
                                                    >
                                                      <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                  </div>
                                                </div>

                                                {/* Departments (Only if Institute is Expanded) */}
                                                {isInstExpanded && (
                                                  <div className="pl-6 border-l-2 border-dashed ml-5 space-y-1.5">
                                                    {(!inst.departments || inst.departments.length === 0) ? (
                                                      <p className="text-xs text-muted-foreground p-2 italic">No departments added yet.</p>
                                                    ) : (
                                                      inst.departments.map(dept => (
                                                        <div key={dept.id} className="flex items-center gap-3 p-1.5 bg-muted/5 rounded-md border shadow-sm">
                                                          <div className="w-6 shrink-0" />
                                                          <GitBranch className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-grow">
                                                            <Input
                                                              placeholder="Department Name"
                                                              value={dept.name}
                                                              onChange={(e) => handleUpdateNode('department', { facultyId: fac.id, instituteId: inst.id, departmentId: dept.id }, { name: e.target.value })}
                                                              className="h-8 text-xs"
                                                            />
                                                            <Input
                                                              placeholder="Department Authority Email"
                                                              value={dept.authorityEmail || ''}
                                                              onChange={(e) => handleUpdateNode('department', { facultyId: fac.id, instituteId: inst.id, departmentId: dept.id }, { authorityEmail: e.target.value })}
                                                              className="h-8 text-xs"
                                                            />
                                                          </div>
                                                          <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                                                            onClick={() => handleDeleteNode('department', { facultyId: fac.id, instituteId: inst.id, departmentId: dept.id })}
                                                          >
                                                            <Trash2 className="h-4 w-4" />
                                                          </Button>
                                                        </div>
                                                      ))
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>

                          <div className="flex justify-end items-center gap-3 pt-4 border-t">
                            <Button onClick={handleSaveMatrix} disabled={isSavingSettings} className="gap-2">
                              {isSavingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              Save Matrix Configuration
                            </Button>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="integrations" className="mt-0 space-y-6">
                        <div className="space-y-4">
                          <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Data Service Integrations</Label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {['scopus', 'wos', 'sci'].map((api) => (
                              <div key={api} className="flex items-center justify-between rounded-lg border p-3 bg-muted/20">
                                <Label htmlFor={`${api}-toggle`} className="capitalize text-sm font-medium">{api === 'sci' ? 'ScienceDirect' : api === 'wos' ? 'Web of Science' : api}</Label>
                                <Switch id={`${api}-toggle`} checked={systemSettings.apiIntegrations?.[api as keyof ApiIntegrations] !== false} onCheckedChange={(c) => handleApiIntegrationToggle(api as keyof ApiIntegrations, c)} disabled={isSavingSettings} />
                              </div>
                            ))}
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-4">
                          <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">DOCX Template URLs</Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {templateFields.map(({ key, label }) => (
                              <div key={key} className="space-y-1.5 p-3 border rounded-lg hover:border-primary/30 transition-colors">
                                <Label htmlFor={`template-${key}`} className="text-[11px] font-bold text-muted-foreground truncate">{label}</Label>
                                <Input id={`template-${key}`} className="h-8 text-xs focus-visible:ring-primary/40" placeholder="https://..." value={systemSettings?.templateUrls?.[key] || ''} onChange={(e) => handleTemplateUrlChange(key, e.target.value)} disabled={isSavingSettings} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </TabsContent>


                    </div>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
