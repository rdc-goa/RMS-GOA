'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';
import { auth, db } from '@/lib/config';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { Skeleton } from '@/components/ui/skeleton';
import { UserNav } from '@/components/user-nav';
import type { User } from '@/types';
import { doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/theme-toggle';

export default function GoaProfileLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUser({ uid: firebaseUser.uid, ...userDocSnap.data() } as User);
        } else {
            // If user exists in auth but not in DB, something is wrong. Log them out.
            await signOut(auth);
            setUser(null);
        }
      } else {
        setUser(null);
        // If no user is logged in, they should not be on this page.
        router.replace('/login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
      toast({ title: 'Logged out successfully.' });
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        variant: 'destructive',
        title: 'Logout Failed',
        description: 'An error occurred during logout. Please try again.',
      });
    }
  };

  if (loading) {
    return (
        <div className="flex h-screen w-full items-center justify-center">
            <div className="w-full max-w-4xl space-y-4 p-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
      </div>
    );
  }

  // If after loading, there's still no user, we don't render the children.
  // The redirect should have already been initiated.
  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background dark:bg-transparent">
       <header className="container mx-auto px-4 lg:px-6 h-20 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b">
        <Logo />
        <nav className="flex items-center gap-4 sm:gap-6">
            <Link href="/dashboard">
                <Button variant="ghost">Dashboard</Button>
            </Link>
            <ThemeToggle />
            <UserNav user={user} onLogout={handleLogout} />
        </nav>
      </header>
      <main className="flex-1">
        {children}
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
