'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/config';
import { collection, query, where, getDocs, onSnapshot, doc, getDoc } from 'firebase/firestore';
import type { FundingCall, User, EmrInterest } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmrManagementClient } from '@/components/emr/emr-management-client';
import { format, parseISO } from 'date-fns';
import { Popover } from '@/components/ui/popover'; // Fix: Added Popover import

export default function EmrManagementPage() {
    const params = useParams();
    const callId = params.callId as string;
    const router = useRouter();
    const { toast } = useToast();

    const [call, setCall] = useState<FundingCall | null>(null);
    const [interests, setInterests] = useState<EmrInterest[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            if (!parsedUser.allowedModules?.includes('emr-management')) {
                toast({
                    title: 'Access Denied',
                    description: "You don't have permission to view this page.",
                    variant: 'destructive',
                });
                router.replace('/dashboard');
                return;
            }
            setCurrentUser(parsedUser);
        } else {
            router.replace('/login');
        }
    }, [router, toast]);


    const fetchData = useCallback(async () => {
        if (!callId) return;
        setLoading(true);

        try {
            // Fetch all necessary data in parallel
            const callDocRef = doc(db, 'fundingCalls', callId);
            const interestsQuery = query(collection(db, 'emrInterests'), where('callId', '==', callId));
            const usersQuery = query(collection(db, 'users'));

            const [callDoc, interestsSnapshot, usersSnapshot] = await Promise.all([
                getDoc(callDocRef),
                getDocs(interestsQuery),
                getDocs(usersQuery),
            ]);

            if (!callDoc.exists()) {
                toast({ variant: 'destructive', title: 'Error', description: 'Funding call not found.' });
                router.push('/dashboard/emr-management');
                return;
            }

            setCall({ id: callDoc.id, ...callDoc.data() } as FundingCall);
            setInterests(interestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest)));
            setAllUsers(usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));

        } catch (error) {
            console.error("Error fetching EMR management data:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch data for this call.' });
        } finally {
            setLoading(false);
        }
    }, [callId, toast, router]);


    useEffect(() => {
        if(currentUser) {
            fetchData();
        }
    }, [fetchData, currentUser]);

    if (loading || !call || !currentUser) {
        return (
            <div className="container mx-auto py-10">
                <PageHeader title="Loading EMR Management..." description="Please wait while we fetch the details." />
                <div className="mt-8">
                    <Skeleton className="h-96 w-full" />
                </div>
            </div>
        );
    }

    const formattedDeadline = call.applyDeadline ? format(parseISO(call.applyDeadline), 'PPP') : 'N/A';

    return (
        <div className="container mx-auto py-10">
            <PageHeader
                title={`Manage: ${call.title}`}
                description={`Agency: ${call.agency} | Agency Deadline: ${formattedDeadline}`}
                backButtonHref="/dashboard/emr-management"
                backButtonText="Back to All Calls"
            />
            <div className="mt-8">
                <EmrManagementClient
                    call={call}
                    interests={interests}
                    allUsers={allUsers}
                    currentUser={currentUser}
                    onActionComplete={fetchData}
                />
            </div>
        </div>
    );
}
