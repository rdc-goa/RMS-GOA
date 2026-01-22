
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
    const staffRes = await fetch(`/api/get-staff-data?email=${firebaseUser.email!}`)
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
  }, [toast, router]); // Added router to dependency array

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
                        data-login_uri={`${process.env.NEXT_PUBLIC_BASE_URL}/login`}
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
