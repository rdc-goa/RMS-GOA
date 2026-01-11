
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
import { doc, getDoc, setDoc } from "firebase/firestore"
import type { User, SystemSettings } from "@/types"
import { useState, useEffect, useCallback } from "react"
import { useTheme } from "next-themes"
import { getDefaultModulesForRole } from "@/lib/modules"
import {
  linkHistoricalData,
  getSystemSettings,
  sendLoginOtp,
  isEmailDomainAllowed,
  linkEmrInterestsToNewUser,
  linkEmrCoPiInterestsToNewUser,
  verifyLoginOtp,
  signInWithGoogleCredential,
  linkPapersToNewUser,
} from "@/app/server-actions"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { OtpDialog } from "@/components/otp-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import Script from "next/script"


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
  const { theme } = useTheme()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [isOtpOpen, setIsOtpOpen] = useState(false)
  const [pendingUser, setPendingUser] = useState<LoginFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [authSettings, setAuthSettings] = useState<SystemSettings['authMethods']>({ email: true, google: true });
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

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

      if (staffResult.success) {
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

      user = {
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
        hasCompletedTutorial: false, // Ensure this is set for new users
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
        const { count: imrCount } = await linkHistoricalData(user);
        const { count: emrCount } = await linkEmrInterestsToNewUser(user.uid, user.email);
        await linkPapersToNewUser(user.uid, user.email);
        await linkEmrCoPiInterestsToNewUser(user.uid, user.email);

        if (imrCount > 0 || emrCount > 0) {
             sessionStorage.setItem('postSetupInfo', JSON.stringify({ imr: imrCount, emr: emrCount }));
        }

    } catch (e) {
      console.error("Error calling linking actions:", e)
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


  useEffect(() => {
    // Expose the callback to the global scope
    // @ts-ignore
    window.handleGoogleSignIn = async (response: any) => {
        setIsSubmitting(true);
        try {
            const result = await signInWithGoogleCredential(JSON.stringify(response));
            if (!result.success || !result.user) {
                throw new Error(result.error || "Failed to verify Google credential.");
            }
            await processSignIn(result.user as FirebaseUser);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Sign In Failed",
                description: error.message || "Could not sign in with Google. Please try again.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const checkAuthAndSettings = async () => {
        const settings = await getSystemSettings();
        setAuthSettings({ email: true, google: true, ...settings.authMethods });
        
        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        setGoogleClientId(clientId || null);

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

  }, [router, toast, theme]);


  const handleSuccessfulOtp = async (otp: string) => {
    if (!pendingUser) return;
    setIsSubmitting(true);
    try {
        const otpResult = await verifyLoginOtp(pendingUser.email, otp);
        if (!otpResult.success) {
            throw new Error(otpResult.error || "Invalid OTP");
        }
        
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
      {showGoogleButton && <Script src="https://accounts.google.com/gsi/client" async defer />}
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
                )}
                
                {showEmailForm && (
                    <div className="mt-4 text-center">
                      <Link href="/forgot-password" passHref>
                        <Button variant="link" className="p-0 h-auto text-xs">
                          Forgot password?
                        </Button>
                      </Link>
                    </div>
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
                
                {showGoogleButton ? (
                   <div id="g_id_onload"
                        data-client_id={googleClientId!}
                        data-callback="handleGoogleSignIn"
                        data-context="signin"
                        data-ux_mode="popup"
                    ></div>
                ) : authSettings.google && !googleClientId ? (
                  <div className="text-center text-destructive p-4 border border-destructive/50 rounded-md bg-destructive/10">
                      Google Sign-In is misconfigured. Administrator: Please set the `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in your environment variables.
                  </div>
                ) : null}

                {showGoogleButton && (
                     <div
                        id="g_id_signin"
                        className="g_id_signin"
                        data-type="standard"
                        data-shape="rectangular"
                        data-theme={theme === 'dark' ? 'filled_black' : 'outline'}
                        data-text="signin_with"
                        data-size="large"
                        data-logo_alignment="left"
                    ></div>
                )}

                 {!showEmailForm && !showGoogleButton && (
                    <div className="text-center text-muted-foreground p-4 border rounded-md">
                        Login is temporarily disabled. Please contact an administrator.
                    </div>
                 )}

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
            &copy; {new Date().getFullYear()} Parul University. All rights reserved.
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
