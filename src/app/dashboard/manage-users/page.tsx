

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, ArrowUpDown, ChevronDown, ShieldCheck, Loader2, Library, Users2, Ban, Bell } from "lucide-react";
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
import { getDefaultModulesForRole, ALL_MODULES } from "@/lib/modules";
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { bulkGrantModuleAccess, bulkRevokeModuleAccess } from '@/app/actions';
import { Switch } from '@/components/ui/switch';


const ROLES: User['role'][] = ['faculty', 'admin', 'CRO', 'IQAC'];
const SUPER_ADMIN_ROLE: User['role'] = 'Super-admin';
const PRIMARY_SUPER_ADMIN_EMAIL = 'rathipranav07@gmail.com';
type SortableKeys = keyof Pick<User, 'name' | 'email' | 'role' | 'faculty'> | 'claimsCount';

const faculties = [
    "Faculty of Engineering & Technology", "Faculty of Diploma Studies", "Faculty of Applied Sciences",
    "Faculty of IT & Computer Science", "Faculty of Agriculture", "Faculty of Architecture & Planning",
    "Faculty of Design", "Faculty of Fine Arts", "Faculty of Arts", "Faculty of Commerce",
    "Faculty of Social Work", "Faculty of Management Studies", "Faculty of Hotel Management & Catering Technology",
    "Faculty of Law", "Faculty of Medicine", "Faculty of Homoeopathy", "Faculty of Ayurved",
    "Faculty of Nursing", "Faculty of Pharmacy", "Faculty of Physiotherapy", "Faculty of Public Health", 
    "Parul Sevashram Hospital", "RDC", "University Office", "Parul Aarogya Seva Mandal"
];

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

function ModuleManagerDialog({ user, open, onOpenChange, onUpdate }: { user: User | null, open: boolean, onOpenChange: (open: boolean) => void, onUpdate: () => void }) {
    const { toast } = useToast();
    const [userModules, setUserModules] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const sortedModules = useMemo(() => [...ALL_MODULES].sort((a, b) => a.label.localeCompare(b.label)), []);

    useEffect(() => {
        if (user) {
            setUserModules(user.allowedModules || getDefaultModulesForRole(user.role, user.designation));
        }
    }, [user]);

    if (!user) return null;

    const handleModuleChange = (moduleId: string, checked: boolean) => {
        setUserModules(prev => checked ? [...prev, moduleId] : prev.filter(id => id !== moduleId));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        try {
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, { allowedModules: userModules });
            toast({ title: 'Permissions Updated', description: 'User modules have been saved successfully.' });
            onUpdate();
            onOpenChange(false);
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Update Failed', description: error.message || 'Could not update permissions.' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
         <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Manage Modules for {user.name}</DialogTitle>
                    <DialogDescription>Enable or disable access to specific portal features for this user.</DialogDescription>
                </DialogHeader>
                <div className="py-4 max-h-[60vh] overflow-y-auto pr-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {sortedModules.map((module) => (
                            <div key={module.id} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`${user.uid}-${module.id}`}
                                    checked={userModules.includes(module.id)}
                                    onCheckedChange={(checked) => handleModuleChange(module.id, !!checked)}
                                />
                                <Label htmlFor={`${user.uid}-${module.id}`} className="text-sm font-normal">{module.label}</Label>
                            </div>
                        ))}
                    </div>
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
  const [userToManageModules, setUserToManageModules] = useState<User | null>(null);
  const [userToManageNotifications, setUserToManageNotifications] = useState<User | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({ key: 'name', direction: 'ascending' });
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

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

  const totalPages = Math.ceil(sortedAndFilteredUsers.length / itemsPerPage);

  const paginatedUsers = sortedAndFilteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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

  const handleRoleChange = useCallback(async (uid: string, newRole: User['role'], extraData?: Record<string, any>) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      
      const newDesignation = extraData?.designation || (newRole === 'Super-admin' ? 'Super-admin' : 'faculty');
      const defaultModules = getDefaultModulesForRole(newRole, newDesignation);
      
      const updatePayload: Partial<User> = {
        role: newRole,
        allowedModules: defaultModules,
        designation: newDesignation,
        ...extraData
      };
      
      await updateDoc(userDocRef, updatePayload);
      
      toast({ title: 'Role Updated', description: "The user's role and permissions have been changed." });
      fetchUsersAndClaims();
    } catch (error) {
       console.error("Error updating role:", error);
       toast({ variant: 'destructive', title: "Error", description: "Could not update role." });
    }
  }, [fetchUsersAndClaims, toast]);
  
  const handleBulkGrant = async (moduleId: string) => {
    setIsBulkSubmitting(true);
    const result = await bulkGrantModuleAccess(selectedUsers, moduleId);
    if (result.success) {
      toast({ title: 'Success', description: `Granted access to '${moduleId}' for ${selectedUsers.length} users.` });
      setSelectedUsers([]);
      fetchUsersAndClaims();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.error });
    }
    setIsBulkSubmitting(false);
  };
  
  const handleBulkRevoke = async (moduleId: string) => {
    setIsBulkSubmitting(true);
    const result = await bulkRevokeModuleAccess(selectedUsers, moduleId);
    if (result.success) {
      toast({ title: 'Success', description: `Revoked access to '${moduleId}' for ${selectedUsers.length} users.` });
      setSelectedUsers([]);
      fetchUsersAndClaims();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.error });
    }
    setIsBulkSubmitting(false);
  };
  
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
              onChange={(event) => {setSearchTerm(event.target.value); setCurrentPage(1);}}
              className="w-full sm:max-w-xs"
          />
          <Select value={roleFilter} onValueChange={(value) => {setRoleFilter(value); setCurrentPage(1);}}>
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
                            setSelectedUsers(paginatedUsers.map(u => u.uid));
                          } else {
                            setSelectedUsers([]);
                          }
                        }}
                        // @ts-ignore
                        indeterminate={isSomeSelected || undefined}
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
                  {paginatedUsers.map((user) => {
                    const isPrimarySuperAdmin = user.email === PRIMARY_SUPER_ADMIN_EMAIL;
                    const isCurrentUserLoggedIn = user.uid === currentUser?.uid;
                    const isActionsDisabled = isCurrentUserLoggedIn || (isPrimarySuperAdmin && currentUser?.email !== PRIMARY_SUPER_ADMIN_EMAIL);
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
                              <Button aria-haspopup="true" size="icon" variant="ghost" disabled={isActionsDisabled}>
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Toggle menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem onSelect={() => setUserToView(user)}>View Details</DropdownMenuItem>
                              {isCurrentUserSuperAdmin && (
                                <>
                                  <DropdownMenuItem onSelect={() => setUserToManageModules(user)}>
                                      <ShieldCheck className="mr-2 h-4 w-4" /> Manage Modules
                                  </DropdownMenuItem>
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
                                                      onClick={() => handleRoleChange(user.uid, role)}
                                                      disabled={user.role === role}
                                                  >
                                                    {role.charAt(0).toUpperCase() + role.slice(1)}
                                                  </DropdownMenuItem>
                                              ))}
                                          </DropdownMenuSubContent>
                                      </DropdownMenuPortal>
                                  </DropdownMenuSub>
                                  {user.designation === 'Head of Goa Campus' ? (
                                      <DropdownMenuItem onClick={() => handleRoleChange(user.uid, 'faculty', { designation: 'faculty', campus: 'Goa' })}>
                                          Dismiss as Head of Goa Campus
                                      </DropdownMenuItem>
                                  ) : (
                                      <DropdownMenuItem onClick={() => handleRoleChange(user.uid, 'admin', { designation: 'Head of Goa Campus', campus: 'Goa'})}>
                                          Assign as Head of Goa Campus
                                      </DropdownMenuItem>
                                  )}
                                </>
                              )}
                              {isCurrentUserSuperAdmin && user.role === 'CRO' && (
                                  <DropdownMenuSub>
                                      <DropdownMenuSubTrigger>Assign Faculties</DropdownMenuSubTrigger>
                                      <DropdownMenuPortal>
                                          <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                                              <DropdownMenuLabel>Faculties</DropdownMenuLabel>
                                              <DropdownMenuSeparator />
                                              {faculties.map(faculty => (
                                                  <DropdownMenuCheckboxItem
                                                      key={faculty}
                                                      checked={user.faculties?.includes(faculty)}
                                                      onCheckedChange={(checked) => {
                                                          const currentFaculties = user.faculties || [];
                                                          const newFaculties = checked
                                                              ? [...currentFaculties, faculty]
                                                              : currentFaculties.filter(f => f !== faculty);
                                                          handleRoleChange(user.uid, user.role, { faculties: newFaculties });
                                                      }}
                                                  >
                                                      {faculty}
                                                  </DropdownMenuCheckboxItem>
                                              ))}
                                          </DropdownMenuSubContent>
                                      </DropdownMenuPortal>
                                  </DropdownMenuSub>
                              )}
                              <DropdownMenuItem className="text-destructive" onSelect={() => setUserToDelete(user)}>
                                Delete User
                              </DropdownMenuItem>
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
              {paginatedUsers.map(user => {
                const isPrimarySuperAdmin = user.email === PRIMARY_SUPER_ADMIN_EMAIL;
                const isCurrentUserLoggedIn = user.uid === currentUser?.uid;
                const isActionsDisabled = isCurrentUserLoggedIn || (isPrimarySuperAdmin && currentUser?.email !== PRIMARY_SUPER_ADMIN_EMAIL);
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
                            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isActionsDisabled}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => setUserToView(user)}>View Details</DropdownMenuItem>
                            {isCurrentUserSuperAdmin && (
                              <>
                                <DropdownMenuItem onSelect={() => setUserToManageModules(user)}>
                                    <ShieldCheck className="mr-2 h-4 w-4" /> Manage Modules
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setUserToManageNotifications(user)}>
                                    <Bell className="mr-2 h-4 w-4" /> Notification Settings
                                </DropdownMenuItem>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>Change Role</DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                        <DropdownMenuSubContent>
                                            {availableRoles.map(role => (
                                                <DropdownMenuItem key={role} onClick={() => handleRoleChange(user.uid, role)} disabled={user.role === role}>{role.charAt(0).toUpperCase() + role.slice(1)}</DropdownMenuItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                </DropdownMenuSub>
                                {user.designation === 'Head of Goa Campus' ? ( <DropdownMenuItem onClick={() => handleRoleChange(user.uid, 'faculty', { designation: 'faculty', campus: 'Goa' })}>Dismiss as Head of Goa Campus</DropdownMenuItem>) : (<DropdownMenuItem onClick={() => handleRoleChange(user.uid, 'admin', { designation: 'Head of Goa Campus', campus: 'Goa'})}>Assign as Head of Goa Campus</DropdownMenuItem>)}
                              </>
                            )}
                            {isCurrentUserSuperAdmin && user.role === 'CRO' && (
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>Assign Faculties</DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                        <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
                                            <DropdownMenuLabel>Faculties</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            {faculties.map(faculty => (
                                                <DropdownMenuCheckboxItem
                                                    key={faculty}
                                                    checked={user.faculties?.includes(faculty)}
                                                    onCheckedChange={(checked) => {
                                                        const currentFaculties = user.faculties || [];
                                                        const newFaculties = checked ? [...currentFaculties, faculty] : currentFaculties.filter(f => f !== faculty);
                                                        handleRoleChange(user.uid, user.role, { faculties: newFaculties });
                                                    }}
                                                >{faculty}</DropdownMenuCheckboxItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                </DropdownMenuSub>
                            )}
                            <DropdownMenuItem className="text-destructive" onSelect={() => setUserToDelete(user)}>Delete User</DropdownMenuItem>
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
            
            {sortedAndFilteredUsers.length > itemsPerPage && (
              <div className="flex items-center justify-between pt-6">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedAndFilteredUsers.length)} of {sortedAndFilteredUsers.length}
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
           {selectedUsers.length > 0 && isCurrentUserSuperAdmin && (
              <CardFooter className="p-4 border-t sticky bottom-0 bg-background/95">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">{selectedUsers.length} user(s) selected</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" disabled={isBulkSubmitting}>
                        <Library className="mr-2 h-4 w-4" /> Grant Module Access
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {ALL_MODULES.map(module => (
                        <DropdownMenuItem key={module.id} onSelect={() => handleBulkGrant(module.id)}>
                          {module.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                   <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="destructive" disabled={isBulkSubmitting}>
                        <Ban className="mr-2 h-4 w-4" /> Revoke Module Access
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {ALL_MODULES.map(module => (
                        <DropdownMenuItem key={module.id} onSelect={() => handleBulkRevoke(module.id)}>
                          {module.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                   {isBulkSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
                </div>
              </CardFooter>
          )}
        </Card>
      </div>
       <ProfileDetailsDialog user={userToView} open={!!userToView} onOpenChange={() => setUserToView(null)} />
       <ModuleManagerDialog user={userToManageModules} open={!!userToManageModules} onOpenChange={() => setUserToManageModules(null)} onUpdate={fetchUsersAndClaims} />
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
