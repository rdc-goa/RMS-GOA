
"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { doc, getDoc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/config"
import type { Project, User, SystemSettings } from "@/types"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { ProjectDetailsClient } from "@/components/projects/project-details-client"
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
  const [userLoading, setUserLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null)
  const [user, setUser] = useState<User | null>(null)

  // Load user from localStorage — must track its own loading state
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('user')
      if (storedUser) {
        setUser(JSON.parse(storedUser))
      }
    } catch (e) {
      console.error('Failed to parse stored user:', e)
    } finally {
      setUserLoading(false)
    }
  }, [])

  const fetchProjectAndUsers = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)

    try {
      const settings = await getSystemSettings()
      setSystemSettings(settings)

      const projectRef = doc(db, 'projects', projectId)
      const projectSnap = await getDoc(projectRef)

      if (!projectSnap.exists()) {
        setError('Project not found. It may have been removed or the link is invalid.')
        setLoading(false)
        return
      }

      const projectData = { id: projectSnap.id, ...projectSnap.data() } as Project
      setProject(projectData)

      // Fetch PI and Evaluator user records
      const uidsToFetch = Array.from(
        new Set(
          [projectData.pi_uid, ...(projectData.meetingDetails?.assignedEvaluators || [])].filter(Boolean)
        )
      )

      if (uidsToFetch.length > 0) {
        const userDocs = await Promise.all(
          uidsToFetch.map(uid => getDoc(doc(db, 'users', uid)))
        )
        const userList = userDocs
          .filter(snap => snap.exists())
          .map(snap => ({ uid: snap.id, ...snap.data() }) as User)

        setAllUsers(userList)
        setPiUser(userList.find(u => u.uid === projectData.pi_uid) || null)
      } else {
        setAllUsers([])
        setPiUser(null)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load project data.')
      console.error('Error loading project:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) return

    // Real-time listener keeps project data fresh (e.g. after attendance is marked)
    const projectRef = doc(db, 'projects', projectId)
    const unsubscribeProject = onSnapshot(projectRef, snap => {
      if (snap.exists()) {
        setProject({ id: snap.id, ...snap.data() } as Project)
      }
    })

    fetchProjectAndUsers()

    return () => unsubscribeProject()
  }, [projectId, fetchProjectAndUsers])

  const handleProjectUpdate = (updatedProject: Project) => {
    setProject(updatedProject)
  }

  const isEvaluationPeriodActive = useMemo(() => {
    if (!project?.meetingDetails?.date) return false
    const meetingDate = new Date(project.meetingDetails.date.replace(/-/g, '/'))
    const today = startOfToday()
    const evaluationDays = systemSettings?.imrEvaluationDays ?? 0
    const deadline = addDays(meetingDate, evaluationDays)
    return !isBefore(today, meetingDate) && !isAfter(today, deadline)
  }, [project?.meetingDetails?.date, systemSettings])

  // Show skeleton while loading project data OR while user session is being restored
  if (loading || userLoading) {
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
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader
          title="Error Loading Project"
          description={error}
          backButtonHref="/dashboard"
          backButtonText="Back to Dashboard"
        />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader
          title="Project Not Found"
          description="The project you are looking for does not exist or may have been removed."
          backButtonHref="/dashboard"
          backButtonText="Back to Dashboard"
        />
      </div>
    )
  }

  // If no session, redirect to login
  if (!user) {
    router.replace('/login')
    return null
  }

  return (
    <div className="container mx-auto py-10">
      <PageHeader
        title={project.title}
        description={project.type}
        backButtonHref="/dashboard"
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
  )
}
