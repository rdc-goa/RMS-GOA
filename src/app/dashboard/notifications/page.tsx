
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from "@/components/ui/card";
import { Bell, FileCheck2, GanttChartSquare, Loader2, Check, X, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { db } from '@/lib/config';
import { collection, query, where, getDocs, doc, updateDoc, orderBy, onSnapshot, getDoc } from 'firebase/firestore';
import { type Notification as NotificationType, type User, Author, ResearchPaper } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { manageCoAuthorRequest } from '@/app/bulkpapers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';

const AUTHOR_ROLES: Author['role'][] = ['First Author', 'Corresponding Author', 'Co-Author', 'First & Corresponding Author'];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const { toast } = useToast();
  const [managingRequest, setManagingRequest] = useState<{ notification: NotificationType, paper: ResearchPaper } | null>(null);
  const [requestToReject, setRequestToReject] = useState<NotificationType | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  
  // State for the acceptance dialog
  const [assignedRole, setAssignedRole] = useState<Author['role'] | ''>('');
  const [mainAuthorNewRole, setMainAuthorNewRole] = useState<Author['role'] | ''>('');
  const [roleConflict, setRoleConflict] = useState(false);


  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User;
      setUser(parsedUser);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    const q = query(
      collection(db, 'notifications'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedNotifications = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as NotificationType));
      setNotifications(fetchedNotifications);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching notifications:", error);
      toast({ variant: 'destructive', title: "Error", description: "Could not fetch notifications." });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, toast]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
        const notifRef = doc(db, 'notifications', notificationId);
        await updateDoc(notifRef, { isRead: true });
    } catch (error) {
        console.error("Error marking notification as read:", error);
        toast({ variant: 'destructive', title: "Error", description: "Could not update notification." });
    }
  };
  
  const handleRoleSelection = (selectedRole: Author['role']) => {
    setAssignedRole(selectedRole);
    if (!managingRequest || !user) return;
    
    const { paper } = managingRequest;
    const mainAuthor = paper.authors.find(a => a.uid === user.uid);
    
    const isFirstAuthorConflict = (selectedRole.includes('First Author') && mainAuthor?.role?.includes('First Author'));
    const isCorrespondingAuthorConflict = (selectedRole.includes('Corresponding Author') && mainAuthor?.role?.includes('Corresponding Author'));
    
    if (isFirstAuthorConflict || isCorrespondingAuthorConflict) {
        setRoleConflict(true);
    } else {
        setRoleConflict(false);
        setMainAuthorNewRole('');
    }
  };

  const handleOpenAcceptDialog = async (notification: NotificationType) => {
    if (!notification.paperId || !notification.requester) return;
    try {
        const paperRef = doc(db, 'papers', notification.paperId);
        const paperSnap = await getDoc(paperRef);
        if (paperSnap.exists()) {
            const paper = { id: paperSnap.id, ...paperSnap.data() } as ResearchPaper;
            setManagingRequest({ notification, paper });
            const requestedRole = notification.requester.role;
            handleRoleSelection(requestedRole);
        } else {
            toast({ title: 'Error', description: 'Could not find the associated paper.', variant: 'destructive' });
        }
    } catch (error) {
        toast({ title: 'Error', description: 'Failed to fetch paper details.', variant: 'destructive' });
    }
  };
  
  const handleConfirmAcceptRequest = async () => {
    if (!managingRequest || !assignedRole) {
        toast({title: "Please assign a role to the requester.", variant: "destructive"});
        return;
    }
    if (roleConflict && !mainAuthorNewRole) {
        toast({title: "Please select a new role for yourself to resolve the conflict.", variant: "destructive"});
        return;
    }

    const { notification } = managingRequest;
    const result = await manageCoAuthorRequest(notification.paperId!, notification.requester!, 'accept', assignedRole, roleConflict ? mainAuthorNewRole : undefined);
    
    if (result.success) {
        toast({title: "Co-Author Approved"});
        await handleMarkAsRead(notification.id);
        setManagingRequest(null);
    } else {
        toast({title: "Error", description: result.error, variant: "destructive"});
    }
  };

  const handleRejectRequest = async () => {
    if (!requestToReject) return;
    const result = await manageCoAuthorRequest(requestToReject.paperId!, requestToReject.requester!, 'reject');
    if (result.success) {
        toast({title: "Request Rejected"});
        await handleMarkAsRead(requestToReject.id);
        setRequestToReject(null);
    } else {
        toast({title: "Error", description: result.error, variant: "destructive"});
    }
  };

  const paginatedNotifications = notifications.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(notifications.length / itemsPerPage);

  const getAvailableRolesForMainAuthor = (paper?: ResearchPaper, requesterAssignedRole?: Author['role']): Author['role'][] => {
    if (!paper || !requesterAssignedRole) return AUTHOR_ROLES;
    const myCurrentRole = paper.authors.find(a => a.uid === user?.uid)?.role;
    
    let availableRoles = AUTHOR_ROLES.filter(r => r !== myCurrentRole);

    if (requesterAssignedRole.includes('First Author')) {
        availableRoles = availableRoles.filter(r => !r.includes('First Author'));
    }
    if (requesterAssignedRole.includes('Corresponding Author')) {
        availableRoles = availableRoles.filter(r => !r.includes('Corresponding Author'));
    }

    return availableRoles;
  }

  const getIcon = (title: string) => {
    if (title.toLowerCase().includes('meeting')) return CalendarClock;
    if (title.includes('Recommended') || title.includes('Completed')) return FileCheck2;
    if (title.includes('Review') || title.includes('Not Recommended')) return GanttChartSquare;
    return Bell;
  }
  
  const getNotificationLink = (notification: NotificationType): string | null => {
      // For EMR meeting notifications, link to the management page
      if (notification.title.toLowerCase().includes('emr') && notification.title.toLowerCase().includes('scheduled')) {
          const callId = notification.projectId; // projectId holds the callId in this case
          if (callId) {
            return `/dashboard/emr-management/${callId}`;
          }
      }
      
      // For general project notifications
      if (notification.projectId && !notification.projectId.startsWith('/')) {
        return `/dashboard/project/${notification.projectId}`;
      }
      
      // For links that are already full paths
      if (notification.projectId?.startsWith('/')) {
        return notification.projectId;
      }

      return null;
  };

  const buttonText = `Confirm & Add as ${assignedRole}`

  return (
    <>
      <div className="container mx-auto max-w-4xl py-10">
        <PageHeader title="Notifications" description="Here are your recent updates." />
        <div className="mt-8">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex justify-center items-center h-40">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                 <div className="text-center py-12 text-muted-foreground">
                    <Bell className="mx-auto h-12 w-12" />
                    <p className="mt-4">You have no new notifications.</p>
                  </div>
              ) : (
                 <div className="space-y-4">
                  {paginatedNotifications.map((notification) => {
                    const Icon = getIcon(notification.title);
                    const link = getNotificationLink(notification);
                    
                    const NotificationContent = () => (
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold break-words">{notification.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    );

                    const ActionButtons = () => (
                      <div className="flex items-center gap-2 self-start sm:self-center flex-shrink-0">
                        {!notification.isRead && notification.type !== 'coAuthorRequest' && (
                          <Button variant="ghost" size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleMarkAsRead(notification.id); }}>
                              Mark as read
                          </Button>
                        )}
                        {!notification.isRead && notification.type === 'coAuthorRequest' && (
                           <>
                             <Button size="sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenAcceptDialog(notification); }}><Check className="h-4 w-4 mr-2"/>Accept</Button>
                             <Button size="sm" variant="destructive" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRequestToReject(notification); }}><X className="h-4 w-4 mr-2"/>Reject</Button>
                           </>
                        )}
                      </div>
                    );

                    return (
                      <div
                        key={notification.id}
                        className={`flex items-start gap-4 rounded-lg border p-4 ${
                          !notification.isRead ? "bg-accent/50" : ""
                        }`}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary mt-1 flex-shrink-0">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 flex-1 min-w-0">
                          {link && notification.type !== 'coAuthorRequest' ? (
                              <Link href={link} className="flex-1 min-w-0" onClick={() => handleMarkAsRead(notification.id)}>
                                <NotificationContent />
                              </Link>
                          ) : (
                              <NotificationContent />
                          )}
                          <ActionButtons />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {notifications.length > itemsPerPage && (
                <div className="flex items-center justify-between pt-6">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, notifications.length)} of {notifications.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="text-sm">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
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
      </div>

      <Dialog open={!!managingRequest} onOpenChange={() => { setManagingRequest(null); setRoleConflict(false); setAssignedRole(''); setMainAuthorNewRole(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept '{managingRequest?.notification.requester?.role}' Request</DialogTitle>
            <DialogDescription>
                {managingRequest?.notification.requester?.name} has requested to be added as the <span className="font-bold">{managingRequest?.notification.requester?.role}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label>Assign Role to {managingRequest?.notification.requester?.name}</Label>
              <Select value={assignedRole} onValueChange={(value) => handleRoleSelection(value as Author['role'])}>
                <SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>
                  {AUTHOR_ROLES.map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            {roleConflict && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Role Conflict Detected!</AlertTitle>
                    <AlertDescription>
                        You are also assigned as the {assignedRole}. To resolve this, please select a new role for yourself.
                        <div className="mt-4">
                            <Label>Your New Role</Label>
                            <Select value={mainAuthorNewRole} onValueChange={(value) => setMainAuthorNewRole(value as Author['role'])}>
                                <SelectTrigger><SelectValue placeholder="Select your new role" /></SelectTrigger>
                                <SelectContent>
                                    {getAvailableRolesForMainAuthor(managingRequest?.paper, assignedRole as Author['role']).map(role => <SelectItem key={role} value={role}>{role}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </AlertDescription>
                </Alert>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleConfirmAcceptRequest}>{buttonText}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
       <AlertDialog open={!!requestToReject} onOpenChange={() => setRequestToReject(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to reject this request?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone. The user will not be added as a co-author.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRejectRequest} className="bg-destructive hover:bg-destructive/90">Confirm Reject</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
  );
}
