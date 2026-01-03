
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, ArrowUpDown, ChevronDown, ShieldCheck, Loader2, Library, Users2, Ban, Bell, Check, UserCog, Trash2 } from "lucide-react";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
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
import { db } from '@/lib/config';
import { collection, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { User, IncentiveClaim, NotificationSettings } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { getDefaultModulesForRole } from "@/lib/modules";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { bulkGrantModuleAccess, bulkRevokeModuleAccess } from '@/app/server-actions';
import { Switch } from '@/components/ui/switch';


const ROLES: User['role'][] = ['faculty', 'admin', 'CRO', 'IQAC'];
const SUPER_ADMIN_ROLE: User['role'] = 'Super-admin';
const PRIMARY_SUPER_ADMIN_EMAIL = 'rathipranav07@gmail.com';
type SortableKeys = keyof Pick<User, 'name' | 'email' | 'role' | 'faculty'> | 'claimsCount';

const goaFaculties = [
    "Faculty of Engineering, IT & CS",
    "Faculty of Management Studies",
    "Faculty of Pharmacy",
    "Faculty of Applied and Health Sciences",
    "Faculty of Nursing",
    "Faculty of Physiotherapy",
    "University Office"
];

const campuses = ["Goa"]

const goaInstitutes = [
  "Parul College of Applied and Health Sciences",
  "Parul College of Engineering",
  "Parul College of Information Technology & Computer Science",
  "Parul College of Management",
  "Parul College of Nursing",
  "Parul College of Pharmacy",
  "Parul College of Physiotherapy",
  "University Office",
]

const notificationTypes = [
  { id: 'projectStatus', label: 'IMR Project Status Updates' },
  { id: 'emrStatus', label: 'EMR Status Updates' },
  { id: 'evaluations', label: 'New Evaluation Assignments' },
  { id: 'grantUpdates', label: 'Grant & Financial Updates' },
  { id: 'coAuthor', label: 'Co-Author/Publication Updates' },
  { id: 'general', label: 'General Announcements' },
] as const;

type NotificationTypeId = typeof notificationTypes[number]['id'];

function NotificationSettingsDialog({ user, open, onOpenChange, onUpdate }: { user: User | null, open: boolean, onOpenChange: (open: boolean) => void, onUpdate: () => void }) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [settings, setSettings] = useState<NotificationSettings>({});

    useEffect(() => {
        if (user) {
            const defaultSettings: NotificationSettings = {};
            notificationTypes.forEach(type => {
                defaultSettings[type.id] = {
                    inApp: user.notificationSettings?.[type.id]?.inApp ?? true,
                    email: user.notificationSettings?.[type.id]?.email ?? true,
                };
            });
            setSettings(defaultSettings);
        }
    }, [user]);

    if (!user) return null;

    const handleSettingChange = (typeId: NotificationTypeId, channel: 'inApp' | 'email', value: boolean) => {
        setSettings(prev => ({
            ...prev,
            [typeId]: {
                ...prev[typeId],
                [channel]: value,
            }
        }));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        try {
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, { notificationSettings: settings });
            toast({ title: 'Notification Settings Updated' });
            onUpdate();
            onOpenChange(false);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message || 'Could not update notification settings.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
         <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Notification Settings for {user.name}</DialogTitle>
                    <DialogDescription>Manage how this user receives different types of notifications from the portal.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2 max-h-[60vh] overflow-y-auto pr-4">
                    <div className="grid grid-cols-3 gap-2 font-semibold text-sm sticky top-0 bg-background py-2">
                        <div className="col-span-1">Notification Type</div>
                        <div className="text-center">In-App</div>
                        <div className="text-center">Email</div>
                    </div>
                    {notificationTypes.map(type => (
                        <div key={type.id} className="grid grid-cols-3 gap-2 items-center p-2 border rounded-md">
                            <Label htmlFor={`in-app-${type.id}`} className="col-span-1 text-sm">{type.label}</Label>
                            <div className="flex justify-center">
                                <Switch
                                    id={`in-app-${type.id}`}
                                    checked={settings[type.id]?.inApp ?? true}
                                    onCheckedChange={(checked) => handleSettingChange(type.id, 'inApp', checked)}
                                />
                            </div>
                            <div className="flex justify-center">
                                <Switch
                                    id={`email-${type.id}`}
                                    checked={settings[type.id]?.email ?? true}
                                    onCheckedChange={(checked) => handleSettingChange(type.id, 'email', checked)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handleSaveChanges} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ProfileDetailsDialog({ user, open, onOpenChange }: { user: User | null, open: boolean, onOpenChange: (open: boolean) => void }) {
    if (!user) return null;

    const renderDetail = (label: string, value?: string | number | string[]) => {
        if (!value && value !== 0) return null;
        let displayValue = Array.isArray(value) ? value.join(', ') : String(value);

        return (
            <div className="grid grid-cols-3 gap-2 py-1.5">
                <dt className="font-semibold text-muted-foreground col-span-1">{label}</dt>
                <dd className="col-span-2">{displayValue}</dd>
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{user.name}'s Profile</DialogTitle>
                    <DialogDescription>Viewing full profile details for {user.email}.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[70vh] overflow-y-auto pr-4 space-y-4 text-sm">
                    <div>
                      <h4 className="font-semibold text-base mb-2">Personal & Contact</h4>
                      {renderDetail("Full Name", user.name)}
                      {renderDetail("Email", user.email)}
                      {renderDetail("Phone", user.phoneNumber)}
                      {renderDetail("Role", user.role)}
                      {renderDetail("Designation", user.designation)}
                    </div>

                    <div className="border-t pt-4">
                      <h4 className="font-semibold text-base mb-2">Academic Details</h4>
                      {renderDetail("MIS ID", user.misId)}
                      {renderDetail("ORCID ID", user.orcidId)}
                      {renderDetail("Primary Faculty", user.faculty)}
                      {renderDetail("Assigned Faculties", user.faculties)}
                      {renderDetail("Institute", user.institute)}
                      {renderDetail("Department", user.department)}
                    </div>
                    
                    {user.bankDetails ? (
                        <div className="border-t pt-4">
                            <h4 className="font-semibold text-base mb-2">Bank Account Details</h4>
                            {renderDetail("Beneficiary Name", user.bankDetails.beneficiaryName)}
                            {renderDetail("Account Number", user.bankDetails.accountNumber)}
                            {renderDetail("Bank Name", user.bankDetails.bankName)}
                            {renderDetail("Branch Name", user.bankDetails.branchName)}
                            {renderDetail("City", user.bankDetails.city)}
                            {renderDetail("IFSC Code", user.bankDetails.ifscCode)}
                        </div>
                    ) : (
                       <div className="border-t pt-4">
                            <h4 className="font-semibold text-base mb-2">Bank Account Details</h4>
                            <p className="text-muted-foreground">No bank details have been added by this user.</p>
                       </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

interface UserWithClaims extends User {
  claimsCount: number;
}


export default function ManageUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [claimsCount, setClaimsCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userToView, setUserToView] = useState<User | null>(null);
  const [userToManageNotifications, setUserToManageNotifications] = useState<User | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'name', direction: 'ascending' });
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      if (!parsedUser.allowedModules?.includes('manage-users')) {
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

  const fetchUsersAndClaims = useCallback(async () => {
    setLoading(true);
    try {
      const usersCollection = collection(db, 'users');
      const userSnapshot = await getDocs(usersCollection);
      const userList = userSnapshot.docs.map(userDoc => ({ ...userDoc.data(), uid: userDoc.id } as User));
      setUsers(userList);

      const claimsCollection = collection(db, 'incentiveClaims');
      const claimsSnapshot = await getDocs(claimsCollection);
      const claimsList = claimsSnapshot.docs.map(doc => doc.data() as IncentiveClaim);
      
      const counts: Record<string, number> = {};
      for (const claim of claimsList) {
          counts[claim.uid] = (counts[claim.uid] || 0) + 1;
      }
      setClaimsCount(counts);

    } catch (error) {
      console.error("Error fetching users or claims:", error);
      toast({ variant: 'destructive', title: "Error", description: "Could not fetch users or claims data." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (currentUser) {
        fetchUsersAndClaims();
    }
  }, [currentUser, fetchUsersAndClaims]);
  
  const usersWithClaims = useMemo(() => {
    return users.map(user => ({
      ...user,
      claimsCount: claimsCount[user.uid] || 0
    }));
  }, [users, claimsCount]);
  
  const sortedAndFilteredUsers = useMemo(() => {
    let filtered: UserWithClaims[] = [...usersWithClaims];

    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    if (searchTerm) {
      const lowerCaseSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        user.name.toLowerCase().includes(lowerCaseSearch) ||
        user.email.toLowerCase().includes(lowerCaseSearch)
      );
    }

    filtered.sort((a, b) => {
        const key = sortConfig.key;
        let aValue, bValue;

        if (key === 'claimsCount') {
          aValue = a.claimsCount;
          bValue = b.claimsCount;
        } else {
          aValue = a[key as keyof User] || '';
          bValue = b[key as keyof User] || '';
        }

        if (aValue < bValue) {
            return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
            return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
    });

    return filtered;
  }, [usersWithClaims, searchTerm, roleFilter, sortConfig]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
        direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleDeleteUser = useCallback(async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      toast({ title: 'User Deleted', description: 'The user has been successfully deleted.' });
      fetchUsersAndClaims(); // Refresh the list
    } catch (error) {
       console.error("Error deleting user:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not delete user." });
    } finally {
      setUserToDelete(null);
    }
  }, [fetchUsersAndClaims, toast]);

  const handleRoleChange = useCallback(async (userToUpdate: User, newRole: User['role'], extraData?: Record<string, any>) => {
    try {
      const userDocRef = doc(db, 'users', userToUpdate.uid);
      
      const newDesignation = newRole === 'Super-admin' ? 'Super-admin' : (userToUpdate.designation || 'faculty');
      const defaultModules = getDefaultModulesForRole(newRole, newDesignation);
      
      const updatePayload: Partial<User> = {
        role: newRole,
        allowedModules: defaultModules,
        designation: newDesignation,
        ...extraData
      };
      
      await updateDoc(userDocRef, updatePayload);
      
      toast({ title: 'Role Updated', description: `The role for ${userToUpdate.name} has been changed.` });
      fetchUsersAndClaims();
    } catch (error) {
       console.error("Error updating role:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not update role." });
    }
  }, [fetchUsersAndClaims, toast]);
  
  if (loading || !currentUser) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Manage Users" description="View and manage user roles and permissions." />
        <div className="mt-8">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              </CardContent>
            </Card>
        </div>
      </div>
    );
  }

  const isCurrentUserSuperAdmin = currentUser?.role === 'Super-admin';
  const availableRoles = isCurrentUserSuperAdmin ? [...ROLES, SUPER_ADMIN_ROLE] : ROLES;
  
  const isAllSelected = sortedAndFilteredUsers.length > 0 && selectedUsers.length === sortedAndFilteredUsers.length;
  const isSomeSelected = selectedUsers.length > 0 && selectedUsers.length < sortedAndFilteredUsers.length;

  return (
    <div className="container mx-auto py-10">
      <PageHeader title="Manage Users & Permissions" description="View, manage user roles, and set module permissions." />
      
      <div className="flex flex-col sm:flex-row items-center py-4 gap-2 sm:gap-4">
          <Input
              placeholder="Filter by name or email..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full sm:max-w-xs"
          />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {availableRoles.map(role => (
                      <SelectItem key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</SelectItem>
                  ))}
              </SelectContent>
          </Select>
      </div>

      <div className="mt-4">
        <Card>
          <CardContent className="pt-6">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedUsers(sortedAndFilteredUsers.map(u => u.uid));
                          } else {
                            setSelectedUsers([]);
                          }
                        }}
                        indeterminate={isSomeSelected}
                      />
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" onClick={() => requestSort('name')}>
                          Name <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" onClick={() => requestSort('email')}>
                          Email <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" onClick={() => requestSort('role')}>
                          Role <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" onClick={() => requestSort('faculty')}>
                          Faculty <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAndFilteredUsers.map((user) => {
                    const isPrimarySuperAdmin = user.email === PRIMARY_SUPER_ADMIN_EMAIL;
                    const canPerformActions = currentUser?.role === 'Super-admin' && !isPrimarySuperAdmin && user.uid !== currentUser?.uid;
                    const profileLink = user.campus === 'Goa' ? `/goa/${user.misId}` : `/profile/${user.misId}`;

                    return (
                      <TableRow key={user.uid} data-state={selectedUsers.includes(user.uid) && "selected"}>
                        <TableCell>
                          <Checkbox
                            checked={selectedUsers.includes(user.uid)}
                            onCheckedChange={(checked) => {
                              setSelectedUsers(
                                checked
                                ? [...selectedUsers, user.uid]
                                : selectedUsers.filter(id => id !== user.uid)
                              );
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>
                              {user.misId ? (
                                  <Link href={profileLink} className="hover:underline" target="_blank" rel="noopener noreferrer">
                                      {user.name}
                                  </Link>
                              ) : (
                                  user.name
                              )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                              {user.designation}, {user.institute}
                          </div>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === 'admin' || user.role === 'Super-admin' || user.role === 'IQAC' ? 'default' : 'secondary'}>{user.role}</Badge>
                        </TableCell>
                        <TableCell>{user.faculty || 'N/A'}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button aria-haspopup="true" size="icon" variant="ghost">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Toggle menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onSelect={() => setUserToView(user)}>View Details</DropdownMenuItem>
                              {canPerformActions && (
                                  <>
                                  <DropdownMenuItem onSelect={() => setUserToManageNotifications(user)}>
                                      <Bell className="mr-2 h-4 w-4" /> Notification Settings
                                  </DropdownMenuItem>
                                  <DropdownMenuSub>
                                      <DropdownMenuSubTrigger>Change Role</DropdownMenuSubTrigger>
                                      <DropdownMenuPortal>
                                          <DropdownMenuSubContent>
                                              {availableRoles.map(role => (
                                                  <DropdownMenuItem 
                                                      key={role} 
                                                      onClick={() => handleRoleChange(user, role)}
                                                      disabled={user.role === role}
                                                  >
                                                    {role.charAt(0).toUpperCase() + role.slice(1)}
                                                  </DropdownMenuItem>
                                              ))}
                                          </DropdownMenuSubContent>
                                      </DropdownMenuPortal>
                                  </DropdownMenuSub>
                                  {user.role === 'CRO' && (
                                      <DropdownMenuSub>
                                          <DropdownMenuSubTrigger>Assign Faculties</DropdownMenuSubTrigger>
                                          <DropdownMenuPortal>
                                              <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                                                  <DropdownMenuLabel>Faculties</DropdownMenuLabel>
                                                  <DropdownMenuSeparator />
                                                  {goaFaculties.map(faculty => (
                                                      <DropdownMenuCheckboxItem
                                                          key={faculty}
                                                          checked={user.faculties?.includes(faculty)}
                                                          onCheckedChange={(checked) => {
                                                              const currentFaculties = user.faculties || [];
                                                              const newFaculties = checked
                                                                  ? [...currentFaculties, faculty]
                                                                  : currentFaculties.filter(f => f !== faculty);
                                                              handleRoleChange(user, user.role, { faculties: newFaculties });
                                                          }}
                                                      >
                                                          {faculty}
                                                      </DropdownMenuCheckboxItem>
                                                  ))}
                                              </DropdownMenuSubContent>
                                          </DropdownMenuPortal>
                                      </DropdownMenuSub>
                                  )}
                                   <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onSelect={() => setUserToDelete(user)}>
                                        <Trash2 className="mr-2 h-4 w-4"/>
                                        Delete User
                                    </DropdownMenuItem>
                                  </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            <div className="grid md:hidden grid-cols-1 sm:grid-cols-2 gap-4">
              {sortedAndFilteredUsers.map(user => {
                const isPrimarySuperAdmin = user.email === PRIMARY_SUPER_ADMIN_EMAIL;
                const canPerformActions = currentUser?.role === 'Super-admin' && !isPrimarySuperAdmin && user.uid !== currentUser?.uid;
                const profileLink = user.campus === 'Goa' ? `/goa/${user.misId}` : `/profile/${user.misId}`;
                return (
                  <Card key={user.uid} className="flex flex-col">
                    <CardHeader className="flex-row items-start justify-between gap-4 pb-2">
                        <div className="flex items-center gap-2">
                           <Checkbox
                            checked={selectedUsers.includes(user.uid)}
                            onCheckedChange={(checked) => {
                              setSelectedUsers(
                                checked
                                ? [...selectedUsers, user.uid]
                                : selectedUsers.filter(id => id !== user.uid)
                              );
                            }}
                          />
                          <div className="flex flex-col">
                            {user.misId ? (
                              <Link href={profileLink} className="font-semibold hover:underline" target="_blank" rel="noopener noreferrer">{user.name}</Link>
                            ) : (
                              <span className="font-semibold">{user.name}</span>
                            )}
                            <span className="text-xs text-muted-foreground">{user.email}</span>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => setUserToView(user)}>View Details</DropdownMenuItem>
                                {canPerformActions && (
                                    <>
                                        <DropdownMenuItem onSelect={() => setUserToManageNotifications(user)}>
                                            <Bell className="mr-2 h-4 w-4" /> Notification Settings
                                        </DropdownMenuItem>
                                        <DropdownMenuSub>
                                            <DropdownMenuSubTrigger>Change Role</DropdownMenuSubTrigger>
                                            <DropdownMenuPortal>
                                                <DropdownMenuSubContent>
                                                    {availableRoles.map(role => (
                                                        <DropdownMenuItem key={role} onClick={() => handleRoleChange(user, role)} disabled={user.role === role}>{role.charAt(0).toUpperCase() + role.slice(1)}</DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuSubContent>
                                            </DropdownMenuPortal>
                                        </DropdownMenuSub>
                                        {user.role === 'CRO' && (
                                            <DropdownMenuSub>
                                                <DropdownMenuSubTrigger>Assign Faculties</DropdownMenuSubTrigger>
                                                <DropdownMenuPortal>
                                                    <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                                                        <DropdownMenuLabel>Faculties</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        {goaFaculties.map(faculty => (
                                                            <DropdownMenuCheckboxItem
                                                                key={faculty}
                                                                checked={user.faculties?.includes(faculty)}
                                                                onCheckedChange={(checked) => {
                                                                    const currentFaculties = user.faculties || [];
                                                                    const newFaculties = checked ? [...currentFaculties, faculty] : currentFaculties.filter(f => f !== faculty);
                                                                    handleRoleChange(user, user.role, { faculties: newFaculties });
                                                                }}
                                                            >{faculty}</DropdownMenuCheckboxItem>
                                                        ))}
                                                    </DropdownMenuSubContent>
                                                </DropdownMenuPortal>
                                            </DropdownMenuSub>
                                        )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive" onSelect={() => setUserToDelete(user)}>Delete User</DropdownMenuItem>
                                    </>
                                )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </CardHeader>
                    <CardContent className="flex-grow space-y-2 text-sm">
                        <p><Badge variant={user.role === 'admin' || user.role === 'Super-admin' || user.role === 'IQAC' ? 'default' : 'secondary'}>{user.role}</Badge></p>
                        <p className="text-muted-foreground">{user.faculty || 'No faculty set'}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
          <CardFooter className="p-4 border-t sticky bottom-0 bg-background/95">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">{selectedUsers.length} user(s) selected</span>
               {isBulkSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
            </div>
          </CardFooter>
        </Card>
      </div>
       <ProfileDetailsDialog user={userToView} open={!!userToView} onOpenChange={() => setUserToView(null)} />
       <NotificationSettingsDialog user={userToManageNotifications} open={!!userToManageNotifications} onOpenChange={() => setUserToManageNotifications(null)} onUpdate={fetchUsersAndClaims} />
       {userToDelete && (
          <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
              <AlertDialogContent>
                  <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the user account for <span className="font-bold">{userToDelete.name}</span>.
                      </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                          onClick={() => handleDeleteUser(userToDelete.uid)}
                          className="bg-destructive hover:bg-destructive/90"
                      >
                          Continue
                      </AlertDialogAction>
                  </AlertDialogFooter>
              </AlertDialogContent>
          </AlertDialog>
      )}
    </div>
  );
}
