

// src/app/dashboard/emr-management/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import ExcelJS from 'exceljs';
import { db } from '@/lib/config';
import { collection, query, orderBy, onSnapshot, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import type { FundingCall, EmrInterest, User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { format, isAfter, parseISO } from 'date-fns';
import { Eye, Download, Edit, Send, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { AddEditCallDialog } from '@/components/emr/emr-calendar';
import { announceEmrCall } from '@/app/emr-actions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Check, PlusCircle, Filter, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface FacetedFilterProps {
    title: string;
    options: string[];
    selectedValues: string[];
    onSelect: (values: string[]) => void;
}

function AgencyFacetedFilter({ title, options, selectedValues, onSelect }: FacetedFilterProps) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 border-dashed">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    {title}
                    {selectedValues?.length > 0 && (
                        <>
                            <Separator orientation="vertical" className="mx-2 h-4" />
                            <Badge
                                variant="secondary"
                                className="rounded-sm px-1 font-normal lg:hidden"
                            >
                                {selectedValues.length}
                            </Badge>
                            <div className="hidden space-x-1 lg:flex">
                                {selectedValues.length > 2 ? (
                                    <Badge
                                        variant="secondary"
                                        className="rounded-sm px-1 font-normal"
                                    >
                                        {selectedValues.length} selected
                                    </Badge>
                                ) : (
                                    options
                                        .filter((option) => selectedValues.includes(option))
                                        .map((option) => (
                                            <Badge
                                                variant="secondary"
                                                key={option}
                                                className="rounded-sm px-1 font-normal"
                                            >
                                                {option}
                                            </Badge>
                                        ))
                                )}
                            </div>
                        </>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                    <CommandInput placeholder={title} />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => {
                                const isSelected = selectedValues.includes(option);
                                return (
                                    <CommandItem
                                        key={option}
                                        onSelect={() => {
                                            if (isSelected) {
                                                onSelect(selectedValues.filter((v) => v !== option));
                                            } else {
                                                onSelect([...selectedValues, option]);
                                            }
                                        }}
                                    >
                                        <div
                                            className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground"
                                                    : "opacity-50 [&_svg]:invisible"
                                            )}
                                        >
                                            <Check className={cn("h-4 w-4")} />
                                        </div>
                                        <span>{option}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        {selectedValues.length > 0 && (
                            <>
                                <CommandSeparator />
                                <CommandGroup>
                                    <CommandItem
                                        onSelect={() => onSelect([])}
                                        className="justify-center text-center"
                                    >
                                        Clear filters
                                    </CommandItem>
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}


function EmrLogsTab({ user, allInterests, allCalls }: { user: User | null, allInterests: EmrInterest[], allCalls: FundingCall[] }) {
    const [users, setUsers] = useState<Map<string, User>>(new Map());
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedAgencies, setSelectedAgencies] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;
    const { toast } = useToast();

    const logs = useMemo(() => {
        if (!user) return [];

        let baseLogs = allInterests.filter(log => log.status === 'Submitted to Agency');

        const isSuperAdminOrAdmin = user.role === 'Super-admin' || user.role === 'admin';
        const isCro = user.role === 'CRO';
        const isPrincipal = user.designation === 'Principal';
        const isHod = user.designation === 'HOD';
        const isGoaHead = user.designation === 'Head of Goa Campus';

        let filtered = baseLogs;
        if (isSuperAdminOrAdmin) {
            filtered = baseLogs;
        } else if (isCro && user.faculties && user.faculties.length > 0) {
            filtered = baseLogs.filter(log => user.faculties?.includes(log.faculty || ''));
        } else if (isGoaHead) {
            filtered = baseLogs.filter(log => log.campus === 'Goa');
        } else if (isPrincipal && user.institute) {
            filtered = baseLogs.filter(log => (user.faculties || []).includes(log.faculty || ''));
        } else if (isHod && user.department && user.institute) {
            filtered = baseLogs.filter(log => log.department === user.department && log.faculty === user.faculty);
        } else {
            return [];
        }

        // Sort by submittedToAgencyAt desc
        return [...filtered].sort((a, b) => {
            const dateA = a.submittedToAgencyAt ? new Date(a.submittedToAgencyAt).getTime() : 0;
            const dateB = b.submittedToAgencyAt ? new Date(b.submittedToAgencyAt).getTime() : 0;
            return dateB - dateA;
        });
    }, [allInterests, user]);

    const calls = useMemo(() => {
        return new Map(allCalls.map(call => [call.id, call]));
    }, [allCalls]);

    useEffect(() => {
        const fetchUsers = async () => {
            const userIds = [...new Set(logs.map(log => log.userId))];
            if (userIds.length === 0) return;

            const userIdsToFetch = userIds.filter(id => !users.has(id));
            if (userIdsToFetch.length === 0) return;

            setLoadingUsers(true);
            try {
                const newUsersMap = new Map(users);
                // Firestore 'in' query limit is 30
                for (let i = 0; i < userIdsToFetch.length; i += 30) {
                    const batch = userIdsToFetch.slice(i, i + 30);
                    const q = query(collection(db, 'users'), where('__name__', 'in', batch));
                    const snapshot = await getDocs(q);
                    snapshot.forEach(doc => {
                        newUsersMap.set(doc.id, { uid: doc.id, ...doc.data() } as User);
                    });
                }
                setUsers(newUsersMap);
            } catch (error) {
                console.error("Error fetching users for logs:", error);
            } finally {
                setLoadingUsers(false);
            }
        };

        fetchUsers();
    }, [logs, users]);


    const availableAgencies = useMemo(() => {
        const uniqueAgencies = new Set<string>();
        logs.forEach(log => {
            const call = calls.get(log.callId);
            if (call?.agency) {
                uniqueAgencies.add(call.agency);
            }
        });
        return Array.from(uniqueAgencies).sort();
    }, [logs, calls]);

    const filteredLogs = useMemo(() => {
        let result = logs;

        // Apply Agency Filter
        if (selectedAgencies.length > 0) {
            result = result.filter(log => {
                const call = calls.get(log.callId);
                return call?.agency && selectedAgencies.includes(call.agency);
            });
        }

        // Apply Search Filter
        if (!searchTerm) return result;
        const lowercasedFilter = searchTerm.toLowerCase();
        return result.filter(log => {
            const call = calls.get(log.callId);
            return (
                log.userName.toLowerCase().includes(lowercasedFilter) ||
                (call?.title && call.title.toLowerCase().includes(lowercasedFilter)) ||
                (log.agencyReferenceNumber && log.agencyReferenceNumber.toLowerCase().includes(lowercasedFilter))
            );
        });
    }, [logs, searchTerm, users, calls, selectedAgencies]);

    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

    const paginatedLogs = filteredLogs.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const handleExport = async () => {
        const dataToExport = filteredLogs.map(log => {
            const call = calls.get(log.callId);
            const user = users.get(log.userId);
            return {
                'PI': log.userName,
                'Institute': user?.institute || 'N/A',
                'Funding Call': call?.title || 'Unknown',
                'Agency Name': call?.agency || 'Unknown',
                'Agency Deadline': call?.applyDeadline ? format(new Date(call.applyDeadline), 'PP') : 'N/A',
                'Reference No.': log.agencyReferenceNumber || 'N/A',
                'Logged Date': log.submittedToAgencyAt ? format(new Date(log.submittedToAgencyAt), 'PPp') : 'N/A',
                'Acknowledgement': log.agencyAcknowledgementUrl || 'Not Provided',
            };
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('EMR_Submission_Logs');

        if (dataToExport.length > 0) {
            const headers = Object.keys(dataToExport[0]);
            worksheet.addRow(headers);
            dataToExport.forEach(item => {
                worksheet.addRow(Object.values(item));
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `emr_submission_logs_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const canViewFullDetails = user?.role === 'Super-admin' || user?.role === 'admin';

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex flex-1 items-center space-x-2 w-full max-w-xl">
                    <Input placeholder="Search logs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-[250px]" />
                    {availableAgencies.length > 0 && (
                        <AgencyFacetedFilter
                            title="Agencies"
                            options={availableAgencies}
                            selectedValues={selectedAgencies}
                            onSelect={setSelectedAgencies}
                        />
                    )}
                </div>
                <Button onClick={handleExport} disabled={filteredLogs.length === 0}><Download className="mr-2 h-4 w-4" /> Export Logs</Button>
            </div>
            <Card>
                <CardContent className="pt-6">
                    {filteredLogs.length > 0 ? (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader><TableRow>
                                        <TableHead>PI</TableHead>
                                        <TableHead className="hidden md:table-cell">Funding Call</TableHead>
                                        <TableHead className="hidden lg:table-cell">Agency Deadline</TableHead>
                                        <TableHead className="hidden sm:table-cell">Reference No.</TableHead>
                                        <TableHead>Logged On</TableHead>
                                        <TableHead>Acknowledgement</TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>{paginatedLogs.map(log => {
                                        const call = calls.get(log.callId);
                                        return (
                                            <TableRow key={log.id}>
                                                <TableCell className="whitespace-nowrap">{users.get(log.userId)?.name || log.userName}</TableCell>
                                                <TableCell className="hidden md:table-cell">{call?.title || 'Loading...'}</TableCell>
                                                <TableCell className="hidden lg:table-cell">{call?.applyDeadline ? format(parseISO(call.applyDeadline), 'PP') : 'N/A'}</TableCell>
                                                <TableCell className="hidden sm:table-cell">{log.agencyReferenceNumber || 'N/A'}</TableCell>
                                                <TableCell className="whitespace-nowrap">{log.submittedToAgencyAt ? format(new Date(log.submittedToAgencyAt), 'PP') : 'N/A'}</TableCell>
                                                <TableCell>
                                                    {log.agencyAcknowledgementUrl ? (
                                                        <Button asChild variant="link" className="p-0 h-auto">
                                                            <a href={log.agencyAcknowledgementUrl} target="_blank" rel="noopener noreferrer">View</a>
                                                        </Button>
                                                    ) : (
                                                        "Not Provided"
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}</TableBody>
                                </Table>
                            </div>
                        ) : (<div className="text-center text-muted-foreground py-8">No submissions have been logged.</div>)}
                    {filteredLogs.length > itemsPerPage && (
                        <div className="flex items-center justify-between mt-4">
                            <p className="text-sm text-muted-foreground">
                                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} submissions
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                >
                                    Previous
                                </Button>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

export default function EmrManagementOverviewPage() {
    const [calls, setCalls] = useState<FundingCall[]>([]);
    const [interests, setInterests] = useState<EmrInterest[]>([]);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();
    const [user, setUser] = useState<User | null>(null);
    const [selectedCall, setSelectedCall] = useState<FundingCall | null>(null);
    const [isAddEditDialogOpen, setIsAddEditDialogOpen] = useState(false);
    const [isAnnounceDialogOpen, setIsAnnounceDialogOpen] = useState(false);
    const [isAnnouncing, setIsAnnouncing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedAgencies, setSelectedAgencies] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;
    const router = useRouter();

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
            setUser(parsedUser);
        } else {
            router.replace('/login');
        }
    }, [router, toast]);

    const fetchData = useCallback(() => {
        setLoading(true);
        const callsQuery = query(collection(db, 'fundingCalls'), orderBy('interestDeadline', 'desc'));
        const interestsQuery = query(collection(db, 'emrInterests'));

        const unsubscribeCalls = onSnapshot(callsQuery,
            (snapshot) => {
                setCalls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall)));
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching funding calls:", error);
                toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch funding calls.' });
                setLoading(false);
            }
        );

        const unsubscribeInterests = onSnapshot(interestsQuery,
            (snapshot) => {
                setInterests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest)));
            },
            (error) => {
                console.error("Error fetching interests:", error);
            }
        );

        return () => {
            unsubscribeCalls();
            unsubscribeInterests();
        };
    }, [toast]);

    useEffect(() => {
        if (user) {
            const unsubscribe = fetchData();
            return () => unsubscribe();
        }
    }, [fetchData, user]);

    const getStatusBadge = (call: FundingCall) => {
        const now = new Date();
        if (call.status === 'Meeting Scheduled') {
            return <Badge variant="default">Meeting Scheduled</Badge>;
        }
        if (isAfter(now, parseISO(call.interestDeadline))) {
            return <Badge variant="secondary">Closed</Badge>;
        }
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700">Open</Badge>;
    }

    const handleAnnounceCall = async () => {
        if (!selectedCall) return;
        setIsAnnouncing(true);
        try {
            const result = await announceEmrCall(selectedCall.id);
            if (result.success) {
                toast({ title: "Success", description: "Announcement email has been sent to all staff." });
                fetchData(); // Refresh data to show updated announcement status
            } else {
                toast({ variant: "destructive", title: "Failed to Announce", description: result.error });
            }
        } catch (error: any) {
            toast({ variant: "destructive", title: "Error", description: error.message || "An unexpected error occurred." });
        } finally {
            setIsAnnouncing(false);
            setIsAnnounceDialogOpen(false);
        }
    };

    const interestCounts = useMemo(() => {
        return interests.reduce((acc, interest) => {
            acc[interest.callId] = (acc[interest.callId] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [interests]);

    const availableAgencies = useMemo(() => {
        const uniqueAgencies = new Set<string>();
        calls.forEach(call => {
            if (call.agency) {
                uniqueAgencies.add(call.agency);
            }
        });
        return Array.from(uniqueAgencies).sort();
    }, [calls]);

    const filteredCalls = useMemo(() => {
        let result = calls;

        // Apply Agency Filter
        if (selectedAgencies.length > 0) {
            result = result.filter(call => call.agency && selectedAgencies.includes(call.agency));
        }

        // Apply Search Filter
        if (!searchTerm) return result;
        const lowercasedFilter = searchTerm.toLowerCase();

        const matchingCallIds = new Set(
            interests
                .filter(interest => interest.userName.toLowerCase().includes(lowercasedFilter))
                .map(interest => interest.callId)
        );

        return result.filter(call =>
            call.title.toLowerCase().includes(lowercasedFilter) ||
            call.agency.toLowerCase().includes(lowercasedFilter) ||
            matchingCallIds.has(call.id)
        );
    }, [calls, interests, searchTerm, selectedAgencies]);

    const totalCallPages = Math.ceil(filteredCalls.length / itemsPerPage);

    const paginatedCalls = filteredCalls.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const isSuperAdmin = user?.role === 'Super-admin';

    const handleExportCalls = async () => {
        const dataToExport = filteredCalls.map(call => {
            const isClosed = isAfter(new Date(), parseISO(call.interestDeadline));
            let status = "Open";
            if (call.status === 'Meeting Scheduled') {
                status = "Meeting Scheduled";
            } else if (isClosed) {
                status = "Closed";
            }

            return {
                'Call Title': call.title,
                'Agency': call.agency,
                'Agency Deadline': call.applyDeadline ? format(parseISO(call.applyDeadline), 'PP') : 'N/A',
                'Registrations': interestCounts[call.id] || 0,
                'Date Added': format(parseISO(call.createdAt), 'PP'),
                'Status': status,
                'Announced': call.isAnnounced ? 'Yes' : 'No',
            };
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Funding_Calls');

        if (dataToExport.length > 0) {
            const headers = Object.keys(dataToExport[0]);
            worksheet.addRow(headers);
            dataToExport.forEach(item => {
                worksheet.addRow(Object.values(item));
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `funding_calls_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    if (!user || loading) {
        return (
            <div className="container mx-auto py-10">
                <PageHeader title="Extramural Research (EMR)" description="Manage funding calls and view submission logs." />
                <div className="mt-8">
                    <Card>
                        <CardHeader>
                            <Skeleton className="h-6 w-1/4" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-48 w-full" />
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="container mx-auto py-10">
                <PageHeader title="Extramural Research (EMR)" description="Manage funding calls and view submission logs." />
                <div className="mt-8">
                    <Tabs defaultValue="calls">
                        <TabsList>
                            <TabsTrigger value="calls">Registrations by Call</TabsTrigger>
                            <TabsTrigger value="logs">Submission Logs</TabsTrigger>
                        </TabsList>
                        <TabsContent value="calls" className="mt-4">
                            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-4">
                                <div className="flex flex-1 items-center space-x-2 w-full max-w-xl">
                                    <Input
                                        placeholder="Search by call, agency, or applicant..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="max-w-[300px]"
                                    />
                                    {availableAgencies.length > 0 && (
                                        <AgencyFacetedFilter
                                            title="Agencies"
                                            options={availableAgencies}
                                            selectedValues={selectedAgencies}
                                            onSelect={setSelectedAgencies}
                                        />
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {isSuperAdmin && (
                                        <Button onClick={() => { setSelectedCall(null); setIsAddEditDialogOpen(true); }}>
                                            <Plus className="mr-2 h-4 w-4" /> Add New Call
                                        </Button>
                                    )}
                                    <Button
                                        onClick={handleExportCalls}
                                        disabled={loading || filteredCalls.length === 0}
                                        variant="outline"
                                    >
                                        <Download className="mr-2 h-4 w-4" />
                                        Export Calls List
                                    </Button>
                                </div>
                            </div>
                            <Card>
                                <CardHeader>
                                    <p className="text-sm text-muted-foreground">
                                        Below is a list of all funding calls. Click the "Manage" button on a call to view registered applicants, schedule meetings, and manage evaluations for that specific opportunity.
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    {loading ? (
                                        <div className="space-y-2">
                                            <Skeleton className="h-10 w-full" />
                                            <Skeleton className="h-10 w-full" />
                                        </div>
                                    ) : filteredCalls.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <Table>
                                                <TableHeader><TableRow>
                                                    <TableHead>Call Title</TableHead>
                                                    <TableHead className="hidden lg:table-cell">Agency</TableHead>
                                                    <TableHead className="hidden md:table-cell">Agency Deadline</TableHead>
                                                    <TableHead className="hidden sm:table-cell">Registrations</TableHead>
                                                    <TableHead className="hidden xl:table-cell">Date Added</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="hidden md:table-cell">Announced</TableHead>
                                                    <TableHead className="text-right">Actions</TableHead>
                                                </TableRow></TableHeader>
                                                <TableBody>{paginatedCalls.map(call => {
                                                    const isClosed = isAfter(new Date(), parseISO(call.interestDeadline));
                                                    return (
                                                        <TableRow key={call.id}>
                                                            <TableCell className="font-medium whitespace-normal line-clamp-2 md:line-clamp-none">{call.title}</TableCell>
                                                            <TableCell className="whitespace-normal hidden lg:table-cell">{call.agency}</TableCell>
                                                            <TableCell className="whitespace-nowrap hidden md:table-cell">{call.applyDeadline ? format(parseISO(call.applyDeadline), 'PP') : 'N/A'}</TableCell>
                                                            <TableCell className="hidden sm:table-cell">{interestCounts[call.id] || 0}</TableCell>
                                                            <TableCell className="hidden xl:table-cell">{format(parseISO(call.createdAt), 'PP')}</TableCell>
                                                            <TableCell>{getStatusBadge(call)}</TableCell>
                                                            <TableCell className="hidden md:table-cell">
                                                                {call.isAnnounced ? (
                                                                    <div className="flex items-center gap-1 text-green-600"><CheckCircle className="h-4 w-4" /> Yes</div>
                                                                ) : (
                                                                    <div className="flex items-center gap-1 text-muted-foreground"><XCircle className="h-4 w-4" /> No</div>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right flex items-center justify-end gap-2">
                                                                <Button asChild variant="outline" size="sm">
                                                                    <Link href={`/dashboard/emr-management/${call.id}`}><Eye className="mr-2 h-4 w-4" /> Manage</Link>
                                                                </Button>
                                                                {isSuperAdmin && (
                                                                    <>
                                                                        <Button variant="ghost" size="sm" onClick={() => { setSelectedCall(call); setIsAddEditDialogOpen(true); }}>
                                                                            <Edit className="mr-2 h-4 w-4" /> Edit
                                                                        </Button>
                                                                        {!call.isAnnounced && !isClosed && (
                                                                            <Button variant="secondary" size="sm" onClick={() => { setSelectedCall(call); setIsAnnounceDialogOpen(true); }}>
                                                                                <Send className="mr-2 h-4 w-4" /> Announce
                                                                            </Button>
                                                                        )}
                                                                    </>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })}</TableBody>
                                            </Table>
                                        </div>
                                    ) : (
                                        <div className="text-center text-muted-foreground py-8">No funding calls have been created or match your search.</div>
                                    )}
                                    {filteredCalls.length > itemsPerPage && (
                                        <div className="flex items-center justify-between mt-4">
                                            <p className="text-sm text-muted-foreground">
                                                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredCalls.length)} of {filteredCalls.length} calls
                                            </p>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                    disabled={currentPage === 1}
                                                >
                                                    Previous
                                                </Button>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-muted-foreground">
                                                        Page {currentPage} of {totalCallPages}
                                                    </span>
                                                </div>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setCurrentPage(prev => Math.min(totalCallPages, prev + 1))}
                                                    disabled={currentPage === totalCallPages}
                                                >
                                                    Next
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="logs" className="mt-4">
                            <EmrLogsTab user={user} allInterests={interests} allCalls={calls} />
                        </TabsContent>
                    </Tabs>
                </div>
            </div>
            {isSuperAdmin && user && (
                <>
                    <AddEditCallDialog
                        isOpen={isAddEditDialogOpen}
                        onOpenChange={setIsAddEditDialogOpen}
                        existingCall={selectedCall}
                        user={user}
                        onActionComplete={fetchData}
                    />
                    {selectedCall && (
                        <AlertDialog open={isAnnounceDialogOpen} onOpenChange={setIsAnnounceDialogOpen}>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Announce Funding Call?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will send an email notification to all staff members about the call for "{selectedCall.title}". This action cannot be undone. Are you sure?
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleAnnounceCall} disabled={isAnnouncing}>
                                        {isAnnouncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Confirm & Announce
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </>
            )}
        </>
    );
}
