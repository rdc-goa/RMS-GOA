// src/components/emr/emr-evaluation-list.tsx
'use client';

import { useState, useMemo } from 'react';
import type { User, FundingCall, EmrInterest, EmrEvaluation } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, UserCheck, UserX, FileText } from 'lucide-react';
import { EmrEvaluationForm } from './emr-evaluation-form';
import { format, parseISO } from 'date-fns';

interface EmrEvaluationListProps {
    interests: any[]; // Using any[] because it can have extra properties
    calls: FundingCall[];
    user: User;
    onActionComplete: () => void;
}

export function EmrEvaluationList({ interests, calls, user, onActionComplete }: EmrEvaluationListProps) {
    const [selectedInterest, setSelectedInterest] = useState<any | null>(null);
    const [isEvaluationFormOpen, setIsEvaluationFormOpen] = useState(false);

    const getCallTitle = (callId: string) => calls.find(c => c.id === callId)?.title || 'Unknown Call';
    
    const handleEvaluationSubmitted = () => {
        setIsEvaluationFormOpen(false);
        setSelectedInterest(null);
        onActionComplete();
    };
    
    const presentInterests = useMemo(() => {
        return interests.filter(interest => !interest.wasAbsent);
    }, [interests]);

    if (presentInterests.length === 0) {
        return (
            <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                    No EMR presentations are currently assigned to you for evaluation.
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <CardContent className="pt-6 overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Applicant</TableHead>
                                <TableHead className="hidden sm:table-cell">Funding Call</TableHead>
                                <TableHead>Presentation Date</TableHead>
                                <TableHead>Presentation</TableHead>
                                <TableHead>My Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {presentInterests.map(interest => {
                                const myEvaluation = interest.evaluations.find((e: EmrEvaluation) => e.evaluatorUid === user?.uid);
                                return (
                                    <TableRow key={interest.id}>
                                        <TableCell className="font-medium whitespace-nowrap">{interest.userName}</TableCell>
                                        <TableCell className="hidden sm:table-cell">{getCallTitle(interest.callId)}</TableCell>
                                        <TableCell className="whitespace-nowrap">
                                            {interest.meetingSlot?.date ? format(parseISO(interest.meetingSlot.date), 'PP') : 'N/A'}
                                        </TableCell>
                                        <TableCell>
                                            {interest.pptUrl ? (
                                                <Button asChild variant="link" className="p-0 h-auto">
                                                    <a href={interest.pptUrl} target="_blank" rel="noopener noreferrer">
                                                        <FileText className="h-4 w-4 mr-1"/> View
                                                    </a>
                                                </Button>
                                            ) : "Not Submitted"}
                                        </TableCell>
                                        <TableCell>
                                            {myEvaluation ? (
                                                <Badge variant="default"><UserCheck className="h-3 w-3 mr-1"/> Submitted</Badge>
                                            ) : (
                                                <Badge variant="secondary"><UserX className="h-3 w-3 mr-1"/> Pending</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => { setSelectedInterest(interest); setIsEvaluationFormOpen(true); }}
                                            >
                                                <Eye className="h-4 w-4 md:mr-2"/> <span className="hidden md:inline">{myEvaluation ? "View" : "Evaluate"}</span>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
            {selectedInterest && user && (
                <EmrEvaluationForm 
                    isOpen={isEvaluationFormOpen} 
                    onOpenChange={setIsEvaluationFormOpen} 
                    interest={selectedInterest} 
                    user={user} 
                    onEvaluationSubmitted={handleEvaluationSubmitted}
                />
            )}
        </>
    );
}
