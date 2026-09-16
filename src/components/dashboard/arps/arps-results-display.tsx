'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { IncentiveClaim, EmrInterest, Author } from '@/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CircleHelp, Sigma, Target, Trophy, GraduationCap, FileText, Star, Briefcase, Landmark, Info, Sparkles, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type CalculationDetails = {
    base?: number;
    multiplier?: number;
    quartileMultiplier?: number;
    authorMultiplier?: number;
    applicantMultiplier?: number;
    rolePoints?: number;
    role?: 'PI' | 'Co-PI';
    divisor?: number;
};

export interface ArpsData {
    publications: { 
        raw: number; 
        weighted: number; 
        final: number; 
        contributingClaims: { 
            claim: any, 
            score: number,
            calculation: CalculationDetails
        }[] 
    };
    patents: { 
        raw: number; 
        weighted: number; 
        final: number; 
        contributingClaims: { 
            claim: any, 
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
    consultancy?: {
        raw: number;
        weighted: number;
        final: number;
        contributingClaims: {
            claim: any;
            score: number;
            calculation: any;
        }[];
    };
    researchActivities?: {
        raw: number;
        weighted: number;
        final: number;
        contributingClaims: {
            claim: any;
            score: number;
            calculation: any;
        }[];
        subtotals?: Record<string, number>;
        cappedSubtotals?: Record<string, number>;
    };
    totalArps: number;
    grade: string;
    authorCounts?: {
        firstCorrespondingAuthor: number;
        coAuthor: number;
    };
    otherDetails?: any[];
}

interface ArpsResultsDisplayProps {
    results: ArpsData;
    evaluationYear?: string;
    evaluationWindow?: string;
}

const FormulaCard = ({ title, steps, result, icon: Icon }: { title: string, steps: { label: string, value: string }[], result: { label: string, value: string }, icon: React.ElementType }) => (
    <Card className="border border-border/80 shadow-md">
        <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-base font-bold"><Icon className="h-5 w-5 text-primary"/> {title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
            <Table>
                <TableBody>
                    {steps.map((step, i) => (
                        <TableRow key={i} className="hover:bg-transparent border-none">
                            <TableCell className="py-1.5 text-sm text-muted-foreground">{step.label}</TableCell>
                            <TableCell className="py-1.5 text-right font-mono text-sm font-semibold">{step.value}</TableCell>
                        </TableRow>
                    ))}
                    <TableRow className="text-sm font-bold bg-primary/5 border-t border-primary/20">
                        <TableCell className="py-2.5 text-primary">{result.label}</TableCell>
                        <TableCell className="py-2.5 text-right font-mono text-primary text-base font-extrabold">{result.value}</TableCell>
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

    const totalRawScore = publications.raw + patents.raw + emr.raw + (results.consultancy?.raw || 0) + (results.researchActivities?.raw || 0);
    const totalWeightedScore = publications.weighted + patents.weighted + emr.weighted + (results.consultancy?.weighted || 0) + (results.researchActivities?.weighted || 0);

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

    const getGenericProofUrl = (claim: any) => {
        return claim.proofUrls?.[0] || claim.routingProofUrl || '';
    };

    // Filter research activities into academic vs student guided
    const activityClaims = results.researchActivities?.contributingClaims.filter(({ claim }) => claim.type !== 'student') || [];
    const studentClaims = results.researchActivities?.contributingClaims.filter(({ claim }) => claim.type === 'student') || [];

    return (
        <div className="mt-8 space-y-8">
            {/* Evaluation Period Info */}
            {evaluationYear && evaluationWindow && (
                <Card className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                            <div>
                                <p className="text-muted-foreground font-medium text-xs uppercase tracking-wider">Evaluation Year</p>
                                <p className="text-xl font-extrabold mt-1">{evaluationYear}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground font-medium text-xs uppercase tracking-wider">Evaluation Period</p>
                                <p className="text-xl font-extrabold mt-1">{evaluationWindow}</p>
                            </div>
                            <div className="flex flex-col md:items-end">
                                <p className="text-muted-foreground font-medium text-xs uppercase tracking-wider md:text-right">ARPS Performance Grade</p>
                                <Badge className={cn(
                                    "text-lg px-5 py-1.5 font-mono font-extrabold mt-2 w-fit",
                                    grade.startsWith('SEE') && "bg-emerald-600 hover:bg-emerald-700 text-white",
                                    grade.startsWith('EE') && "bg-blue-600 hover:bg-blue-700 text-white",
                                    grade.startsWith('ME') && "bg-amber-600 hover:bg-amber-700 text-white",
                                    grade.startsWith('DME') && "bg-slate-600 hover:bg-slate-700 text-white"
                                )}>
                                    {grade}
                                </Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* --- Global Summary Section at Top --- */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-foreground"><Sigma className="h-5.5 w-5.5 text-primary"/> ARPS Calculation Summary</h2>
                <Card className="shadow-lg border border-border">
                    <CardContent className="p-0 overflow-x-auto">
                        <Table className="w-full text-sm text-left">
                            <thead>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableCell className="font-bold py-3.5">Component</TableCell>
                                    <TableCell className="font-bold py-3.5 text-center">Raw Score</TableCell>
                                    <TableCell className="font-bold py-3.5 text-center">Weighted Score</TableCell>
                                    <TableCell className="font-bold py-3.5 text-right pr-6">Final Capped Score</TableCell>
                                </TableRow>
                            </thead>
                            <TableBody>
                                <TableRow className="hover:bg-muted/10">
                                    <TableCell className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground"/> Publications</TableCell>
                                    <TableCell className="text-center font-mono">{publications.raw.toFixed(2)}</TableCell>
                                    <TableCell className="text-center font-mono">{publications.weighted.toFixed(2)}</TableCell>
                                    <TableCell className="text-right pr-6 font-mono font-bold text-primary">{publications.final.toFixed(2)}</TableCell>
                                </TableRow>
                                <TableRow className="hover:bg-muted/10">
                                    <TableCell className="font-semibold flex items-center gap-2"><Trophy className="h-4 w-4 text-muted-foreground"/> Patents</TableCell>
                                    <TableCell className="text-center font-mono">{patents.raw.toFixed(2)}</TableCell>
                                    <TableCell className="text-center font-mono">{patents.weighted.toFixed(2)}</TableCell>
                                    <TableCell className="text-right pr-6 font-mono font-bold text-primary">{patents.final.toFixed(2)}</TableCell>
                                </TableRow>
                                <TableRow className="hover:bg-muted/10">
                                    <TableCell className="font-semibold flex items-center gap-2"><Star className="h-4 w-4 text-muted-foreground"/> EMR Projects</TableCell>
                                    <TableCell className="text-center font-mono">{emr.raw.toFixed(2)}</TableCell>
                                    <TableCell className="text-center font-mono">{emr.weighted.toFixed(2)}</TableCell>
                                    <TableCell className="text-right pr-6 font-mono font-bold text-primary">{emr.final.toFixed(2)}</TableCell>
                                </TableRow>
                                <TableRow className="hover:bg-muted/10">
                                    <TableCell className="font-semibold flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground"/> Consultancy</TableCell>
                                    <TableCell className="text-center font-mono">{(results.consultancy?.raw || 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-center font-mono">{(results.consultancy?.weighted || 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right pr-6 font-mono font-bold text-primary">{(results.consultancy?.final || 0).toFixed(2)}</TableCell>
                                </TableRow>
                                <TableRow className="hover:bg-muted/10">
                                    <TableCell className="font-semibold flex items-center gap-2"><GraduationCap className="h-4 w-4 text-muted-foreground"/> Research Activities (Academic &amp; Students)</TableCell>
                                    <TableCell className="text-center font-mono">{(results.researchActivities?.raw || 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-center font-mono">{(results.researchActivities?.weighted || 0).toFixed(2)}</TableCell>
                                    <TableCell className="text-right pr-6 font-mono font-bold text-primary">{(results.researchActivities?.final || 0).toFixed(2)}</TableCell>
                                </TableRow>
                                <TableRow className="bg-primary/5 hover:bg-primary/5 font-extrabold border-t-2 border-primary/25">
                                    <TableCell className="text-primary text-base">Totals</TableCell>
                                    <TableCell className="text-center font-mono text-primary">{totalRawScore.toFixed(2)}</TableCell>
                                    <TableCell className="text-center font-mono text-primary">{totalWeightedScore.toFixed(2)}</TableCell>
                                    <TableCell className="text-right pr-6 font-mono text-primary text-lg font-black">{totalArps.toFixed(2)}</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* --- Premium Nested Tabbed Breakdown Details --- */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2 text-foreground"><Info className="h-5.5 w-5.5 text-primary"/> Detailed Component Breakdown</h2>
                
                <Tabs defaultValue="publications" className="w-full shadow-lg border rounded-xl overflow-hidden bg-card">
                    <TabsList className="bg-muted/50 p-1 flex justify-start rounded-none border-b overflow-x-auto whitespace-nowrap scrollbar-none">
                        <TabsTrigger value="publications" className="flex items-center gap-1.5 px-4 py-2"><FileText className="h-4 w-4"/> Publications</TabsTrigger>
                        <TabsTrigger value="patents" className="flex items-center gap-1.5 px-4 py-2"><Trophy className="h-4 w-4"/> Patents</TabsTrigger>
                        <TabsTrigger value="emr" className="flex items-center gap-1.5 px-4 py-2"><Star className="h-4 w-4"/> EMR Projects</TabsTrigger>
                        <TabsTrigger value="consultancy" className="flex items-center gap-1.5 px-4 py-2"><Briefcase className="h-4 w-4"/> Consultancy</TabsTrigger>
                        <TabsTrigger value="activities" className="flex items-center gap-1.5 px-4 py-2"><GraduationCap className="h-4 w-4"/> Activities &amp; Students</TabsTrigger>
                        {(results.otherDetails && results.otherDetails.length > 0) && (
                            <TabsTrigger value="others" className="flex items-center gap-1.5 px-4 py-2"><Landmark className="h-4 w-4"/> Others</TabsTrigger>
                        )}
                    </TabsList>

                    {/* Tab 1: Publications */}
                    <TabsContent value="publications" className="p-6 space-y-6 m-0 border-none">
                        <CardHeader className="p-0">
                            <CardTitle className="text-lg">Step 1: Individual Publication Raw Scores</CardTitle>
                            <CardDescription>Each approved publication is scored based on its type, journal quality, and your role as an author. The formula is: <br/> <code className="font-mono text-xs bg-muted p-1 rounded-sm">Raw Score = Base Points × Quartile Multiplier × Author Multiplier</code></CardDescription>
                        </CardHeader>

                        <div className="space-y-4">
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
                                        <Table className="mt-2 text-sm whitespace-nowrap w-full">
                                            <TableBody>
                                                {claim.claimType === 'Research Papers' ? (
                                                    <>
                                                        <TableRow><TableCell className="w-[70%] text-muted-foreground">Base Points for article type '{claim.publicationType}'</TableCell><TableCell className="text-right font-mono font-medium">{(calculation.base ?? 0).toFixed(2)}</TableCell></TableRow>
                                                        <TableRow><TableCell className="text-muted-foreground">× Quartile Multiplier for <strong>{claim.journalClassification}</strong></TableCell><TableCell className="text-right font-mono font-medium">{(calculation.multiplier ?? calculation.quartileMultiplier ?? 1).toFixed(2)}</TableCell></TableRow>
                                                        <TableRow><TableCell className="text-muted-foreground">× Your Role Multiplier as <strong>{getClaimant(claim)?.role}</strong> (Position: {claim.authorPosition})</TableCell><TableCell className="text-right font-mono font-medium">{calculation.authorMultiplier?.toFixed(2)}</TableCell></TableRow>
                                                    </>
                                                ) : (
                                                    <>
                                                        <TableRow><TableCell className="w-[70%] text-muted-foreground">Base Points for {claim.claimType === 'Books' ? (claim.publicationType === 'Book Chapter' ? 'Scopus-indexed Book Chapter' : 'Scopus-indexed Book') : 'Scopus-indexed Conference Proceedings'}</TableCell><TableCell className="text-right font-mono font-medium">{(calculation.base ?? 0).toFixed(2)}</TableCell></TableRow>
                                                        {claim.publicationType === 'Book Chapter' && claim.bookTitleForChapter && (
                                                            <TableRow><TableCell className="text-muted-foreground">Book Name</TableCell><TableCell className="text-right font-semibold">{claim.bookTitleForChapter}</TableCell></TableRow>
                                                        )}
                                                        {calculation.divisor && calculation.divisor > 1 && (
                                                            <TableRow><TableCell className="text-muted-foreground">÷ Number of Editors ({calculation.divisor})</TableCell><TableCell className="text-right font-mono font-medium">÷ {calculation.divisor}</TableCell></TableRow>
                                                        )}
                                                        <TableRow><TableCell className="text-muted-foreground">× Your Role Multiplier as <strong>{getClaimant(claim)?.role}</strong> (Position: {claim.authorPosition})</TableCell><TableCell className="text-right font-mono font-medium">{(calculation.multiplier ?? calculation.authorMultiplier ?? 1).toFixed(2)}</TableCell></TableRow>
                                                    </>
                                                )}
                                                <TableRow className="font-bold border-t border-border bg-primary/5 text-primary"><TableCell>Raw Score for this Publication</TableCell><TableCell className="text-right font-mono font-bold">{score.toFixed(2)}</TableCell></TableRow>
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>;
                            }) : <p className="text-muted-foreground text-center py-8 bg-muted/10 rounded-lg">No contributing publications found in this period.</p>}
                        </div>

                        <Separator />

                        <FormulaCard
                            title="Step 2: Publication Score Calculation"
                            icon={Target}
                            steps={[
                                { label: 'Sum of all Publication Raw Scores', value: publications.raw.toFixed(2) },
                                { label: '× Dynamic Policy Weightage', value: `× ${(publications.weighted / (publications.raw || 1)).toFixed(2)}` },
                                { label: '= Weighted Score', value: `${publications.weighted.toFixed(2)}` },
                                { label: 'Maximum Component Cap', value: `${(results as any).caps?.publication || '80'}.00` },
                            ]}
                            result={{ label: 'Final Score P(pub) = min(Weighted Score, Cap)', value: publications.final.toFixed(2) }}
                        />
                    </TabsContent>

                    {/* Tab 2: Patents */}
                    <TabsContent value="patents" className="p-6 space-y-6 m-0 border-none">
                        <CardHeader className="p-0">
                            <CardTitle className="text-lg">Step 1: Individual Patent Raw Scores</CardTitle>
                            <CardDescription>Each patent is scored based on its status and the University's applicant role. The formula is: <br/> <code className="font-mono text-xs bg-muted p-1 rounded-sm">Raw Score = Base Points × Applicant Multiplier</code></CardDescription>
                        </CardHeader>

                        <div className="space-y-4">
                            {patents.contributingClaims.length > 0 ? patents.contributingClaims.map(({ claim, score, calculation }) => (
                                <div key={claim.id} className="p-4 border rounded-lg bg-background/50">
                                    <div className="flex justify-between items-start gap-4">
                                        <h4 className="font-semibold flex-1">{claim.patentTitle}</h4>
                                        {claim.claimId && <Badge variant="outline">{claim.claimId}</Badge>}
                                    </div>
                                    <Table className="mt-2 text-sm w-full"><TableBody>
                                        <TableRow><TableCell className="w-[70%] text-muted-foreground">Base Points for status '<strong>{claim.currentStatus || claim.patentCategory} ({claim.patentLocale || 'India'})</strong>'</TableCell><TableCell className="text-right font-mono font-medium">{(calculation.base ?? 0).toFixed(2)}</TableCell></TableRow>
                                        <TableRow><TableCell className="text-muted-foreground">× PU Applicant Multiplier (<strong>{claim.isPuSoleApplicant ? 'Sole' : 'Joint'} Applicant</strong>)</TableCell><TableCell className="text-right font-mono font-medium">{calculation.applicantMultiplier?.toFixed(2)}</TableCell></TableRow>
                                        <TableRow className="font-bold border-t border-border bg-primary/5 text-primary"><TableCell>Raw Score for this Patent</TableCell><TableCell className="text-right font-mono font-bold">{score.toFixed(2)}</TableCell></TableRow>
                                    </TableBody></Table>
                                </div>
                            )) : <p className="text-muted-foreground text-center py-8 bg-muted/10 rounded-lg">No contributing patents found in this period.</p>}
                        </div>

                        <Separator />

                        <FormulaCard
                            title="Step 2: Patent Score Calculation"
                            icon={Target}
                            steps={[
                                { label: 'Sum of all Patent Raw Scores', value: patents.raw.toFixed(2) },
                                { label: '× Dynamic Policy Weightage', value: `× ${(patents.weighted / (patents.raw || 1)).toFixed(2)}` },
                                { label: '= Weighted Score', value: `${patents.weighted.toFixed(2)}` },
                                { label: 'Maximum Component Cap', value: `${(results as any).caps?.patent || '5'}.00` },
                            ]}
                            result={{ label: 'Final Score P(patent) = min(Weighted Score, Cap)', value: patents.final.toFixed(2) }}
                        />
                    </TabsContent>

                    {/* Tab 3: EMR Projects */}
                    <TabsContent value="emr" className="p-6 space-y-6 m-0 border-none">
                        <CardHeader className="p-0">
                            <CardTitle className="text-lg">Step 1: Individual EMR Project Raw Scores</CardTitle>
                            <CardDescription>
                                Extramural Research (EMR) projects are scored directly by funding tier and investigator role (Principal Investigator vs Co-PI).
                                <br/>
                                <code className="font-mono text-xs bg-muted p-1 rounded-sm">Raw Score = Role Points</code>
                            </CardDescription>
                        </CardHeader>

                        <div className="space-y-4">
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
                                        {((project as any).submissionId || project.interestId) && (
                                            <Badge variant="outline">{(project as any).submissionId || project.interestId}</Badge>
                                        )}
                                    </div>
                                    <Table className="mt-2 text-sm w-full"><TableBody>
                                        <TableRow><TableCell className="w-[70%] text-muted-foreground">Points for role as <strong>{calculation.role || (project as any).role || 'PI'}</strong></TableCell><TableCell className="text-right font-mono font-medium">{score.toFixed(2)}</TableCell></TableRow>
                                        <TableRow><TableCell className="text-muted-foreground">Sanction Date</TableCell><TableCell className="text-right font-mono font-medium">{formatEmrSanctionDate(project.sanctionDate)}</TableCell></TableRow>
                                        <TableRow><TableCell className="text-muted-foreground">Amount</TableCell><TableCell className="text-right font-mono font-medium">{amount}</TableCell></TableRow>
                                        <TableRow><TableCell className="text-muted-foreground">Duration</TableCell><TableCell className="text-right font-mono font-medium">{duration}</TableCell></TableRow>
                                        <TableRow className="font-bold border-t border-border bg-primary/5 text-primary"><TableCell>Raw Score for this Project</TableCell><TableCell className="text-right font-mono font-bold">{score.toFixed(2)}</TableCell></TableRow>
                                    </TableBody></Table>
                                </div>;
                            }) : <p className="text-muted-foreground text-center py-8 bg-muted/10 rounded-lg">No contributing EMR projects found in this period.</p>}
                        </div>

                        <Separator />

                        <FormulaCard
                            title="Step 2: EMR Score Calculation"
                            icon={Target}
                            steps={[
                                { label: 'Sum of all EMR Raw Scores', value: emr.raw.toFixed(2) },
                                { label: '× Dynamic Policy Weightage', value: `× ${(emr.weighted / (emr.raw || 1)).toFixed(2)}` },
                                { label: '= Weighted Score', value: `${emr.weighted.toFixed(2)}` },
                                { label: 'Maximum Component Cap', value: `${(results as any).caps?.emr || '5'}.00` },
                            ]}
                            result={{ label: 'Final Score P(EMR) = min(Weighted Score, Cap)', value: emr.final.toFixed(2) }}
                        />
                    </TabsContent>

                    {/* Tab 4: Consultancy */}
                    <TabsContent value="consultancy" className="p-6 space-y-6 m-0 border-none">
                        <CardHeader className="p-0">
                            <CardTitle className="text-lg">Step 1: Individual Consultancy Raw Scores</CardTitle>
                            <CardDescription>
                                Revenue-generating consultancy claims are evaluated against structured point slabs, rewarding larger values.
                                <br />
                                <code className="font-mono text-xs bg-muted p-1 rounded-sm">Raw Score = Slab Points + Extra Steps (if &gt;₹500k)</code>
                            </CardDescription>
                        </CardHeader>

                        <div className="space-y-4">
                            {results.consultancy && results.consultancy.contributingClaims.length > 0 ? results.consultancy.contributingClaims.map(({ claim, score }) => {
                                const proofUrl = getGenericProofUrl(claim);
                                return <div key={claim.id} className="p-4 border rounded-lg bg-background/50">
                                    <div className="flex justify-between items-start gap-4">
                                        {proofUrl ? (
                                            <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="font-semibold flex-1 underline underline-offset-4 hover:text-primary">
                                                {claim.consultancyTitle || claim.title}
                                            </a>
                                        ) : (
                                            <h4 className="font-semibold flex-1">{claim.consultancyTitle || claim.title}</h4>
                                        )}
                                        {claim.submissionId && <Badge variant="outline">{claim.submissionId}</Badge>}
                                    </div>
                                    <Table className="mt-2 text-sm w-full"><TableBody>
                                        <TableRow><TableCell className="w-[70%] text-muted-foreground">Client Organization</TableCell><TableCell className="text-right font-medium">{claim.clientOrganization || 'N/A'}</TableCell></TableRow>
                                        <TableRow><TableCell className="text-muted-foreground">Revenue Generated (₹)</TableCell><TableCell className="text-right font-mono font-medium">₹{(claim.revenueAmount || claim.revenue || 0).toLocaleString('en-IN')}</TableCell></TableRow>
                                        <TableRow><TableCell className="text-muted-foreground">Transaction/Sanction Date</TableCell><TableCell className="text-right font-mono font-medium">{claim.transactionDate ? new Date(claim.transactionDate).toLocaleDateString('en-GB') : 'N/A'}</TableCell></TableRow>
                                        <TableRow className="font-bold border-t border-border bg-primary/5 text-primary"><TableCell>Raw Score for this Claim</TableCell><TableCell className="text-right font-mono font-bold">{score.toFixed(2)}</TableCell></TableRow>
                                    </TableBody></Table>
                                </div>;
                            }) : <p className="text-muted-foreground text-center py-8 bg-muted/10 rounded-lg">No contributing consultancy projects found in this period.</p>}
                        </div>

                        <Separator />

                        {results.consultancy && (
                            <FormulaCard
                                title="Step 2: Consultancy Score Calculation"
                                icon={Target}
                                steps={[
                                    { label: 'Sum of all Consultancy Raw Scores', value: results.consultancy.raw.toFixed(2) },
                                    { label: '× Dynamic Policy Weightage', value: `× ${(results.consultancy.weighted / (results.consultancy.raw || 1)).toFixed(2)}` },
                                    { label: '= Weighted Score', value: `${results.consultancy.weighted.toFixed(2)}` },
                                    { label: 'Maximum Component Cap', value: `${(results as any).caps?.consultancy || '5'}.00` },
                                ]}
                                result={{ label: 'Final Score P(consultancy) = min(Weighted Score, Cap)', value: results.consultancy.final.toFixed(2) }}
                            />
                        )}
                    </TabsContent>

                    {/* Tab 5: Activities & Students */}
                    <TabsContent value="activities" className="p-6 space-y-6 m-0 border-none">
                        <CardHeader className="p-0">
                            <CardTitle className="text-lg">Research Activities Scoring</CardTitle>
                            <CardDescription>
                                Academic Activites and student thesis guidance contribute to this section. Subcategory scores are individualy capped at **10.0 points** maximum to ensure balanced performance.
                            </CardDescription>
                        </CardHeader>

                        {/* Subcategory sub-total meters */}
                        {results.researchActivities?.subtotals && (
                            <div className="bg-muted/30 p-4 rounded-xl border space-y-3">
                                <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Mapped Subcategory Points &amp; Caps</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                                    {Object.entries(results.researchActivities.subtotals).map(([key, val]) => {
                                        const cappedVal = results.researchActivities?.cappedSubtotals?.[key] ?? 0;
                                        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                        const isCapped = val > 10;
                                        return (
                                            <div key={key} className="bg-background p-2.5 rounded border flex justify-between items-center shadow-sm">
                                                <span className="font-medium text-muted-foreground truncate mr-2" title={label}>{label}</span>
                                                <div className="text-right shrink-0">
                                                    <span className="font-mono font-bold">{val.toFixed(1)}</span>
                                                    {isCapped && (
                                                        <span className="text-[10px] text-destructive font-black ml-1.5" title="Capped at 10 points max. font">
                                                            (Capped: {cappedVal.toFixed(1)})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Section A: Academic Activities */}
                        <div className="space-y-3">
                            <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5"><GraduationCap className="h-4.5 w-4.5 text-primary"/> Part A: Academic &amp; Conference Activities</h4>
                            {activityClaims.length > 0 ? (
                                <div className="border rounded-lg overflow-hidden bg-background">
                                    <Table>
                                        <thead>
                                            <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
                                                <TableCell className="font-bold py-2.5">Claim ID</TableCell>
                                                <TableCell className="font-bold py-2.5">Activity Title</TableCell>
                                                <TableCell className="font-bold py-2.5">Category</TableCell>
                                                <TableCell className="font-bold py-2.5 text-right pr-4">Raw Score</TableCell>
                                            </TableRow>
                                        </thead>
                                        <TableBody className="text-xs">
                                            {activityClaims.map(({ claim, score }) => (
                                                <TableRow key={claim.id} className="hover:bg-muted/5">
                                                    <TableCell className="font-mono text-muted-foreground">{claim.submissionId || claim.id}</TableCell>
                                                    <TableCell className="font-semibold">{claim.name || claim.eventName || 'Academic Activity'}</TableCell>
                                                    <TableCell><Badge variant="outline">{claim.category || claim.activityCategory}</Badge></TableCell>
                                                    <TableCell className="text-right pr-4 font-mono font-bold text-foreground">{score.toFixed(2)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : <p className="text-muted-foreground text-center py-6 bg-muted/10 rounded-lg text-sm">No contributing academic activities found in this period.</p>}
                        </div>

                        {/* Section B: Students Guided */}
                        <div className="space-y-3">
                            <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5"><Info className="h-4.5 w-4.5 text-primary"/> Part B: Students Thesis Guidance</h4>
                            {studentClaims.length > 0 ? (
                                <div className="border rounded-lg overflow-hidden bg-background">
                                    <Table>
                                        <thead>
                                            <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
                                                <TableCell className="font-bold py-2.5">Claim ID</TableCell>
                                                <TableCell className="font-bold py-2.5">Student / Thesis Title</TableCell>
                                                <TableCell className="font-bold py-2.5">Program</TableCell>
                                                <TableCell className="font-bold py-2.5">Allotment Order Reference</TableCell>
                                                <TableCell className="font-bold py-2.5 text-right pr-4">Raw Score</TableCell>
                                            </TableRow>
                                        </thead>
                                        <TableBody className="text-xs">
                                            {studentClaims.map(({ claim, score }) => (
                                                <TableRow key={claim.id} className="hover:bg-muted/5">
                                                    <TableCell className="font-mono text-muted-foreground">{claim.submissionId || claim.id}</TableCell>
                                                    <TableCell className="font-semibold">{claim.name || claim.studentName || 'Student Guidance'}</TableCell>
                                                    <TableCell><Badge variant="outline">{claim.category || claim.program}</Badge></TableCell>
                                                    <TableCell className="text-muted-foreground">{claim.allotmentDetails || 'N/A'}</TableCell>
                                                    <TableCell className="text-right pr-4 font-mono font-bold text-foreground">{score.toFixed(2)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : <p className="text-muted-foreground text-center py-6 bg-muted/10 rounded-lg text-sm">No student guided claims found in this period.</p>}
                        </div>

                        <Separator />

                        {results.researchActivities && (
                            <FormulaCard
                                title="Step 2: Research Activities Score Calculation"
                                icon={Target}
                                steps={[
                                    { label: 'Total Capped Raw Activities Score', value: results.researchActivities.raw.toFixed(2) },
                                    { label: '× Dynamic Policy Weightage', value: `× ${(results.researchActivities.weighted / (results.researchActivities.raw || 1)).toFixed(2)}` },
                                    { label: '= Weighted Score', value: `${results.researchActivities.weighted.toFixed(2)}` },
                                    { label: 'Maximum Component Cap', value: `${(results as any).caps?.researchActivities || '5'}.00` },
                                ]}
                                result={{ label: 'Final Score P(activities) = min(Weighted Score, Cap)', value: results.researchActivities.final.toFixed(2) }}
                            />
                        )}
                    </TabsContent>

                    {/* Tab 6: Others (Other Details) */}
                    {(results.otherDetails && results.otherDetails.length > 0) && (
                        <TabsContent value="others" className="p-6 space-y-6 m-0 border-none">
                            <CardHeader className="p-0">
                                <CardTitle className="text-lg">Other Contributing Submissions</CardTitle>
                                <CardDescription>Special items and manual admin calculations credited to your score card.</CardDescription>
                            </CardHeader>
                            <div className="border rounded-lg overflow-hidden bg-background">
                                <Table>
                                    <thead>
                                        <TableRow className="bg-muted/40 hover:bg-muted/40 text-xs">
                                            <TableCell className="font-bold py-2.5">Claim ID</TableCell>
                                            <TableCell className="font-bold py-2.5">Submission Ref</TableCell>
                                            <TableCell className="font-bold py-2.5">Details Description</TableCell>
                                        </TableRow>
                                    </thead>
                                    <TableBody className="text-xs">
                                        {results.otherDetails.map((detail: any, idx) => (
                                            <TableRow key={detail.id || idx} className="hover:bg-muted/5">
                                                <TableCell className="font-mono text-muted-foreground">{detail.id || 'N/A'}</TableCell>
                                                <TableCell className="font-semibold">{detail.submissionId || 'N/A'}</TableCell>
                                                <TableCell className="leading-relaxed whitespace-normal pr-4">{detail.details || 'N/A'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        </div>
    );
}
