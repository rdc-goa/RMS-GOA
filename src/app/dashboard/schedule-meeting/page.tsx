
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { format, startOfToday, subMonths, parseISO, isAfter, isToday, parse, isFuture, subDays } from 'date-fns';
import { Calendar as CalendarIcon, Loader2, ChevronDown, Info, Edit, Send, CalendarDays, Megaphone, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { db } from '@/lib/config';
import type { Project, User, SystemSettings, FundingCall, EmrInterest } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { scheduleMeeting, getSystemSettings, sendGlobalEvaluationReminders } from '@/app/actions';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';

const scheduleSchema = z.object({
  date: z.date({ required_error: 'A meeting date is required.' }).min(startOfToday(), "Meeting date cannot be in the past."),
  time: z.string().min(1, 'Meeting time is required.'),
  evaluatorUids: z.array(z.string()).min(1, 'Please select at least one evaluator.'),
  mode: z.enum(['Offline', 'Online'], { required_error: 'Please select a meeting mode.' }),
  venue: z.string().optional(),
}).refine(data => {
  if (data.mode === 'Offline') {
    return data.venue && data.venue.length > 0;
  }
  if (data.mode === 'Online') {
    return data.venue && data.venue.startsWith('https://');
  }
  return true;
}, {
  message: 'A valid venue or meeting link is required for the selected mode.',
  path: ['venue'],
}).refine(data => {
  if (isToday(data.date)) {
    const now = new Date();
    const meetingTime = parse(data.time, 'HH:mm', data.date);
    return meetingTime > now;
  }
  return true;
}, {
  message: "Meeting time must be in the future for today's date.",
  path: ['time'],
});

function HistoryTable({
  projects,
  usersMap,
  filter,
  onFilterChange,
  currentUser,
  onRemind,
  isReminding,
  onEdit,
}: {
  projects: Project[],
  usersMap: Map<string, User>,
  filter: 'all' | 'regular' | 'mid-term',
  onFilterChange: (value: 'all' | 'regular' | 'mid-term') => void,
  currentUser: User,
  onRemind: () => void,
  isReminding: boolean,
  onEdit: (project: Project) => void,
}) {
  const sortedProjects = [...projects].sort((a, b) => {
    const dateA = a.meetingDetails?.date ? parseISO(a.meetingDetails.date).getTime() : 0;
    const dateB = b.meetingDetails?.date ? parseISO(b.meetingDetails.date).getTime() : 0;
    return dateB - dateA;
  });

  const isSuperAdmin = currentUser.role === 'Super-admin';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Scheduled Meetings History</CardTitle>
            <CardDescription>A log of all past and future scheduled IMR meetings.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(value) => onFilterChange(value as any)}>
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue placeholder="Filter by meeting type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Meetings</SelectItem>
                <SelectItem value="regular">Regular Submissions</SelectItem>
                <SelectItem value="mid-term">Mid-term Reviews</SelectItem>
              </SelectContent>
            </Select>
            {isSuperAdmin && (
              <Button onClick={onRemind} disabled={isReminding}>
                {isReminding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Remind Evaluators
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sortedProjects.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project / PI</TableHead>
                <TableHead>Meeting Type</TableHead>
                <TableHead>Meeting Date & Time</TableHead>
                <TableHead>Venue / Mode</TableHead>
                <TableHead>Pending Evaluators</TableHead>
                <TableHead>Completed Evaluators</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedProjects.map(project => {
                const piUser = usersMap.get(project.pi_uid);
                const profileLink = piUser?.campus === 'Goa' ? `/goa/${piUser.misId}` : `/profile/${piUser?.misId}`;

                const assignedEvaluators = project.meetingDetails?.assignedEvaluators || [];
                const evaluatedBy = project.evaluatedBy || [];

                const pendingEvaluators = assignedEvaluators
                  .filter(uid => !evaluatedBy.includes(uid))
                  .map(uid => usersMap.get(uid)?.name)
                  .filter(Boolean);

                const completedEvaluators = assignedEvaluators
                  .filter(uid => evaluatedBy.includes(uid))
                  .map(uid => usersMap.get(uid)?.name)
                  .filter(Boolean);

                const isUpcoming = project.meetingDetails?.date && isFuture(parseISO(project.meetingDetails.date));

                return (
                  <TableRow key={project.id}>
                    <TableCell>
                      <div className="font-medium">
                        <Link href={`/dashboard/project/${project.id}`} className="hover:underline text-primary" target="_blank">
                          {project.title}
                        </Link>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        by{' '}
                        {piUser?.misId ? (
                          <Link href={profileLink} target="_blank" className="text-primary hover:underline" rel="noopener noreferrer">
                            {project.pi}
                          </Link>
                        ) : project.pi}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        if (project.hasHadMidTermReview) {
                          return (
                            <span className="inline-flex items-center rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
                              Mid-term Review Meeting
                            </span>
                          );
                        }
                        if (project.revisedProposalUrl || project.revisionSubmissionDate) {
                          return (
                            <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
                              Revision Meeting
                            </span>
                          );
                        }
                        return (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                            Fresh Meeting
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {project.meetingDetails?.date ? format(parseISO(project.meetingDetails.date), 'PPP') : 'N/A'}
                      {' @ '}{project.meetingDetails?.time || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {project.meetingDetails?.venue} ({(project.meetingDetails as any)?.mode})
                    </TableCell>
                    <TableCell>
                      {pendingEvaluators.length > 0 ? pendingEvaluators.join(', ') : <span className="text-muted-foreground">None</span>}
                    </TableCell>
                    <TableCell>
                      {completedEvaluators.length > 0 ? completedEvaluators.join(', ') : <span className="text-muted-foreground">None</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {isSuperAdmin && isUpcoming && (
                        <Button variant="ghost" size="icon" onClick={() => onEdit(project)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <p>No meetings match the selected filter.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectListTable({
  projects,
  selectedProjects,
  onSelectAll,
  onSelectOne,
  usersMap,
  usersByEmailMap,
  title,
  description,
  dateColumnHeader
}: {
  projects: Project[],
  selectedProjects: string[],
  onSelectAll: (checked: boolean) => void,
  onSelectOne: (id: string, checked: boolean) => void,
  usersMap: Map<string, User>,
  usersByEmailMap: Map<string, User>,
  title: string,
  description: string,
  dateColumnHeader: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {projects.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={selectedProjects.length === projects.length && projects.length > 0}
                    onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Title</TableHead>
                <TableHead>PI</TableHead>
                <TableHead>Times Absent</TableHead>
                <TableHead>{dateColumnHeader}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map(project => {
                const piUser = usersMap.get(project.pi_uid) || (project.pi_email ? usersByEmailMap.get(project.pi_email.toLowerCase()) : undefined);
                const profileLink = piUser?.campus === 'Goa' ? `/goa/${piUser.misId}` : `/profile/${piUser?.misId}`;

                let displayDate;
                if (project.status === 'Submitted') {
                  displayDate = project.submissionDate;
                } else {
                  const disbursementDates = project.grant?.phases
                    ?.map(p => p.disbursementDate)
                    .filter((d): d is string => !!d)
                    .map(d => parseISO(d));

                  if (disbursementDates && disbursementDates.length > 0) {
                    const latestDate = new Date(Math.max.apply(null, disbursementDates.map(d => d.getTime())));
                    displayDate = latestDate.toISOString();
                  } else {
                    displayDate = project.projectStartDate || project.submissionDate;
                  }
                }

                return (
                  <TableRow key={project.id} data-state={selectedProjects.includes(project.id) ? "selected" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedProjects.includes(project.id)}
                        onCheckedChange={(checked) => onSelectOne(project.id, !!checked)}
                        aria-label={`Select project ${project.title}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/project/${project.id}`} className="hover:underline text-primary" target="_blank">
                        {project.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>
                        {piUser?.misId ? (
                          <Link href={profileLink} target="_blank" className="text-primary hover:underline" rel="noopener noreferrer">
                            {project.pi}
                          </Link>
                        ) : (
                          project.pi
                        )}
                        {piUser?.campus && piUser.campus !== 'Vadodara' && ` (${piUser.campus})`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {piUser?.department || project.departmentName}, {piUser?.institute || project.institute}
                      </div>
                    </TableCell>
                    <TableCell>
                      {piUser?.absentCount && piUser.absentCount > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                          {piUser.absentCount}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>{new Date(displayDate).toLocaleDateString()}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <p>There are no projects currently in this category.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ScheduleMeetingPage() {
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('new-submissions');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'regular' | 'mid-term'>('all');
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const [midTermSearchTerm, setMidTermSearchTerm] = useState('');
  const [meetingToEdit, setMeetingToEdit] = useState<Project | null>(null);
  const [isSendingGlobalReminders, setIsSendingGlobalReminders] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  const [emrCalls, setEmrCalls] = useState<FundingCall[]>([]);
  const [emrInterests, setEmrInterests] = useState<EmrInterest[]>([]);
  const [statsMonth, setStatsMonth] = useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'));
  const [statsYear, setStatsYear] = useState<string>(new Date().getFullYear().toString());

  const form = useForm<z.infer<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      time: '',
      evaluatorUids: [],
      mode: 'Offline',
      venue: 'RDC Committee Room, PU Goa',
    },
  });

  const selectedPids = useMemo(() => new Set(selectedProjects), [selectedProjects]);

  const hasGoaCampusPi = useMemo(() => {
    return allProjects.some(p =>
      selectedPids.has(p.id) &&
      allUsers.find(u => u.uid === p.pi_uid)?.campus === 'Goa'
    );
  }, [selectedPids, allProjects, allUsers]);

  const meetingMode = form.watch('mode');

  useEffect(() => {
    if (hasGoaCampusPi) {
      form.setValue('mode', 'Online');
    }
  }, [hasGoaCampusPi, form]);

  useEffect(() => {
    if (meetingMode === 'Online') {
      form.setValue('venue', '');
    } else {
      form.setValue('venue', 'RDC Committee Room, PU Goa');
    }
  }, [meetingMode, form]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      if (!parsedUser.allowedModules?.includes('schedule-meeting')) {
        toast({ variant: 'destructive', title: 'Access Denied', description: "You don't have permission to view this page." });
        router.replace('/dashboard');
        return;
      }
      setUser(parsedUser);
    } else {
      router.replace('/login');
    }
  }, [router, toast]);

  const fetchRequiredData = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await getSystemSettings();
      setSystemSettings(settings);

      const projectsQuery = query(collection(db, 'projects'), orderBy('submissionDate', 'desc'));
      const usersQuery = query(collection(db, 'users'));
      const emrCallsQuery = query(collection(db, 'fundingCalls'));
      const emrInterestsQuery = query(collection(db, 'emrInterests'));

      const [projectsSnapshot, usersSnapshot, emrCallsSnapshot, emrInterestsSnapshot] = await Promise.all([
        getDocs(projectsQuery),
        getDocs(usersQuery),
        getDocs(emrCallsQuery),
        getDocs(emrInterestsQuery),
      ]);

      const projectList = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      const userList = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
      const callList = emrCallsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall));
      const interestList = emrInterestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest));

      setAllProjects(projectList);
      setAllUsers(userList);
      setEmrCalls(callList);
      setEmrInterests(interestList);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch projects or users.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) {
      fetchRequiredData();
    }
  }, [user, fetchRequiredData]);

  useEffect(() => {
    if (meetingToEdit) {
      form.reset({
        date: meetingToEdit.meetingDetails?.date ? parseISO(meetingToEdit.meetingDetails.date) : undefined,
        time: meetingToEdit.meetingDetails?.time || '',
        evaluatorUids: meetingToEdit.meetingDetails?.assignedEvaluators || [],
        mode: (meetingToEdit.meetingDetails as any)?.mode || 'Offline',
        venue: meetingToEdit.meetingDetails?.venue || 'RDC Committee Room, PU Goa',
      });
    }
  }, [meetingToEdit, form]);

  const evaluators = useMemo(() => {
    return allUsers
      .filter(u => ['CRO', 'admin', 'Super-admin'].includes(u.role))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allUsers]);

  const newSubmissions = allProjects.filter(p => p.status === 'Submitted');

  const revisedProposalProjects = allProjects.filter(p =>
    p.status === 'Revision Submitted'
  );

  const midTermReviewProjects = allProjects.filter(p => {
    const isEligibleStatus = (p.status as string) === 'In Progress' || (p.status as string) === 'IN PROGRESS' || (p.isBulkUploaded && ((p.status as string) === 'Sanctioned' || (p.status as string) === 'SANCTIONED'));
    if (!isEligibleStatus) return false;

    if (p.hasHadMidTermReview) {
      return false;
    }

    const reviewMonths = systemSettings?.imrMidTermReviewMonths ?? 6;
    const thresholdDate = subMonths(new Date(), reviewMonths);
    const grantStartDate = p.isBulkUploaded ? p.submissionDate : (p.grant?.phases?.[0]?.disbursementDate || p.projectStartDate);

    if (!grantStartDate) return false;

    return isAfter(thresholdDate, parseISO(grantStartDate));
  });

  const filteredMidTermProjects = useMemo(() => {
    if (!midTermSearchTerm) return midTermReviewProjects;
    const lowerCaseSearch = midTermSearchTerm.toLowerCase();
    return midTermReviewProjects.filter(p =>
      p.title.toLowerCase().includes(lowerCaseSearch) ||
      p.pi.toLowerCase().includes(lowerCaseSearch)
    );
  }, [midTermReviewProjects, midTermSearchTerm]);

  const scheduledMeetingsHistory = allProjects.filter(p => p.meetingDetails && ['Under Review', 'Recommended', 'Not Recommended', 'Completed', 'In Progress', 'Pending Completion Approval', 'Sanctioned', 'SANCTIONED'].includes(p.status));

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'regular') {
      return scheduledMeetingsHistory.filter(p => !p.hasHadMidTermReview);
    }
    if (historyFilter === 'mid-term') {
      return scheduledMeetingsHistory.filter(p => p.hasHadMidTermReview === true);
    }
    return scheduledMeetingsHistory; // 'all'
  }, [scheduledMeetingsHistory, historyFilter]);

  const projectsForCurrentTab = activeTab === 'new-submissions' ? newSubmissions : (activeTab === 'revised-proposals' ? revisedProposalProjects : filteredMidTermProjects);

  const totalPages = useMemo(() => {
    let dataForTab = projectsForCurrentTab;
    if (activeTab === 'history') {
      dataForTab = filteredHistory;
    }
    return Math.ceil(dataForTab.length / itemsPerPage);
  }, [projectsForCurrentTab, activeTab, filteredHistory]);

  const paginatedProjects = (() => {
    let dataForTab = projectsForCurrentTab;
    if (activeTab === 'history') {
      dataForTab = filteredHistory;
    }
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return dataForTab.slice(startIndex, endIndex);
  })();

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProjects(projectsForCurrentTab.map(p => p.id));
    } else {
      setSelectedProjects([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedProjects([...selectedProjects, id]);
    } else {
      setSelectedProjects(selectedProjects.filter(pId => pId !== id));
    }
  };

  useEffect(() => {
    setSelectedProjects([]);
    setCurrentPage(1);
  }, [activeTab]);

  const onSubmit = async (data: z.infer<typeof scheduleSchema>) => {
    let projectsToSchedule: { id: string, pi_uid: string, pi: string, title: string, pi_email?: string }[] = [];
    let isMidTerm = activeTab === 'mid-term-review';

    if (meetingToEdit) {
      // Rescheduling logic
      const oldMeeting = meetingToEdit.meetingDetails;
      if (!oldMeeting) return;
      // Find all projects that share the same meeting details
      projectsToSchedule = allProjects
        .filter(p => p.meetingDetails?.date === oldMeeting.date && p.meetingDetails?.time === oldMeeting.time && p.meetingDetails?.venue === oldMeeting.venue)
        .map(p => ({ id: p.id, pi_uid: p.pi_uid, pi: p.pi, title: p.title, pi_email: p.pi_email }));
      isMidTerm = !!meetingToEdit.hasHadMidTermReview;
    } else {
      // New scheduling logic
      if (selectedProjects.length === 0) {
        toast({ variant: 'destructive', title: 'No Projects Selected', description: 'Please select at least one project to schedule.' });
        return;
      }
      projectsToSchedule = allProjects
        .filter(p => selectedProjects.includes(p.id))
        .map(p => ({ id: p.id, pi_uid: p.pi_uid, pi: p.pi, title: p.title, pi_email: p.pi_email }));
    }

    const meetingDetails = {
      date: format(data.date, 'yyyy-MM-dd'),
      time: data.time,
      venue: data.venue || '',
      mode: data.mode,
      evaluatorUids: data.evaluatorUids,
    };

    const result = await scheduleMeeting(projectsToSchedule, meetingDetails, isMidTerm);

    if (result.success) {
      toast({ 
        title: `Meeting ${meetingToEdit ? 'Rescheduled' : 'Scheduled'}!`, 
        description: result.warning ? `Meeting saved. ${result.warning}` : 'Participants have been notified.' 
      });
      setMeetingToEdit(null);
      setSelectedProjects([]);
      form.reset();
      await fetchRequiredData();
    } else {
      toast({ variant: 'destructive', title: 'Scheduling Failed', description: result.error || 'An unknown error occurred.' });
    }
  };

  const handleGlobalReminder = async () => {
    if (!user) return;
    setIsSendingGlobalReminders(true);
    try {
      const result = await sendGlobalEvaluationReminders(user.name);
      if (result.success) {
        if (result.sentCount > 0) {
          toast({ title: 'Reminders Sent', description: `${result.sentCount} reminder email(s) have been sent to evaluators.` });
        } else {
          toast({ title: 'No Reminders Sent', description: result.error || 'All evaluations are up to date.' });
        }
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to send reminders.' });
    } finally {
      setIsSendingGlobalReminders(false);
    }
  };

  const usersMap = useMemo(() => new Map(allUsers.map(u => [u.uid, u])), [allUsers]);
  const usersByEmailMap = useMemo(() => new Map(allUsers.map(u => [u.email.toLowerCase(), u])), [allUsers]);

  const availableStatsYears = useMemo(() => {
    const yearsSet = new Set<string>();
    const currentYr = new Date().getFullYear().toString();
    yearsSet.add(currentYr);
    allProjects.forEach(p => {
      if (p.meetingDetails?.date) {
        const y = new Date(p.meetingDetails.date).getFullYear().toString();
        if (!isNaN(parseInt(y))) yearsSet.add(y);
      }
    });
    emrCalls.forEach(c => {
      if (c.meetingDetails?.date) {
        const y = new Date(c.meetingDetails.date).getFullYear().toString();
        if (!isNaN(parseInt(y))) yearsSet.add(y);
      }
    });
    emrInterests.forEach(i => {
      if (i.meetingSlot?.date) {
        const y = new Date(i.meetingSlot.date).getFullYear().toString();
        if (!isNaN(parseInt(y))) yearsSet.add(y);
      }
    });
    return Array.from(yearsSet).sort((a, b) => parseInt(b) - parseInt(a));
  }, [allProjects, emrCalls, emrInterests]);

  const monthlyMeetingStats = useMemo(() => {
    let imrCount = 0;
    allProjects.forEach(p => {
      if (p.meetingDetails?.date) {
        const date = parseISO(p.meetingDetails.date);
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear().toString();
        if ((statsYear === 'all' || y === statsYear) && (statsMonth === 'all' || m === statsMonth)) {
          imrCount++;
        }
      }
    });

    let emrCount = 0;
    emrCalls.forEach(c => {
      if (c.meetingDetails?.date) {
        const date = parseISO(c.meetingDetails.date);
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear().toString();
        if ((statsYear === 'all' || y === statsYear) && (statsMonth === 'all' || m === statsMonth)) {
          emrCount++;
        }
      }
    });

    emrInterests.forEach(i => {
      if (i.meetingSlot?.date) {
        const date = parseISO(i.meetingSlot.date);
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear().toString();
        if ((statsYear === 'all' || y === statsYear) && (statsMonth === 'all' || m === statsMonth)) {
          emrCount++;
        }
      }
    });

    return {
      imrCount,
      emrCount,
      totalCount: imrCount + emrCount
    };
  }, [allProjects, emrCalls, emrInterests, statsMonth, statsYear]);

  if (loading || !user) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Schedule IMR Meeting" description="Loading projects..." />
        <Card className="mt-8">
          <CardHeader>
            <Skeleton className="h-6 w-1/2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ScheduleForm = ({ isEditing }: { isEditing: boolean }) => {
    const [searchVal, setSearchVal] = useState("");

    const filteredEvaluators = useMemo(() => {
      return evaluators.filter(ev =>
        ev.name.toLowerCase().includes(searchVal.toLowerCase())
      );
    }, [searchVal]);

    return (
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Reschedule Meeting' : 'Schedule Details'}</CardTitle>
          <CardDescription>{isEditing ? 'Update the details for this meeting.' : 'Set the time and assign evaluators.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} id="schedule-form" className="space-y-6">
              <FormField name="date" control={form.control} render={({ field }) => (<FormItem className="flex flex-col"><FormLabel>Meeting Date</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal w-full", !field.value && "text-muted-foreground")}>{field.value ? format(field.value, "PPP") : (<span>Pick a date</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar captionLayout="dropdown-buttons" fromYear={new Date().getFullYear()} toYear={new Date().getFullYear() + 5} mode="single" selected={field.value} onSelect={field.onChange} disabled={(date) => date < startOfToday()} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>)} />
              <FormField name="time" control={form.control} render={({ field }) => (<FormItem><FormLabel>Meeting Time</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>)} />
              <FormField name="mode" control={form.control} render={({ field }) => (<FormItem className="space-y-3"><FormLabel>Meeting Mode</FormLabel>{hasGoaCampusPi && (<Alert variant="default" className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700"><Info className="h-4 w-4 text-blue-600" /><AlertTitle>Online Mode Enforced</AlertTitle><AlertDescription className="text-blue-700 dark:text-blue-300">An online meeting is required as one or more selected PIs are from the Goa campus.</AlertDescription></Alert>)}<FormControl><RadioGroup onValueChange={field.onChange} value={field.value} className="flex space-x-4"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="Offline" disabled={hasGoaCampusPi} /></FormControl><FormLabel className="font-normal">Offline</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="Online" /></FormControl><FormLabel className="font-normal">Online</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem>)} />
              <FormField name="venue" control={form.control} render={({ field }) => (<FormItem><FormLabel>{meetingMode === 'Online' ? 'Meeting Link' : 'Venue'}</FormLabel><FormControl><Input {...field} placeholder={meetingMode === 'Online' ? 'https://meet.google.com/...' : 'Enter physical venue'} /></FormControl><FormMessage /></FormItem>)} />
              <FormField
                control={form.control}
                name="evaluatorUids"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Assign Evaluators</FormLabel>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          {field.value?.length > 0 ? `${field.value.length} selected` : "Select evaluators"}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[--radix-popover-trigger-width] p-2 flex flex-col gap-1">
                        <div className="px-2 py-1">
                          <Input
                            placeholder="Search evaluators..."
                            value={searchVal}
                            onChange={(e) => setSearchVal(e.target.value)}
                            className="h-8 text-xs bg-muted/50"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          />
                        </div>
                        <DropdownMenuSeparator />
                        <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                          {filteredEvaluators.length > 0 ? (
                            filteredEvaluators.map((evaluator) => (
                              <DropdownMenuCheckboxItem
                                key={evaluator.uid}
                                checked={field.value?.includes(evaluator.uid)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value || []), evaluator.uid])
                                    : field.onChange(field.value?.filter((id) => id !== evaluator.uid));
                                }}
                              >
                                {evaluator.name}
                              </DropdownMenuCheckboxItem>
                            ))
                          ) : (
                            <div className="text-xs text-muted-foreground text-center py-2">
                              No evaluators found
                            </div>
                          )}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </CardContent>
        <CardFooter>
          <Button type="submit" form="schedule-form" className="w-full" disabled={form.formState.isSubmitting || (!isEditing && selectedProjects.length === 0)}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Reschedule Meeting' : `Schedule for ${selectedProjects.length} Project(s)`}
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <>
      <div className="container mx-auto py-10">
        <PageHeader
          title="Schedule IMR Meeting"
          description="Select projects to schedule an initial submission meeting or a mid-term review."
        />

        {/* Monthly Scheduled Meetings Statistics */}
        <div className="mt-6 p-4 bg-muted/40 border rounded-lg space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-full text-primary">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Monthly Scheduled Meetings Statistics</h3>
                <p className="text-xs text-muted-foreground">Stats of meetings scheduled in a month for both IMR and EMR</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Month:</span>
                <Select value={statsMonth} onValueChange={setStatsMonth}>
                  <SelectTrigger className="w-[130px] h-8 text-xs bg-background">
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    <SelectItem value="01">January</SelectItem>
                    <SelectItem value="02">February</SelectItem>
                    <SelectItem value="03">March</SelectItem>
                    <SelectItem value="04">April</SelectItem>
                    <SelectItem value="05">May</SelectItem>
                    <SelectItem value="06">June</SelectItem>
                    <SelectItem value="07">July</SelectItem>
                    <SelectItem value="08">August</SelectItem>
                    <SelectItem value="09">September</SelectItem>
                    <SelectItem value="10">October</SelectItem>
                    <SelectItem value="11">November</SelectItem>
                    <SelectItem value="12">December</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">Year:</span>
                <Select value={statsYear} onValueChange={setStatsYear}>
                  <SelectTrigger className="w-[100px] h-8 text-xs bg-background">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {availableStatsYears.map(yr => (
                      <SelectItem key={yr} value={yr}>{yr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="p-3 bg-background rounded-md border flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">Total Scheduled</p>
                <p className="text-2xl font-bold text-primary">{monthlyMeetingStats.totalCount}</p>
              </div>
              <CalendarDays className="h-6 w-6 text-primary/40" />
            </div>

            <div className="p-3 bg-background rounded-md border flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">IMR Meetings Scheduled</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{monthlyMeetingStats.imrCount}</p>
              </div>
              <Badge variant="secondary">IMR</Badge>
            </div>

            <div className="p-3 bg-background rounded-md border flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase">EMR Meetings Scheduled</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{monthlyMeetingStats.emrCount}</p>
              </div>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">EMR</Badge>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="new-submissions">New Submissions ({newSubmissions.length})</TabsTrigger>
              <TabsTrigger value="revised-proposals">Revised Proposals ({revisedProposalProjects.length})</TabsTrigger>
              <TabsTrigger value="mid-term-review">Mid-term Review ({midTermReviewProjects.length})</TabsTrigger>
              <TabsTrigger value="history">History ({scheduledMeetingsHistory.length})</TabsTrigger>
            </TabsList>

            <div className={cn("grid grid-cols-1 gap-8 mt-4", activeTab !== 'history' && "lg:grid-cols-3")}>
              <div className={cn("space-y-4", activeTab !== 'history' ? "lg:col-span-2" : "lg:col-span-3")}>
                <TabsContent value="new-submissions" className="mt-0 space-y-4">
                  <ProjectListTable
                    projects={paginatedProjects} selectedProjects={selectedProjects} onSelectAll={handleSelectAll} onSelectOne={handleSelectOne}
                    usersMap={usersMap} usersByEmailMap={usersByEmailMap} title="Projects Awaiting Meeting"
                    description="Select new submissions to schedule for their initial evaluation meeting." dateColumnHeader="Submission Date"
                  />
                  {newSubmissions.length > itemsPerPage && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, newSubmissions.length)} of {newSubmissions.length} projects
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
                            Page {currentPage} of {Math.ceil(newSubmissions.length / itemsPerPage)}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(Math.ceil(newSubmissions.length / itemsPerPage), prev + 1))}
                          disabled={currentPage === Math.ceil(newSubmissions.length / itemsPerPage)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="mid-term-review" className="mt-0 space-y-4">
                  <Input placeholder="Search by title or PI..." value={midTermSearchTerm} onChange={e => setMidTermSearchTerm(e.target.value)} className="max-w-sm" />
                  <ProjectListTable
                    projects={paginatedProjects} selectedProjects={selectedProjects} onSelectAll={handleSelectAll} onSelectOne={handleSelectOne}
                    usersMap={usersMap} usersByEmailMap={usersByEmailMap} title="Projects Due for Mid-term Review"
                    description={`These projects were funded at least ${systemSettings?.imrMidTermReviewMonths ?? 6} months ago and are due for a progress review.`}
                    dateColumnHeader="Last Disbursement Date"
                  />
                  {filteredMidTermProjects.length > itemsPerPage && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredMidTermProjects.length)} of {filteredMidTermProjects.length} projects
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
                            Page {currentPage} of {Math.ceil(filteredMidTermProjects.length / itemsPerPage)}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredMidTermProjects.length / itemsPerPage), prev + 1))}
                          disabled={currentPage === Math.ceil(filteredMidTermProjects.length / itemsPerPage)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="revised-proposals" className="mt-0 space-y-4">
                  <ProjectListTable
                    projects={paginatedProjects} selectedProjects={selectedProjects} onSelectAll={handleSelectAll} onSelectOne={handleSelectOne}
                    usersMap={usersMap} usersByEmailMap={usersByEmailMap} title="Revised Proposals Awaiting Meeting"
                    description="Select revised proposals that have been submitted to schedule their re-evaluation meeting." dateColumnHeader="Revision Submission Date"
                  />
                  {revisedProposalProjects.length > itemsPerPage && (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, revisedProposalProjects.length)} of {revisedProposalProjects.length} projects
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
                            Page {currentPage} of {Math.ceil(revisedProposalProjects.length / itemsPerPage)}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(Math.ceil(revisedProposalProjects.length / itemsPerPage), prev + 1))}
                          disabled={currentPage === Math.ceil(revisedProposalProjects.length / itemsPerPage)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="history" className="mt-0 space-y-4">
                  <HistoryTable
                    projects={paginatedProjects}
                    usersMap={usersMap}
                    filter={historyFilter}
                    onFilterChange={setHistoryFilter}
                    currentUser={user}
                    onRemind={handleGlobalReminder}
                    isReminding={isSendingGlobalReminders}
                    onEdit={setMeetingToEdit}
                  />
                  {filteredHistory.length > itemsPerPage && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length} meetings
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
                            Page {currentPage} of {Math.ceil(filteredHistory.length / itemsPerPage)}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredHistory.length / itemsPerPage), prev + 1))}
                          disabled={currentPage === Math.ceil(filteredHistory.length / itemsPerPage)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>
              </div>

              {activeTab !== 'history' && (
                <div className="lg:col-span-1 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Submission Counts</CardTitle>
                      <CardDescription>Quick overview before scheduling.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span>Fresh Submissions</span>
                        <span className="font-semibold">{newSubmissions.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Revised Submissions</span>
                        <span className="font-semibold">{revisedProposalProjects.length}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <ScheduleForm isEditing={false} />
                </div>
              )}
            </div>
          </Tabs>
        </div>
      </div>
      <Dialog open={!!meetingToEdit} onOpenChange={() => setMeetingToEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule Meeting</DialogTitle>
            <DialogDescription>
              Update the details for this meeting. All participants will be re-notified.
            </DialogDescription>
          </DialogHeader>
          <ScheduleForm isEditing={true} />
        </DialogContent>
      </Dialog>
    </>
  );
}

