
"use client"

import * as React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
import * as z from "zod"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { format, startOfToday, isToday, parseISO, isAfter, subDays, addDays, isBefore } from "date-fns"
import { useRouter } from "next/navigation"
import Link from "next/link"

import type { Project, User, GrantDetails, Evaluation, GrantPhase, SystemSettings } from "@/types"
import { db } from "@/lib/config"
import { doc, updateDoc, addDoc, collection, getDoc, getDocs, where, query } from "firebase/firestore"
import {
  awardInitialGrant,
  updateProjectStatus,
  updateProjectWithRevision,
  updateProjectDuration,
  updateProjectEvaluators,
  notifyAdminsOnCompletionRequest,
  updateCoInvestigators,
  sendEmail,
  generateOfficeNotingForm,
  deleteImrProject,
  markImrAttendance,
  getSystemSettings,
  generateSanctionOrder,
  adminUploadProposal,
} from "@/app/actions"
import { generateRecommendationForm } from "@/app/document-actions"
import { findUserByMisId } from '@/app/userfinding';
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
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
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useIsMobile } from "@/hooks/use-mobile"

import { Check, ChevronDown, Clock, X, DollarSign, FileCheck2, CalendarIcon, Edit, UserCog, Banknote, AlertCircle, Users, Loader2, Printer, Download, Plus, FileText, Trash2, UserCheck, Upload } from 'lucide-react'

import { GrantManagement } from "./grant-management"
import { EvaluationForm } from "./evaluation-form"
import { EvaluationsSummary } from "./evaluations-summary"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "../ui/textarea"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Checkbox } from "../ui/checkbox"
import { uploadFileToServer } from '@/app/actions';

interface ProjectDetailsClientProps {
  project: Project
  allUsers: User[]
  piUser: User | null
  onProjectUpdate: (project: Project) => void;
  isEvaluationPeriodActive: boolean;
}

const statusVariant: { [key: string]: "default" | "secondary" | "destructive" | "outline" } = {
  Submitted: "secondary",
  Recommended: "default",
  "In Progress": "default",
  "Under Review": "secondary",
  "Revision Needed": "secondary",
  "Pending Completion Approval": "secondary",
  "Not Recommended": "destructive",
  Completed: "outline",
}

const durationSchema = z
  .object({
    startDate: z.date({ required_error: "A start date is required." }),
    endDate: z.date({ required_error: "An end date is required." }),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date.",
    path: ["endDate"],
  })
type DurationFormData = z.infer<typeof durationSchema>

const evaluatorSchema = z.object({
  evaluatorUids: z.array(z.string()).min(1, "Please select at least one evaluator."),
})
type EvaluatorFormData = z.infer<typeof evaluatorSchema>

const revisionCommentSchema = z.object({
  comments: z.string().min(10, "Please provide detailed comments for the revision."),
  statusToSet: z.enum(["Revision Needed", "Not Recommended"]),
})
type RevisionCommentFormData = z.infer<typeof revisionCommentSchema>

const awardGrantSchema = z.object({
    sanctionNumber: z.string().min(1, "Sanction number is required."),
    totalAmount: z.coerce.number().positive("Total amount must be a positive number."),
    phases: z.array(z.object({
        name: z.string(),
        amount: z.coerce.number().positive('Phase amount must be positive.'),
    })).min(1, 'At least one phase is required.'),
}).refine(data => {
    const totalPhaseAmount = data.phases.reduce((sum, phase) => sum + phase.amount, 0);
    return Math.abs(totalPhaseAmount - data.totalAmount) < 0.01; // Allow for floating point inaccuracies
}, {
    message: "The sum of phase amounts must equal the total sanctioned amount.",
    path: ["totalAmount"],
});


const notingFormSchema = z.object({
    projectDuration: z.string().min(3, 'Project duration is required.'),
    phases: z.array(z.object({
        name: z.string().min(1, 'Phase name is required.'),
        amount: z.coerce.number().positive('Amount must be a positive number.'),
    })).min(1, 'At least one funding phase is required.')
});
type NotingFormData = z.infer<typeof notingFormSchema>

const deleteProjectSchema = z.object({
    reason: z.string().min(10, "A reason for deletion is required."),
});
type DeleteProjectFormData = z.infer<typeof deleteProjectSchema>;

const attendanceSchema = z.object({
  absentPiUids: z.array(z.string()),
  absentEvaluatorUids: z.array(z.string()),
});

const venues = ["RDC Committee Room, PIMSR"]

const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
    reader.readAsDataURL(file)
  })
}

function AttendanceDialog({ isOpen, onOpenChange, project, allUsers, onUpdate }: {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    project: Project;
    allUsers: User[];
    onUpdate: () => void;
}) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const form = useForm<z.infer<typeof attendanceSchema>>({
        resolver: zodResolver(attendanceSchema),
        defaultValues: {
            absentPiUids: [],
            absentEvaluatorUids: project.meetingDetails?.absentEvaluators || [],
        },
    });

    const assignedEvaluators = allUsers.filter(u => project.meetingDetails?.assignedEvaluators?.includes(u.uid));

    const handleSubmit = async (values: z.infer<typeof attendanceSchema>) => {
        setIsSubmitting(true);
        try {
            const result = await markImrAttendance(
                [{ projectId: project.id, piUid: project.pi_uid }],
                values.absentPiUids,
                values.absentEvaluatorUids,
                project.meetingDetails // Pass meeting details to find other projects in the same meeting
            );
            if (result.success) {
                toast({ title: 'Success', description: 'Attendance has been marked.' });
                onUpdate();
                onOpenChange(false);
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message || 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Mark Meeting Attendance</DialogTitle>
                    <DialogDescription>Select any applicants or evaluators who were absent from the meeting.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="attendance-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 py-4 max-h-[60vh] overflow-y-auto pr-4">
                        <div>
                            <h4 className="font-semibold mb-2">Principal Investigator</h4>
                            <FormField
                                control={form.control}
                                name="absentPiUids"
                                render={({ field }) => (
                                    <FormItem className="flex items-center space-x-3 space-y-0 p-2 border rounded-md">
                                        <FormControl>
                                            <Checkbox
                                                checked={field.value?.includes(project.pi_uid)}
                                                onCheckedChange={(checked) => {
                                                    return checked
                                                        ? field.onChange([project.pi_uid])
                                                        : field.onChange([]);
                                                }}
                                            />
                                        </FormControl>
                                        <FormLabel className="font-normal">{project.pi}</FormLabel>
                                    </FormItem>
                                )}
                            />
                        </div>
                        <div>
                            <h4 className="font-semibold mb-2">Evaluators ({assignedEvaluators.length})</h4>
                            <div className="space-y-2">
                                {assignedEvaluators.map(evaluator => (
                                     <FormField
                                        key={evaluator.uid}
                                        control={form.control}
                                        name="absentEvaluatorUids"
                                        render={({ field }) => (
                                            <FormItem className="flex items-center space-x-3 space-y-0 p-2 border rounded-md">
                                                <FormControl>
                                                    <Checkbox
                                                        checked={field.value?.includes(evaluator.uid)}
                                                        onCheckedChange={(checked) => {
                                                            return checked
                                                                ? field.onChange([...(field.value || []), evaluator.uid])
                                                                : field.onChange(field.value?.filter(id => id !== evaluator.uid));
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormLabel className="font-normal">{evaluator.name}</FormLabel>
                                            </FormItem>
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                    </form>
                </Form>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" form="attendance-form" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Save Attendance'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function ProjectDetailsClient({ project: initialProject, allUsers, piUser, onProjectUpdate, isEvaluationPeriodActive }: ProjectDetailsClientProps) {
  const [project, setProject] = useState(initialProject)
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [coPiUsers, setCoPiUsers] = useState<User[]>([])
  const [isUpdating, setIsUpdating] = useState(false)
  const { toast } = useToast()
  const router = useRouter()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCompletionDialogOpen, setIsCompletionDialogOpen] = useState(false)
  const [completionReportFile, setCompletionReportFile] = useState<File | null>(null)
  const [utilizationCertificateFile, setUtilizationCertificateFile] = useState<File | null>(null)
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false)
  const [isRevisionDialogOpen, setIsRevisionDialogOpen] = useState(false)
  const [revisedProposalFile, setRevisedProposalFile] = useState<File | null>(null)
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false)
  const [isDurationDialogOpen, setIsDurationDialogOpen] = useState(false)
  const [isEvaluatorDialogOpen, setIsEvaluatorDialogOpen] = useState(false)
  const [isRevisionCommentDialogOpen, setIsRevisionCommentDialogOpen] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [isNotingDialogOpen, setIsNotingDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] = useState(false);
  const [isAwarding, setIsAwarding] = useState(false);
  const [isDownloadingSanctionOrder, setIsDownloadingSanctionOrder] = useState(false);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [isProposalUploadOpen, setIsProposalUploadOpen] = useState(false);
  const [proposalFile, setProposalFile] = useState<File | null>(null);

  const isMobile = useIsMobile();

  // Co-PI management state
  const [coPiSearchTerm, setCoPiSearchTerm] = useState("")
  const [foundCoPi, setFoundCoPi] = useState<{ uid: string; name: string } | null>(null)
  const [coPiList, setCoPiList] = useState<{ uid: string; name: string }[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSavingCoPis, setIsSavingCoPis] = useState(false)

  const awardGrantForm = useForm<z.infer<typeof awardGrantSchema>>({
    resolver: zodResolver(awardGrantSchema),
     defaultValues: {
      sanctionNumber: "",
      totalAmount: 0,
      phases: [{ name: "Phase 1", amount: 0 }],
    },
  });

  const durationForm = useForm<DurationFormData>({
    resolver: zodResolver(durationSchema),
  })

  const evaluatorForm = useForm<EvaluatorFormData>({
    resolver: zodResolver(evaluatorSchema),
  })

  const revisionCommentForm = useForm<RevisionCommentFormData>({
    resolver: zodResolver(revisionCommentSchema),
    defaultValues: { comments: "" },
  })

  const deleteProjectForm = useForm<DeleteProjectFormData>({
    resolver: zodResolver(deleteProjectSchema),
    defaultValues: { reason: "" },
  })

    const notingForm = useForm<NotingFormData>({
        resolver: zodResolver(notingFormSchema),
        defaultValues: {
            projectDuration: project.projectDuration || '',
            phases: project.phases || [{ name: 'Phase 1', amount: 0 }],
        }
    });

  const refetchProject = useCallback(async () => {
    try {
        const projectRef = doc(db, 'projects', initialProject.id);
        const projectSnap = await getDoc(projectRef);
        if (projectSnap.exists()) {
            const updatedProject = { id: projectSnap.id, ...projectSnap.data() } as Project;
            setProject(updatedProject);
            onProjectUpdate(updatedProject);
        }
    } catch (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not refresh project data.' });
    }
  }, [initialProject.id, toast, onProjectUpdate]);

  const refetchEvaluations = useCallback(async () => {
    try {
      const evaluationsCol = collection(db, "projects", initialProject.id, "evaluations")
      const evaluationsSnapshot = await getDocs(evaluationsCol)
      const evaluationsList = evaluationsSnapshot.docs.map((evaluationDoc) => evaluationDoc.data() as Evaluation)
      setEvaluations(evaluationsList)
    } catch (error) {
      console.error("Error refetching evaluations:", error)
      toast({ variant: "destructive", title: "Error", description: "Could not refresh evaluation data." })
    }
  }, [initialProject.id, toast])

  useEffect(() => {
    setProject(initialProject)
  }, [initialProject])

  useEffect(() => {
    refetchEvaluations()
  }, [refetchEvaluations])

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
    const fetchSettings = async () => {
        const settings = await getSystemSettings();
        setSystemSettings(settings);
    };
    fetchSettings();
  }, [])

  useEffect(() => {
    const fetchCoPiUsers = async () => {
      if (project.coPiUids && project.coPiUids.length > 0) {
        const usersRef = collection(db, "users")
        const q = query(usersRef, where("__name__", "in", project.coPiUids))
        const querySnapshot = await getDocs(q)
        const fetchedUsers = querySnapshot.docs.map((coPiDoc) => ({ uid: coPiDoc.id, ...coPiDoc.data() }) as User)
        setCoPiUsers(fetchedUsers)
        setCoPiList(fetchedUsers.map((u) => ({ uid: u.uid, name: u.name })))
      }
    }
    fetchCoPiUsers()
  }, [project.coPiUids])

  useEffect(() => {
    durationForm.reset({
      startDate: project.projectStartDate ? parseISO(project.projectStartDate) : undefined,
      endDate: project.projectEndDate ? parseISO(project.projectEndDate) : undefined,
    })
    evaluatorForm.reset({
      evaluatorUids: project.meetingDetails?.assignedEvaluators || [],
    })
  }, [project, durationForm, evaluatorForm])

  const isPI = user?.uid === project.pi_uid || user?.email === project.pi_email
  const isCoPi = user && project.coPiUids?.includes(user.uid)
  const isAdmin = user && ["Super-admin", "admin"].includes(user.role)
  const isSuperAdmin = user?.role === "Super-admin"
  const isUserAdmin = user && ["Super-admin", "admin"].includes(user.role);
  const isAssignedEvaluator = user && project.meetingDetails?.assignedEvaluators?.includes(user.uid)
  const isHeadOfGoaCampus = user?.designation === 'Head of Goa Campus';
  const canViewDocuments = (isPI || isCoPi || isAdmin || isAssignedEvaluator) && !isHeadOfGoaCampus;


  const canViewCoPiCVs = useMemo(() => {
    if (!user) return false
    if (isSuperAdmin) return true
    if (isAssignedEvaluator && project.meetingDetails?.date) {
      const evaluationDays = systemSettings?.imrEvaluationDays ?? 0;
      const meetingDate = parseISO(project.meetingDetails.date);
      const deadline = addDays(meetingDate, evaluationDays);
      return isToday(meetingDate) || (isAfter(new Date(), meetingDate) && !isAfter(new Date(), deadline));
    }
    return false
  }, [user, isSuperAdmin, isAssignedEvaluator, project.meetingDetails, systemSettings])
  
  const showEvaluationForm = user && isAssignedEvaluator && project.status === 'Under Review';

  const assignedEvaluatorsCount = project.meetingDetails?.assignedEvaluators?.length ?? 0;
  const absentEvaluatorsCount = project.meetingDetails?.absentEvaluators?.length ?? 0;
  const presentEvaluatorsCount = assignedEvaluatorsCount - absentEvaluatorsCount;

  const allEvaluationsIn =
    assignedEvaluatorsCount > 0 &&
    evaluations.length >= presentEvaluatorsCount;

  const canManageGrants =
    user &&
    (user.role === "Super-admin" ||
      user.role === "admin" ||
      isPI || isCoPi)

  const canRequestClosure = useMemo(() => {
    if (!isPI) return false
    const normalizedStatus = project.status.toLowerCase()
    const allowedStatuses = ["recommended", "in progress", "completed", "pending completion approval"]
    return allowedStatuses.includes(normalizedStatus) && normalizedStatus !== "pending completion approval"
  }, [isPI, project.status])

  const assignedEvaluatorNames = useMemo(() => {
    if (!project.meetingDetails?.assignedEvaluators || !allUsers.length) {
      return []
    }
    return project.meetingDetails.assignedEvaluators.map((uid) => {
      const evaluator = allUsers.find((u) => u.uid === uid)
      return evaluator ? evaluator.name : "Unknown Evaluator"
    })
  }, [project.meetingDetails, allUsers])

  const handleStatusUpdate = async (newStatus: Project["status"], comments?: string) => {
    setIsUpdating(true)
    const result = await updateProjectStatus(project.id, newStatus, comments)
    setIsUpdating(false)

    if (result.success) {
      const updatedProjectData = { ...project, status: newStatus };
      if (comments) {
        if (newStatus === 'Revision Needed') updatedProjectData.revisionComments = comments;
        if (newStatus === 'Not Recommended') updatedProjectData.rejectionComments = comments;
      }
      setProject(updatedProjectData);
      onProjectUpdate(updatedProjectData); // Notify parent component
      toast({ title: "Success", description: `Project status updated to ${newStatus}` })
      if (newStatus === "Revision Needed" || newStatus === "Not Recommended") {
        setIsRevisionCommentDialogOpen(false)
        revisionCommentForm.reset()
      }
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error || "Failed to update project status." })
    }
  }

  const handleSearchCoPi = async () => {
    if (!coPiSearchTerm) return
    setIsSearching(true)
    setFoundCoPi(null)
    try {
      const result = await findUserByMisId(coPiSearchTerm)
      if (result.success && result.users && result.users.length > 0) {
        setFoundCoPi({uid: result.users[0].uid!, name: result.users[0].name})
      } else {
        toast({ variant: "destructive", title: "User Not Found", description: result.error })
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Search Failed", description: "An error occurred while searching." })
    } finally {
      setIsSearching(false)
    }
  }

  const handleAddCoPi = () => {
    if (foundCoPi && !coPiList.some((coPi) => coPi.uid === foundCoPi.uid)) {
      if (user && foundCoPi.uid === user.uid) {
        toast({ variant: "destructive", title: "Cannot Add Self", description: "You cannot add yourself as a Co-PI." })
        return
      }
      setCoPiList([...coPiList, foundCoPi])
    }
    setFoundCoPi(null)
    setCoPiSearchTerm("")
  }

  const handleRemoveCoPi = (uidToRemove: string) => {
    setCoPiList(coPiList.filter((coPi) => coPi.uid !== uidToRemove))
  }

  const handleSaveCoPis = async () => {
    setIsSavingCoPis(true)
    const coPiUids = coPiList.map((coPi) => coPi.uid)
    const result = await updateCoInvestigators(project.id, coPiUids)
    if (result.success) {
      toast({ title: "Success", description: "Co-PI list has been updated." })
      setProject((prev) => ({ ...prev, coPiUids }))
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error })
    }
    setIsSavingCoPis(false)
  }

  const handleAwardGrantAndDownload = async (values: z.infer<typeof awardGrantSchema>) => {
    setIsAwarding(true)
    try {
        const result = await awardInitialGrant(
            project.id,
            values,
            { uid: project.pi_uid, name: project.pi, email: project.pi_email, campus: piUser?.campus },
            project.title
        );

        if (!result.success || !result.updatedProject) {
            throw new Error(result.error || "Failed to award grant.");
        }
        
        onProjectUpdate(result.updatedProject);
        toast({ title: "Grant Awarded!", description: `The grant has been created with all phases.` });
        
        const printResult = await generateRecommendationForm(project.id);
        if (printResult.success && printResult.fileData) {
            const byteCharacters = atob(printResult.fileData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `IMR_Recommendation_${project.pi.replace(/\s/g, '_')}.docx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } else {
            throw new Error(printResult.error || "Failed to generate recommendation form.");
        }

        setIsDialogOpen(false);
    } catch (error: any) {
        console.error("Error in award and download process:", error);
        toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
        setIsAwarding(false);
    }
  };

  const handleDirectDownload = async () => {
    setIsAwarding(true); // Re-use the same loading state
    try {
        const printResult = await generateRecommendationForm(project.id);
        if (printResult.success && printResult.fileData) {
            const byteCharacters = atob(printResult.fileData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `IMR_Recommendation_${project.pi.replace(/\s/g, '_')}.docx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } else {
            throw new Error(printResult.error || "Failed to generate recommendation form.");
        }
    } catch (error: any) {
        toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
        setIsAwarding(false);
    }
};

  const handleCompletionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCompletionReportFile(e.target.files[0])
    }
  }

  const handleCertificateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUtilizationCertificateFile(e.target.files[0])
    }
  }

  const handleCompletionSubmit = async () => {
    if (!completionReportFile || !utilizationCertificateFile) {
      toast({
        variant: "destructive",
        title: "Files Missing",
        description: "Please upload both the completion report and the utilization certificate.",
      })
      return
    }
    if (!user) {
      toast({ variant: "destructive", title: "Authentication Error", description: "Could not identify user." })
      return
    }
    setIsSubmittingCompletion(true)
    try {
      const projectRef = doc(db, "projects", project.id)

      const uploadFile = async (file: File, folder: string): Promise<string> => {
        try {
          const dataUrl = await fileToDataUrl(file)
          if (!dataUrl || typeof dataUrl !== "string") {
            throw new Error(`Failed to convert ${file.name} to data URL`)
          }

          const path = `reports/${project.id}/${folder}/${Date.now()}-${file.name}`
          const result = await uploadFileToServer(dataUrl, path)

          if (!result.success || !result.url) {
            throw new Error(result.error || `Failed to upload ${file.name}`)
          }
          return result.url
        } catch (error: any) {
          console.error(`Error uploading ${file.name}:`, error)
          throw new Error(`Upload failed for ${file.name}: ${error.message}`)
        }
      }

      const reportUrl = await uploadFile(completionReportFile, "completion-report")
      const certificateUrl = await uploadFile(utilizationCertificateFile, "utilization-certificate")

      const updateData = {
        status: "Pending Completion Approval" as Project["status"],
        completionReportUrl: reportUrl,
        utilizationCertificateUrl: certificateUrl,
        completionSubmissionDate: new Date().toISOString(),
      }

      await updateDoc(projectRef, updateData)
      setProject({ ...project, ...updateData })

      // Notify Super Admins
      await notifyAdminsOnCompletionRequest(project.id, project.title, user.name)

      toast({ title: "Documents Submitted", description: "Your completion documents have been submitted for review." })
      setIsCompletionDialogOpen(false)
      setCompletionReportFile(null)
      setUtilizationCertificateFile(null)
    } catch (error: any) {
      console.error("Error submitting completion documents:", error)
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error.message || "Could not submit the completion documents. Please try again.",
      })
    } finally {
      setIsSubmittingCompletion(false)
    }
  }

  const handleRevisionSubmit = async () => {
    if (!revisedProposalFile) {
      toast({ variant: "destructive", title: "File Missing", description: "Please upload the revised proposal." })
      return
    }
    setIsSubmittingRevision(true)
    try {
      const dataUrl = await fileToDataUrl(revisedProposalFile);
      const path = `revisions/${project.id}/${revisedProposalFile.name}`;
      const uploadResult = await uploadFileToServer(dataUrl, path);

      if (!uploadResult.success || !uploadResult.url) {
        throw new Error(uploadResult.error || "Revision upload failed")
      }

      const revisionResult = await updateProjectWithRevision(project.id, uploadResult.url)

      if (!revisionResult.success) {
        throw new Error(revisionResult.error || "Failed to update project with revision.")
      }

      toast({ title: "Revision Submitted", description: "Your revised proposal has been submitted for re-evaluation." })
      setIsRevisionDialogOpen(false)
      setRevisedProposalFile(null)
      const projectRef = doc(db, "projects", project.id)
      const projectSnap = await getDoc(projectRef)
      setProject({ id: projectSnap.id, ...projectSnap.data() } as Project)
    } catch (error: any) {
      console.error("Error submitting revision:", error)
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: error.message || "Could not submit your revision.",
      })
    } finally {
      setIsSubmittingRevision(false)
    }
  }

  const handleDurationSubmit = async (data: DurationFormData) => {
    setIsUpdating(true)
    const result = await updateProjectDuration(project.id, data.startDate.toISOString(), data.endDate.toISOString())
    if (result.success) {
      toast({ title: "Success", description: "Project duration has been updated." })
      setProject((prev) => ({
        ...prev,
        projectStartDate: data.startDate.toISOString(),
        projectEndDate: data.endDate.toISOString(),
      }))
      onProjectUpdate({
        ...project,
        projectStartDate: data.startDate.toISOString(),
        projectEndDate: data.endDate.toISOString(),
      })
      setIsDurationDialogOpen(false)
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error })
    }
    setIsUpdating(false)
  }

  const handleEvaluatorSubmit = async (data: EvaluatorFormData) => {
    setIsUpdating(true)
    const result = await updateProjectEvaluators(project.id, data.evaluatorUids)
    if (result.success) {
      toast({ title: "Success", description: "Assigned evaluators have been updated." })
      setProject((prev) => ({
        ...prev,
        meetingDetails: { ...prev.meetingDetails!, assignedEvaluators: data.evaluatorUids },
      }))
      onProjectUpdate({
        ...project,
        meetingDetails: { ...project.meetingDetails!, assignedEvaluators: data.evaluatorUids },
      })
      setIsEvaluatorDialogOpen(false)
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error })
    }
    setIsUpdating(false)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    try {
      return format(parseISO(dateString), "dd/MM/yyyy");
    } catch (e) {
      console.error("Date formatting error:", e);
      return "Invalid Date";
    }
  };

  const handleProjectUpdate = (updatedProject: Project) => {
    setProject(updatedProject)
  }

  const handleApprovalClick = (status: "Recommended" | "Not Recommended" | "Revision Needed") => {
    if (status === "Revision Needed" || status === "Not Recommended") {
        revisionCommentForm.setValue("statusToSet", status);
        setIsRevisionCommentDialogOpen(true);
    } else {
        handleStatusUpdate(status);
    }
  };

  const handleRevisionCommentSubmit = (data: RevisionCommentFormData) => {
    handleStatusUpdate(data.statusToSet, data.comments);
  };

  const handlePrint = async (notingData: NotingFormData) => {
    setIsPrinting(true);
    const result = await generateOfficeNotingForm(project.id, notingData);
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
      a.download = `Office_Noting_${project.pi.replace(/\s/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: "Download Started", description: "Office Notings form is being downloaded." });
      setIsNotingDialogOpen(false);
      refetchProject();
    } else {
      toast({ variant: 'destructive', title: 'Download Failed', description: result.error });
    }
    setIsPrinting(false);
  };
  
  const handleDownloadSanctionOrder = async () => {
    setIsDownloadingSanctionOrder(true);
    const result = await generateSanctionOrder(project.id);
    if (result.success && result.fileData) {
        const byteCharacters = atob(result.fileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Sanction_Order_${project.pi.replace(/\s/g, '_')}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } else {
        toast({ variant: 'destructive', title: 'Download Failed', description: result.error });
    }
    setIsDownloadingSanctionOrder(false);
  };

  const handleOpenNotingDialog = () => {
    notingForm.reset({
        projectDuration: project.projectDuration || '',
        phases: project.phases || [{ name: 'Phase 1', amount: 0 }],
    });
    setIsNotingDialogOpen(true);
  };
  
  const handleDeleteProject = async (values: DeleteProjectFormData) => {
    setIsUpdating(true);
    const result = await deleteImrProject(project.id, values.reason, user?.name || 'Unknown Admin');
    if (result.success) {
        toast({ title: "Project Deleted", description: "The project and all its associated data have been removed." });
        router.push('/dashboard/all-projects');
    } else {
        toast({ variant: "destructive", title: "Deletion Failed", description: result.error });
        setIsUpdating(false);
    }
  };
  
  const handleProposalUpload = async () => {
    if (!proposalFile) {
        toast({ variant: 'destructive', title: 'File Missing', description: 'Please select a proposal file to upload.' });
        return;
    }
    setIsUpdating(true);
    try {
        const dataUrl = await fileToDataUrl(proposalFile);
        const result = await adminUploadProposal(project.id, dataUrl, proposalFile.name);
        if (result.success) {
            toast({ title: 'Success', description: 'Proposal has been uploaded to the draft.' });
            refetchProject();
            setIsProposalUploadOpen(false);
        } else {
            throw new Error(result.error);
        }
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Upload Failed', description: error.message });
    } finally {
        setIsUpdating(false);
    }
  };

  const canViewEvaluations = (isAdmin || isAssignedEvaluator) && !isHeadOfGoaCampus;
  const showAdminActions = (user?.role === "Super-admin" || user?.role === "admin") && project.status !== 'Draft';
  const canManageCoPi = (isPI || isAdmin) && project.status !== 'Not Recommended';


  const isGrantAwarded = !!project.grant;
  const showDownloadButton = isUserAdmin && (project.status === 'Recommended' || project.status === 'In Progress');
  const showSanctionOrderButton = isUserAdmin && project.status === 'In Progress';
  const isDurationSet = !!project.projectStartDate && !!project.projectEndDate;
  const isMeetingScheduled = !!project.meetingDetails?.date;
  const showBankDetails = isAdmin && ['Recommended', 'In Progress', 'Completed', 'Sanctioned', 'Pending Completion Approval'].includes(project.status);

  return (
    <React.Fragment>
      <div className="flex items-center justify-between mb-4">
        <div>
          {isAdmin && project.status === 'Draft' && (
              <Dialog open={isProposalUploadOpen} onOpenChange={setIsProposalUploadOpen}>
                  <DialogTrigger asChild>
                      <Button variant="outline">
                          <Upload className="mr-2 h-4 w-4"/> Upload Proposal PDF
                      </Button>
                  </DialogTrigger>
                   <DialogContent>
                      <DialogHeader>
                          <DialogTitle>Upload Proposal for Draft</DialogTitle>
                          <DialogDescription>As an admin, you can upload a proposal file to this draft project on behalf of the PI.</DialogDescription>
                      </DialogHeader>
                      <div className="py-4 space-y-2">
                          <Label htmlFor="admin-proposal-upload">Proposal PDF</Label>
                          <Input id="admin-proposal-upload" type="file" accept=".pdf" onChange={(e) => setProposalFile(e.target.files?.[0] || null)} />
                      </div>
                      <DialogFooter>
                           <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                           <Button onClick={handleProposalUpload} disabled={isUpdating || !proposalFile}>
                              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin"/> : null} Upload
                           </Button>
                      </DialogFooter>
                  </DialogContent>
              </Dialog>
          )}
        </div>
        <div className="flex items-center gap-2">
            {showDownloadButton && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div tabIndex={isDurationSet ? undefined : -1}>
                                {isGrantAwarded ? (
                                    <Button onClick={handleDirectDownload} disabled={isAwarding}>
                                        {isAwarding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                        Download Recommendation Form
                                    </Button>
                                ) : (
                                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button disabled={!isDurationSet}>
                                                <Download className="mr-2 h-4 w-4" /> Award Grant & Download
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>Award Grant & Download</DialogTitle>
                                                <DialogDescription>
                                                    To download the recommendation form, first confirm the grant details. This will update the project status and save the grant information.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <AwardGrantForm
                                                form={awardGrantForm}
                                                onSubmit={handleAwardGrantAndDownload}
                                                isAwarding={isAwarding}
                                            />
                                        </DialogContent>
                                    </Dialog>
                                )}
                            </div>
                        </TooltipTrigger>
                        {!isDurationSet && (
                            <TooltipContent>
                                <p>Set project duration first.</p>
                            </TooltipContent>
                        )}
                    </Tooltip>
                </TooltipProvider>
            )}
            {showSanctionOrderButton && (
                 <Button onClick={handleDownloadSanctionOrder} disabled={isDownloadingSanctionOrder}>
                    {isDownloadingSanctionOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download Sanction Order
                </Button>
            )}
             {showAdminActions && (
                <Dialog open={isDurationDialogOpen} onOpenChange={setIsDurationDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {project.projectStartDate ? "Update Duration" : "Set Duration"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Set Project Duration</DialogTitle>
                      <DialogDescription>Define the start and end dates for this project.</DialogDescription>
                    </DialogHeader>
                    <Form {...durationForm}>
                      <form
                        id="duration-form"
                        onSubmit={durationForm.handleSubmit(handleDurationSubmit)}
                        className="space-y-4 py-4"
                      >
                         <FormField name="startDate" control={durationForm.control} render={({ field }) => ( 
                           <FormItem className="flex flex-col">
                             <FormLabel>Start Date</FormLabel>
                             <Popover><PopoverTrigger asChild><FormControl><div><Button variant={"outline"} className={cn("pl-3 text-left font-normal w-full", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></div></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar captionLayout="dropdown-buttons" fromYear={2010} toYear={new Date().getFullYear() + 5} mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover>
                             <FormMessage />
                           </FormItem> 
                         )} />
                         <FormField name="endDate" control={durationForm.control} render={({ field }) => ( 
                          <FormItem className="flex flex-col">
                            <FormLabel>End Date</FormLabel>
                              <Popover><PopoverTrigger asChild><FormControl><div><Button variant={"outline"} className={cn("pl-3 text-left font-normal w-full", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></div></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar captionLayout="dropdown-buttons" fromYear={2010} toYear={new Date().getFullYear() + 5} mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover>
                            <FormMessage />
                          </FormItem> 
                         )} />
                      </form>
                    </Form>
                    <DialogFooter>
                       <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                      <Button type="submit" form="duration-form" disabled={isUpdating}>
                        {isUpdating ? "Saving..." : "Save Duration"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
             {isSuperAdmin && (
                <Button variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Project
                </Button>
            )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Submitted on {formatDate(project.submissionDate)}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <Badge variant={statusVariant[project.status] || "secondary"} className="text-sm px-3 py-1">
                {project.status === "Under Review" && <Clock className="mr-2 h-4 w-4" />}
                {project.status === "Revision Needed" && <Edit className="mr-2 h-4 w-4" />}
                {project.status === "Pending Completion Approval" && <Clock className="mr-2 h-4 w-4" />}
                {(project.status === "Recommended" || project.status === "Completed") && (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {project.status === "Not Recommended" && <X className="mr-2 h-4 w-4" />}
                {project.status}
              </Badge>
              {isAdmin && project.status === "Under Review" && (
                 <TooltipProvider>
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" disabled={isUpdating}>
                            Update Status <ChevronDown className="ml-2 h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                    </Tooltip>
                    <DropdownMenuContent align="end">
                       <DropdownMenuItem 
                          onClick={() => handleApprovalClick("Recommended")}
                       >
                          <Check className="mr-2 h-4 w-4" /> Recommended
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleApprovalClick("Not Recommended")}>
                        <X className="mr-2 h-4 w-4 text-destructive" />{" "}
                        <span className="text-destructive">Not Recommend</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => handleApprovalClick("Revision Needed")}>
                        <Edit className="mr-2 h-4 w-4" /> Request Revision
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipProvider>
              )}
              {(isPI || isSuperAdmin) && project.status === "Revision Needed" && (
                <Dialog open={isRevisionDialogOpen} onOpenChange={setIsRevisionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <FileCheck2 className="mr-2 h-4 w-4" /> Submit Revision
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Submit Revised Proposal</DialogTitle>
                      <DialogDescription>
                        {isSuperAdmin && !isPI
                            ? "As an admin, you are uploading a revised proposal on behalf of the PI."
                            : "Upload your revised proposal based on the feedback from the IMR evaluation meeting."}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="revised-proposal" className="text-right col-span-1">
                          Proposal (PDF)
                        </Label>
                        <Input
                          id="revised-proposal"
                          type="file"
                          accept=".pdf"
                          onChange={(e) => setRevisedProposalFile(e.target.files ? e.target.files[0] : null)}
                          className="col-span-3"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        onClick={handleRevisionSubmit}
                        disabled={isSubmittingRevision || !revisedProposalFile}
                      >
                        {isSubmittingRevision ? "Submitting..." : "Submit Revised Proposal"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              
              {canRequestClosure && (
                <Dialog open={isCompletionDialogOpen} onOpenChange={setIsCompletionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <FileCheck2 className="mr-2 h-4 w-4" /> Request Project Closure
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Submit Completion Documents</DialogTitle>
                      <DialogDescription>
                        To request project closure, please upload the final 'Project outcome-cum-completion report' and
                        the 'Utilization Certificate'. You can download the templates below.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 flex-wrap">
                          <Button variant="secondary" asChild>
                              <a href="/templates/COMPLETION_REPORT_TEMPLATE.docx" download>
                                  <Download className="mr-2 h-4 w-4" />
                                  Completion Report Template
                              </a>
                          </Button>
                           <Button variant="secondary" asChild>
                              <a href="/templates/UTILIZATION_CERTIFICATE_TEMPLATE.docx" download>
                                  <Download className="mr-2 h-4 w-4" />
                                  Utilization Certificate Template
                              </a>
                          </Button>
                      </div>
                      <div className="grid gap-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="completion-report" className="text-right col-span-1">
                            Completion Report (PDF)
                          </Label>
                          <Input
                            id="completion-report"
                            type="file"
                            accept=".pdf"
                            onChange={handleCompletionFileChange}
                            className="col-span-3"
                          />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                          <Label htmlFor="utilization-certificate" className="text-right col-span-1">
                            Utilization Certificate (PDF)
                          </Label>
                          <Input
                            id="utilization-certificate"
                            type="file"
                            accept=".pdf"
                            onChange={handleCertificateFileChange}
                            className="col-span-3"
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        onClick={handleCompletionSubmit}
                        disabled={isSubmittingCompletion || !completionReportFile || !utilizationCertificateFile}
                      >
                        {isSubmittingCompletion ? "Submitting..." : "Submit for Review"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {project.wasAbsent && !project.meetingDetails && (
              <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>PI Was Absent</AlertTitle>
                  <AlertDescription>
                      The Principal Investigator was marked as absent for the scheduled evaluation meeting. This project will need to be rescheduled.
                  </AlertDescription>
              </Alert>
          )}
           {isMeetingScheduled && (
            <>
              <div className="space-y-2 p-4 border rounded-lg bg-secondary/50">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <h3 className="font-semibold text-lg">IMR Evaluation Meeting Details</h3>
                   {isSuperAdmin && project.status === 'Under Review' && (
                    <Button variant="outline" size="sm" onClick={() => setIsAttendanceDialogOpen(true)}>
                        <UserCheck className="mr-2 h-4 w-4" /> Mark Attendance
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                  <p>
                    <strong>Date:</strong> {formatDate(project.meetingDetails?.date)}
                  </p>
                  <p>
                    <strong>Time:</strong> {project.meetingDetails?.time}
                  </p>
                  <p>
                    <strong>Venue:</strong> {project.meetingDetails?.venue}
                  </p>
                </div>
                {isAdmin && assignedEvaluatorNames.length > 0 && (
                  <div className="pt-2">
                    <p className="font-semibold text-sm">Assigned Evaluators:</p>
                    <ul className="list-disc list-inside text-sm pl-4">
                      {assignedEvaluatorNames.map((name, index) => (
                        <li key={index}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <Separator />
            </>
          )}
          {(project.status === "Revision Needed" || project.status === "Not Recommended") && (project.revisionComments || project.rejectionComments) && (
            <>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{project.status === "Revision Needed" ? "Revision Requested" : "Decision Feedback"}</AlertTitle>
                <AlertDescription>
                  <p className="font-semibold mt-2">Evaluator's Comments:</p>
                  <p className="whitespace-pre-wrap">{project.revisionComments || project.rejectionComments}</p>
                </AlertDescription>
              </Alert>
              <Separator />
            </>
          )}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Abstract</h3>
            <p className="text-muted-foreground">{project.abstract}</p>
          </div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="space-y-4 md:col-span-2">
              <h3 className="font-semibold text-lg">Project Details</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="font-medium text-muted-foreground">Category</dt>
                <dd>{project.type}</dd>
                {project.projectStartDate && project.projectEndDate && (
                  <>
                    <dt className="font-medium text-muted-foreground">Project Duration</dt>
                    <dd>
                      {format(new Date(project.projectStartDate), "dd/MM/yyyy")} -{" "}
                      {format(new Date(project.projectEndDate), "dd/MM/yyyy")}
                    </dd>
                  </>
                )}
              </dl>
              {project.sdgGoals && project.sdgGoals.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2 pt-2">
                    <p className="font-medium text-muted-foreground">UN Sustainable Development Goals</p>
                    <div className="flex flex-wrap gap-1">
                      {project.sdgGoals.map((goal) => (
                        <Badge key={goal} variant="secondary">
                          {goal}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="space-y-4 md:col-span-3">
              <h3 className="font-semibold text-lg">Submitter Information</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="font-medium text-muted-foreground">Principal Investigator</dt>
                <dd>
                    {piUser?.misId ? (
                        <Link href={`/profile/${piUser.misId}`} className="text-primary hover:underline" target="_blank">
                            {project.pi}
                        </Link>
                    ) : (
                        project.pi
                    )}
                </dd>
                <dt className="font-medium text-muted-foreground">Email</dt>
                <dd className="break-all">{project.pi_email || "N/A"}</dd>
                <dt className="font-medium text-muted-foreground">Phone</dt>
                <dd>{project.pi_phoneNumber || "N/A"}</dd>
                <dt className="font-medium text-muted-foreground">Faculty</dt>
                <dd>{project.faculty}</dd>
                <dt className="font-medium text-muted-foreground">Institute</dt>
                <dd>{project.institute}</dd>
                <dt className="font-medium text-muted-foreground">Department</dt>
                <dd>{project.departmentName}</dd>
                 <dt className="font-medium text-muted-foreground">Campus</dt>
                <dd>{piUser?.campus || 'N/A'}</dd>
                {(isAdmin || isSuperAdmin) && project.piCvUrl && (
                  <>
                    <dt className="font-medium text-muted-foreground">PI CV</dt>
                    <dd>
                      <Button asChild variant="link" className="p-0 h-auto">
                        <a href={project.piCvUrl} target="_blank" rel="noopener noreferrer">
                          View CV
                        </a>
                      </Button>
                    </dd>
                  </>
                )}
              </dl>
            </div>
          </div>
          {showBankDetails && piUser?.bankDetails && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2"><Banknote className="h-5 w-5" />Bank Details</h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <div className="grid grid-cols-2"><dt className="font-medium text-muted-foreground">Beneficiary Name</dt><dd>{piUser.bankDetails.beneficiaryName}</dd></div>
                    <div className="grid grid-cols-2"><dt className="font-medium text-muted-foreground">Account Number</dt><dd>{piUser.bankDetails.accountNumber}</dd></div>
                    <div className="grid grid-cols-2"><dt className="font-medium text-muted-foreground">Bank Name</dt><dd>{piUser.bankDetails.bankName}</dd></div>
                    <div className="grid grid-cols-2"><dt className="font-medium text-muted-foreground">IFSC Code</dt><dd>{piUser.bankDetails.ifscCode}</dd></div>
                    <div className="grid grid-cols-2"><dt className="font-medium text-muted-foreground">Branch</dt><dd>{piUser.bankDetails.branchName}</dd></div>
                  </dl>
                </div>
              </>
          )}
          <Separator />
          {(project.teamInfo || (project.coPiDetails && project.coPiDetails.length > 0) || canManageCoPi) && (
            <>
              <div className="space-y-4">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Team Information
                  </h3>
                  {canManageCoPi && project.status !== 'Not Recommended' && (
                      <Card className="bg-muted/50">
                          <CardHeader>
                              <CardTitle className="text-base">Manage Co-Investigators</CardTitle>
                              <CardDescription>Add or remove Co-PIs for this project.</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                              <div className="space-y-2">
                                  <Label>Search & Add Co-PI by MIS ID</Label>
                                  <div className="flex items-center gap-2">
                                      <Input placeholder="Search by Co-PI's MIS ID" value={coPiSearchTerm} onChange={(e) => setCoPiSearchTerm(e.target.value)} />
                                      <Button type="button" onClick={handleSearchCoPi} disabled={isSearching}>{isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}</Button>
                                  </div>
                                  {foundCoPi && (
                                      <div className="flex items-center justify-between p-2 border rounded-md">
                                          <p>{foundCoPi.name}</p>
                                          <Button type="button" size="sm" onClick={handleAddCoPi}>Add</Button>
                                      </div>
                                  )}
                              </div>
                              <div className="space-y-2">
                                  <Label>Current Co-PI(s)</Label>
                                  {coPiList.length > 0 ? (
                                      coPiList.map((coPi) => (
                                          <div key={coPi.uid} className="flex items-center justify-between p-2 bg-background rounded-md">
                                              <p className="text-sm font-medium">{coPi.name}</p>
                                              <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveCoPi(coPi.uid)}>Remove</Button>
                                          </div>
                                      ))
                                  ) : (
                                      <p className="text-sm text-muted-foreground">No Co-PIs added.</p>
                                  )}
                              </div>
                              <Button onClick={handleSaveCoPis} disabled={isSavingCoPis}>
                                  {isSavingCoPis && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Save Co-PI List
                              </Button>
                          </CardContent>
                      </Card>
                  )}
                   {project.coPiDetails && project.coPiDetails.length > 0 && (
                      <div className="space-y-2">
                          <h4 className="font-semibold text-base">Co-Principal Investigators:</h4>
                          <div className="space-y-2">
                              {project.coPiDetails.map((coPi, index) => {
                                  const coPiUser = coPiUsers.find(u => u.uid === coPi.uid);
                                  return (
                                      <div key={index} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                                          <div className="flex items-center gap-2">
                                              <span className="text-sm font-medium">
                                                  {coPiUser?.misId ? (
                                                      <Link href={`/profile/${coPiUser.misId}`} className="text-primary hover:underline" target="_blank">
                                                          {coPi.name}
                                                      </Link>
                                                  ) : (
                                                      coPi.name
                                                  )}
                                              </span>
                                          </div>
                                          {canViewCoPiCVs && coPi.cvUrl && (
                                              <Button variant="outline" size="sm" asChild>
                                                  <a href={coPi.cvUrl} target="_blank" rel="noopener noreferrer">
                                                      <FileText className="mr-2 h-4 w-4" />
                                                      View CV
                                                  </a>
                                              </Button>
                                          )}
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  )}
                  {project.teamInfo && <p className="text-muted-foreground whitespace-pre-wrap">{project.teamInfo}</p>}
              </div>
              <Separator />
            </>
          )}
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Timeline and Outcomes</h3>
            <p className="text-muted-foreground whitespace-pre-wrap">{project.timelineAndOutcomes}</p>
          </div>
          {canViewDocuments && (
            <>
              {(project.proposalUrl || project.ethicsUrl) && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Submitted Documents</h3>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {project.proposalUrl && (
                        <li>
                          <Button variant="link" asChild className="p-0 h-auto">
                            <a href={project.proposalUrl} target="_blank" rel="noopener noreferrer">
                              View Project Proposal
                            </a>
                          </Button>
                        </li>
                      )}
                      {project.ethicsUrl && (
                        <li>
                          <Button variant="link" asChild className="p-0 h-auto">
                            <a href={project.ethicsUrl} target="_blank" rel="noopener noreferrer">
                              View Ethics Approval
                            </a>
                          </Button>
                        </li>
                      )}
                    </ul>
                  </div>
                </>
              )}
              {project.revisedProposalUrl && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Revised Proposal</h3>
                    <p className="text-sm text-muted-foreground">
                      The following revised proposal was submitted on {formatDate(project.revisionSubmissionDate)}.
                    </p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      <li>
                        <Button variant="link" asChild className="p-0 h-auto">
                          <a href={project.revisedProposalUrl} target="_blank" rel="noopener noreferrer">
                            View Revised Proposal
                          </a>
                        </Button>
                      </li>
                    </ul>
                  </div>
                </>
              )}
              {project.completionReportUrl && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg">Completion Documents</h3>
                    <p className="text-sm text-muted-foreground">
                      The following documents were submitted on {formatDate(project.completionSubmissionDate)}.
                    </p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      <li>
                        <Button variant="link" asChild className="p-0 h-auto">
                          <a href={project.completionReportUrl} target="_blank" rel="noopener noreferrer">
                            Project outcome-cum-completion report
                          </a>
                        </Button>
                      </li>
                      {project.utilizationCertificateUrl && (
                        <li>
                          <Button variant="link" asChild className="p-0 h-auto">
                            <a href={project.utilizationCertificateUrl} target="_blank" rel="noopener noreferrer">
                              Utilization Certificate
                            </a>
                          </Button>
                        </li>
                      )}
                    </ul>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {canViewEvaluations && evaluations.length > 0 && user && (
          <EvaluationsSummary project={project} evaluations={evaluations} currentUser={user} />
      )}
      
      {showEvaluationForm && user && (
        <EvaluationForm 
          project={project} 
          user={user} 
          onEvaluationSubmitted={refetchEvaluations} 
          isEvaluationPeriodActive={isEvaluationPeriodActive}
        />
      )}

      {project.grant && user && canManageGrants && (
        <GrantManagement project={project} user={user} onUpdate={handleProjectUpdate} />
      )}


      <Dialog open={isRevisionCommentDialogOpen} onOpenChange={setIsRevisionCommentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provide Comments</DialogTitle>
            <DialogDescription>
              Please provide comments for the PI. This will be included in the email notification.
            </DialogDescription>
          </DialogHeader>
          <Form {...revisionCommentForm}>
            <form
              id="revision-comment-form"
              onSubmit={revisionCommentForm.handleSubmit(handleRevisionCommentSubmit)}
              className="py-4"
            >
              <FormField
                control={revisionCommentForm.control}
                name="comments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comments</FormLabel>
                    <FormControl>
                      <Textarea rows={5} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsRevisionCommentDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="revision-comment-form" disabled={isUpdating}>
              {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OfficeNotingDialog 
        isOpen={isNotingDialogOpen}
        onOpenChange={setIsNotingDialogOpen}
        onSubmit={handlePrint}
        isPrinting={isPrinting}
        form={notingForm}
      />
       <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <Form {...deleteProjectForm}>
              <form id="delete-project-form" onSubmit={deleteProjectForm.handleSubmit(handleDeleteProject)}>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the project and all its associated data, including evaluations and uploaded files. Please provide a reason for deletion.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <FormField
                    control={deleteProjectForm.control}
                    name="reason"
                    render={({ field }) => (
                      <FormItem>
                          <FormLabel>Reason for Deletion</FormLabel>
                          <FormControl><Textarea {...field} /></FormControl>
                          <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button type="submit" variant="destructive" disabled={isUpdating}>
                      {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Confirm & Delete
                    </Button>
                </AlertDialogFooter>
              </form>
            </Form>
          </AlertDialogContent>
      </AlertDialog>
       {isSuperAdmin && project.meetingDetails && (
        <AttendanceDialog
            isOpen={isAttendanceDialogOpen}
            onOpenChange={setIsAttendanceDialogOpen}
            project={project}
            allUsers={allUsers}
            onUpdate={refetchProject}
        />
      )}
    </React.Fragment>
  )
}

function AwardGrantForm({ form, onSubmit, isAwarding }: { form: any, onSubmit: (values: z.infer<typeof awardGrantSchema>) => void, isAwarding: boolean }) {
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "phases",
    });

    return (
        <Form {...form}>
            <form id="award-grant-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                <FormField name="sanctionNumber" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Project Sanction Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )} />
                <FormField name="totalAmount" control={form.control} render={({ field }) => ( <FormItem><FormLabel>Total Sanctioned Amount (₹)</FormLabel><FormControl><Input type="number" {...field} min="0" onWheel={(e) => (e.target as HTMLElement).blur()} /></FormControl><FormMessage /></FormItem> )} />
                
                <Separator />
                <Label>Phase-wise Grant Amounts</Label>

                {fields.map((field, index) => (
                    <div key={field.id} className="p-3 border rounded-md space-y-3">
                         <h4 className="font-semibold text-sm">{form.getValues(`phases.${index}.name`)}</h4>
                         <FormField control={form.control} name={`phases.${index}.amount`} render={({ field }) => ( <FormItem><FormLabel>Amount (₹)</FormLabel><FormControl><Input type="number" {...field} min="0" onWheel={(e) => (e.target as HTMLElement).blur()} /></FormControl><FormMessage /></FormItem> )} />
                         {fields.length > 1 && (<Button type="button" variant="destructive" size="sm" onClick={() => remove(index)}>Remove Phase</Button>)}
                    </div>
                ))}
                 {fields.length < 5 && (
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => append({ name: `Phase ${fields.length + 1}`, amount: 0 })}>
                        <Plus className="mr-2 h-4 w-4" /> Add Phase
                    </Button>
                )}
            </form>
             <DialogFooter className="mt-4">
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button type="submit" form="award-grant-form" disabled={isAwarding}>
                    {isAwarding ? 'Processing...' : 'Save & Download'}
                </Button>
            </DialogFooter>
        </Form>
    );
}


function OfficeNotingDialog({ isOpen, onOpenChange, onSubmit, isPrinting, form }: { isOpen: boolean, onOpenChange: (open: boolean) => void, onSubmit: (data: NotingFormData) => void, isPrinting: boolean, form: any }) {
    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: "phases",
    });

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Generate Office Notings Form</DialogTitle>
                    <DialogDescription>Please provide the project duration and phase-wise grant amounts before downloading.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form id="noting-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                        <FormField control={form.control} name="projectDuration" render={({ field }) => (
                            <FormItem><FormLabel>Project Duration</FormLabel><FormControl><Input {...field} placeholder="e.g., 2 Years" /></FormControl><FormMessage /></FormItem>
                        )} />
                        <div>
                            <Label>Phase-wise Grant Amount</Label>
                            <div className="space-y-2 mt-2">
                                {fields.map((field: any, index: number) => (
                                    <div key={field.id} className="flex items-center gap-2">
                                        <FormField control={form.control} name={`phases.${index}.name`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input {...field} placeholder={`Phase ${index + 1} Name`} /></FormControl><FormMessage /></FormItem> )} />
                                        <FormField control={form.control} name={`phases.${index}.amount`} render={({ field }) => ( <FormItem className="flex-1"><FormControl><Input type="number" {...field} min="0" onWheel={(e) => (e.target as HTMLElement).blur()} placeholder="Amount" /></FormControl><FormMessage /></FormItem> )} />
                                        {fields.length > 1 && (<Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}><X className="h-4 w-4" /></Button>)}
                                    </div>
                                ))}
                            </div>
                            {fields.length < 5 && (
                                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => append({ name: `Phase ${fields.length + 1}`, amount: 0 })}>
                                    <Plus className="mr-2 h-4 w-4" /> Add Phase
                                </Button>
                            )}
                        </div>
                    </form>
                </Form>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" form="noting-form" disabled={isPrinting}>
                        {isPrinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Save & Download
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
