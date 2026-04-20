
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Info, Calculator, Users, GraduationCap } from 'lucide-react';
import type { IncentiveClaim, Author, User } from '@/types';
import { Separator } from '@/components/ui/separator';

interface CalculationBreakdownProps {
  claimData: Partial<IncentiveClaim>;
  user: User | null;
}

export function IncentiveCalculationBreakdown({ claimData, user }: CalculationBreakdownProps) {
  if (!user) {
    return null;
  }

  const {
    claimType,
    journalClassification,
    publicationType,
    authors = [],
    wasApcPaidByUniversity,
    isPuNameInPublication,
    authorPosition,
    // Patent fields
    currentStatus,
    patentFiledInPuName,
    isPuSoleApplicant,
    patentInventors = [],
    // Book fields 
    bookApplicationType,
    isScopusIndexed,
    publisherType,
    bookChapterPages,
    bookTotalPages,
    authorRole
  } = claimData;

  const internalAuthors = authors.filter(a => !a.isExternal);
  const claimant = authors.find(a => a.email.toLowerCase() === user.email.toLowerCase());

  let baseAmount = 0;
  let adjustedAmount = 0;
  let adjustmentMultiplier = 1.0;
  let finalIncentive = 0;
  let distributionText = '';
  let sharePercentage = 100;
  let steps: { label: string; value: string; multiplier?: string }[] = [];
  const apcPaid = wasApcPaidByUniversity === true;
  const puNameMissing = isPuNameInPublication === false;

  if (claimType === 'Research Papers') {
    // Base Logic
    if (user.designation === 'Ph.D Scholar') {
      switch (journalClassification) {
        case 'Q1': baseAmount = 6000; break;
        case 'Q2': baseAmount = 4000; break;
        default: baseAmount = 0;
      }
    } else if (publicationType === 'Scopus Indexed Conference Proceedings') {
      baseAmount = 3000;
    } else {
      switch (journalClassification) {
        case 'Nature/Science/Lancet': baseAmount = 50000; break;
        case 'Top 1% Journals': baseAmount = 25000; break;
        case 'Q1': baseAmount = 15000; break;
        case 'Q2': baseAmount = 10000; break;
        case 'Q3': baseAmount = 6000; break;
        case 'Q4': baseAmount = 4000; break;
        default: baseAmount = 0;
      }
    }

    steps.push({ label: 'Base Amount (Q-Rating)', value: `₹${baseAmount.toLocaleString('en-IN')}` });

    if (publicationType === 'Case Reports/Short Surveys') {
      adjustmentMultiplier = 0.9;
    } else if (publicationType === 'Review Articles' && (journalClassification === 'Q3' || journalClassification === 'Q4')) {
      adjustmentMultiplier = 0.8;
    }
    adjustedAmount = baseAmount * adjustmentMultiplier;

    steps.push({ 
        label: 'Publication Type Adjustment', 
        value: publicationType?.split('/')[0] || 'Standard',
        multiplier: `×${adjustmentMultiplier.toFixed(1)}×`
    });

    if (apcPaid) adjustedAmount /= 2;
    if (puNameMissing) adjustedAmount /= 2;

    const mainAuthors = internalAuthors.filter(a => a.role === 'First Author' || a.role === 'Corresponding Author' || a.role === 'First & Corresponding Author');
    const coAuthors = internalAuthors.filter(a => a.role === 'Co-Author');

    if (internalAuthors.length === 1) {
      if (mainAuthors.length === 1) {
        distributionText = 'Sole main author (100%)';
        sharePercentage = 100;
        finalIncentive = adjustedAmount;
      } else if (coAuthors.length === 1) {
        distributionText = 'Sole co-author (80% of total pool)';
        sharePercentage = 80;
        finalIncentive = adjustedAmount * 0.8;
      }
    } else if (mainAuthors.length > 0 && coAuthors.length > 0) {
      if (claimant?.role === 'Co-Author') {
        distributionText = `Mixed: Co-authors get 30% ÷ ${coAuthors.length}`;
        sharePercentage = 30 / coAuthors.length;
        finalIncentive = (adjustedAmount * 0.3) / coAuthors.length;
      } else {
        distributionText = `Mixed: Main authors get 70% ÷ ${mainAuthors.length}`;
        sharePercentage = 70 / mainAuthors.length;
        finalIncentive = (adjustedAmount * 0.7) / mainAuthors.length;
      }
    } else if (mainAuthors.length === 0 && coAuthors.length > 1) {
      distributionText = `Multiple Co-authors (no internal main): 80% ÷ ${coAuthors.length}`;
      sharePercentage = 80 / coAuthors.length;
      finalIncentive = (adjustedAmount * 0.8) / coAuthors.length;
    } else if (mainAuthors.length > 0 && coAuthors.length === 0) {
      distributionText = `Multiple Main authors: 100% ÷ ${mainAuthors.length}`;
      sharePercentage = 100 / mainAuthors.length;
      finalIncentive = adjustedAmount / mainAuthors.length;
    }

    if (publicationType === 'Scopus Indexed Conference Proceedings') {
        const presentingAuthors = internalAuthors.filter(a => a.role === 'Presenting Author' || a.role === 'First & Presenting Author');
        const isClaimantPresenting = presentingAuthors.some(a => a.email.toLowerCase() === user.email.toLowerCase());
        if (!isClaimantPresenting) {
            finalIncentive = 0;
            distributionText = 'Only Presenting Authors are eligible';
        } else {
            finalIncentive = adjustedAmount / (presentingAuthors.length || 1);
            distributionText = `Presenting Author share (Total Pool ÷ ${presentingAuthors.length})`;
        }
    }
  } else if (claimType === 'Patents') {
      const inventorCount = patentInventors.length || 1;
      baseAmount = currentStatus === 'Published' ? 3000 : (currentStatus === 'Granted' || currentStatus === 'Awarded' ? 15000 : 0);
      steps.push({ label: 'Base Amount (Status)', value: `₹${baseAmount.toLocaleString('en-IN')}` });

      if (patentFiledInPuName) {
        adjustmentMultiplier = isPuSoleApplicant ? 1.0 : 0.8;
      } else {
        adjustmentMultiplier = 0;
      }
      adjustedAmount = baseAmount * adjustmentMultiplier;

      steps.push({ 
          label: 'Applicant Adjustment', 
          value: isPuSoleApplicant ? 'Sole Applicant' : (patentFiledInPuName ? 'Joint Applicant' : 'Non-PU Applicant'),
          multiplier: `×${adjustmentMultiplier.toFixed(1)}×`
      });

      finalIncentive = adjustedAmount / inventorCount;
      distributionText = `Split between ${inventorCount} inventor(s)`;
      sharePercentage = 100 / inventorCount;
  } else if (claimType === 'Books') {
      const isChapter = bookApplicationType === 'Book Chapter';
      const pages = isChapter ? (bookChapterPages || 0) : (bookTotalPages || 0);
      
      const getBookBase = () => {
          if (isScopusIndexed) return isChapter ? 6000 : 18000;
          if (publisherType === 'National') {
              if (isChapter) {
                  if (pages > 20) return 2500;
                  if (pages >= 10) return 1500;
                  return 500;
              } else {
                  if (pages > 350) return 3000;
                  if (pages >= 200) return 2500;
                  if (pages >= 100) return 2000;
                  return 1000;
              }
          } else if (publisherType === 'International') {
              if (isChapter) {
                   if (pages > 20) return 3000;
                   if (pages >= 10) return 2000;
                   return 1000;
              } else {
                  if (pages > 350) return 6000;
                  if (pages >= 200) return 3500;
                  return 2000;
              }
          }
          return 0;
      };

      baseAmount = getBookBase();
      steps.push({ label: 'Base Amount (Pages/Indexing)', value: `₹${baseAmount.toLocaleString('en-IN')}` });

      adjustmentMultiplier = authorRole === 'Editor' ? 0.5 : 1.0;
      adjustedAmount = baseAmount * adjustmentMultiplier;
      
      steps.push({ 
          label: 'Author Role Adjustment', 
          value: authorRole || 'Author',
          multiplier: `×${adjustmentMultiplier.toFixed(1)}×`
      });

      const internalCount = authors.filter(a => !a.isExternal).length || 1;
      finalIncentive = adjustedAmount / internalCount;
      distributionText = `Split between ${internalCount} PU author(s)`;
      sharePercentage = 100 / internalCount;
  } else if (claimType === 'Conference Presentations') {
      const regFee = Number(claimData.registrationFee || 0);
      const fare = Number(claimData.travelFare || 0);
      const isPuConference = claimData.organizerName?.toLowerCase().includes('parul university goa') || claimData.conferenceName?.toLowerCase().includes('picet');
      
      steps.push({ label: 'Registration Fee', value: `₹${regFee.toLocaleString('en-IN')}` });
      if (claimData.conferenceMode === 'Offline') {
          steps.push({ label: 'Travel Fare', value: `₹${fare.toLocaleString('en-IN')}` });
      }

      // Percentage adjustment
      let percentage = 1.0;
      if (isPuConference) {
          percentage = 0.75;
          distributionText = 'PU Conference: 75% reimbursement';
      } else if (claimData.conferenceMode === 'Online') {
          switch (claimData.onlinePresentationOrder) {
              case 'First': percentage = 1.0; break;
              case 'Second': percentage = 0.5; break;
              case 'Third': percentage = 0.25; break;
              default: percentage = 0;
          }
          distributionText = `Online Presentation Order: ${claimData.onlinePresentationOrder} (${percentage * 100}%)`;
      } else {
          distributionText = 'Full eligible reimbursement (Subject to caps)';
      }

      const totalExpenses = regFee + fare;
      adjustedAmount = totalExpenses * percentage;

      steps.push({ 
          label: 'Policy Multiplier', 
          value: isPuConference ? 'PU Event' : (claimData.conferenceMode || 'Standard'),
          multiplier: `×${percentage.toFixed(2)}×`
      });

      // Caps
      let cap = 15000;
      if (claimData.conferenceType === 'National') cap = 7500;
      if (claimData.conferenceType === 'Regional/State') cap = 3000;

      finalIncentive = Math.min(adjustedAmount, cap);
      if (adjustedAmount > cap) {
          distributionText += ` (Capped at ₹${cap.toLocaleString('en-IN')})`;
      }
      sharePercentage = (finalIncentive / (totalExpenses || 1)) * 100;
  } else {
    return null;
  }

  // Eligibility check for co-author position
  const isBeyondFifth = authorPosition && ['6th', '7th', '8th', '9th', '10th'].includes(authorPosition) && claimant?.role === 'Co-Author';
  if (isBeyondFifth) {
      finalIncentive = 0;
  }

  return (
    <Card className="border-primary/20 bg-primary/5 overflow-hidden">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <Calculator className="h-4 w-4" />
          <h4 className="text-sm uppercase tracking-wider">Incentive Calculation Breakdown</h4>
        </div>

        <div className="space-y-2.5 text-sm">
          {steps.map((step, idx) => (
            <div key={idx} className="flex justify-between items-center">
              <span className="text-muted-foreground">{idx + 1}. {step.label}:</span>
              <div className="flex items-center gap-1.5">
                 {step.multiplier ? (
                   <>
                     <Badge variant="outline" className="text-[10px] h-5">{step.value}</Badge>
                     <span className="font-medium">{step.multiplier}</span>
                   </>
                 ) : (
                   <span className="font-medium">{step.value}</span>
                 )}
              </div>
            </div>
          ))}

          {(apcPaid || puNameMissing) && (
            <div className="space-y-1 bg-yellow-500/10 p-2 rounded border border-yellow-500/20">
               <p className="text-[11px] font-semibold text-yellow-700 dark:text-yellow-400 uppercase">Policy Deductions (Applied before sharing):</p>
               {apcPaid && (
                 <div className="flex justify-between items-center text-xs text-yellow-800 dark:text-yellow-200">
                    <span>APC paid by University</span>
                    <span className="font-medium">-50%</span>
                 </div>
               )}
               {puNameMissing && (
                 <div className="flex justify-between items-center text-xs text-yellow-800 dark:text-yellow-200">
                    <span>PU Name missing in affiliation</span>
                    <span className="font-medium">-50%</span>
                 </div>
               )}
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <span className="text-muted-foreground">{steps.length + 1}. Total Pool after Adjustments:</span>
            <span className="font-semibold text-primary">₹{adjustedAmount.toLocaleString('en-IN')}</span>
          </div>

          <Separator className="my-2 bg-primary/10" />

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground font-medium mb-1">
              <Users className="h-3.5 w-3.5" />
              <span>Author/Inventor Distribution:</span>
            </div>
            
            <div className="bg-white/50 dark:bg-black/20 p-2 rounded-md mt-1 border border-primary/10 flex justify-between items-center">
               <span className="text-xs font-medium">{distributionText}</span>
               {finalIncentive > 0 && <Badge variant="secondary" className="text-[10px]">{sharePercentage.toFixed(1)}% Share</Badge>}
            </div>
          </div>

          <div className="pt-3">
             <div className="flex flex-col gap-1 items-end">
                <span className="text-[11px] text-muted-foreground font-medium uppercase">Final Incentive per Author:</span>
                <span className="text-2xl font-bold text-primary">₹{finalIncentive.toLocaleString('en-IN')}</span>
             </div>
             
             {isBeyondFifth && (
               <div className="mt-2 flex items-start gap-2 bg-yellow-500/10 p-2 rounded border border-yellow-500/20 text-[11px] text-yellow-700 dark:text-yellow-300">
                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <p>As per policy, co-authors beyond the 5th position are eligible for ARPS score but not monetary incentives.</p>
               </div>
             )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
