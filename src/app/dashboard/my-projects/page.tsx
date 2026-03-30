
"use client"

import { useState, useEffect, useMemo } from "react"
import { PageHeader } from "@/components/page-header"
import { ProjectList } from "@/components/projects/project-list"
import type { Project, User, EmrInterest, FundingCall } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { db } from "@/lib/config"
import { collection, getDocs, query, where, or, orderBy, limit, startAfter } from "firebase/firestore"
import { useToast } from "@/hooks/use-toast"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { format, parseISO } from "date-fns"
import { Button } from "@/components/ui/button"
import { FileText, Loader2 } from "lucide-react"
import { reportSystemError } from "@/lib/error-reporting"

function EmrProjectList({ 
  interests, 
  calls, 
  currentUser 
}: { 
  interests: EmrInterest[]; 
  calls: FundingCall[]; 
  currentUser: User | null 
}) {
  if (interests.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          You have not registered for any EMR projects.
        </CardContent>
      </Card>
    )
  }

  const getCallTitle = (interest: EmrInterest) => {
    if (interest.isBulkUploaded && interest.callTitle) {
      return interest.callTitle;
    }
    return calls.find((c) => c.id === interest.callId)?.title || "Unknown Funding Call"
  }

  return (
    <Card>
      <CardContent className="pt-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funding Call Title</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Proof</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {interests.map((interest) => {
                const proofLink = interest.proofUrl || interest.finalProofUrl;
                const isPI = currentUser?.uid === interest.userId || currentUser?.email === interest.userEmail;
                
                return (
                  <TableRow key={interest.id}>
                    <TableCell className="font-medium max-w-[300px] break-words whitespace-normal py-4">
                        {getCallTitle(interest)}
                    </TableCell>
                    <TableCell>
                        <Badge variant={isPI ? "default" : "outline"} className="font-semibold px-2 py-0.5">
                            {isPI ? "PI" : "Co-PI"}
                        </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {interest.registeredAt ? format(parseISO(interest.registeredAt), 'dd MMM yyyy') : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={interest.status === "Recommended" || interest.status === 'Sanctioned' ? "default" : "secondary"}>
                        {interest.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                        {proofLink ? (
                            <Button asChild variant="outline" size="sm">
                                <a href={proofLink} target="_blank" rel="noopener noreferrer">
                                    <FileText className="h-4 w-4 mr-2"/> Proof
                                </a>
                            </Button>
                        ) : (
                            <span className="text-sm text-muted-foreground">N/A</span>
                        )}
                    </TableCell>
                  </TableRow>
                )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export default function MyProjectsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [myProjects, setMyProjects] = useState<Project[]>([])
  const [myEmrInterests, setMyEmrInterests] = useState<EmrInterest[]>([])
  const [fundingCalls, setFundingCalls] = useState<FundingCall[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  
  const [lastVisibleImr, setLastVisibleImr] = useState<any>(null)
  const [lastVisibleEmr, setLastVisibleEmr] = useState<any>(null)
  const [hasMoreImr, setHasMoreImr] = useState(false)
  const [hasMoreEmr, setHasMoreEmr] = useState(false)
  const itemsPerPage = 20

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser) as User
      setUser(parsedUser)
    } else {
      setLoading(false)
    }
  }, [])

  const fetchFundingCalls = async () => {
    try {
      const callsRef = collection(db, "fundingCalls")
      const snapshot = await getDocs(query(callsRef))
      setFundingCalls(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FundingCall)))
    } catch (error) {
      console.error("Error fetching funding calls:", error)
    }
  }

  const fetchImrProjects = async (isLoadMore = false) => {
    if (!user) return
    if (!isLoadMore) setLoading(true)
    try {
      const projectsRef = collection(db, "projects")
      let constraints: any[] = [
        or(
          where("pi_uid", "==", user.uid), 
          where("coPiUids", "array-contains", user.uid),
          where("pi_email", "==", user.email)
        ),
        orderBy("submissionDate", "desc"),
        limit(itemsPerPage)
      ]

      if (isLoadMore && lastVisibleImr) {
        constraints.push(startAfter(lastVisibleImr))
      }

      const q = query(projectsRef, ...constraints)
      const snapshot = await getDocs(q)
      const newList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project))
      
      setMyProjects(prev => isLoadMore ? [...prev, ...newList] : newList)
      setLastVisibleImr(snapshot.docs[snapshot.docs.length - 1])
      setHasMoreImr(snapshot.docs.length === itemsPerPage)
    } catch (error: any) {
      console.error("Error fetching IMR projects:", error)
      toast({ variant: "destructive", title: "Error", description: "Could not fetch IMR projects." })
    } finally {
      setLoading(false)
    }
  }

  const fetchEmrInterests = async (isLoadMore = false) => {
    if (!user) return
    if (!isLoadMore) setLoading(true)
    try {
      const emrInterestsRef = collection(db, "emrInterests")
      let constraints: any[] = [
        or(
          where("userId", "==", user.uid),
          where("coPiUids", "array-contains", user.uid),
          where("coPiEmails", "array-contains", user.email.toLowerCase())
        ),
        orderBy("registeredAt", "desc"),
        limit(itemsPerPage)
      ]

      if (isLoadMore && lastVisibleEmr) {
        constraints.push(startAfter(lastVisibleEmr))
      }

      const q = query(emrInterestsRef, ...constraints)
      const snapshot = await getDocs(q)
      const newList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest))

      setMyEmrInterests(prev => isLoadMore ? [...prev, ...newList] : newList)
      setLastVisibleEmr(snapshot.docs[snapshot.docs.length - 1])
      setHasMoreEmr(snapshot.docs.length === itemsPerPage)
    } catch (error: any) {
      console.error("Error fetching EMR interests:", error)
      reportSystemError(error, user)
      toast({ variant: "destructive", title: "Error", description: "Could not fetch EMR interests." })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchFundingCalls()
      fetchImrProjects()
      fetchEmrInterests()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const filteredImrProjects = useMemo(() => {
    if (!searchTerm) return myProjects
    return myProjects.filter((p) => p.title.toLowerCase().includes(searchTerm.toLowerCase()))
  }, [myProjects, searchTerm])
  
  const filteredEmrInterests = useMemo(() => {
    if (!searchTerm) return myEmrInterests;
    return myEmrInterests.filter(interest => {
        const title = interest.callTitle || fundingCalls.find(c => c.id === interest.callId)?.title || '';
        return title.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [myEmrInterests, fundingCalls, searchTerm]);

  if (loading && myProjects.length === 0 && myEmrInterests.length === 0) {
    return (
      <div className="container mx-auto py-10">
        <PageHeader title="My Projects" description="A list of all projects you have submitted or are associated with." />
        <div className="mt-8">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!user && !loading) {
    return (
        <div className="container mx-auto py-10 text-center">
            <h1 className="text-2xl font-bold">Please login to view your projects.</h1>
        </div>
    )
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <PageHeader
        title="My Projects"
        description="A list of all projects you are associated with as a PI or Co-PI, for both Intramural (IMR) and Extramural (EMR) funding."
      />
      <div className="mt-8">
        <Tabs defaultValue="imr" className="w-full">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
            <TabsList>
              <TabsTrigger value="imr">Intramural Research (IMR)</TabsTrigger>
              <TabsTrigger value="emr">Extramural Research (EMR)</TabsTrigger>
            </TabsList>
            <Input
              placeholder="Filter by title..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="max-w-sm"
            />
          </div>
          <TabsContent value="imr">
            {myProjects.length === 0 && !loading ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  You have not submitted any IMR projects yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <ProjectList projects={filteredImrProjects} currentUser={user!} />
                {hasMoreImr && (
                    <div className="flex justify-center">
                        <Button variant="outline" onClick={() => fetchImrProjects(true)} disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Load More IMR Projects
                        </Button>
                    </div>
                )}
              </div>
            )}
          </TabsContent>
          <TabsContent value="emr">
            <div className="space-y-6">
                <EmrProjectList interests={filteredEmrInterests} calls={fundingCalls} currentUser={user} />
                {hasMoreEmr && (
                    <div className="flex justify-center">
                        <Button variant="outline" onClick={() => fetchEmrInterests(true)} disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Load More EMR Interests
                        </Button>
                    </div>
                )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
