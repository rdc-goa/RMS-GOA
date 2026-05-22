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
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  signInWithCustomToken,
  type User as FirebaseUser,
  onAuthStateChanged,
} from "firebase/auth"
import { doc, getDoc, setDoc, collection, addDoc, updateDoc } from "firebase/firestore"
import type { User } from "@/types"
import { useState, useEffect } from "react"
import { getDefaultModulesForRole } from "@/lib/modules"
import {
  linkHistoricalData,
  getSystemSettings,
  initiateLogin,
  isEmailDomainAllowed,
  linkEmrInterestsToNewUser,
  linkEmrCoPiInterestsToNewUser,
  verifyLoginOtp,
  logFrontendAction,
  registerUserInDatabase,
  setSession,
} from "@/app/actions"
import { LogCategory } from "@/lib/logger"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { OtpDialog } from "@/components/otp-dialog"
import { Skeleton } from "@/components/ui/skeleton"

const loginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(1, "Password is required."),
})

type LoginFormValues = z.infer<typeof loginSchema>

async function logLoginEvent(category: LogCategory, message: string, user?: User | any, status: 'success' | 'error' | 'warning' = 'success', error?: string) {
  try {
    await logFrontendAction(category, message, {
      user,
      status,
      metadata: error ? { error } : {},
      path: '/login'
    });
  } catch (err) {
    console.error("Failed to log internal event:", err);
  }
}

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isOtpOpen, setIsOtpOpen] = useState(false)
  const [pendingUser, setPendingUser] = useState<LoginFormValues | null>(null);
  const [loading, setLoading] = useState(true);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && !isSubmitting) {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          if (userData.profileComplete) {
            router.replace('/dashboard');
          } else {
            router.replace('/profile-setup');
          }
        } else {
          setLoading(false);
        }
      } else if (!user) {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router, isSubmitting]);


  const processSignIn = async (firebaseUser: FirebaseUser) => {
    const systemSettings = await getSystemSettings();

    // Check if email matches configured principal emails
    let matchedInstituteForPrincipal = "";
    if (systemSettings?.principalEmails) {
      for (const [inst, email] of Object.entries(systemSettings.principalEmails)) {
        if (email.toLowerCase() === firebaseUser.email!.toLowerCase()) {
          matchedInstituteForPrincipal = inst;
          break;
        }
      }
    }

    const userDocRef = doc(db, "users", firebaseUser.uid)
    const userDocSnap = await getDoc(userDocRef)
    let user: User

    if (userDocSnap.exists()) {
      user = { uid: firebaseUser.uid, ...userDocSnap.data() } as User
      if (user.name === user.email.split("@")[0] && firebaseUser.displayName) {
        user.name = firebaseUser.displayName
      }

      // Dynamic update for Principal role if newly assigned
      if (matchedInstituteForPrincipal && (user.designation !== "Principal" || user.institute !== matchedInstituteForPrincipal)) {
        user.designation = "Principal";
        user.institute = matchedInstituteForPrincipal;
        user.role = "faculty";
        user.profileComplete = true;
        user.allowedModules = getDefaultModulesForRole("faculty", "Principal");

        await updateDoc(userDocRef, {
          designation: "Principal",
          institute: matchedInstituteForPrincipal,
          role: "faculty",
          profileComplete: true,
          allowedModules: user.allowedModules
        });
      }

      const idToken = await firebaseUser.getIdToken();
      await setSession(idToken);
    } else {
      const idToken = await firebaseUser.getIdToken();
      await setSession(idToken);
      const staffRes = await fetch(`/api/get-staff-data?email=${firebaseUser.email!}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      })
      const staffResult = await staffRes.json()

      let userDataFromExcel: Partial<User> = {}
      let role: User["role"] = "faculty"
      let designation: User["designation"] = "faculty"
      let profileComplete = false

      const domainCheck = await isEmailDomainAllowed(firebaseUser.email!)

      if (matchedInstituteForPrincipal) {
        role = "faculty";
        designation = "Principal";
        profileComplete = true;
        userDataFromExcel.institute = matchedInstituteForPrincipal;
      } else if (staffResult.success) {
        userDataFromExcel = staffResult.data
        const userType = staffResult.data.type

        if (userType === "CRO") {
          role = "CRO"
          designation = "CRO"
          profileComplete = true
        } else if (userType === "Institutional") {
          role = "faculty"
          designation = "Principal"
          profileComplete = true
        }
      } else if (domainCheck.isCro) {
        role = "CRO"
        designation = "CRO"
        profileComplete = true
      }

      const determinedCampus = "Goa";

      user = {
        uid: firebaseUser.uid,
        name: userDataFromExcel.name || firebaseUser.displayName || firebaseUser.email!.split("@")[0],
        email: firebaseUser.email!,
        role,
        designation,
        campus: determinedCampus,
        faculty: userDataFromExcel.faculty || domainCheck.croFaculty || '',
        institute: matchedInstituteForPrincipal || userDataFromExcel.institute || '',
        department: userDataFromExcel.department || '',
        phoneNumber: userDataFromExcel.phoneNumber || '',
        misId: userDataFromExcel.misId || '',
        profileComplete,
        allowedModules: getDefaultModulesForRole(role, designation),
      }
    }

    if (firebaseUser.photoURL) {
      user.photoURL = firebaseUser.photoURL
    }

    if (!user.allowedModules || user.allowedModules.length === 0) {
      user.allowedModules = getDefaultModulesForRole(user.role, user.designation)
    }

    if (user.designation === "Principal" || matchedInstituteForPrincipal) {
      if (!user.allowedModules?.includes('incentive-approver-1')) {
        user.allowedModules = [...(user.allowedModules || []), 'incentive-approver-1'];
      }
      if (!user.allowedModules?.includes('incentive-approvals')) {
        user.allowedModules = [...(user.allowedModules || []), 'incentive-approvals'];
      }
    }

    const approverSetting = systemSettings.incentiveApprovers?.find(a => a.email.toLowerCase() === user.email.toLowerCase());

    if (approverSetting) {
      const approverModule = `incentive-approver-${approverSetting.stage}`;
      if (!user.allowedModules?.includes(approverModule)) {
        user.allowedModules = [...(user.allowedModules || []), approverModule, 'incentive-approvals'];
      }
    }


    const regResult = await registerUserInDatabase(user);
    if (!regResult.success) {
      throw new Error(regResult.error || "Failed to update user in database.");
    }

    await logLoginEvent('AUTH', 'User logged in successfully', user);

    try {
      const result = await linkHistoricalData(user)
      if (result.success && result.count > 0) {
        console.log(`Successfully linked ${result.count} historical projects for user ${user.email}.`)
      }

      const emrResult = await linkEmrInterestsToNewUser(user.uid, user.email)
      if (emrResult.success && emrResult.count > 0) {
        console.log(`Successfully linked ${emrResult.count} EMR interests for user ${user.email}.`)
      }

      const emrCoPiResult = await linkEmrCoPiInterestsToNewUser(user.uid, user.email)
      if (emrCoPiResult.success && emrCoPiResult.count > 0) {
        console.log(`Successfully linked ${emrCoPiResult.count} EMR Co-PI interests for user ${user.email}.`);
      }


      if (!result.success) {
        console.error("Failed to link historical projects:", result.error)
      }
    } catch (e) {
      console.error("Error calling linkHistoricalData action:", e)
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(user))
    }

    if (user.profileComplete) {
      toast({
        title: "Login Successful",
        description: "Redirecting to your dashboard...",
      })
      router.push("/dashboard")
    } else {
      toast({
        title: "Profile Setup Required",
        description: "Please complete your profile to continue.",
      })
      router.push("/profile-setup")
    }
  }

  const handleSuccessfulOtp = async (otp: string) => {
    if (!pendingUser) return;
    setIsSubmitting(true);
    try {
      const otpResult = await verifyLoginOtp(pendingUser.email, otp);
      if (!otpResult.success) {
        throw new Error(otpResult.error || "Invalid OTP");
      }

      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, pendingUser.email, pendingUser.password);
      } catch (emailSignInError) {
        if (otpResult.customToken) {
          userCredential = await signInWithCustomToken(auth, otpResult.customToken);
        } else {
          throw emailSignInError;
        }
      }

      setIsOtpOpen(false);
      await processSignIn(userCredential.user);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Verification Failed",
        description: error.message || "An error occurred.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onEmailSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true)
    try {
      // Initiate login securely on the server
      // This checks credentials and 2FA requirement in one go, preventing client-side bypass
      const loginResult = await initiateLogin(data.email, data.password);

      if (!loginResult.success) {
        throw new Error(loginResult.error || "Login failed.");
      }

      if (loginResult.otpRequired) {
        setPendingUser(data);
        setIsOtpOpen(true);
      } else {
        let userCredential;
        try {
          userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
        } catch (emailSignInError) {
          if (loginResult.customToken) {
            userCredential = await signInWithCustomToken(auth, loginResult.customToken);
          } else {
            throw emailSignInError;
          }
        }
        await processSignIn(userCredential.user);
      }
    } catch (error: any) {
      console.error("Login error full object:", error)
      toast({
        variant: "destructive",
        title: "Login Failed",
        description:
          error.code === "auth/invalid-credential"
            ? "Invalid email or password."
            : error.message || "An unknown error occurred.",
      })
      await logLoginEvent('AUTH', 'Login attempt failed', { email: data.email }, 'error', error.message);

    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true)
    const provider = new GoogleAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      const firebaseUser = result.user
      const email = firebaseUser.email

      if (!email) {
        throw new Error("No email found in Google account")
      }

      const domainCheck = await isEmailDomainAllowed(email)

      if (email && /^\d+$/.test(email.split("@")[0]) && email !== "rathipranav07@gmail.com") {
        await signOut(auth)
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "Access is for faculty members only. Student accounts are not permitted.",
        })
        await logLoginEvent('AUTH', 'Google sign-in blocked: Unauthorized account type', { email }, 'warning');
        setIsSubmitting(false)
        return
      }

      if (!domainCheck.allowed) {
        await signOut(auth)
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "Access is restricted to authorized university domains.",
        })
        await logLoginEvent('AUTH', 'Google sign-in blocked: Unauthorized domain', { email }, 'warning');
        setIsSubmitting(false)
        return
      }

      await processSignIn(firebaseUser)
    } catch (error: any) {
      console.error("Google Sign-in error:", error)
      toast({
        variant: "destructive",
        title: "Sign In Failed",
        description: error.message || "Could not sign in with Google. Please try again.",
      })
      await logLoginEvent('AUTH', 'Google sign-in attempt failed', {}, 'error', error.message);
    } finally {
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

  return (
    <>
      <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
        <main className="flex-1 flex min-h-screen items-center justify-center bg-muted/40 p-4">
          <div className="w-full max-w-md">
            <Card className="shadow-xl animate-in fade-in-0 zoom-in-95 duration-500">
              <CardHeader className="text-center">
                <div className="mx-auto mb-6 flex justify-center">
                  <Logo />
                </div>
                <CardTitle className="text-2xl font-bold">Welcome Back!</CardTitle>
                <CardDescription>Sign in to access the Research Projects Portal.</CardDescription>
              </CardHeader>
              <CardContent>
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
                          <div className="flex items-center justify-between">
                            <FormLabel>Password</FormLabel>
                          </div>
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
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Signing In..." : "Sign In"}
                    </Button>
                  </form>
                </Form>
                <div className="mt-4 text-center">
                  <Link href="/forgot-password" passHref>
                    <Button variant="link" className="p-0 h-auto text-xs">
                      Forgot password?
                    </Button>
                  </Link>
                </div>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={handleGoogleSignIn}
                  disabled={isSubmitting}
                >
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="mr-2 h-4 w-4">
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.23 0 12 0 7.31 0 3.25 2.69 1.28 6.61l3.99 3.1C6.21 6.86 8.87 4.75 12 4.75z" />
                    <path fill="#4285F4" d="M23.49 12.27c0-.78-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.13 2.74-2.39 3.59l3.86 3c2.26-2.09 3.55-5.18 3.55-8.83z" />
                    <path fill="#FBBC05" d="M5.26 14.29c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29L1.27 6.61C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.39l3.99-3.1z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.97-1.06 7.94-2.91l-3.86-3c-1.08.72-2.46 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.95L1.27 17.39C3.25 21.31 7.31 24 12 24z" />
                  </svg>
                  Sign in with Parul University Goa Google Account
                </Button>
              </CardContent>
              <CardFooter className="justify-center text-sm">
                <p className="text-muted-foreground">Don't have an account?&nbsp;</p>
                <Link href="/signup" passHref>
                  <Button variant="link" className="p-0 h-auto">
                    Sign Up
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
      {pendingUser && (
        <OtpDialog
          isOpen={isOtpOpen}
          onOpenChange={setIsOtpOpen}
          email={pendingUser.email}
          onVerify={handleSuccessfulOtp}
          isVerifying={isSubmitting}
        />
      )}
    </>
  )
}
