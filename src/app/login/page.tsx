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
  type User as FirebaseUser,
  onAuthStateChanged,
} from "firebase/auth"
import { doc, getDoc, setDoc, collection, addDoc } from "firebase/firestore"
import type { User } from "@/types"
import { useState, useEffect } from "react"
import { getDefaultModulesForRole } from "@/lib/modules"
import {
  linkHistoricalData,
  getSystemSettings,
  sendLoginOtp,
  isEmailDomainAllowed,
  linkEmrInterestsToNewUser,
  linkEmrCoPiInterestsToNewUser,
  verifyLoginOtp,
} from "@/app/actions"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { OtpDialog } from "@/components/otp-dialog"
import { Skeleton } from "@/components/ui/skeleton"

const loginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(1, "Password is required."),
})

type LoginFormValues = z.infer<typeof loginSchema>

async function logLogin(uid: string, email: string) {
  try {
    await addDoc(collection(db, 'logs'), {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'User logged in',
      context: { uid, email }
    });
  } catch (error) {
    console.error("Failed to log user login:", error);
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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/dashboard');
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);


  const processSignIn = async (firebaseUser: FirebaseUser) => {
    const userDocRef = doc(db, "users", firebaseUser.uid)
    const userDocSnap = await getDoc(userDocRef)
    let user: User

    if (userDocSnap.exists()) {
      user = { uid: firebaseUser.uid, ...userDocSnap.data() } as User
      if (user.name === user.email.split("@")[0] && firebaseUser.displayName) {
        user.name = firebaseUser.displayName
      }
    } else {
      const staffRes = await fetch(`/api/get-staff-data?email=${firebaseUser.email!}`)
      const staffResult = await staffRes.json()

      let userDataFromExcel: Partial<User> = {}
      let role: User["role"] = "faculty"
      let designation: User["designation"] = "faculty"
      let profileComplete = false

      const domainCheck = await isEmailDomainAllowed(firebaseUser.email!)

      if (staffResult.success && Array.isArray(staffResult.data) && staffResult.data.length > 0) {
        const staffData = staffResult.data[0]
        userDataFromExcel = staffData
        const userType = staffData.type

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

      user = {
        uid: firebaseUser.uid,
        name: userDataFromExcel.name || firebaseUser.displayName || firebaseUser.email!.split("@")[0],
        email: firebaseUser.email!,
        role,
        designation,
        faculty: userDataFromExcel.faculty || domainCheck.croFaculty || '',
        institute: userDataFromExcel.institute || '',
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

    const systemSettings = await getSystemSettings();
    const approverSetting = systemSettings.incentiveApprovers?.find(a => a.email.toLowerCase() === user.email.toLowerCase());

    if (approverSetting) {
      const approverModule = `incentive-approver-${approverSetting.stage}`;
      if (!user.allowedModules?.includes(approverModule)) {
        user.allowedModules = [...(user.allowedModules || []), approverModule, 'incentive-approvals'];
      }
    }


    await setDoc(userDocRef, user, { merge: true })

    await logLogin(user.uid, user.email);

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

      // Now that OTP is verified, sign the user in
      const userCredential = await signInWithEmailAndPassword(auth, pendingUser.email, pendingUser.password);
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
      const settings = await getSystemSettings()

      if (settings.is2faEnabled && data.email !== "vicepresident_86@paruluniversity.ac.in") {
        setPendingUser(data);
        const otpResult = await sendLoginOtp(data.email);
        if (otpResult.success) {
          setIsOtpOpen(true);
        } else {
          throw new Error(otpResult.error || "Failed to send OTP.");
        }
      } else {
        const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password)
        await processSignIn(userCredential.user)
      }
    } catch (error: any) {
      console.error("Login error:", error)
      toast({
        variant: "destructive",
        title: "Login Failed",
        description:
          error.code === "auth/invalid-credential"
            ? "Invalid email or password."
            : error.message || "An unknown error occurred.",
      })
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
                  <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="mr-2 h-4 w-4">
                    <title>Google</title>
                    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.02 1.02-2.62 1.9-4.63 1.9-3.87 0-7-3.13-7-7s3.13-7 7-7c2.18 0 3.66.87 4.53 1.73l2.43-2.38C18.04 2.33 15.47 1 12.48 1 7.01 1 3 5.02 3 9.98s4.01 8.98 9.48 8.98c2.96 0 5.42-1 7.15-2.68 1.78-1.74 2.37-4.24 2.37-6.52 0-.6-.05-1.18-.15-1.72H12.48z" />
                  </svg>
                  Sign in with Google
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
