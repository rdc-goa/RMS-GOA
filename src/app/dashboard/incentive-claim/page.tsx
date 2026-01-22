

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import type { User, IncentiveClaim, Author, SystemSettings } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, orderBy, addDoc, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Book, Award, Presentation, FileText, UserPlus, Banknote, Users, CheckSquare, Loader2, Edit, Eye, Info, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ClaimDetailsDialog } from '@/components/incentives/claim-details-dialog';
import { getSystemSettings } from '@/app/server-actions';
import { submitIncentiveClaim, deleteIncentiveClaim } from '@/app/incentive-approval-actions';
import { differenceInDays, parseISO, addYears, format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { calculateBookIncentive,calculateApcIncentive, calculateResearchPaperIncentive, calculateConferenceIncentive } from '@/app/incentive-calculation';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';


function UserClaimsList({ 
    claims, 
    claimType,
    onViewDetails,
    onDeleteClaim
}: { 
    claims: IncentiveClaim[], 
    claimType: 'draft' | 'other',
    onViewDetails: (claim: IncentiveClaim) => void,
    onDeleteClaim: (claimId: string) => void
}) {
    if (claims.length === 0) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">You have no claims with this status.</p>
                </CardContent>
            </Card>
        );
    }
    
    const getClaimTitle = (claim: IncentiveClaim): string => {
        return claim.paperTitle || claim.publicationTitle || claim.patentTitle || claim.conferencePaperTitle || claim.professionalBodyName || claim.apcPaperTitle || 'Untitled Claim';
    };

    const getClaimEditHref = (claim: IncentiveClaim): string => {
        const typeMap: { [key: string]: string } = {
            'Research Papers': 'research-paper',
            'Patents': 'patent',
            'Conference Presentations': 'conference',
            'Books': 'book',
            'Membership of Professional Bodies': 'membership',
            'Seed Money for APC': 'apc',
        };
        const slug = typeMap[claim.claimType] || '';
        return `/dashboard/incentive-claim/${slug}?claimId=${claim.id}`;
    }

    const getSimplifiedStatus = (claim: IncentiveClaim) => {
        if (claim.status === 'Submitted to Accounts') {
            return (
                <div className="flex flex-col items-end">
                    <Badge variant="default">Approved</Badge>
                </div>
            );
        }

        const highestApprovalStage = claim.approvals?.filter(a => a?.status === 'Approved').length || 0;
        if (highestApprovalStage > 0 && claim.status.startsWith('Pending Stage')) {
             return <Badge variant="secondary">Stage ${highestApprovalStage} Approved</Badge>;
        }
        
        return <Badge variant={claim.status === 'Accepted' ? 'default' : claim.status === 'Rejected' ? 'destructive' : 'secondary'}>{claim.status}</Badge>;
    };

    return (
        <div className="space-y-4">
            {claims.map(claim => (
                 <Card key={claim.id}>
                    <CardContent className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                         <div className="flex-1 space-y-1">
                            <Badge variant="outline">{claim.claimType}</Badge>
                            <p className="font-semibold">
                              {getClaimTitle(claim)}
                            </p>
                            {claim.journalName && <p className="text-sm text-muted-foreground">Journal: ${claim.journalName}</p>}
                            {claim.conferenceName && <p className="text-sm text-muted-foreground">Conference: ${claim.conferenceName}</p>}
                            <p className="text-sm text-muted-foreground pt-1">Submitted: ${new Date(claim.submissionDate).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-center">
                            {claimType === 'draft' ? (
                                <>
                                    <Button asChild variant="outline" size="sm">
                                        <Link href={getClaimEditHref(claim)}>
                                            <Edit className="mr-2 h-4 w-4"/>
                                            Continue
                                        </Link>
                                    </Button>
                                    <Button variant="destructive" size="icon" onClick={() => onDeleteClaim(claim.id)}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => onViewDetails(claim)}>
                                        <Eye className="mr-2 h-4 w-4" />
                                        View Details
                                    </Button>
                                    {getSimplifiedStatus(claim)}
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

const coAuthorApplySchema = z.object({
    publicationOrderInYear: z.enum(['First', 'Second', 'Third']).optional(),
});

type CoAuthorApplyValues = z.infer<typeof coAuthorApplySchema>;

function CoAuthorClaimsList({ claims, currentUser, onClaimApplied }: { claims: IncentiveClaim[], currentUser: User | null, onClaimApplied: () => void }) {
    const { toast } = useToast();
    const [claimToApply, setClaimToApply] = useState<IncentiveClaim | null>(null);
    const [isApplying, setIsApplying] = useState(false);
    const [calculatedAmount, setCalculatedAmount] = useState<number | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);

    const form = useForm<CoAuthorApplyValues>({
        resolver: zodResolver(coAuthorApplySchema),
    });
    
const handleOpenDialog = useCallback(async (claim: IncentiveClaim) => {
    if (!currentUser) return;
    setClaimToApply(claim);
    setIsCalculating(true);
    setCalculatedAmount(null);
    
    try {
        let result;
        const myAuthorDetails = claim.authors?.find(
            a => a.email.toLowerCase() === currentUser.email.toLowerCase()
        );

        if (!myAuthorDetails) {
            toast({ 
                variant: 'destructive', 
                title: 'Error', 
                description: 'Your details not found in the author list.' 
            });
            setIsCalculating(false);
            return;
        }

        const SPECIAL_POLICY_FACULTIES = [
            "Faculty of Applied Sciences",
            "Faculty of Medicine",
            "Faculty of Homoeopathy",
            "Faculty of Ayurved",
            "Faculty of Nursing",
            "Faculty of Pharmacy",
            "Faculty of Physiotherapy",
            "Faculty of Public Health",
            "Faculty of Engineering & Technology"
        ];
        const isSpecialFaculty = SPECIAL_POLICY_FACULTIES.includes(currentUser.faculty || '');

        const claimDataForCalc: Partial<IncentiveClaim> = { 
            ...claim, 
            authors: claim.authors?.map(author => {
                // For calculation, treat the current applicant as the primary one for role-based logic
                if (author.email.toLowerCase() === currentUser.email.toLowerCase()) {
                    return { ...author, role: myAuthorDetails.role }; 
                }
                return author;
            }),
            userEmail: currentUser.email,
        };

        if (claim.claimType === 'Research Papers') {
            result = await calculateResearchPaperIncentive(claimDataForCalc, currentUser.faculty || '', currentUser.designation);
        } else if (claim.claimType === 'Books') {
            result = await calculateBookIncentive(claimDataForCalc);
        } else if (claim.claimType === 'Seed Money for APC') {
            result = await calculateApcIncentive(claimDataForCalc, isSpecialFaculty);
        } else if (claim.claimType === 'Conference Presentations') {
             result = await calculateConferenceIncentive(claimDataForCalc);
        }
        else {
            result = { success: true, amount: 0 };
        }
        
        if (result.success) {
            setCalculatedAmount(result.amount ?? 0);
        } else {
            toast({ 
                variant: 'destructive', 
                title: 'Calculation Error', 
                description: result.error 
            });
        }
    } catch (e: any) {
        console.error('Calculation error:', e);
        toast({ 
            variant: 'destructive', 
            title: 'Error', 
            description: e.message || 'Could not calculate incentive amount.' 
        });
    } finally {
        setIsCalculating(false);
    }
}, [currentUser, toast]);

    const handleApply = async (values: CoAuthorApplyValues) => {
        if (!claimToApply || !currentUser) {
            toast({ variant: 'destructive', title: 'Action Required', description: 'Cannot process claim application.' });
            return;
        }
        if (!currentUser.bankDetails) {
            toast({ variant: 'destructive', title: 'Action Required', description: 'Please complete your bank details in settings before applying.' });
            return;
        }
        setIsApplying(true);
        try {
            const { id, uid, userName, userEmail, status, submissionDate, publicationOrderInYear, ...originalClaimData } = claimToApply;

            const newClaim: Omit<IncentiveClaim, 'id' | 'claimId'> = {
                ...originalClaimData,
                publicationOrderInYear: values.publicationOrderInYear,
                originalClaimId: id,
                uid: currentUser.uid,
                userName: currentUser.name,
                userEmail: currentUser.email,
                status: 'Pending',
                submissionDate: new Date().toISOString(),
                bankDetails: currentUser.bankDetails,
                misId: currentUser.misId,
                orcidId: currentUser.orcidId,
                faculty: currentUser.faculty || '',
                institute: currentUser.institute || '',
                calculatedIncentive: calculatedAmount, // Store the calculated amount
            };
            
            await submitIncentiveClaim(newClaim);

            // Update the status on the original claim for this co-author
            const originalClaimRef = doc(db, 'incentiveClaims', claimToApply.id);
            const updatedCoAuthors = claimToApply.authors?.map(author => 
                author.uid === currentUser.uid ? { ...author, status: 'Applied' } : author
            );
            await updateDoc(originalClaimRef, { authors: updatedCoAuthors });
            
            toast({ title: 'Success', description: 'Your claim has been submitted based on the original publication details.' });
            setClaimToApply(null);
            onClaimApplied();
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message || 'Could not submit your claim.' });
        } finally {
            setIsApplying(false);
        }
    };
    
    const claimsToShow = claims.filter(claim => {
        const myDetails = claim.authors?.find(a => a.uid === currentUser?.uid);
        return !!myDetails;
    });
    
    const getMyCoAuthorDetails = (claim: IncentiveClaim) => {
        return claim.authors?.find(a => a.uid === currentUser?.uid);
    }
    
    const getClaimTitle = (claim: IncentiveClaim): string => {
        return claim.paperTitle || claim.publicationTitle || claim.patentTitle || claim.conferencePaperTitle || claim.professionalBodyName || claim.apcPaperTitle || 'Untitled Claim';
    };

    const myDetailsInDialog = claimToApply ? getMyCoAuthorDetails(claimToApply) : null;
    const myRole = myDetailsInDialog?.role;

    return (
      <>
        <div className="space-y-4">
            {claimsToShow.map(claim => {
                 const myDetails = getMyCoAuthorDetails(claim);
                 // Special rule for Scopus Conference Proceedings
                 const isScopusConference = claim.publicationType === 'Scopus Indexed Conference Proceedings';
                 const isPresentingAuthor = myDetails?.role === 'Presenting Author' || myDetails?.role === 'First & Presenting Author';
                 const canApplyForConference = isScopusConference ? isPresentingAuthor : true;
                 
                 const canApply = myDetails?.status === 'pending' && !!currentUser?.bankDetails && canApplyForConference;

                return (
                 <Card key={claim.id}>
                    <CardContent className="p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                         <div className="flex-1 space-y-2">
                            <p className="font-semibold">
                                {getClaimTitle(claim)}
                            </p>
                            <p className="text-sm text-muted-foreground">Primary Author: <span className="font-medium text-foreground">{claim.userName}</span></p>
                             <div className="flex items-center gap-2">
                                <Badge variant="outline">{claim.claimType}</Badge>
                                {isScopusConference && !isPresentingAuthor && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Badge variant="destructive">Not Eligible</Badge>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Only Presenting Authors can claim for this publication type.</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                             </div>
                        </div>
                        <Button onClick={() => handleOpenDialog(claim)} disabled={!canApply}>
                            {myDetails?.status === 'Applied' ? 'Applied' : 'View & Apply'}
                        </Button>
                    </CardContent>
                </Card>
            )})}
        </div>
        {claimToApply && (
            <Dialog open={!!claimToApply} onOpenChange={() => setClaimToApply(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Apply for Co-Author Incentive</DialogTitle>
                        <DialogDescription>
                           You are applying for an incentive for the publication: "${getClaimTitle(claimToApply)}".
                        </DialogDescription>
                    </DialogHeader>

                     <div className="space-y-3 py-4">
                        {myRole && (
                             <p className="text-sm"><strong>Your Role:</strong> <Badge variant="secondary">{myRole}</Badge></p>
                        )}
                        {claimToApply.claimType === 'Research Papers' && (
                            <>
                                <p className="text-sm"><strong>Journal:</strong> ${claimToApply.journalName}</p>
                                <p className="text-sm"><strong>Indexing:</strong> ${claimToApply.indexType?.toUpperCase()}</p>
                                <p className="text-sm"><strong>Q-Rating:</strong> ${claimToApply.journalClassification}</p>
                            </>
                        )}
                         {claimToApply.claimType === 'Books' && (
                             <>
                                <p className="text-sm"><strong>Publisher:</strong> ${claimToApply.publisherName}</p>
                                <p className="text-sm"><strong>Book Type:</strong> ${claimToApply.bookType}</p>
                            </>
                         )}
                        <Separator />
                        <div className="p-4 bg-secondary rounded-md text-center">
                            {isCalculating ? (
                                <div className="flex items-center justify-center">
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                                    <span>Calculating your incentive...</span>
                                </div>
                            ) : (
                                <>
                                    <p className="text-sm font-medium">Your Tentative Eligible Incentive Amount:</p>
                                    <p className="font-bold text-2xl text-primary mt-1">₹${calculatedAmount?.toLocaleString('en-IN') ?? 'N/A'}</p>
                                </>
                            )}
                        </div>
                     </div>

                    <Form {...form}>
                         <form id="co-author-apply-form" onSubmit={form.handleSubmit(handleApply)} className="space-y-4">
                             {claimToApply.claimType === 'Books' && (
                                <FormField
                                    control={form.control}
                                    name="publicationOrderInYear"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Is this your First/Second/Third Chapter/Book in the calendar year?</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select publication order" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="First">First</SelectItem>
                                                    <SelectItem value="Second">Second</SelectItem>
                                                    <SelectItem value="Third">Third</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                             )}
                         </form>
                    </Form>
                    <p className="text-xs text-muted-foreground">This action will create a new incentive claim under your name using the publication details from the original author's submission.</p>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" form="co-author-apply-form" disabled={isApplying || isCalculating}>
                           ${isApplying ? <><Loader2 className="h-4 w-4 animate-spin mr-2"/> Submitting...</> : 'Confirm & Apply'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}
      </>
    );
}


export default function IncentiveClaimPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userClaims, setUserClaims] = useState<IncentiveClaim[]>([]);
  const [coAuthorClaims, setCoAuthorClaims] = useState<IncentiveClaim[]>([]);
  const { toast } = useToast();
  const [selectedClaim, setSelectedClaim] = useState<IncentiveClaim | null>(null);
  const [claimToDelete, setClaimToDelete] = useState<IncentiveClaim | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [membershipClaimInfo, setMembershipClaimInfo] = useState<{ canClaim: boolean; nextAvailableDate?: string }>({ canClaim: true });
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'apply');
  const isMobile = useIsMobile();

  const updateUrl = useCallback((tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router]);

  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab) {
      setActiveTab(currentTab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeTab) {
      updateUrl(activeTab);
    }
  }, [activeTab, updateUrl]);


  const fetchAllData = useCallback(async (uid: string) => {
      setLoading(true);
      try {
          const claimsCollection = collection(db, 'incentiveClaims');
          
          // User's own claims
          const userClaimsQuery = query(claimsCollection, where('uid', '==', uid), orderBy('submissionDate', 'desc'));
          const userClaimSnapshot = await getDocs(userClaimsQuery);
          const userClaimList = userClaimSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as IncentiveClaim));
          setUserClaims(userClaimList);

          // Check for membership claim eligibility
          const lastMembershipClaim = userClaimList
            .filter(c => c.claimType === 'Membership of Professional Bodies' && c.status !== 'Draft' && c.status !== 'Rejected')
            .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())[0];

          if (lastMembershipClaim) {
            const lastClaimDate = parseISO(lastMembershipClaim.submissionDate);
            const daysSinceClaim = differenceInDays(new Date(), lastClaimDate);
            if (daysSinceClaim < 365) {
                const nextDate = addYears(lastClaimDate, 1);
                setMembershipClaimInfo({
                    canClaim: false,
                    nextAvailableDate: format(nextDate, 'PPP')
                });
            }
          }

          // Co-author claims
          const coAuthorClaimsQuery = query(claimsCollection, where('authorUids', 'array-contains', uid));
          const coAuthorSnapshot = await getDocs(coAuthorClaimsQuery);
          const coAuthorClaimList = coAuthorSnapshot.docs
              .map(doc => ({...doc.data(), id: doc.id} as IncentiveClaim))
              .filter(claim => claim.uid !== uid); // Ensure it's not the user's own claim
          setCoAuthorClaims(coAuthorClaimList);

          // System Settings
          const settings = await getSystemSettings();
          setSystemSettings(settings);

      } catch (error) {
          console.error("Error fetching data:", error);
          toast({ variant: 'destructive', title: "Error", description: "Could not fetch your data." });
      } finally {
          setLoading(false);
      }
  }, []);
  
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      fetchAllData(parsedUser.uid);
    } else {
        setLoading(false);
    }
  }, [fetchAllData]);

  const handleViewDetails = (claim: IncentiveClaim) => {
    setSelectedClaim(claim);
    setIsDetailsOpen(true);
  };
  
  const handleDeleteDraft = async () => {
    if (!claimToDelete || !user) return;
    setIsDeleting(true);
    try {
        const result = await deleteIncentiveClaim(claimToDelete.id, user.uid);
        if (result.success) {
            toast({ title: "Draft Deleted" });
            fetchAllData(user.uid);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error });
        }
    } catch(e) {
        toast({ variant: 'destructive', title: 'Error', description: 'Could not delete draft.' });
    } finally {
        setIsDeleting(false);
        setClaimToDelete(null);
    }
  };


  const draftClaims = userClaims.filter(c => c.status === 'Draft');
  const otherClaims = userClaims.filter(c => c.status !== 'Draft');

  const claimTypes = useMemo(() => [
    {
      title: 'Research Papers',
      description: 'Claim incentives for papers published in WoS/Scopus indexed journals.',
      href: '/dashboard/incentive-claim/research-paper',
      icon: FileText,
    },
    {
      title: 'Patents',
      description: 'Claim incentives for filed, published, or granted patents.',
      href: '/dashboard/incentive-claim/patent',
      icon: Award,
    },
    {
      title: 'Conference Presentations',
      description: 'Get assistance for presenting papers at events.',
      href: '/dashboard/incentive-claim/conference',
      icon: Presentation,
    },
    {
      title: 'Books',
      description: 'Claim incentives for publishing books or book chapters.',
      href: '/dashboard/incentive-claim/book',
      icon: Book,
    },
    {
      title: 'Membership of Professional Bodies',
      description: 'Claim 50% of the fee for one membership per year.',
      href: '/dashboard/incentive-claim/membership',
      icon: UserPlus,
      disabled: !membershipClaimInfo.canClaim,
      tooltip: !membershipClaimInfo.canClaim ? `You can apply again on ${membershipClaimInfo.nextAvailableDate}.` : undefined,
    },
    {
      title: 'Seed Money for APC',
      description: 'Claim reimbursement for Article Processing Charges after publication.',
      href: '/dashboard/incentive-claim/apc',
      icon: Banknote,
    },
  ], [membershipClaimInfo]);
  
  const enabledClaimTypes = useMemo(() => {
    let filteredTypes = claimTypes;

    if (user?.designation === 'Ph.D Scholar') {
        return filteredTypes.filter(type => type.title === 'Research Papers');
    }

    if (systemSettings?.enabledIncentiveTypes) {
        filteredTypes = filteredTypes.filter(type => systemSettings.enabledIncentiveTypes![type.title] !== false);
    }
    
    return filteredTypes;
  }, [systemSettings, claimTypes, user]);
  
  const tabs = [
    { value: 'apply', label: 'Apply' },
    { value: 'my-claims', label: `My Claims (${otherClaims.length})` },
    { value: 'co-author', label: `Co-Author Claims (${coAuthorClaims.filter(c => c.authors?.find(a => a.uid === user?.uid)?.status === 'pending').length})` },
    { value: 'draft', label: `Drafts (${draftClaims.length})` },
  ];

  return (
    <>
    <div className="container mx-auto max-w-5xl py-10">
      <PageHeader
        title="Incentive Claim Portal"
        description="Select a category to apply for an incentive, or view your existing claims below."
        showBackButton={false}
      />
      <div className="mt-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {isMobile ? (
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a view" />
              </SelectTrigger>
              <SelectContent>
                {tabs.map(tab => (
                  <SelectItem key={tab.value} value={tab.value}>{tab.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <TabsList className="grid w-full grid-cols-4">
              {tabs.map(tab => (
                  <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
              ))}
            </TabsList>
          )}

          <TabsContent value="apply" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {enabledClaimTypes.map(claim => {
                  const cardContent = (
                    <Card className={`flex flex-col w-full transition-colors ${claim.disabled ? 'bg-muted/50' : 'hover:bg-accent/50 dark:hover:bg-accent/20'}`}>
                      <CardHeader>
                        <claim.icon className={`h-7 w-7 mb-2 ${claim.disabled ? 'text-muted-foreground' : 'text-primary'}`} />
                        <CardTitle>{claim.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex-grow">
                        <p className="text-sm text-muted-foreground">{claim.description}</p>
                      </CardContent>
                      <CardFooter>
                        <div className={`text-sm font-semibold ${claim.disabled ? 'text-muted-foreground' : 'text-primary'}`}>
                           ${claim.disabled ? 'Unavailable' : <>Apply Now <ArrowRight className="inline-block ml-1 h-4 w-4" /></>}
                        </div>
                      </CardFooter>
                    </Card>
                  );

                  return (
                    <div key={claim.href}>
                        {claim.disabled ? (
                             <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild><div className="flex cursor-not-allowed">{cardContent}</div></TooltipTrigger>
                                    <TooltipContent><p>{claim.tooltip}</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        ) : (
                            <Link href={claim.href} className="flex">{cardContent}</Link>
                        )}
                    </div>
                  );
              })}
            </div>
          </TabsContent>
           <TabsContent value="my-claims" className="mt-4">
             {loading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={otherClaims} claimType="other" onViewDetails={handleViewDetails} onDeleteClaim={() => {}}/>}
          </TabsContent>
           <TabsContent value="co-author" className="mt-4">
            {loading ? <Skeleton className="h-40 w-full" /> : <CoAuthorClaimsList claims={coAuthorClaims} currentUser={user} onClaimApplied={() => fetchAllData(user!.uid)} />}
          </TabsContent>
          <TabsContent value="draft" className="mt-4">
             {loading ? <Skeleton className="h-40 w-full" /> : <UserClaimsList claims={draftClaims} claimType="draft" onViewDetails={handleViewDetails} onDeleteClaim={(id) => setClaimToDelete(userClaims.find(c => c.id === id) || null)}/>}
          </TabsContent>
        </Tabs>
      </div>
    </div>
    <ClaimDetailsDialog 
        claim={selectedClaim}
        open={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        currentUser={user}
        claimant={user} // On this page, the claimant is always the current user
    />
     <AlertDialog open={!!claimToDelete} onOpenChange={() => setClaimToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>This action will permanently delete this draft claim. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteDraft} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                    Delete
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
