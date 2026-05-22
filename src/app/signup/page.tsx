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
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
  onAuthStateChanged,
} from "firebase/auth"
import { doc, getDoc, setDoc } from "firebase/firestore"
import type { User } from "@/types"
import { useState, useEffect } from "react"
import { getDefaultModulesForRole } from "@/lib/modules"
import {
  linkHistoricalData,
  notifySuperAdminsOnNewUser,
  linkPapersToNewUser,
  linkEmrInterestsToNewUser,
  isEmailDomainAllowed,
  linkEmrCoPiInterestsToNewUser,
  logFrontendAction,
  sendLoginOtp,
  verifyLoginOtp,
  registerUserInDatabase,
  getSystemSettings,
} from "@/app/actions"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { OtpDialog } from "@/components/otp-dialog"

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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(true);
  const [isOtpOpen, setIsOtpOpen] = useState(false)
  const [pendingUser, setPendingUser] = useState<SignupFormValues | null>(null)

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && !isSubmitting) {
        const userDocRef = doc(db, "users", user.uid)
        const userDocSnap = await getDoc(userDocRef)
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data()
          if (userData.profileComplete) {
            router.replace("/dashboard")
          } else {
            router.replace("/profile-setup")
          }
        } else {
          setLoading(false)
        }
      } else if (!user) {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [router, isSubmitting])

  const validateEmailDomain = async (email: string): Promise<boolean> => {
    if (email === "rathipranav07@gmail.com" || email === "vicepresident_86@paruluniversity.ac.in") {
      return true
    }

    if (/^\d+$/.test(email.split("@")[0])) {
      return false
    }

    const domainCheck = await isEmailDomainAllowed(email)
    return domainCheck.allowed
  }

  const processNewUser = async (firebaseUser: FirebaseUser) => {
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
    const idToken = await firebaseUser.getIdToken();
    const staffRes = await fetch(`/api/get-staff-data?email=${firebaseUser.email!}`, {
      headers: {
        'Authorization': `Bearer ${idToken}`
      }
    })
    const staffResult = await staffRes.json()

    const systemSettings = await getSystemSettings()
    let matchedInstituteForPrincipal = ""
    if (systemSettings?.principalEmails) {
      for (const [inst, email] of Object.entries(systemSettings.principalEmails)) {
        if (email.toLowerCase() === firebaseUser.email!.toLowerCase()) {
          matchedInstituteForPrincipal = inst
          break
        }
      }
    }

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
    } else if (matchedInstituteForPrincipal) {
      role = "faculty"
      designation = "Principal"
      profileComplete = true
      notifyRole = "Principal"
      userDataFromExcel.institute = matchedInstituteForPrincipal
      campus = "Goa"
    } else if (staffResult.success) {
      userDataFromExcel = staffResult.data
      const userType = staffResult.data.type
      campus = 'Goa'

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
      institute: matchedInstituteForPrincipal || userDataFromExcel.institute || '',
      department: userDataFromExcel.department || '',
      phoneNumber: userDataFromExcel.phoneNumber || '',
      misId: userDataFromExcel.misId || '',
      profileComplete,
      allowedModules: getDefaultModulesForRole(role, designation),
      hasCompletedTutorial: false,
    }

    if (firebaseUser.photoURL) {
      user.photoURL = firebaseUser.photoURL
    }

    if (user.designation === "Principal" || matchedInstituteForPrincipal) {
      if (!user.allowedModules?.includes('incentive-approver-1')) {
        user.allowedModules = [...(user.allowedModules || []), 'incentive-approver-1'];
      }
      if (!user.allowedModules?.includes('incentive-approvals')) {
        user.allowedModules = [...(user.allowedModules || []), 'incentive-approvals'];
      }
    }

    const approverSetting = systemSettings?.incentiveApprovers?.find(a => a.email.toLowerCase() === user.email.toLowerCase());
    if (approverSetting) {
      const approverModule = `incentive-approver-${approverSetting.stage}`;
      if (!user.allowedModules?.includes(approverModule)) {
        user.allowedModules = [...(user.allowedModules || []), approverModule, 'incentive-approvals'];
      }
    }

    const regResult = await registerUserInDatabase(user);
    if (!regResult.success) {
      throw new Error(regResult.error || "Failed to register user in database.");
    }

    await logFrontendAction('AUTH', 'User signed up successfully', {
      user: user,
      metadata: { method: firebaseUser.providerData[0]?.providerId || 'email', campus: user.campus }
    });

    if (notifyRole) {
      await notifySuperAdminsOnNewUser(user.name, notifyRole)
    }

    try {
      const historicalResult = await linkHistoricalData(user)
      if (historicalResult.success && historicalResult.count > 0) {
        console.log(`Successfully linked ${historicalResult.count} historical IMR projects for new user ${user.email}.`)
      }

      const paperResult = await linkPapersToNewUser(user.uid, user.email)
      if (paperResult.success && paperResult.count > 0) {
        console.log(`Successfully linked ${paperResult.count} research papers for new user ${user.email}.`)
      }

      const emrInterestResult = await linkEmrInterestsToNewUser(user.uid, user.email)
      if (emrInterestResult.success && emrInterestResult.count > 0) {
        console.log(`Successfully linked ${emrInterestResult.count} EMR interests for new user ${user.email}.`)
      }

      const emrCoPiResult = await linkEmrCoPiInterestsToNewUser(user.uid, user.email);
      if (emrCoPiResult.success && emrCoPiResult.count > 0) {
        console.log(`Successfully linked ${emrCoPiResult.count} EMR Co-PI interests for new user ${user.email}.`);
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
        await logFrontendAction('AUTH', 'Signup blocked: Unauthorized domain', {
          user: { email: data.email } as any,
          metadata: { method: 'email' },
          status: 'warning'
        });
        setIsSubmitting(false)
        return
      }

      setPendingUser(data);
      const otpResult = await sendLoginOtp(data.email);
      if (otpResult.success) {
        setIsOtpOpen(true);
        setIsSubmitting(false);
      } else {
        throw new Error(otpResult.error || "Failed to send OTP.");
      }
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
      await logFrontendAction('AUTH', 'Signup attempt failed', {
        user: { email: data.email } as any,
        metadata: { error: error.message, code: error.code, method: 'email' },
        status: 'error'
      });
      setIsSubmitting(false)
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

      const userCredential = await createUserWithEmailAndPassword(auth, pendingUser.email, pendingUser.password);
      setIsOtpOpen(false);
      await processNewUser(userCredential.user);
    } catch (error: any) {
      console.error("Signup OTP Error:", error);
      toast({
        variant: "destructive",
        title: "Verification Failed",
        description: error.code === "auth/email-already-in-use"
          ? "This email is already registered."
          : error.message || "An error occurred.",
      });
      if (error.code === "auth/email-already-in-use") {
        await logFrontendAction('AUTH', 'Signup attempt failed', {
          user: { email: pendingUser.email } as any,
          metadata: { error: error.message, code: error.code, method: 'email' },
          status: 'error'
        });
        setIsOtpOpen(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsSubmitting(true)
    const provider = new GoogleAuthProvider()
    try {
      const result = await signInWithPopup(auth, provider)
      const firebaseUser = result.user
      const email = firebaseUser.email

      if (!email) {
        throw new Error("No email found in Google account")
      }

      const isValidDomain = await validateEmailDomain(email)
      if (!isValidDomain) {
        await signOut(auth)
        toast({
          variant: "destructive",
          title: "Access Denied",
          description: "This email domain is not authorized for portal access, or student accounts are not permitted.",
        })
        await logFrontendAction('AUTH', 'Google Signup blocked: Unauthorized domain', {
          user: { email: email } as any,
          metadata: { method: 'google' },
          status: 'warning'
        });
        setIsSubmitting(false)
        return
      }

      await processNewUser(firebaseUser)
    } catch (error: any) {
      console.error("Google Sign-up error:", error)
      toast({
        variant: "destructive",
        title: "Sign Up Failed",
        description: error.message || "Could not sign up with Google. Please try again.",
      })
      await logFrontendAction('AUTH', 'Google signup attempt failed', {
        metadata: { error: error.message, code: error.code, method: 'google' },
        status: 'error'
      });
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
            <Card className="shadow-xl">
              <CardHeader className="text-center">
                <div className="mx-auto mb-6 flex justify-center">
                  <Logo />
                </div>
                <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
                <CardDescription>Join the Parul University Goa Research Projects Portal.</CardDescription>
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
                  onClick={handleGoogleSignUp}
                  disabled={isSubmitting}
                >
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="mr-2 h-4 w-4">
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.23 0 12 0 7.31 0 3.25 2.69 1.28 6.61l3.99 3.1C6.21 6.86 8.87 4.75 12 4.75z" />
                    <path fill="#4285F4" d="M23.49 12.27c0-.78-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.13 2.74-2.39 3.59l3.86 3c2.26-2.09 3.55-5.18 3.55-8.83z" />
                    <path fill="#FBBC05" d="M5.26 14.29c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29L1.27 6.61C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.39l3.99-3.1z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.97-1.06 7.94-2.91l-3.86-3c-1.08.72-2.46 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.95L1.27 17.39C3.25 21.31 7.31 24 12 24z" />
                  </svg>
                  Sign up with Parul University Goa Google Account
                </Button>
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

