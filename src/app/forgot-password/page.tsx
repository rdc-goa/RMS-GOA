'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Logo } from '@/components/logo';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { auth } from '@/lib/config';
import { sendPasswordResetEmail } from 'firebase/auth';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address.'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    try {
      // Use the dedicated API route to check if the user's domain is allowed.
      const checkRes = await fetch('/api/is-domain-allowed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      });

      const checkData = await checkRes.json();
      
      // We send the email regardless of existence to prevent email enumeration,
      // but we block disallowed domains.
      if (!checkRes.ok || !checkData.allowed) {
        toast({ variant: 'destructive', title: 'Access Denied', description: checkData.error || 'This email domain is not permitted.' });
        return;
      }

      await sendPasswordResetEmail(auth, data.email);
      toast({
        title: 'Check your email',
        description: "If an account exists for that email, we've sent a password reset link.",
      });
      router.push('/login');
    } catch (error: any) {
       console.error('Password reset error:', error);
       toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to send reset email. Please try again.',
      });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
       <header className="container mx-auto px-4 lg:px-6 h-20 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
        <Logo />
      </header>
      <main className="flex-1 flex min-h-screen items-center justify-center bg-muted/40 p-4 dark:bg-transparent">
        <div className="w-full max-w-md">
          <Card className="shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-6 flex justify-center">
                <Logo />
              </div>
              <CardTitle className="text-2xl font-bold">Forgot Password?</CardTitle>
              <CardDescription>
                Enter your email to receive a reset link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>University Email</FormLabel>
                        <FormControl>
                          <Input placeholder="your.name@paruluniversity.ac.in" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Sending..." : "Send Reset Link"}
                  </Button>
                </form>
              </Form>
            </CardContent>
            <CardFooter className="justify-center text-sm">
               <Link href="/login" passHref>
                  <Button variant="link" className="p-0 h-auto">Back to Sign In</Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Parul University Goa. All rights reserved.</p>
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
  );
}
