'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Settings, BookCopy, Loader2, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export function isScopusIdRequiredForClaimType(claimTypeOrTitle?: string): boolean {
  if (!claimTypeOrTitle) return false;
  const lower = claimTypeOrTitle.toLowerCase().trim();
  // Exempted categories: Patents, Event Participation/Conference/Workshop, Books, Membership, Honoring Award, EMR Sanction
  if (
    lower.includes('patent') ||
    lower.includes('event') ||
    lower.includes('conference') ||
    lower.includes('workshop') ||
    lower.includes('fdp') ||
    lower.includes('training') ||
    lower.includes('book') ||
    lower.includes('membership') ||
    lower.includes('award') ||
    lower.includes('emr')
  ) {
    return false;
  }
  return true;
}

export function extractNumericScopusId(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();

  // If a URL was pasted, extract the numeric author ID parameter
  const urlMatch =
    trimmed.match(/authorId=(\d+)/i) ||
    trimmed.match(/authorID=(\d+)/i) ||
    trimmed.match(/author_id\/(\d+)/i) ||
    trimmed.match(/id=(\d+)/i) ||
    trimmed.match(/scp=(\d+)/i) ||
    trimmed.match(/(\d{10,12})/);

  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // Otherwise strip non-digits so input allows numbers only
  return trimmed.replace(/\D/g, '');
}

interface ScopusIdGuardProps {
  claimType: string;
  children: ReactNode;
}

export function ScopusIdGuard({ claimType, children }: ScopusIdGuardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [hasScopusId, setHasScopusId] = useState<boolean | null>(null);
  const [scopusIdInput, setScopusIdInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    async function checkUserScopusId() {
      if (!isScopusIdRequiredForClaimType(claimType)) {
        setHasScopusId(true);
        setLoading(false);
        return;
      }

      try {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setCurrentUser(parsedUser);
          if (parsedUser?.scopusId && parsedUser.scopusId.trim() !== '') {
            setHasScopusId(true);
            setLoading(false);
            return;
          }

          // Verify with latest Firestore document in case settings were recently updated
          if (parsedUser?.uid) {
            const userSnap = await getDoc(doc(db, 'users', parsedUser.uid));
            if (userSnap.exists()) {
              const userData = userSnap.data();
              if (userData?.scopusId && String(userData.scopusId).trim() !== '') {
                const updated = { ...parsedUser, scopusId: userData.scopusId };
                localStorage.setItem('user', JSON.stringify(updated));
                setCurrentUser(updated);
                setHasScopusId(true);
                setLoading(false);
                return;
              }
            }
          }
        }
        setHasScopusId(false);
      } catch (error) {
        console.error('Error checking Scopus ID:', error);
        setHasScopusId(false);
      } finally {
        setLoading(false);
      }
    }

    checkUserScopusId();
  }, [claimType]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const parsed = extractNumericScopusId(rawVal);
    setScopusIdInput(parsed);
  };

  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText) {
      e.preventDefault();
      const parsed = extractNumericScopusId(pastedText);
      setScopusIdInput(parsed);
    }
  };

  const handleSaveInlineScopusId = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = extractNumericScopusId(scopusIdInput);
    if (!cleanId) {
      toast({
        variant: 'destructive',
        title: 'Valid Scopus ID Required',
        description: 'Please enter a valid numeric Scopus ID (10-11 digits) or paste your Scopus author link.',
      });
      return;
    }

    setIsSaving(true);
    try {
      if (currentUser?.uid) {
        // 1. Update Firestore user document
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, { scopusId: cleanId });

        // 2. Update localStorage user data
        const updatedUser = { ...currentUser, scopusId: cleanId };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        setCurrentUser(updatedUser);

        toast({
          title: 'Scopus ID Saved Successfully!',
          description: `Scopus ID (${cleanId}) saved to your profile settings. You can now complete your form.`,
        });

        // Unblock form immediately
        setHasScopusId(true);
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'User session not found. Please log in again.',
        });
      }
    } catch (error: any) {
      console.error('Error saving Scopus ID inline:', error);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message || 'Could not save Scopus ID. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto py-10">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (hasScopusId === false) {
    return (
      <div className="py-8 max-w-3xl mx-auto">
        <Card className="border-primary/40 bg-card shadow-xl overflow-hidden">
          <CardHeader className="text-center pb-3 bg-muted/30 border-b">
            <div className="mx-auto bg-primary/10 p-3.5 rounded-full w-14 h-14 flex items-center justify-center mb-2">
              <BookCopy className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">
              Scopus ID Required
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground max-w-md mx-auto">
              All applicants applying for <strong>{claimType}</strong> claims must configure their <strong>Scopus ID</strong> before proceeding.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-6 max-w-xl mx-auto">
            {/* Inline Form to Save Scopus ID directly */}
            <form onSubmit={handleSaveInlineScopusId} className="space-y-4 p-5 bg-muted/40 rounded-xl border">
              <div className="space-y-1.5 text-left">
                <label htmlFor="scopus-id-input" className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  Enter & Save Your Scopus ID
                </label>
                <p className="text-xs text-muted-foreground">
                  Type your numeric Scopus Author ID (e.g. <code>57290715300</code>) or paste your Scopus author profile link to automatically parse the numeric ID.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <Input
                  id="scopus-id-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="e.g. 57290715300 or paste https://www.scopus.com/authid/detail.uri?authorId=..."
                  value={scopusIdInput}
                  onChange={handleInputChange}
                  onPaste={handleInputPaste}
                  className="flex-1 font-mono text-sm bg-background"
                  disabled={isSaving}
                  required
                />
                <Button type="submit" disabled={isSaving || !scopusIdInput.trim()} className="gap-2 font-semibold">
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save & Continue
                    </>
                  )}
                </Button>
              </div>
            </form>

            <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-center text-xs text-muted-foreground">
              If you do not have a Scopus ID yet, please write to{' '}
              <a
                href="mailto:helpdesk.rdc@paruluniversity.ac.in"
                className="font-semibold text-primary hover:underline"
              >
                helpdesk.rdc@paruluniversity.ac.in
              </a>{' '}
              for necessary action.
            </div>

          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-3 justify-between pt-4 border-t bg-muted/20">
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/incentive-claim">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Claim Categories
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
