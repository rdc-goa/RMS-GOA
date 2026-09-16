"use client";
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Loader2 } from 'lucide-react';

interface OtpDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  onVerify: (otp: string) => Promise<void>;
  isVerifying: boolean;
  onResend: () => Promise<void>;
}

const otpSchema = z.object({
  otp: z.string().min(6, {
    message: "Your one-time password must be 6 characters.",
  }),
});

export function OtpDialog({ isOpen, onOpenChange, email, onVerify, isVerifying, onResend }: OtpDialogProps) {
  const [cooldown, setCooldown] = useState(30);
  const [validTime, setValidTime] = useState(60);
  const [isResending, setIsResending] = useState(false);

  const form = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      otp: "",
    },
  });

  useEffect(() => {
    if (!isOpen) return;

    setCooldown(30);
    setValidTime(60);

    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      setValidTime((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      await onResend();
      setCooldown(30);
      setValidTime(60);
      form.reset({ otp: "" });
    } finally {
      setIsResending(false);
    }
  };

  const onSubmit = async (data: z.infer<typeof otpSchema>) => {
    await onVerify(data.otp);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Two-Factor Authentication</DialogTitle>
          <DialogDescription>
            A 6-digit code has been sent to your email address: <strong>{email}</strong>. Please enter it below to continue. Please check your spam folder if you don't see it in your inbox.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 flex flex-col items-center">
            <FormField
              control={form.control}
              name="otp"
              render={({ field }) => (
                <FormItem className="flex flex-col items-center">
                  <FormLabel className="mb-2">One-Time Password</FormLabel>
                  <FormControl>
                    <InputOTP maxLength={6} {...field}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="text-sm text-center space-y-2 mt-2 w-full">
              {validTime > 0 ? (
                <p className="text-muted-foreground">
                  Code expires in <span className="font-semibold text-foreground">{validTime}s</span>
                </p>
              ) : (
                <p className="text-destructive font-semibold">
                  Code has expired. Please request a new one.
                </p>
              )}
              
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-muted-foreground">Didn't receive the code?</span>
                <Button
                  type="button"
                  variant="link"
                  className="p-0 h-auto font-semibold text-primary hover:text-primary/95"
                  disabled={cooldown > 0 || isResending}
                  onClick={handleResend}
                >
                  {isResending && <Loader2 className="h-3 w-3 animate-spin mr-1 inline" />}
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
                </Button>
              </div>
            </div>

            <Button type="submit" disabled={isVerifying || validTime === 0} className="w-full">
              {isVerifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : 'Verify Code'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

