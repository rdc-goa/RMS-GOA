// src/app/dashboard/emr-evaluations/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { User, FundingCall, EmrInterest, EmrEvaluation } from '@/types';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { PageHeader } from '@/components/page-header';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, ThumbsDown, ThumbsUp, History as HistoryIcon, UserCheck, UserX, FileText, CheckCheck, Edit } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EMR_EVALUATION_RECOMMENDATIONS, EmrEvaluationForm } from '@/components/emr/emr-evaluation-form';
import { updateEmrStatus, uploadRevisedEmrPpt } from '@/app/server-actions';
import { Textarea } from '@/components/ui/textarea';

function EvaluationDetailsDialog({ interest, call }: { interest: EmrInterestWithDetails, call: FundingCall }) {
    const { toast } = useToast();
    const [isStatusUpdateOpen, setIsStatusUpdateOpen] = useState(false);
    const [statusToUpdate, setStatusToUpdate] = useState<EmrInterest['status'] | null>(null);
    const [adminRemarks, setAdminRemarks] = useState('');

    const handleUpdateStatus = async () => {
        if (!statusToUpdate) return;
        if (statusToUpdate === 'Revision Needed' && !adminRemarks) {
            toast({ variant: 'destructive', title: 'Remarks Required', description: 'Please provide comments for the revision request.' });
            return;
        }
        const result = await updateEmrStatus(interest.id, statusToUpdate, adminRemarks);
        if (result.success) {
            toast({ title: "Status Updated", description: "The applicant has been notified." });
        } else {
            toast({ variant: 'destructive', title: "Error", description: result.error });
        }
        setIsStatusUpdateOpen(false);
        setAdminRemarks('');
    };

    return (
        <Dialog open={isStatusUpdateOpen} onOpenChange={setIsStatusUpdateOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm">View Evaluations</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Evaluations for {interest.userName}</DialogTitle>
                    <DialogDescription>Call: {call.title}</DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto pr-4 space-y-4">
                    {interest.evaluations.length > 0 ? interest.evaluations.map(evaluation => (
                        <div key={evaluation.evaluatorUid} className="p-4 border rounded-lg">
                            <div className="flex justify-between items-start">
                               <div><p className="font-semibold">{evaluation.evaluatorName}</p><p className="text-xs text-muted-foreground">{new Date(evaluation.evaluationDate).toLocaleDateString()}</p></div>
                                <Badge variant={ evaluation.recommendation === 'Recommended' ? 'default' : evaluation.recommendation === 'Not Recommended' ? 'destructive' : 'secondary' } className="capitalize">
                                     {evaluation.recommendation === 'Recommended' && <ThumbsUp className="h-3 w-3 mr-1" />}
                                     {evaluation.recommendation === 'Not Recommended' && <ThumbsDown className="h-3 w-3 mr-1" />}
                                     {evaluation.recommendation === 'Revision is needed' && <HistoryIcon className="h-3 w-3 mr-1" />}
                                    {evaluation.recommendation}
                                </Badge>
                            </div>
                            <p className="text-sm mt-4 text-muted-foreground border-t pt-3"><span className="font-semibold text-foreground">Comments:</span> {evaluation.comments}</p>
                        </div>
                    )) : (<div className="text-center py-8 text-muted-foreground">No evaluations submitted yet.</div>)}
                </div>
                {statusToUpdate === 'Revision Needed' ? (
                    <div className="space-y-2">
                        <label htmlFor="adminRemarks" className="font-medium">Revision Comments</label>
                        <Textarea id="adminRemarks" value={adminRemarks} onChange={(e) => setAdminRemarks(e.target.value)} placeholder="Provide clear instructions for the revision..."/>
                    </div>
                ) : null}
                <DialogFooter>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button>Update Final Status</Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => setStatusToUpdate('Recommended')}>Recommended</DropdownMenuItem>
                             <DropdownMenuItem onClick={() => setStatusToUpdate('Endorsement Pending')}>Recommended (Endorsement Pending)</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusToUpdate('Not Recommended')}>Not Recommended</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatusToUpdate('Revision Needed')}>Revision is Needed</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    {statusToUpdate && <Button onClick={handleUpdateStatus}>Confirm Status: {statusToUpdate}</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

interface EmrInterestWithDetails extends EmrInterest {
    evaluations: EmrEvaluation[];
    userDetails: User | null;
}

export default function EmrEvaluationsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [interests, setInterests] = useState<EmrInterestWithDetails[]>([]);
    const [calls, setCalls] = useState<FundingCall[]>([]);
    const { toast } = useToast();
    const [selectedInterest, setSelectedInterest] = useState<EmrInterestWithDetails | null>(null);
    const [isEvaluationFormOpen, setIsEvaluationFormOpen] = useState(false);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);

        try {
            const callsQuery = query(collection(db, 'fundingCalls'), where('status', '==', 'Meeting Scheduled'));
            const callsSnapshot = await getDocs(callsQuery);
            const callsData = callsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));
            setCalls(callsData);
            
            let interestsQuery;
            if (user.role === 'Super-admin' || user.role === 'admin') {
                interestsQuery = query(collection(db, 'emrInterests'));
            } else {
                 const relevantCallIds = callsData.filter(call => call.meetingDetails?.assignedEvaluators?.includes(user.uid)).map(call => call.id);
                if (relevantCallIds.length === 0) { setInterests([]); setLoading(false); return; }
                interestsQuery = query(collection(db, 'emrInterests'), where('callId', 'in', relevantCallIds));
            }
            
            const interestsSnapshot = await getDocs(interestsQuery);
            const interestsData = interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));
            
            const allUserIds = [...new Set(interestsData.map(i => i.userId))];
            const usersMap = new Map<string, User>();
            if (allUserIds.length > 0) {
              const usersQuery = query(collection(db, 'users'), where('__name__', 'in', allUserIds));
              const usersSnapshot = await getDocs(usersQuery);
              usersSnapshot.forEach(doc => usersMap.set(doc.id, { uid: doc.id, ...doc.data()} as User));
            }

            const interestsWithDetails = await Promise.all(
              interestsData.map(async interest => {
                const evaluationsCol = collection(db, 'emrInterests', interest.id, 'evaluations');
                const evaluationsSnapshot = await getDocs(evaluationsCol);
                const evaluations = evaluationsSnapshot.docs.map(doc => doc.data() as EmrEvaluation);
                const userDetails = usersMap.get(interest.userId) || null;
                return { ...interest, evaluations, userDetails };
              })
            );

            if (user.role !== 'Super-admin' && user.role !== 'admin') {
                setInterests(interestsWithDetails.filter(interest => {
                    const call = callsData.find(c => c.id === interest.callId);
                    return call?.meetingDetails?.assignedEvaluators?.includes(user.uid);
                }));
            } else { setInterests(interestsWithDetails); }

        } catch (error) {
            console.error("Error fetching EMR evaluation data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch EMR evaluation data.' });
        } finally { setLoading(false); }
    }, [user, toast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const isSuperAdmin = user?.role === 'Super-admin';

    const getCallTitle = (callId: string) => calls.find(c => c.id === callId)?.title || 'Unknown Call';
    
    const handleEvaluationSubmitted = () => { setIsEvaluationFormOpen(false); setSelectedInterest(null); fetchData(); };

    return (
        <div className="container mx-auto py-10">
            <PageHeader
                title="EMR Evaluations"
                description={isSuperAdmin ? "Review all submitted EMR evaluations." : "EMR presentations assigned to you for evaluation."}
            />
            <div className="mt-8">
                {loading ? ( <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
                ) : interests.length > 0 ? (
                    <Card><CardContent className="pt-6"><Table>
                        <TableHeader><TableRow>
                            <TableHead>Applicant</TableHead>
                            <TableHead>Funding Call</TableHead>
                            <TableHead>Presentation</TableHead>
                            <TableHead>My Status</TableHead>
                            {isSuperAdmin && <TableHead>Evaluations</TableHead>}
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>{interests.map(interest => {
                            const myEvaluation = interest.evaluations.find(e => e.evaluatorUid === user?.uid);
                            const call = calls.find(c => c.id === interest.callId);
                            const allEvaluatorsAssigned = call?.meetingDetails?.assignedEvaluators || [];
                            
                            return (
                            <TableRow key={interest.id}>
                                <TableCell className="font-medium"><div>{interest.userName}</div><div className="text-xs text-muted-foreground">{interest.userDetails?.department}, {interest.userDetails?.institute}</div></TableCell>
                                <TableCell>{getCallTitle(interest.callId)}</TableCell>
                                <TableCell>{interest.pptUrl ? (<Button asChild variant="link" className="p-0 h-auto"><a href={interest.pptUrl} target="_blank" rel="noopener noreferrer"><FileText className="h-4 w-4 mr-1"/> View</a></Button>) : "Not Submitted"}</TableCell>
                                <TableCell>{myEvaluation ? <Badge variant="default"><UserCheck className="h-3 w-3 mr-1"/> Submitted</Badge> : <Badge variant="secondary"><UserX className="h-3 w-3 mr-1"/> Pending</Badge>}</TableCell>
                                {isSuperAdmin && (<TableCell>
                                    {interest.evaluations.length > 0 ? (
                                        <EvaluationDetailsDialog interest={interest} call={call!} />
                                    ) : `${interest.evaluations.length}/${allEvaluatorsAssigned.length}`}
                                </TableCell>)}
                                <TableCell className="text-right"><Button variant="outline" size="sm" onClick={() => { setSelectedInterest(interest); setIsEvaluationFormOpen(true); }}><Eye className="h-4 w-4 mr-2"/> {myEvaluation ? "View/Edit" : "Evaluate"}</Button></TableCell>
                            </TableRow> );
                        })}</TableBody>
                    </Table></CardContent></Card>
                ) : (
                    <Card><CardContent className="text-center py-12 text-muted-foreground">No EMR presentations are currently assigned to you for evaluation.</CardContent></Card>
                )}
            </div>
            {selectedInterest && user && ( <EmrEvaluationForm isOpen={isEvaluationFormOpen} onOpenChange={setIsEvaluationFormOpen} interest={selectedInterest} user={user} onEvaluationSubmitted={handleEvaluationSubmitted}/>)}
        </div>
    );
}
