
"use client"

import type React from "react"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import Image from "next/image"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import {
  Award,
  Bell,
  Book,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  FilePlus2,
  GanttChartSquare,
  Home,
  LineChart,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  History,
  Calendar,
  NotebookPen,
  GripVertical,
  Save,
  Loader2,
  Briefcase,
  BookUp,
  MessageCircle,
  BookOpenCheck,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { UserNav } from "@/components/user-nav"
import { ThemeToggle } from "@/components/theme-toggle"
import { Logo } from "@/components/logo"
import type { User, SystemSettings } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { auth, db } from "@/lib/config"
import { signOut, onAuthStateChanged, type User as FirebaseUser } from "firebase/auth"
import { useToast } from "@/hooks/use-toast"
import { collection, onSnapshot, query, where, doc, getDoc, setDoc } from "firebase/firestore"
import { getDefaultModulesForRole } from "@/lib/modules"
import { saveSidebarOrder, getSystemSettings, isEmailDomainAllowed, linkHistoricalData, linkPapersToNewUser, linkEmrInterestsToNewUser, linkEmrCoPiInterestsToNewUser } from "@/app/server-actions"
import { TutorialDialog } from "@/components/tutorial-dialog"
import { HelpDialog } from "@/components/help-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { subMonths, differenceInDays } from 'date-fns'


interface NavItem {
  id: string
  href: string
  tooltip: string
  icon: React.ElementType
  label: string
  badge?: number
  condition?: boolean
}

const SortableSidebarMenuItem = ({ item }: { item: NavItem }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const pathname = usePathname()
  const isActive = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href)

  return (
    <SidebarMenuItem ref={setNodeRef} style={style} {...attributes}>
      <SidebarMenuButton href={item.href} tooltip={item.tooltip} isActive={isActive}>
        <div {...listeners} className="cursor-grab p-1 -ml-1">
          <GripVertical className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <item.icon />
        <span>{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
            {item.badge}
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingMeetingsCount, setPendingMeetingsCount] = useState(0)
  const [pendingIncentiveApprovalsCount, setPendingIncentiveApprovalsCount] = useState(0)
  const [pendingBankClaimsCount, setPendingBankClaimsCount] = useState(0)
  const [menuItems, setMenuItems] = useState<NavItem[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [isPostSetupDialogOpen, setIsPostSetupDialogOpen] = useState(false)
  const [linkedProjectsCount, setLinkedProjectsCount] = useState({ imr: 0, emr: 0 })
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()

  const isRearrangeEnabled = user?.role === "Super-admin" || user?.role === "admin" || user?.role === "CRO"

  const allNavItems = useMemo(
    (): NavItem[] => [
      { id: "dashboard", href: "/dashboard", tooltip: "Dashboard", icon: Home, label: "Dashboard", condition: true },
      { id: "ai-chat", href: "/dashboard/ai-chat", tooltip: "AI Chat", icon: MessageCircle, label: "AI Chat Agent" },
      {
        id: "new-submission",
        href: "/dashboard/new-submission",
        tooltip: "New Submission",
        icon: FilePlus2,
        label: "New Submission",
      },
      { id: "my-projects", href: "/dashboard/my-projects", tooltip: "My Projects", icon: Book, label: "My Projects" },
      {
        id: "emr-calendar",
        href: "/dashboard/emr-calendar",
        tooltip: "EMR Calendar",
        icon: Calendar,
        label: "EMR Calendar",
      },
      {
        id: "incentive-claim",
        href: "/dashboard/incentive-claim",
        tooltip: "Incentive Claims",
        icon: Award,
        label: "Incentive Claims",
      },
      {
        id: "incentive-approvals",
        href: "/dashboard/incentive-approvals",
        tooltip: "Incentive Approvals",
        icon: NotebookPen,
        label: "Incentive Approvals",
        badge: pendingIncentiveApprovalsCount,
      },
      {
        id: "evaluator-dashboard",
        href: "/dashboard/evaluator-dashboard",
        tooltip: "Evaluation Queue",
        icon: ClipboardCheck,
        label: "Evaluation Queue",
      },
      {
        id: "my-evaluations",
        href: "/dashboard/my-evaluations",
        tooltip: "My Evaluations",
        icon: History,
        label: "My IMR Evaluations",
      },
      {
        id: "emr-evaluations",
        href: "/dashboard/emr-evaluations",
        tooltip: "EMR Evaluations",
        icon: FileCheck2,
        label: "EMR Evaluations",
      },
      {
        id: "schedule-meeting",
        href: "/dashboard/schedule-meeting",
        tooltip: "Schedule Meeting",
        icon: CalendarClock,
        label: "Schedule Meeting",
        badge: pendingMeetingsCount,
      },
      {
        id: "pending-reviews",
        href: "/dashboard/pending-reviews",
        tooltip: "Pending Reviews",
        icon: GanttChartSquare,
        label: "Pending Reviews",
      },
      {
        id: "completed-reviews",
        href: "/dashboard/completed-reviews",
        tooltip: "Completed Reviews",
        icon: FileCheck2,
        label: "Completed Reviews",
      },
      {
        id: "all-projects",
        href: "/dashboard/all-projects",
        tooltip: "All Projects",
        icon: Book,
        label: "All Projects",
      },
      {
        id: "emr-management",
        href: "/dashboard/emr-management",
        tooltip: "EMR Management",
        icon: Briefcase,
        label: "EMR Management",
      },
      { id: "analytics", href: "/dashboard/analytics", tooltip: "Analytics", icon: LineChart, label: "Analytics" },
      {
        id: "manage-users",
        href: "/dashboard/manage-users",
        tooltip: "Manage Users",
        icon: Users,
        label: "Manage Users",
      },
      {
        id: "manage-incentive-claims",
        href: "/dashboard/manage-incentive-claims",
        tooltip: "Manage Incentive Claims",
        icon: Award,
        label: "Manage Claims",
        badge: pendingBankClaimsCount,
      },
      {
        id: "bulk-upload",
        href: "/dashboard/bulk-upload",
        tooltip: "Bulk Upload Projects",
        icon: Upload,
        label: "Bulk Upload Projects",
      },
      {
        id: "bulk-upload-papers",
        href: "/dashboard/bulk-upload-papers",
        tooltip: "Bulk Upload Papers",
        icon: BookUp,
        label: "Bulk Upload Papers",
      },
      {
        id: "bulk-upload-emr",
        href: "/dashboard/bulk-upload-emr",
        tooltip: "Bulk Upload EMR",
        icon: Upload,
        label: "Bulk Upload EMR",
      },
      {
        id: "bulk-upload-incentives",
        href: "/dashboard/bulk-upload-incentives",
        tooltip: "Bulk Upload Incentives",
        icon: Upload,
        label: "Bulk Upload Incentives",
      },
      {
        id: "module-management",
        href: "/dashboard/module-management",
        tooltip: "Module Management",
        icon: ShieldCheck,
        label: "Module Management",
      },
      {
        id: "notifications",
        href: "/dashboard/notifications",
        tooltip: "Notifications",
        icon: Bell,
        label: "Notifications",
        badge: unreadCount,
        condition: true,
      },
      {
        id: "settings",
        href: "/dashboard/settings",
        tooltip: "Settings",
        icon: Settings,
        label: "Settings",
        condition: true,
      },
    ],
    [unreadCount, pendingMeetingsCount, pendingIncentiveApprovalsCount, pendingBankClaimsCount],
  )

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined
    
    const fetchUserProfile = async (firebaseUser: FirebaseUser) => {
      const userDocRef = doc(db, "users", firebaseUser.uid)
      const userDocSnap = await getDoc(userDocRef)

      if (userDocSnap.exists()) {
        const appUser = { uid: firebaseUser.uid, ...userDocSnap.data() } as User

        if (!appUser.profileComplete) {
          router.replace("/profile-setup")
          return
        }

        if (!appUser.allowedModules || appUser.allowedModules.length === 0) {
          appUser.allowedModules = getDefaultModulesForRole(appUser.role, appUser.designation)
        }

        const isPrincipal = appUser.designation === "Principal"
        const isHod = appUser.designation === "HOD"

        if (isPrincipal || isHod) {
          if (!appUser.allowedModules.includes("all-projects")) {
            appUser.allowedModules.push("all-projects")
          }
        }

        const postSetupInfo = sessionStorage.getItem("postSetupInfo")
        if (postSetupInfo) {
          const { imr, emr } = JSON.parse(postSetupInfo)
          if (imr > 0 || emr > 0) {
            setLinkedProjectsCount({ imr, emr })
            setIsPostSetupDialogOpen(true)
          }
          sessionStorage.removeItem("postSetupInfo")
        }

        setUser(appUser)
        localStorage.setItem("user", JSON.stringify(appUser))
        setLoading(false)
      } else {
        // If user document does not exist after login, create it and redirect to profile setup.
        try {
            console.log("User document not found for authenticated user. Creating profile...");
            const staffRes = await fetch(\`/api/get-staff-data?email=\${firebaseUser.email!}\`);
            const staffResult = await staffRes.json();

            let userDataFromExcel: Partial<User> = {};
            let role: User["role"] = "faculty";
            let designation: User["designation"] = "faculty";
            let profileComplete = false;

            const domainCheck = await isEmailDomainAllowed(firebaseUser.email!);

            if (staffResult.success && staffResult.data && staffResult.data.length > 0) {
                userDataFromExcel = staffResult.data[0];
                const userType = staffResult.data[0].type;

                if (userType === "CRO") {
                    role = "CRO";
                    designation = "CRO";
                    profileComplete = true;
                } else if (userType === "Institutional") {
                    role = "faculty";
                    designation = "Principal";
                    profileComplete = true;
                }
            } else if (domainCheck.isCro) {
                role = "CRO";
                designation = "CRO";
                profileComplete = true;
            }

            const newUser: User = {
                uid: firebaseUser.uid,
                name: userDataFromExcel.name || firebaseUser.displayName || firebaseUser.email!.split("@")[0],
                email: firebaseUser.email!,
                role,
                designation,
                campus: 'Goa',
                faculty: userDataFromExcel.faculty || domainCheck.croFaculty || '',
                institute: userDataFromExcel.institute || '',
                department: userDataFromExcel.department || '',
                phoneNumber: userDataFromExcel.phoneNumber || '',
                misId: userDataFromExcel.misId || '',
                profileComplete,
                allowedModules: getDefaultModulesForRole(role, designation),
                hasCompletedTutorial: false,
                photoURL: firebaseUser.photoURL || '',
            };

            await setDoc(userDocRef, newUser, { merge: true });

            localStorage.setItem("user", JSON.stringify(newUser));
            
            // Link historical data
            const { count: imrCount } = await linkHistoricalData(newUser);
            const { count: emrCount } = await linkEmrInterestsToNewUser(newUser.uid, newUser.email);
            await linkPapersToNewUser(newUser.uid, newUser.email);
            await linkEmrCoPiInterestsToNewUser(newUser.uid, newUser.email);

            if (imrCount > 0 || emrCount > 0) {
                sessionStorage.setItem('postSetupInfo', JSON.stringify({ imr: imrCount, emr: emrCount }));
            }
            
            toast({
                title: "Welcome!",
                description: "Your user profile has been created. Please complete your setup.",
            });
            router.replace("/profile-setup");

        } catch (error: any) {
            console.error("Failed to create user profile on-the-fly:", error);
            toast({
                variant: "destructive",
                title: "Authentication Error",
                description: "There was a problem setting up your user profile. Please try signing in again.",
            });
            signOut(auth);
            setLoading(false);
        }
      }
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (unsubscribeProfile) unsubscribeProfile()

      if (firebaseUser) {
        fetchUserProfile(firebaseUser)
      } else {
        // This is the key change: ensure all state is reset on logout
        setUser(null)
        setMenuItems([])
        setUnreadCount(0)
        setPendingMeetingsCount(0)
        setPendingIncentiveApprovalsCount(0)
        setPendingBankClaimsCount(0)
        localStorage.removeItem("user")
        sessionStorage.clear()
        router.replace("/login")
        setLoading(false)
      }
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeProfile) unsubscribeProfile()
    }
  }, [router, toast])


  useEffect(() => {
    if (user) {
      // Update activity timestamp on every dashboard load
      localStorage.setItem('lastActivity', Date.now().toString());

      const filtered = allNavItems.filter((item) => {
        if (item.condition) return true;
        if (item.id === "incentive-approvals") {
          return user.designation === 'Principal' || user.allowedModules?.some((m) => m.startsWith("incentive-approver-"));
        }
        return user.allowedModules?.includes(item.id);
      })
      const sorted = user.sidebarOrder
        ? filtered.sort((a, b) => user.sidebarOrder!.indexOf(a.id) - user.sidebarOrder!.indexOf(b.id))
        : filtered

      setMenuItems(sorted)
    }
  }, [user, allNavItems]);

  useEffect(() => {
    if (!user) return

    const unsubscribes: (() => void)[] = []

    // Notifications listener
    const notificationsQuery = query(collection(db, "notifications"), where("uid", "==", user.uid))
    unsubscribes.push(
      onSnapshot(notificationsQuery, (snapshot) => {
        const unread = snapshot.docs.filter((doc) => !doc.data().isRead).length
        setUnreadCount(unread)
      }),
    )

    // Pending Meetings listener (for admins)
    if (user.allowedModules?.includes("schedule-meeting")) {
      let unsubscribeNew: () => void;
      let unsubscribeMidTerm: () => void;

      const fetchSettingsAndSubscribe = async () => {
        const settings: SystemSettings = await getSystemSettings();
        const reviewMonths = settings?.imrMidTermReviewMonths ?? 6;
        const thresholdDate = subMonths(new Date(), reviewMonths);

        const newSubmissionsQuery = query(collection(db, "projects"), where("status", "==", "Submitted"));
        const midTermQuery = query(
          collection(db, "projects"), 
          where('status', '==', 'In Progress'),
          where('grant.phases.0.disbursementDate', '<=', thresholdDate.toISOString())
        );

        let newCount = 0;
        let midTermCount = 0;

        const updateTotal = () => {
          setPendingMeetingsCount(newCount + midTermCount);
        };

        unsubscribeNew = onSnapshot(newSubmissionsQuery, (snapshot) => {
          newCount = snapshot.size;
          updateTotal();
        });

        unsubscribeMidTerm = onSnapshot(midTermQuery, (snapshot) => {
            midTermCount = snapshot.docs.filter(doc => {
                const project = doc.data();
                // Additional client-side check if needed, though Firestore should handle it
                const firstDisbursement = project.grant?.phases?.[0]?.disbursementDate;
                return firstDisbursement && new Date(firstDisbursement) <= thresholdDate;
            }).length;
            updateTotal();
        });

        unsubscribes.push(unsubscribeNew, unsubscribeMidTerm);
      };

      fetchSettingsAndSubscribe();
    }

    // Incentive Approvals listener
    if (user.designation === 'Principal' && user.institute) {
        const incentiveQuery = query(
          collection(db, "incentiveClaims"), 
          where("status", "==", "Pending Principal Approval"),
          where('institute', '==', user.institute),
        );
        unsubscribes.push(
            onSnapshot(incentiveQuery, (snapshot) => {
                setPendingIncentiveApprovalsCount(snapshot.size);
            })
        );
    } else {
        const approverModule = user.allowedModules?.find((m) => m.startsWith("incentive-approver-"))
        if (approverModule) {
          const stage = Number.parseInt(approverModule.split("-")[2], 10)
          const statusToFetch = \`Pending Stage \${stage} Approval\`
          const incentiveQuery = query(collection(db, "incentiveClaims"), where("status", "==", statusToFetch))
          unsubscribes.push(
            onSnapshot(incentiveQuery, (snapshot) => {
              setPendingIncentiveApprovalsCount(snapshot.size)
            }),
          )
        }
    }


    // Pending Bank Claims listener (for admins)
    if (user.allowedModules?.includes("manage-incentive-claims")) {
      const bankClaimsQuery = query(
        collection(db, "incentiveClaims"),
        where("status", "in", ["Accepted", "Submitted to Accounts"]),
      )
      unsubscribes.push(
        onSnapshot(bankClaimsQuery, (snapshot) => {
          setPendingBankClaimsCount(snapshot.size)
        }),
      )
    }

    return () => unsubscribes.forEach((unsub) => unsub())
  }, [user])

  const handleLogout = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error("Logout error:", error)
      toast({
        variant: "destructive",
        title: "Logout Failed",
        description: "An error occurred during logout. Please try again.",
      })
    }
  }

  const attemptLogout = () => {
    if (sessionStorage.getItem("chatSessionActive")) {
      setIsLogoutConfirmOpen(true)
    } else {
      handleLogout()
    }
  }

  const getPageTitle = () => {
    const segments = pathname.split("/")
    const lastSegment = segments.pop() || "dashboard"

    if (pathname.includes("/dashboard/project/")) return "Project Details"
    if (pathname.includes("/dashboard/incentive-claim")) return "Incentive Claims"
    if (pathname.includes("/dashboard/manage-incentive-claims")) return "Manage Incentive Claims"
    if (pathname.includes("/dashboard/emr-management")) return "EMR Management"
    if (pathname.includes("/dashboard/emr-calendar")) return "EMR Calendar"
    if (pathname.includes("/dashboard/profile-setup")) return "Profile Setup"

    if (lastSegment === "dashboard") return "Dashboard"
    return lastSegment.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setMenuItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
      setIsDirty(true)
    }
  }

  const handleSaveOrder = async () => {
    if (!user) return
    setIsSaving(true)
    const newOrder = menuItems.map((item) => item.id)
    const result = await saveSidebarOrder(user.uid, newOrder)
    if (result.success) {
      toast({ title: "Success", description: "Your sidebar layout has been saved." })
      setIsDirty(false)
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error })
    }
    setIsSaving(false)
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden md:block md:w-64 bg-card border-r p-4">
          <div className="flex items-center h-10 mb-8">
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
        <div className="flex-1">
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6">
            <Skeleton className="h-8 w-48" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-9 w-9 rounded-md" />
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
          </header>
          <main className="p-6">
            <Skeleton className="h-[calc(100vh-10rem)] w-full" />
          </main>
        </div>
      </div>
    )
  }

  return (
    <>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <Logo variant="dashboard" />
          </SidebarHeader>
          <SidebarContent>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={menuItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <SidebarMenu>
                  {menuItems.map((item) =>
                    isRearrangeEnabled ? (
                      <SortableSidebarMenuItem key={item.id} item={item} />
                    ) : (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          href={item.href}
                          tooltip={item.tooltip}
                          isActive={
                            item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href)
                          }
                        >
                          <item.icon />
                          <span>{item.label}</span>
                          {item.badge !== undefined && item.badge > 0 && (
                            <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
                              {item.badge}
                            </span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ),
                  )}
                </SidebarMenu>
              </SortableContext>
            </DndContext>
          </SidebarContent>
          <SidebarFooter className="hidden md:flex mt-auto group-data-[collapsible=icon]:hidden">
            <Image
              src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/PU-WATERMARK.svg"
              alt="Parul University Goa Logo"
              width={150}
              height={50}
              className="mx-auto"
              style={{ height: "auto" }}
            />
          </SidebarFooter>
          {isRearrangeEnabled && isDirty && (
            <SidebarHeader>
              <Button onClick={handleSaveOrder} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Order
              </Button>
            </SidebarHeader>
          )}
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="md:hidden" />
              <h1 className="text-xl font-semibold">{getPageTitle()}</h1>
            </div>
            <div className="flex items-center gap-2">
              <TutorialDialog user={user} />
              <HelpDialog />
              <ThemeToggle />
              <UserNav user={user} onLogout={attemptLogout} />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto sm:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <AlertDialog open={isLogoutConfirmOpen} onOpenChange={setIsLogoutConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
            <AlertDialogDescription>
              Logging out will permanently delete your current AI chat history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>Log Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isPostSetupDialogOpen} onOpenChange={setIsPostSetupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Projects Linked to Your Account</AlertDialogTitle>
            <AlertDialogDescription>
              We found some existing projects where you were listed as an investigator. They have been automatically
              linked to your new account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            {linkedProjectsCount.imr > 0 && <p>{linkedProjectsCount.imr} IMR project(s) linked.</p>}
            {linkedProjectsCount.emr > 0 && <p>{linkedProjectsCount.emr} EMR project(s) linked.</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIsPostSetupDialogOpen(false)}>Great!</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
`

const signupFix = `
"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Logo } from "@/components/logo"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { auth, db } from "@/lib/config"
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
  type User as FirebaseUser,
  onAuthStateChanged,
} from "firebase/auth"
import { doc, getDoc, setDoc } from "firebase/firestore"
import type { User, SystemSettings } from "@/types"
import { useState, useEffect, useCallback } from "react"
import { getDefaultModulesForRole } from "@/lib/modules"
import {
  linkHistoricalData,
  notifySuperAdminsOnNewUser,
  linkPapersToNewUser,
  linkEmrInterestsToNewUser,
  isEmailDomainAllowed,
  linkEmrCoPiInterestsToNewUser,
  getSystemSettings,
} from "@/app/server-actions"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { useTheme } from "next-themes"
import Script from "next/script"

const signupSchema = z
  .object({
    email: z.string().email("Invalid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

type SignupFormValues = z.infer<typeof signupSchema>

export default function SignupPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { theme } = useTheme()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(true);
  const [authSettings, setAuthSettings] = useState<SystemSettings['authMethods']>({ email: true, google: true });
  const [googleClientId, setGoogleClientId] = useState<string | null>(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const processNewUser = async (firebaseUser: Partial<FirebaseUser> & { uid: string; email: string; }) => {
    const userDocRef = doc(db, "users", firebaseUser.uid)
    const userDocSnap = await getDoc(userDocRef)

    if (userDocSnap.exists()) {
      toast({
        title: "Account Exists",
        description: "This email is already registered. Please sign in.",
      })
      await signOut(auth)
      router.push("/login")
      return
    }

    const domainCheck = await isEmailDomainAllowed(firebaseUser.email!)
    const staffRes = await fetch(\`/api/get-staff-data?email=\${firebaseUser.email!}\`)
    const staffResult = await staffRes.json()

    let userDataFromExcel: Partial<User> = {}
    let role: User["role"] = "faculty"
    let designation: User["designation"] = "faculty"
    let profileComplete = false
    let notifyRole: string | null = null
    let campus: User['campus'] = 'Goa';


    if (firebaseUser.email === "vicepresident_86@paruluniversity.ac.in") {
      role = "Super-admin"
      designation = "Super-admin"
      profileComplete = true
      notifyRole = "Super-admin"
    } else if (staffResult.success && staffResult.data.length > 0) {
      const userData = staffResult.data[0];
      userDataFromExcel = userData
      const userType = userData.type
      campus = userData.campus || campus

      if (userType === "CRO") {
        role = "CRO"
        designation = "CRO"
        profileComplete = true
        notifyRole = "CRO"
      } else if (userType === "Institutional") {
        role = "faculty"
        designation = "Principal"
        profileComplete = true
        notifyRole = "Principal"
      }
    } else if (domainCheck.isCro) {
      role = "CRO"
      designation = "CRO"
      profileComplete = true
      notifyRole = "CRO"
    }

    const user: User = {
      uid: firebaseUser.uid,
      name: userDataFromExcel.name || firebaseUser.displayName || firebaseUser.email!.split("@")[0],
      email: firebaseUser.email!,
      role,
      designation,
      campus,
      faculty: userDataFromExcel.faculty || domainCheck.croFaculty || '',
      institute: userDataFromExcel.institute || '',
      department: userDataFromExcel.department || '',
      phoneNumber: userDataFromExcel.phoneNumber || '',
      misId: userDataFromExcel.misId || '',
      profileComplete,
      allowedModules: getDefaultModulesForRole(role, designation),
      hasCompletedTutorial: false,
      photoURL: firebaseUser.photoURL || '',
    }

    if (firebaseUser.photoURL) {
      user.photoURL = firebaseUser.photoURL
    }

    await setDoc(userDocRef, user, { merge: true })

    if (notifyRole) {
      await notifySuperAdminsOnNewUser(user.name, notifyRole)
    }

    try {
      const historicalResult = await linkHistoricalData(user)
      if (historicalResult.success && historicalResult.count > 0) {
        console.log(\`Successfully linked \${historicalResult.count} historical IMR projects for new user \${user.email}.\`)
      }

      const paperResult = await linkPapersToNewUser(user.uid, user.email)
      if (paperResult.success && paperResult.count > 0) {
        console.log(\`Successfully linked \${paperResult.count} research papers for new user \${user.email}.\`)
      }

      const emrInterestResult = await linkEmrInterestsToNewUser(user.uid, user.email)
      if (emrInterestResult.success && emrInterestResult.count > 0) {
        console.log(\`Successfully linked \${emrInterestResult.count} EMR interests for new user \${user.email}.\`)
      }
      
      const emrCoPiResult = await linkEmrCoPiInterestsToNewUser(user.uid, user.email);
      if (emrCoPiResult.success && emrCoPiResult.count > 0) {
        console.log(\`Successfully linked \${emrCoPiResult.count} EMR Co-PI interests for new user \${user.email}.\`);
      }

    } catch (e) {
      console.error("Error calling linking actions:", e)
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(user))
    }

    if (user.profileComplete) {
      toast({
        title: "Account Created",
        description: "Welcome! Redirecting to your dashboard.",
      })
      router.push("/dashboard")
    } else {
      toast({
        title: "Account Created",
        description: "Let's complete your profile to continue.",
      })
      router.push("/profile-setup")
    }
  }

  // Define handleCredentialResponse using useCallback so it can be used in useEffect
  const handleCredentialResponse = useCallback(async (response: any) => {
    setIsSubmitting(true);
    try {
      // Exchange Google credential for Firebase credential
      const credential = GoogleAuthProvider.credential(response.credential);
      const userCredential = await signInWithCredential(auth, credential);
      await processNewUser(userCredential.user);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign Up Failed",
        description: error.message || "Could not sign up with Google. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [toast]);

  useEffect(() => {
    const checkAuthAndSettings = async () => {
        const settings = await getSystemSettings();
        setAuthSettings({ email: true, google: true, ...settings.authMethods });
        
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          if (user) {
            router.replace('/dashboard');
          } else {
            setLoading(false);
          }
        });
        return () => unsubscribe();
    };

    checkAuthAndSettings();

    if (!googleClientId) return;

    // Initialize Google Sign-In (script is loaded globally by AuthInitializer)
    const initializeGoogleSignIn = async () => {
      // Wait for Google script to load
      let attempts = 0;
      while (!window.google && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.google) {
        console.error('Google Sign-In script failed to load');
        return;
      }

      try {
        // Use global GSI helper
        // @ts-ignore
        if (window.__gsi) {
          console.debug('[GSI] signup page calling __gsi.init', { googleClientId, hasGsi: !!window.__gsi });
          // @ts-ignore
          window.__gsi.init(googleClientId);
          // @ts-ignore
          window.__gsi.setCallback(handleCredentialResponse);
          // @ts-ignore
          window.__gsi.promptSafe();
        } else {
          console.error('GSI helper not available on window.');
        }
      } catch (error) {
        console.error('Failed to initialize or use GSI helper:', error);
      }
    };

    initializeGoogleSignIn();
  }, [router, toast, googleClientId, handleCredentialResponse]);

  const validateEmailDomain = async (email: string): Promise<boolean> => {
    if (email === "rathipranav07@gmail.com" || email === "vicepresident_86@paruluniversity.ac.in") {
      return true
    }

    if (/^\\d+$/.test(email.split("@")[0])) {
      return false
    }

    const domainCheck = await isEmailDomainAllowed(email)
    return domainCheck.allowed
  }

  const onEmailSubmit = async (data: SignupFormValues) => {
    setIsSubmitting(true)
    try {
      const isValidDomain = await validateEmailDomain(data.email)
      if (!isValidDomain) {
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "This email domain is not authorized for portal access, or student accounts are not permitted.",
        })
        setIsSubmitting(false)
        return
      }

      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password)
      await processNewUser(userCredential.user)
    } catch (error: any) {
      console.error("Signup Error:", error)
      toast({
        variant: "destructive",
        title: "Sign Up Failed",
        description:
          error.code === "auth/email-already-in-use"
            ? "This email is already registered."
            : error.message || "An unknown error occurred.",
      })
      setIsSubmitting(false)
    }
  }
  
  if (loading) {
    return (
        <div className="flex flex-col min-h-screen items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    )
  }
  
  const showEmailForm = authSettings.email !== false;
  const showGoogleButton = authSettings.google !== false && googleClientId;
  const showSeparator = showEmailForm && showGoogleButton;


  return (
    <>
    <Script src="https://accounts.google.com/gsi/client" async defer />
    <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
      <main className="flex-1 flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <div className="w-full max-w-md">
          <Card className="shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-6 flex justify-center">
                <Logo />
              </div>
              <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
              <CardDescription>Join the Parul University Goa Research Projects Portal.</CardDescription>
            </CardHeader>
            <CardContent>
              {showEmailForm && (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onEmailSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>University Email</FormLabel>
                          <FormControl>
                            <Input placeholder="your.name@paruluniversity.ac.in" {...field} disabled={isSubmitting} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showPassword ? "text" : "password"}
                                placeholder="••••••••"
                                {...field}
                                disabled={isSubmitting}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="••••••••"
                                {...field}
                                disabled={isSubmitting}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              >
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Creating Account..." : "Sign Up with Email"}
                    </Button>
                  </form>
                </Form>
              )}
               {showSeparator && (
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>
              )}
              
               {showGoogleButton && (
                    <div
                        id="g_id_onload"
                        data-client_id={googleClientId}
                        data-context="signup"
                        data-login_uri={\`\${process.env.NEXT_PUBLIC_BASE_URL}/login\`}
                        data-callback="handleCredentialResponse"
                        data-itp_support="true"
                    ></div>
                )}
               {!showEmailForm && !showGoogleButton && (
                  <div className="text-center text-muted-foreground p-4 border rounded-md">
                      Sign-up is temporarily disabled. Please contact an administrator.
                  </div>
              )}
            </CardContent>
            <CardFooter className="justify-center text-sm">
              <p className="text-muted-foreground">Already have an account?&nbsp;</p>
              <Link href="/login" passHref>
                <Button variant="link" className="p-0 h-auto">
                  Sign In
                </Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Parul University Goa. All rights reserved.
        </p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4" href="/help">
            Help
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="/terms-of-use">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4" href="/privacy-policy">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
    </>
  )
}
`

        // I will return both changes.
        return [
            {
                file: 'src/app/dashboard/layout.tsx',
                content: newLayoutTsx
            },
            {
                file: 'src/app/signup/page.tsx',
                content: correctSignupPage
            }
        ]

    } catch (e) {
        console.error(e)
    }
    return []
}You are right, that's a frustrating user experience. My apologies for that oversight. If a user is authenticated but their profile document doesn't exist in Firestore, they should be treated as a new user and guided to the profile setup page, not logged out.

I will fix this by changing the logic in the main dashboard layout. When an authenticated user without a profile is detected, the system will now:
1.  Automatically create a basic user document in Firestore for them.
2.  Redirect them to the `/profile-setup` page to complete their information.

This ensures a seamless onboarding flow even if their database record was delayed or missing. I've also included a small bug fix for the sign-up page to ensure it correctly reads data from the staff information file.

Here are the changes:
<changes>
  <description>Updated the dashboard layout to handle authenticated users who are missing a Firestore profile by creating a new profile and redirecting them to the setup page instead of logging them out. Also fixed a data handling bug on the signup page.</description>
  <change>
    <file>src/app/dashboard/layout.tsx</file>
    <content><![CDATA[
"use client"

import type React from "react"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import Image from "next/image"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import {
  Award,
  Bell,
  Book,
  CalendarClock,
  ClipboardCheck,
  FileCheck2,
  FilePlus2,
  GanttChartSquare,
  Home,
  LineChart,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  History,
  Calendar,
  NotebookPen,
  GripVertical,
  Save,
  Loader2,
  Briefcase,
  BookUp,
  MessageCircle,
  BookOpenCheck,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { UserNav } from "@/components/user-nav"
import { ThemeToggle } from "@/components/theme-toggle"
import { Logo } from "@/components/logo"
import type { User, SystemSettings } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { auth, db } from "@/lib/config"
import { signOut, onAuthStateChanged, type User as FirebaseUser } from "firebase/auth"
import { useToast } from "@/hooks/use-toast"
import { collection, onSnapshot, query, where, doc, getDoc, setDoc } from "firebase/firestore"
import { getDefaultModulesForRole } from "@/lib/modules"
import { saveSidebarOrder, getSystemSettings, isEmailDomainAllowed, linkHistoricalData, linkPapersToNewUser, linkEmrInterestsToNewUser, linkEmrCoPiInterestsToNewUser } from "@/app/server-actions"
import { TutorialDialog } from "@/components/tutorial-dialog"
import { HelpDialog } from "@/components/help-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { subMonths, differenceInDays } from 'date-fns'


interface NavItem {
  id: string
  href: string
  tooltip: string
  icon: React.ElementType
  label: string
  badge?: number
  condition?: boolean
}

const SortableSidebarMenuItem = ({ item }: { item: NavItem }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const pathname = usePathname()
  const isActive = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href)

  return (
    <SidebarMenuItem ref={setNodeRef} style={style} {...attributes}>
      <SidebarMenuButton href={item.href} tooltip={item.tooltip} isActive={isActive}>
        <div {...listeners} className="cursor-grab p-1 -ml-1">
          <GripVertical className="h-4 w-4 text-muted-foreground/50" />
        </div>
        <item.icon />
        <span>{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
            {item.badge}
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [pendingMeetingsCount, setPendingMeetingsCount] = useState(0)
  const [pendingIncentiveApprovalsCount, setPendingIncentiveApprovalsCount] = useState(0)
  const [pendingBankClaimsCount, setPendingBankClaimsCount] = useState(0)
  const [menuItems, setMenuItems] = useState<NavItem[]>([])
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [isPostSetupDialogOpen, setIsPostSetupDialogOpen] = useState(false)
  const [linkedProjectsCount, setLinkedProjectsCount] = useState({ imr: 0, emr: 0 })
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()

  const isRearrangeEnabled = user?.role === "Super-admin" || user?.role === "admin" || user?.role === "CRO"

  const allNavItems = useMemo(
    (): NavItem[] => [
      { id: "dashboard", href: "/dashboard", tooltip: "Dashboard", icon: Home, label: "Dashboard", condition: true },
      { id: "ai-chat", href: "/dashboard/ai-chat", tooltip: "AI Chat", icon: MessageCircle, label: "AI Chat Agent" },
      {
        id: "new-submission",
        href: "/dashboard/new-submission",
        tooltip: "New Submission",
        icon: FilePlus2,
        label: "New Submission",
      },
      { id: "my-projects", href: "/dashboard/my-projects", tooltip: "My Projects", icon: Book, label: "My Projects" },
      {
        id: "emr-calendar",
        href: "/dashboard/emr-calendar",
        tooltip: "EMR Calendar",
        icon: Calendar,
        label: "EMR Calendar",
      },
      {
        id: "incentive-claim",
        href: "/dashboard/incentive-claim",
        tooltip: "Incentive Claims",
        icon: Award,
        label: "Incentive Claims",
      },
      {
        id: "incentive-approvals",
        href: "/dashboard/incentive-approvals",
        tooltip: "Incentive Approvals",
        icon: NotebookPen,
        label: "Incentive Approvals",
        badge: pendingIncentiveApprovalsCount,
      },
      {
        id: "evaluator-dashboard",
        href: "/dashboard/evaluator-dashboard",
        tooltip: "Evaluation Queue",
        icon: ClipboardCheck,
        label: "Evaluation Queue",
      },
      {
        id: "my-evaluations",
        href: "/dashboard/my-evaluations",
        tooltip: "My Evaluations",
        icon: History,
        label: "My IMR Evaluations",
      },
      {
        id: "emr-evaluations",
        href: "/dashboard/emr-evaluations",
        tooltip: "EMR Evaluations",
        icon: FileCheck2,
        label: "EMR Evaluations",
      },
      {
        id: "schedule-meeting",
        href: "/dashboard/schedule-meeting",
        tooltip: "Schedule Meeting",
        icon: CalendarClock,
        label: "Schedule Meeting",
        badge: pendingMeetingsCount,
      },
      {
        id: "pending-reviews",
        href: "/dashboard/pending-reviews",
        tooltip: "Pending Reviews",
        icon: GanttChartSquare,
        label: "Pending Reviews",
      },
      {
        id: "completed-reviews",
        href: "/dashboard/completed-reviews",
        tooltip: "Completed Reviews",
        icon: FileCheck2,
        label: "Completed Reviews",
      },
      {
        id: "all-projects",
        href: "/dashboard/all-projects",
        tooltip: "All Projects",
        icon: Book,
        label: "All Projects",
      },
      {
        id: "emr-management",
        href: "/dashboard/emr-management",
        tooltip: "EMR Management",
        icon: Briefcase,
        label: "EMR Management",
      },
      { id: "analytics", href: "/dashboard/analytics", tooltip: "Analytics", icon: LineChart, label: "Analytics" },
      {
        id: "manage-users",
        href: "/dashboard/manage-users",
        tooltip: "Manage Users",
        icon: Users,
        label: "Manage Users",
      },
      {
        id: "manage-incentive-claims",
        href: "/dashboard/manage-incentive-claims",
        tooltip: "Manage Incentive Claims",
        icon: Award,
        label: "Manage Claims",
        badge: pendingBankClaimsCount,
      },
      {
        id: "bulk-upload",
        href: "/dashboard/bulk-upload",
        tooltip: "Bulk Upload Projects",
        icon: Upload,
        label: "Bulk Upload Projects",
      },
      {
        id: "bulk-upload-papers",
        href: "/dashboard/bulk-upload-papers",
        tooltip: "Bulk Upload Papers",
        icon: BookUp,
        label: "Bulk Upload Papers",
      },
      {
        id: "bulk-upload-emr",
        href: "/dashboard/bulk-upload-emr",
        tooltip: "Bulk Upload EMR",
        icon: Upload,
        label: "Bulk Upload EMR",
      },
      {
        id: "bulk-upload-incentives",
        href: "/dashboard/bulk-upload-incentives",
        tooltip: "Bulk Upload Incentives",
        icon: Upload,
        label: "Bulk Upload Incentives",
      },
      {
        id: "module-management",
        href: "/dashboard/module-management",
        tooltip: "Module Management",
        icon: ShieldCheck,
        label: "Module Management",
      },
      {
        id: "notifications",
        href: "/dashboard/notifications",
        tooltip: "Notifications",
        icon: Bell,
        label: "Notifications",
        badge: unreadCount,
        condition: true,
      },
      {
        id: "settings",
        href: "/dashboard/settings",
        tooltip: "Settings",
        icon: Settings,
        label: "Settings",
        condition: true,
      },
    ],
    [unreadCount, pendingMeetingsCount, pendingIncentiveApprovalsCount, pendingBankClaimsCount],
  )

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined
    
    const fetchUserProfile = async (firebaseUser: FirebaseUser) => {
      const userDocRef = doc(db, "users", firebaseUser.uid)
      const userDocSnap = await getDoc(userDocRef)

      if (userDocSnap.exists()) {
        const appUser = { uid: firebaseUser.uid, ...userDocSnap.data() } as User

        if (!appUser.profileComplete) {
          router.replace("/profile-setup")
          return
        }

        if (!appUser.allowedModules || appUser.allowedModules.length === 0) {
          appUser.allowedModules = getDefaultModulesForRole(appUser.role, appUser.designation)
        }

        const isPrincipal = appUser.designation === "Principal"
        const isHod = appUser.designation === "HOD"

        if (isPrincipal || isHod) {
          if (!appUser.allowedModules.includes("all-projects")) {
            appUser.allowedModules.push("all-projects")
          }
        }

        const postSetupInfo = sessionStorage.getItem("postSetupInfo")
        if (postSetupInfo) {
          const { imr, emr } = JSON.parse(postSetupInfo)
          if (imr > 0 || emr > 0) {
            setLinkedProjectsCount({ imr, emr })
            setIsPostSetupDialogOpen(true)
          }
          sessionStorage.removeItem("postSetupInfo")
        }

        setUser(appUser)
        localStorage.setItem("user", JSON.stringify(appUser))
        setLoading(false)
      } else {
        // If user document does not exist after login, create it and redirect to profile setup.
        try {
            console.log("User document not found for authenticated user. Creating profile...");
            const staffRes = await fetch(\`/api/get-staff-data?email=\${firebaseUser.email!}\`);
            const staffResult = await staffRes.json();

            let userDataFromExcel: Partial<User> = {};
            let role: User["role"] = "faculty";
            let designation: User["designation"] = "faculty";
            let profileComplete = false;

            const domainCheck = await isEmailDomainAllowed(firebaseUser.email!);

            if (staffResult.success && staffResult.data && staffResult.data.length > 0) {
                userDataFromExcel = staffResult.data[0];
                const userType = staffResult.data[0].type;

                if (userType === "CRO") {
                    role = "CRO";
                    designation = "CRO";
                    profileComplete = true;
                } else if (userType === "Institutional") {
                    role = "faculty";
                    designation = "Principal";
                    profileComplete = true;
                }
            } else if (domainCheck.isCro) {
                role = "CRO";
                designation = "CRO";
                profileComplete = true;
            }

            const newUser: User = {
                uid: firebaseUser.uid,
                name: userDataFromExcel.name || firebaseUser.displayName || firebaseUser.email!.split("@")[0],
                email: firebaseUser.email!,
                role,
                designation,
                campus: 'Goa',
                faculty: userDataFromExcel.faculty || domainCheck.croFaculty || '',
                institute: userDataFromExcel.institute || '',
                department: userDataFromExcel.department || '',
                phoneNumber: userDataFromExcel.phoneNumber || '',
                misId: userDataFromExcel.misId || '',
                profileComplete,
                allowedModules: getDefaultModulesForRole(role, designation),
                hasCompletedTutorial: false,
                photoURL: firebaseUser.photoURL || '',
            };

            await setDoc(userDocRef, newUser, { merge: true });

            localStorage.setItem("user", JSON.stringify(newUser));
            
            // Link historical data
            const { count: imrCount } = await linkHistoricalData(newUser);
            const { count: emrCount } = await linkEmrInterestsToNewUser(newUser.uid, newUser.email);
            await linkPapersToNewUser(newUser.uid, newUser.email);
            await linkEmrCoPiInterestsToNewUser(newUser.uid, newUser.email);

            if (imrCount > 0 || emrCount > 0) {
                sessionStorage.setItem('postSetupInfo', JSON.stringify({ imr: imrCount, emr: emrCount }));
            }
            
            toast({
                title: "Welcome!",
                description: "Your user profile has been created. Please complete your setup.",
            });
            router.replace("/profile-setup");

        } catch (error: any) {
            console.error("Failed to create user profile on-the-fly:", error);
            toast({
                variant: "destructive",
                title: "Authentication Error",
                description: "There was a problem setting up your user profile. Please try signing in again.",
            });
            signOut(auth);
            setLoading(false);
        }
      }
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (unsubscribeProfile) unsubscribeProfile()

      if (firebaseUser) {
        fetchUserProfile(firebaseUser)
      } else {
        // This is the key change: ensure all state is reset on logout
        setUser(null)
        setMenuItems([])
        setUnreadCount(0)
        setPendingMeetingsCount(0)
        setPendingIncentiveApprovalsCount(0)
        setPendingBankClaimsCount(0)
        localStorage.removeItem("user")
        sessionStorage.clear()
        router.replace("/login")
        setLoading(false)
      }
    })

    return () => {
      unsubscribeAuth()
      if (unsubscribeProfile) unsubscribeProfile()
    }
  }, [router, toast])


  useEffect(() => {
    if (user) {
      // Update activity timestamp on every dashboard load
      localStorage.setItem('lastActivity', Date.now().toString());

      const filtered = allNavItems.filter((item) => {
        if (item.condition) return true;
        if (item.id === "incentive-approvals") {
          return user.designation === 'Principal' || user.allowedModules?.some((m) => m.startsWith("incentive-approver-"));
        }
        return user.allowedModules?.includes(item.id);
      })
      const sorted = user.sidebarOrder
        ? filtered.sort((a, b) => user.sidebarOrder!.indexOf(a.id) - user.sidebarOrder!.indexOf(b.id))
        : filtered

      setMenuItems(sorted)
    }
  }, [user, allNavItems]);

  useEffect(() => {
    if (!user) return

    const unsubscribes: (() => void)[] = []

    // Notifications listener
    const notificationsQuery = query(collection(db, "notifications"), where("uid", "==", user.uid))
    unsubscribes.push(
      onSnapshot(notificationsQuery, (snapshot) => {
        const unread = snapshot.docs.filter((doc) => !doc.data().isRead).length
        setUnreadCount(unread)
      }),
    )

    // Pending Meetings listener (for admins)
    if (user.allowedModules?.includes("schedule-meeting")) {
      let unsubscribeNew: () => void;
      let unsubscribeMidTerm: () => void;

      const fetchSettingsAndSubscribe = async () => {
        const settings: SystemSettings = await getSystemSettings();
        const reviewMonths = settings?.imrMidTermReviewMonths ?? 6;
        const thresholdDate = subMonths(new Date(), reviewMonths);

        const newSubmissionsQuery = query(collection(db, "projects"), where("status", "==", "Submitted"));
        const midTermQuery = query(
          collection(db, "projects"), 
          where('status', '==', 'In Progress'),
          where('grant.phases.0.disbursementDate', '<=', thresholdDate.toISOString())
        );

        let newCount = 0;
        let midTermCount = 0;

        const updateTotal = () => {
          setPendingMeetingsCount(newCount + midTermCount);
        };

        unsubscribeNew = onSnapshot(newSubmissionsQuery, (snapshot) => {
          newCount = snapshot.size;
          updateTotal();
        });

        unsubscribeMidTerm = onSnapshot(midTermQuery, (snapshot) => {
            midTermCount = snapshot.docs.filter(doc => {
                const project = doc.data();
                // Additional client-side check if needed, though Firestore should handle it
                const firstDisbursement = project.grant?.phases?.[0]?.disbursementDate;
                return firstDisbursement && new Date(firstDisbursement) <= thresholdDate;
            }).length;
            updateTotal();
        });

        unsubscribes.push(unsubscribeNew, unsubscribeMidTerm);
      };

      fetchSettingsAndSubscribe();
    }

    // Incentive Approvals listener
    if (user.designation === 'Principal' && user.institute) {
        const incentiveQuery = query(
          collection(db, "incentiveClaims"), 
          where("status", "==", "Pending Principal Approval"),
          where('institute', '==', user.institute),
        );
        unsubscribes.push(
            onSnapshot(incentiveQuery, (snapshot) => {
                setPendingIncentiveApprovalsCount(snapshot.size);
            })
        );
    } else {
        const approverModule = user.allowedModules?.find((m) => m.startsWith("incentive-approver-"))
        if (approverModule) {
          const stage = Number.parseInt(approverModule.split("-")[2], 10)
          const statusToFetch = \`Pending Stage \${stage} Approval\`
          const incentiveQuery = query(collection(db, "incentiveClaims"), where("status", "==", statusToFetch))
          unsubscribes.push(
            onSnapshot(incentiveQuery, (snapshot) => {
              setPendingIncentiveApprovalsCount(snapshot.size)
            }),
          )
        }
    }


    // Pending Bank Claims listener (for admins)
    if (user.allowedModules?.includes("manage-incentive-claims")) {
      const bankClaimsQuery = query(
        collection(db, "incentiveClaims"),
        where("status", "in", ["Accepted", "Submitted to Accounts"]),
      )
      unsubscribes.push(
        onSnapshot(bankClaimsQuery, (snapshot) => {
          setPendingBankClaimsCount(snapshot.size)
        }),
      )
    }

    return () => unsubscribes.forEach((unsub) => unsub())
  }, [user])

  const handleLogout = async () => {
    try {
      await signOut(auth)
    } catch (error) {
      console.error("Logout error:", error)
      toast({
        variant: "destructive",
        title: "Logout Failed",
        description: "An error occurred during logout. Please try again.",
      })
    }
  }

  const attemptLogout = () => {
    if (sessionStorage.getItem("chatSessionActive")) {
      setIsLogoutConfirmOpen(true)
    } else {
      handleLogout()
    }
  }

  const getPageTitle = () => {
    const segments = pathname.split("/")
    const lastSegment = segments.pop() || "dashboard"

    if (pathname.includes("/dashboard/project/")) return "Project Details"
    if (pathname.includes("/dashboard/incentive-claim")) return "Incentive Claims"
    if (pathname.includes("/dashboard/manage-incentive-claims")) return "Manage Incentive Claims"
    if (pathname.includes("/dashboard/emr-management")) return "EMR Management"
    if (pathname.includes("/dashboard/emr-calendar")) return "EMR Calendar"
    if (pathname.includes("/dashboard/profile-setup")) return "Profile Setup"

    if (lastSegment === "dashboard") return "Dashboard"
    return lastSegment.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setMenuItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id)
        const newIndex = items.findIndex((item) => item.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
      setIsDirty(true)
    }
  }

  const handleSaveOrder = async () => {
    if (!user) return
    setIsSaving(true)
    const newOrder = menuItems.map((item) => item.id)
    const result = await saveSidebarOrder(user.uid, newOrder)
    if (result.success) {
      toast({ title: "Success", description: "Your sidebar layout has been saved." })
      setIsDirty(false)
    } else {
      toast({ variant: "destructive", title: "Error", description: result.error })
    }
    setIsSaving(false)
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden md:block md:w-64 bg-card border-r p-4">
          <div className="flex items-center h-10 mb-8">
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
        <div className="flex-1">
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6">
            <Skeleton className="h-8 w-48" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-9 w-9 rounded-md" />
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
          </header>
          <main className="p-6">
            <Skeleton className="h-[calc(100vh-10rem)] w-full" />
          </main>
        </div>
      </div>
    )
  }

  return (
    <>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <Logo variant="dashboard" />
          </SidebarHeader>
          <SidebarContent>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={menuItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <SidebarMenu>
                  {menuItems.map((item) =>
                    isRearrangeEnabled ? (
                      <SortableSidebarMenuItem key={item.id} item={item} />
                    ) : (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          href={item.href}
                          tooltip={item.tooltip}
                          isActive={
                            item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href)
                          }
                        >
                          <item.icon />
                          <span>{item.label}</span>
                          {item.badge !== undefined && item.badge > 0 && (
                            <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
                              {item.badge}
                            </span>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ),
                  )}
                </SidebarMenu>
              </SortableContext>
            </DndContext>
          </SidebarContent>
          <SidebarFooter className="hidden md:flex mt-auto group-data-[collapsible=icon]:hidden">
            <Image
              src="https://pinxoxpbufq92wb4.public.blob.vercel-storage.com/PU-WATERMARK.svg"
              alt="Parul University Goa Logo"
              width={150}
              height={50}
              className="mx-auto"
              style={{ height: "auto" }}
            />
          </SidebarFooter>
          {isRearrangeEnabled && isDirty && (
            <SidebarHeader>
              <Button onClick={handleSaveOrder} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Order
              </Button>
            </SidebarHeader>
          )}
        </Sidebar>
        <SidebarInset>
          <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/90 px-4 backdrop-blur-md sm:px-6">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="md:hidden" />
              <h1 className="text-xl font-semibold">{getPageTitle()}</h1>
            </div>
            <div className="flex items-center gap-2">
              <TutorialDialog user={user} />
              <HelpDialog />
              <ThemeToggle />
              <UserNav user={user} onLogout={attemptLogout} />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto sm:p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      <AlertDialog open={isLogoutConfirmOpen} onOpenChange={setIsLogoutConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to log out?</AlertDialogTitle>
            <AlertDialogDescription>
              Logging out will permanently delete your current AI chat history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>Log Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isPostSetupDialogOpen} onOpenChange={setIsPostSetupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Projects Linked to Your Account</AlertDialogTitle>
            <AlertDialogDescription>
              We found some existing projects where you were listed as an investigator. They have been automatically
              linked to your new account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            {linkedProjectsCount.imr > 0 && <p>{linkedProjectsCount.imr} IMR project(s) linked.</p>}
            {linkedProjectsCount.emr > 0 && <p>{linkedProjectsCount.emr} EMR project(s) linked.</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIsPostSetupDialogOpen(false)}>Great!</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
