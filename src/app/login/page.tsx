
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
import { doc, getDoc, setDoc, addDoc, collection } from "firebase/firestore"
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
      const staffRes = await fetch(`/api/get-staff-data?email=${firebaseUser.email}`)
      if (staffRes.ok) {
        const staff = await staffRes.json()
        user = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || staff.firstName + ' ' + staff.lastName,
          role: staff.role || 'user',
          modules: getDefaultModulesForRole(staff.role || 'user'),
          emrId: staff.emrId || null,
        }

        await setDoc(userDocRef, user)
        toast({
          title: "Welcome!",
          description: "Your account has been created."
        })

        await linkHistoricalData(firebaseUser.uid, firebaseUser.email)
        if (staff.emrId) {
          await linkEmrInterestsToNewUser(firebaseUser.uid, staff.emrId)
          await linkEmrCoPiInterestsToNewUser(firebaseUser.uid, staff.emrId)
          await linkPapersToNewUser(firebaseUser.uid, staff.emrId)
        }
      } else {
        user = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email.split("@")[0],
          role: "user",
          modules: getDefaultModulesForRole("user"),
        }

        await setDoc(userDocRef, user)
        toast({
          title: "Welcome!",
          description: "Your account has been created."
        })
      }
    }

    await logLogin(firebaseUser.uid, firebaseUser.email);
    return user
  }

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const settings = await getSystemSettings();
        setAuthSettings(settings?.authMethods || { email: true, google: true });
        setGoogleClientId(settings?.googleClientId || null);
      } catch (error) {
        console.error("Failed to fetch system settings:", error);
        toast({
          title: "Error",
          description: "Failed to load system settings.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [toast]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const user = await processSignIn(firebaseUser)
        if (user) {
          router.push("/")
        } else {
          toast({
            title: "Error",
            description: "Failed to process sign-in.",
            variant: "destructive",
          })
        }
      }
    })

    return () => unsubscribe()
  }, [router, toast])

  async function onSubmit(data: LoginFormValues) {
    setIsSubmitting(true)
    try {
      if (!authSettings.email) {
        toast({
          title: "Error",
          description: "Email login is disabled.",
          variant: "destructive",
        })
        return;
      }

      const domainAllowed = await isEmailDomainAllowed(data.email);
      if (!domainAllowed) {
          toast({
              title: "Error",
              description: "This email domain is not allowed.",
              variant: "destructive",
          });
          return;
      }

      if (process.env.NEXT_PUBLIC_ENABLE_OTP === "true") {
          const otpResult = await sendLoginOtp(data.email);
          if (otpResult.success) {
              setPendingUser(data);
              setIsOtpOpen(true);
          } else {
              toast({
                  title: "Error",
                  description: otpResult.error || "Failed to send OTP.",
                  variant: "destructive",
              });
          }
      } else {
          const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      }

    } catch (error: any) {
      console.error("Login failed:", error)
      toast({
        title: "Error",
        description: error.message || "Invalid credentials.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGoogleSignIn = useCallback(async () => {
    if (!authSettings.google) {
        toast({
            title: "Error",
            description: "Google login is disabled.",
            variant: "destructive",
        });
        return;
    }

    if (!googleClientId) {
        toast({
            title: "Error",
            description: "Google Client ID is not configured.",
            variant: "destructive",
        });
        return;
    }

    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(auth, provider)
    } catch (error: any) {
      console.error("Google sign-in failed:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to sign in with Google.",
        variant: "destructive",
      })
    }
  }, [authSettings.google, googleClientId, toast]);

  const handleOtpVerification = async (otp: string) => {
      if (!pendingUser) {
          toast({
              title: "Error",
              description: "No pending user found.",
              variant: "destructive",
          });
          setIsOtpOpen(false);
          return;
      }

      setIsSubmitting(true);
      try {
          const verificationResult = await verifyLoginOtp(pendingUser.email, otp);
          if (verificationResult.success) {
              const userCredential = await signInWithEmailAndPassword(auth, pendingUser.email, pendingUser.password);
              setIsOtpOpen(false);
          } else {
              toast({
                  title: "Error",
                  description: verificationResult.error || "Invalid OTP.",
                  variant: "destructive",
              });
          }
      } catch (error: any) {
          console.error("OTP verification failed:", error);
          toast({
              title: "Error",
              description: error.message || "Failed to verify OTP.",
              variant: "destructive",
          });
      } finally {
          setIsSubmitting(false);
      }
  };

  return (
    <>
      {googleClientId && <Script
        src={`https://accounts.google.com/gsi/client`}
        strategy="beforeInteractive"
      />}
      <div className="grid h-screen w-screen place-items-center">
        <Card className="w-[350px]">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center"><Logo /></CardTitle>
            <CardDescription className="text-center">Enter your email and password to login</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {loading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="shadcn@example.com" {...field} />
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
                          <Input type={showPassword ? "text" : "password"} placeholder="Password" {...field} />
                        </FormControl>
                        <button
                          type="button"
                          className="absolute right-2 top-8 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=on]:bg-accent data-[state=on]:text-muted-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button disabled={isSubmitting} type="submit" className="w-full">
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Login
                  </Button>
                </form>
              </Form>
            )}
            {authSettings.google && googleClientId && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            {authSettings.google && googleClientId && (
                <div className="flex justify-center">
                    <Button variant="outline" disabled={isSubmitting} onClick={handleGoogleSignIn}>
                      Google
                    </Button>
                </div>
            )}
            <Link href="/register" className="text-sm text-muted-foreground underline underline-offset-4">
              Don't have an account?
            </Link>
          </CardFooter>
        </Card>
      </div>
      <OtpDialog
          open={isOtpOpen}
          onOpenChange={setIsOtpOpen}
          onVerify={handleOtpVerification}
          loading={isSubmitting}
          email={pendingUser?.email || ''}
      />
    </>
  )
}

