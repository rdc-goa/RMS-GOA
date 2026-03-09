'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { IncentiveClaim, EmrInterest, Author } from '@/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CircleHelp, Sigma, Percent, Waypoints, Target, Trophy, GraduationCap, FileText, Star } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type CalculationDetails = {
    base?: number;
    multiplier?: number;
    quartileMultiplier?: number;
    authorMultiplier?: number;
    applicantMultiplier?: number;
    rolePoints?: number;
    role?: 'PI' | 'Co-PI';
};

export interface ArpsData {
    publications: { 
        raw: number; 
        weighted: number; 
        final: number; 
        contributingClaims: { 
            claim: IncentiveClaim, 
            score: number,
            calculation: CalculationDetails
        }[] 
    };
    patents: { 
        raw: number; 
        weighted: number; 
        final: number; 
        contributingClaims: { 
            claim: IncentiveClaim, 
            score: number,
            calculation: CalculationDetails
        }[] 
    };
    emr: { 
        raw: number; 
        weighted: number; 
        final: number; 
        contributingProjects: { 
            project: EmrInterest, 
            score: number,
            calculation: CalculationDetails
        }[] 
    };
    totalArps: number;
    grade: string;
    authorCounts?: {
        firstCorrespondingAuthor: number;
        coAuthor: number;
    };
}

interface ArpsResultsDisplayProps {
    results: ArpsData;
    evaluationYear?: string;
    evaluationWindow?: string;
}

const FormulaCard = ({ title, steps, result, icon: Icon }: { title: string, steps: { label: string, value: string }[], result: { label: string, value: string }, icon: React.ElementType }) => (
    <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5"/> {title}</CardTitle>
        </CardHeader>
        <CardContent>
            <Table>
                <TableBody>
                    {steps.map((step, i) => (
                        <TableRow key={i}>
                            <TableCell>{step.label}</TableCell>
                            <TableCell className="text-right font-mono">{step.value}</TableCell>
                        </TableRow>
                    ))}
                    <TableRow className="text-base font-bold bg-muted/50">
                        <TableCell>{result.label}</TableCell>
                        <TableCell className="text-right font-mono">{result.value}</TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </CardContent>
    </Card>
);

const getClaimant = (claim: IncentiveClaim): Author | undefined => {
    return claim.authors?.find(a => a.uid === claim.uid);
};

export function ArpsResultsDisplay({ results, evaluationYear, evaluationWindow }: ArpsResultsDisplayProps) {
    const { publications, patents, emr, totalArps, grade } = results;

    const totalRawScore = publications.raw + patents.raw + emr.raw;
    const totalWeightedScore = publications.weighted + patents.weighted + emr.weighted;

    const parseEmrAmountAndDuration = (durationAmount?: string) => {
        const raw = durationAmount || '';
        const amountMatch = raw.match(/Amount\s*:\s*[^\d]*([\d,]+(?:\.\d+)?)/i);
        const durationMatch = raw.match(/Duration\s*:\s*([^|]+)/i);

        const amount = amountMatch ? amountMatch[1].trim() : '';
        const duration = durationMatch ? durationMatch[1].trim() : '';

        return {
            amount: amount ? `₹${amount}` : 'N/A',
            duration: duration || 'N/A',
        };
    };

    const formatEmrSanctionDate = (dateValue?: string) => {
        if (!dateValue) return 'N/A';
        const parsed = new Date(dateValue);
        if (isNaN(parsed.getTime())) return 'N/A';
        return parsed.toLocaleDateString('en-GB');
    };

    const getSanctionProofUrl = (project: EmrInterest) => {
        return project.finalProofUrl || project.proofUrl || project.agencyAcknowledgementUrl || '';
    };

    const getPublicationProofUrl = (claim: IncentiveClaim) => {
        return claim.publicationProofUrls?.[0] || '';
    };

    return (
        <div className="mt-8 space-y-12">
            {/* Evaluation Period Info */}
            {evaluationYear && evaluationWindow && (
                <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground font-medium">Evaluation Year</p>
                                <p className="text-lg font-semibold">{evaluationYear}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground font-medium">Evaluation Period</p>
                                <p className="text-lg font-semibold">{evaluationWindow}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* --- Publications Section --- */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileText className="h-6 w-6"/> I. Publications Scoring Breakdown</h2>
                <Card>
                    <CardHeader>
                        <CardTitle>Step 1: Individual Publication Raw Scores</CardTitle>
                        <CardDescription>Each approved publication is scored based on its type, journal quality, and your role as an author. The formula is: <br/> <code className="font-mono text-sm bg-muted p-1 rounded-sm">Raw Score = Base Points × Quartile Multiplier × Author Multiplier</code></CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {publications.contributingClaims.length > 0 ? publications.contributingClaims.map(({ claim, score, calculation }) => {
                            const publicationProofUrl = getPublicationProofUrl(claim);
                            return <div key={claim.id} className="p-4 border rounded-lg bg-background/50">
                                <div className="flex justify-between items-start gap-4">
                                    {publicationProofUrl ? (
                                        <a href={publicationProofUrl} target="_blank" rel="noopener noreferrer" className="font-semibold flex-1 underline underline-offset-4 hover:text-primary">
                                            {claim.paperTitle || claim.publicationTitle}
                                        </a>
                                    ) : (
                                        <h4 className="font-semibold flex-1">{claim.paperTitle || claim.publicationTitle}</h4>
                                    )}
                                    {claim.claimId && <Badge variant="outline">{claim.claimId}</Badge>}
                                </div>
                                <div className="overflow-x-auto">
                                    <Table className="mt-2 text-sm whitespace-nowrap">
                                        <TableBody>
                                            {claim.claimType === 'Research Papers' ? (
                                                <>
                                                    <TableRow><TableCell className="w-[70%]">Base Points for article type '{claim.publicationType}'</TableCell><TableCell className="text-right font-mono">{calculation.base.toFixed(2)}</TableCell></TableRow>
                                                    <TableRow><TableCell>× Quartile Multiplier for <strong>{claim.journalClassification}</strong></TableCell><TableCell className="text-right font-mono">{(calculation.multiplier ?? calculation.quartileMultiplier ?? 1).toFixed(2)}</TableCell></TableRow>
                                                    <TableRow><TableCell>× Your Role Multiplier as <strong>{getClaimant(claim)?.role}</strong> (Position: {claim.authorPosition})</TableCell><TableCell className="text-right font-mono">{calculation.authorMultiplier?.toFixed(2)}</TableCell></TableRow>
                                                </>
                                            ) : (
                                                <>
                                                    <TableRow><TableCell className="w-[70%]">Base Points for {claim.claimType === 'Books' ? (claim.publicationType === 'Book Chapter' ? 'Scopus-indexed Book Chapter' : 'Scopus-indexed Book') : 'Scopus-indexed Conference Proceedings'}</TableCell><TableCell className="text-right font-mono">{calculation.base.toFixed(2)}</TableCell></TableRow>
                                                    {calculation.divisor && calculation.divisor > 1 && (
                                                        <TableRow><TableCell>÷ Number of Editors ({calculation.divisor})</TableCell><TableCell className="text-right font-mono">÷ {calculation.divisor}</TableCell></TableRow>
                                                    )}
                                                    <TableRow><TableCell>× Your Role Multiplier as <strong>{getClaimant(claim)?.role}</strong> (Position: {claim.authorPosition})</TableCell><TableCell className="text-right font-mono">{(calculation.multiplier ?? calculation.authorMultiplier ?? 1).toFixed(2)}</TableCell></TableRow>
                                                </>
                                            )}
                                            <TableRow className="font-bold border-t-2 border-primary/20"><TableCell>= Raw Score for this Publication</TableCell><TableCell className="text-right font-mono">{score.toFixed(2)}</TableCell></TableRow>
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        }) : <p className="text-muted-foreground text-center py-4">No contributing publications found in this period.</p>}
                    </CardContent>
                </Card>

                <FormulaCard
                    title="Step 2: Final Publication Score P(pub)"
                    icon={Target}
                    steps={[
                        { label: 'Sum of all Publication Raw Scores', value: publications.raw.toFixed(2) },
                        { label: '× Weightage (as per policy)', value: '× 0.80' },
                        { label: '= Weighted Score', value: `= ${publications.weighted.toFixed(2)}` },
                        { label: 'Maximum Score (Cap)', value: '80.00' },
                    ]}
                    result={{ label: 'Final Score P(pub) = min(Weighted Score, Cap)', value: publications.final.toFixed(2) }}
                />
            </div>

            {/* --- Patents Section --- */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Trophy className="h-6 w-6"/> II. Patent Scoring Breakdown</h2>
                <Card>
                    <CardHeader>
                        <CardTitle>Step 1: Individual Patent Raw Scores</CardTitle>
                        <CardDescription>Each patent is scored based on its status and the University's applicant role. The formula is: <br/> <code className="font-mono text-sm bg-muted p-1 rounded-sm">Raw Score = Base Points × Applicant Multiplier</code></CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {patents.contributingClaims.length > 0 ? patents.contributingClaims.map(({ claim, score, calculation }) => (
                            <div key={claim.id} className="p-4 border rounded-lg bg-background/50">
                                <div className="flex justify-between items-start gap-4">
                                    <h4 className="font-semibold flex-1">{claim.patentTitle}</h4>
                                    {claim.claimId && <Badge variant="outline">{claim.claimId}</Badge>}
                                </div>
                                <Table className="mt-2 text-sm"><TableBody>
                                    <TableRow><TableCell className="w-[70%]">Base Points for status '<strong>{claim.currentStatus} ({claim.patentLocale})</strong>'</TableCell><TableCell className="text-right font-mono">{calculation.base.toFixed(2)}</TableCell></TableRow>
                                    <TableRow><TableCell>× PU Applicant Multiplier (<strong>{claim.isPuSoleApplicant ? 'Sole' : 'Joint'} Applicant</strong>)</TableCell><TableCell className="text-right font-mono">{calculation.applicantMultiplier?.toFixed(2)}</TableCell></TableRow>
                                    <TableRow className="font-bold border-t-2 border-primary/20"><TableCell>= Raw Score for this Patent</TableCell><TableCell className="text-right font-mono">{score.toFixed(2)}</TableCell></TableRow>
                                </TableBody></Table>
                            </div>
                        )) : <p className="text-muted-foreground text-center py-4">No contributing patents found in this period.</p>}
                    </CardContent>
                </Card>
                <FormulaCard
                    title="Step 2: Final Patent Score P(patent)"
                    icon={Target}
                    steps={[
                        { label: 'Sum of all Patent Raw Scores', value: patents.raw.toFixed(2) },
                        { label: '× Weightage (as per policy)', value: '× 0.15' },
                        { label: '= Weighted Score', value: `= ${patents.weighted.toFixed(2)}` },
                        { label: 'Maximum Score (Cap)', value: '15.00' },
                    ]}
                    result={{ label: 'Final Score P(patent) = min(Weighted Score, Cap)', value: patents.final.toFixed(2) }}
                />
            </div>

            {/* --- EMR Section --- */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Star className="h-6 w-6"/> III. EMR Project Scoring Breakdown</h2>
                <Card>
                    <CardHeader>
                        <CardTitle>Step 1: Individual EMR Project Raw Scores</CardTitle>
                        <CardDescription>
                            EMR projects are scored directly by funding tier and role (PI vs Co‑PI); no ARPS weightage is applied later.
                            <br/>
                            <code className="font-mono text-sm bg-muted p-1 rounded-sm">Raw Score = Role Points (10/15/20 for PI; half for Co‑PI)</code>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {emr.contributingProjects.length > 0 ? emr.contributingProjects.map(({ project, score, calculation }) => {
                            const proofUrl = getSanctionProofUrl(project);
                            const { amount, duration } = parseEmrAmountAndDuration(project.durationAmount);

                            return <div key={project.id} className="p-4 border rounded-lg bg-background/50">
                                <div className="flex justify-between items-start gap-4">
                                    {proofUrl ? (
                                        <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="font-semibold flex-1 underline underline-offset-4 hover:text-primary">
                                            {project.callTitle}
                                        </a>
                                    ) : (
                                        <h4 className="font-semibold flex-1">{project.callTitle}</h4>
                                    )}
                                    {project.interestId && <Badge variant="outline">{project.interestId}</Badge>}
                                </div>
                                <Table className="mt-2 text-sm"><TableBody>
                                    <TableRow><TableCell className="w-[70%]">Points for role as <strong>{calculation.role ?? 'Co-PI'}</strong></TableCell><TableCell className="text-right font-mono">{score.toFixed(2)}</TableCell></TableRow>
                                    <TableRow><TableCell>Sanction Date</TableCell><TableCell className="text-right font-mono">{formatEmrSanctionDate(project.sanctionDate)}</TableCell></TableRow>
                                    <TableRow><TableCell>Amount</TableCell><TableCell className="text-right font-mono">{amount}</TableCell></TableRow>
                                    <TableRow><TableCell>Duration</TableCell><TableCell className="text-right font-mono">{duration}</TableCell></TableRow>
                                    {proofUrl && <TableRow><TableCell>Sanction Proof</TableCell><TableCell className="text-right font-mono break-all">Available</TableCell></TableRow>}
                                    <TableRow className="font-bold border-t-2 border-primary/20"><TableCell>= Raw Score for this Project</TableCell><TableCell className="text-right font-mono">{score.toFixed(2)}</TableCell></TableRow>
                                </TableBody></Table>
                            </div>
                        }) : <p className="text-muted-foreground text-center py-4">No contributing EMR projects found in this period.</p>}
                    </CardContent>
                </Card>
                <FormulaCard
                    title="Step 2: Final EMR Score P(EMR)"
                    icon={Target}
                    steps={[
                        { label: 'Sum of all EMR Raw Scores', value: emr.raw.toFixed(2) },
                        { label: 'No weightage applied (direct score)', value: '' },
                        { label: 'Cap on EMR component', value: '20.00' },
                    ]}
                    result={{ label: 'Final Score P(EMR) = min(Raw Score, Cap)', value: emr.final.toFixed(2) }}
                />
            </div>
            
            {/* Final ARPS Calculation Summary */}
            <div className="space-y-6">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Sigma className="h-6 w-6"/> IV. Final ARPS Calculation Summary</h2>
                <FormulaCard
                    title="Final ARPS Calculation"
                    icon={Sigma}
                    steps={[
                        { label: 'Total Raw Score (Publications + Patents + EMR)', value: totalRawScore.toFixed(2) },
                        { label: 'Total Weighted Score (Before Capping)', value: totalWeightedScore.toFixed(2) },
                        { label: 'Capped Publication Score: P(pub)', value: publications.final.toFixed(2) },
                        { label: '+ Capped Patent Score: P(patent)', value: `+ ${patents.final.toFixed(2)}` },
                        { label: '+ Capped EMR Project Score: P(EMR)', value: `+ ${emr.final.toFixed(2)}` },
                    ]}
                    result={{ label: '= Final ARPS', value: totalArps.toFixed(2) }}
                />
            </div>
        </div>
    );
}
