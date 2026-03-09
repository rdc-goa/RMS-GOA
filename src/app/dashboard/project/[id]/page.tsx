
"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { doc, getDoc, onSnapshot, collection, query, where } from "firebase/firestore"
import { db } from "@/lib/config"
import type { Project, User, Evaluation, SystemSettings } from "@/types"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { ProjectDetailsClient } from "@/components/projects/project-details-client"
import { getDocs } from "firebase/firestore"
import { getSystemSettings } from "@/app/actions"
import { startOfToday, addDays, isBefore, isAfter } from "date-fns"

export default function ProjectDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const [project, setProject] = useState<Project | null>(null)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [piUser, setPiUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        setUser(JSON.parse(storedUser));
    }
  }, []);

  const fetchProjectAndUsers = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);

    try {
      const settings = await getSystemSettings();
      setSystemSettings(settings);
      
      const projectRef = doc(db, 'projects', projectId);
      const projectSnap = await getDoc(projectRef);

      if (!projectSnap.exists()) {
        setError('Project not found.');
        setLoading(false);
        return;
      }
      
      const projectData = { id: projectSnap.id, ...projectSnap.data() } as Project;
      setProject(projectData);
      
      const usersRef = collection(db, 'users');
      const usersSnap = await getDocs(usersRef);
      const userList = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }) as User);
      setAllUsers(userList);
      
      const pi = userList.find(u => u.uid === projectData.pi_uid);
      setPiUser(pi || null);

    } catch (err: any) {
      setError(err.message || 'Failed to load project data.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    // Set up real-time listener for project
    const projectRef = doc(db, 'projects', projectId);
    const unsubscribeProject = onSnapshot(projectRef, (snap) => {
      if (snap.exists()) {
        const projectData = { id: snap.id, ...snap.data() } as Project;
        setProject(projectData);
      }
    });

    // Initial fetch for users
    const fetchUsers = async () => {
      try {
        const usersRef = collection(db, 'users');
        const usersSnap = await getDocs(usersRef);
        const userList = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }) as User);
        setAllUsers(userList);
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    };

    fetchUsers();
    fetchProjectAndUsers();

    return () => {
      unsubscribeProject();
    };
  }, [projectId]);
  
  const handleProjectUpdate = (updatedProject: Project) => {
    setProject(updatedProject);
  };
  
  const isEvaluationPeriodActive = useMemo(() => {
    if (!project?.meetingDetails?.date) return false;
    const meetingDate = new Date(project.meetingDetails.date.replace(/-/g, "/")); // Safer parsing
    const today = startOfToday();
    const evaluationDays = systemSettings?.imrEvaluationDays ?? 0;
    const deadline = addDays(meetingDate, evaluationDays);

    // It is active if today is on or after the meeting date AND on or before the deadline.
    return !isBefore(today, meetingDate) && !isAfter(today, deadline);
  }, [project?.meetingDetails?.date, systemSettings]);


  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Loading Project..." description="Please wait while we fetch the details." />
        <Card className="mt-8">
            <CardContent className="pt-6 space-y-6">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-1/2" />
                <Skeleton className="h-10 w-full" />
            </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Error" description={error} />
      </div>
    );
  }

  if (!project || !user) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="Project Not Found" description="The project you are looking for does not exist." />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader 
        title={project.title} 
        description={project.type} 
        onBackClick={() => router.back()} 
        backButtonText="Back"
      />
      <div className="mt-8">
        <ProjectDetailsClient 
          project={project}
          allUsers={allUsers}
          piUser={piUser}
          onProjectUpdate={handleProjectUpdate}
          isEvaluationPeriodActive={isEvaluationPeriodActive}
        />
      </div>
    </div>
  );
}
