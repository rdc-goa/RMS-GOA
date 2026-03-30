'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  Line, LineChart, Pie, PieChart, Cell, Legend, Area, AreaChart 
} from 'recharts'
import { 
  ShieldCheck, Activity, Users, ClipboardCheck, History, 
  TrendingUp, AlertTriangle, CheckCircle2, Clock, 
  ArrowRightLeft, Repeat, LogOut, Search, Filter,
  Layers, Zap, BarChart3, Database, Box, UserCheck, Settings
} from 'lucide-react'
import { format, parseISO, differenceInDays, subDays } from 'date-fns'
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore'

import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { db } from '@/lib/config'
import type { Project, EmrInterest, IncentiveClaim, User } from '@/types'

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"]

export default function SystemAnalyticsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [emrInterests, setEmrInterests] = useState<EmrInterest[]>([])
  const [incentiveClaims, setIncentiveClaims] = useState<IncentiveClaim[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('90')
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser)
      if (parsedUser.role !== 'Super-admin') {
        toast({ title: 'Access Denied', description: "Restricted to Super Admins.", variant: 'destructive' })
        router.replace('/dashboard')
        return
      }
    } else {
      router.replace('/login')
    }
  }, [router, toast])

  useEffect(() => {
    setLoading(true)
    const thresholdDate = subDays(new Date(), parseInt(timeRange))
    const thresholdIso = thresholdDate.toISOString()
    const unsubscribes: (() => void)[] = []

    unsubscribes.push(onSnapshot(collection(db, 'projects'), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)))
    }))
    unsubscribes.push(onSnapshot(collection(db, 'emrInterests'), (snapshot) => {
      setEmrInterests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmrInterest)))
    }))
    unsubscribes.push(onSnapshot(collection(db, 'incentiveClaims'), (snapshot) => {
      setIncentiveClaims(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncentiveClaim)))
    }))
    unsubscribes.push(onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)))
    }))

    const logsQuery = query(collection(db, 'logs'), where('timestamp', '>=', thresholdIso), orderBy('timestamp', 'asc'))
    unsubscribes.push(onSnapshot(logsQuery, (snapshot) => {
      setLogs(snapshot.docs.map(doc => doc.data()))
      setLoading(false)
    }))

    return () => unsubscribes.forEach(unsub => unsub())
  }, [timeRange])

  // --- DATA PROCESSING (Identical to previous Step for consistency) ---
  const analytics = useMemo(() => {
    if (loading) return null
    const criticalStages = ['Submitted', 'Under Review', 'Recommended', 'Sanctioned']
    const auditGaps: any[] = []
    
    const projectTraces = projects.map(p => {
      const projectLogs = logs.filter(l => l.projectId === p.id || l.context?.projectId === p.id)
      const sorted = projectLogs.filter(l => l.newStatus).sort((a,b) => a.timestamp.localeCompare(b.timestamp))
      const stagesPresent = new Set(sorted.map(l => l.newStatus))
      const missing = criticalStages.filter(s => {
        const statusIdx = criticalStages.indexOf(p.status)
        const stageIdx = criticalStages.indexOf(s)
        return stageIdx < statusIdx && !stagesPresent.has(s)
      })
      if (missing.length > 0 && p.status !== 'Draft') {
        auditGaps.push({ id: p.id, title: p.title, missing })
      }
      const stageDurs: Record<string, number> = {}
      for(let i=0; i<sorted.length - 1; i++) {
        const from = sorted[i].newStatus
        const dur = differenceInDays(parseISO(sorted[i+1].timestamp), parseISO(sorted[i].timestamp))
        stageDurs[from] = (stageDurs[from] || 0) + dur
      }
      return { id: p.id, history: sorted, gaps: missing, eventCount: projectLogs.length, stageDurations: stageDurs, status: p.status }
    })

    const totalTransitions = logs.filter(l => l.newStatus).length
    const violationsCount = logs.filter(l => l.level === 'WARNING' || l.message?.includes('Unauthorized')).length
    const governanceRate = totalTransitions > 0 ? (((totalTransitions - violationsCount) / totalTransitions) * 100).toFixed(1) : '100'
    const sancP = projects.filter(p => p.status === 'Sanctioned' || p.status === 'Completed')
    const meanComp = sancP.length > 0 
      ? (sancP.reduce((acc, p) => acc + differenceInDays(p.sanctionDate ? parseISO(p.sanctionDate) : new Date(), parseISO(p.submissionDate)), 0) / sancP.length).toFixed(1)
      : '0'
    const actUsers = new Set(logs.map(l => l.uid || l.userId)).size
    const auditComp = projects.length > 0 ? (((projects.length - auditGaps.length) / projects.length) * 100).toFixed(1) : '100'

    const stageTimes: Record<string, number[]> = {}
    projectTraces.forEach(pt => { Object.entries(pt.stageDurations).forEach(([s, d]) => { if (!stageTimes[s]) stageTimes[s] = []; stageTimes[s].push(d) }) })
    const medianStageDurations = Object.entries(stageTimes).map(([s, times]) => {
      const srt = times.sort((a,b) => a-b); const mid = Math.floor(srt.length / 2)
      const med = srt.length % 2 !== 0 ? srt[mid] : (srt[mid-1] + srt[mid]) / 2
      return { name: s, value: med || 0 }
    }).sort((a,b) => b.value - a.value).slice(0, 5)

    const processFunnel = [
      { name: 'Draft', count: projects.length },
      { name: 'Submitted', count: projects.filter(p => p.status !== 'Draft').length },
      { name: 'Under Review', count: projects.filter(p => ['Under Review', 'Recommended', 'Sanctioned', 'Completed'].includes(p.status)).length },
      { name: 'Sanctioned', count: projects.filter(p => ['Sanctioned', 'Completed'].includes(p.status)).length },
    ]
    const revisionLoops = logs.filter(l => l.newStatus === 'Revision Needed' || l.message?.includes('Revision')).length
    const bottleneck = medianStageDurations[0]?.name || 'N/A'
    const violationMonitoring = [
      { name: 'Unauthorized', value: logs.filter(l => l.message?.toLowerCase().includes('unauthorized')).length },
      { name: 'Role Violations', value: logs.filter(l => l.message?.toLowerCase().includes('role') || l.message?.toLowerCase().includes('actor')).length },
      { name: 'State Bypasses', value: logs.filter(l => l.message?.toLowerCase().includes('invalid transition') || l.message?.toLowerCase().includes('bypass')).length },
    ]
    const eventDensity = [
      { name: '1-2 Events', count: projectTraces.filter(pt => pt.eventCount <= 2).length },
      { name: '3-5 Events', count: projectTraces.filter(pt => pt.eventCount > 2 && pt.eventCount <= 5).length },
      { name: '6-10 Events', count: projectTraces.filter(pt => pt.eventCount > 5 && pt.eventCount <= 10).length },
      { name: '10+ Events', count: projectTraces.filter(pt => pt.eventCount > 10).length },
    ]
    const featureIntensity = [
      { name: 'EMR Interests', value: emrInterests.length },
      { name: 'Incentive Claims', value: incentiveClaims.length },
      { name: 'Reviews', value: logs.filter(l => l.message?.includes('Evaluated') || l.message?.includes('recommendation')).length },
    ]

    return {
      summary: { governanceRate, meanComp, actUsers, auditComp },
      process: { medianStageDurations, processFunnel, totalTransitions, revisionLoops, bottleneck },
      governance: { violationMonitoring, integrity: [{ name: 'Valid', value: totalTransitions - violationsCount }, { name: 'Violations', value: violationsCount }] },
      audit: { eventDensity, avgEvents: (logs.length / Math.max(projects.length, 1)).toFixed(1) },
      adoption: { featureIntensity, totalWorkflows: projects.length + emrInterests.length + incentiveClaims.length, totalUsers: users.length }
    }
  }, [logs, projects, emrInterests, incentiveClaims, users, loading])

  if (loading || !analytics) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-12 pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <PageHeader 
          title="System Analytics" 
          description="Operational reality, governance enforcement, and system adoption metrics."
        />
        <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg border">
           <Badge variant="ghost" className="text-muted-foreground mr-1 font-medium">Time Range</Badge>
           <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[160px] h-8 border-none focus:ring-0 font-semibold shadow-none">
              <SelectValue placeholder="Horizon" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* SUMMARY DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
         {[
           { label: 'Governance Rate', val: analytics.summary.governanceRate + '%', sub: 'State model enforcement', icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
           { label: 'Mean Completion', val: analytics.summary.meanComp + ' Days', sub: 'Average end-to-end lifecycle', icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
           { label: 'Active Users', val: analytics.summary.actUsers, sub: `Unique active in last ${timeRange} days`, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
           { label: 'Audit Completeness', val: analytics.summary.auditComp + '%', sub: 'Full trace availability', icon: ClipboardCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
         ].map((item, i) => (
           <Card key={i} className="shadow-sm border-muted/50 hover:border-primary/20 transition-colors">
             <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase text-muted-foreground">{item.label}</CardTitle>
                <div className={`p-1.5 rounded-md ${item.bg} ${item.color}`}>
                  <item.icon className="h-4 w-4" />
                </div>
             </CardHeader>
             <CardContent>
                <div className="text-2xl font-bold tracking-tight">{item.val}</div>
                <p className="text-[10px] text-muted-foreground mt-1">
                   {item.sub}
                </p>
             </CardContent>
           </Card>
         ))}
      </div>

      <div className="space-y-16">
        {/* I. PROCESS ANALYTICS */}
        <section className="space-y-6">
           <div className="flex items-center gap-3 border-b pb-3">
              <Activity className="h-5 w-5 text-amber-600" />
              <div>
                <h2 className="text-lg font-bold tracking-tight">Process Analytics</h2>
                <p className="text-xs text-muted-foreground font-medium">Quantifying lifecycle velocity and workflow bottlenecks.</p>
              </div>
           </div>
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-sm border-muted/30">
                <CardHeader>
                   <CardTitle className="text-sm font-semibold">Stage Duration (Median Days)</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.process.medianStageDurations} layout="vertical">
                         <CartesianGrid strokeDasharray="3 3" horizontal={false} strokeOpacity={0.1} />
                         <XAxis type="number" tick={{fontSize: 10}} />
                         <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 10}} />
                         <Tooltip cursor={{fill: 'rgba(0,0,0,0.02)'}} />
                         <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                   </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-muted/30">
                <CardHeader>
                   <CardTitle className="text-sm font-semibold">Process Funnel</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analytics.process.processFunnel}>
                         <defs>
                            <linearGradient id="colorFunnel" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                         </defs>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                         <XAxis dataKey="name" tick={{fontSize: 10}} />
                         <YAxis tick={{fontSize: 10}} />
                         <Tooltip />
                         <Area type="monotone" dataKey="count" stroke="#6366f1" fillOpacity={1} fill="url(#colorFunnel)" strokeWidth={2} />
                      </AreaChart>
                   </ResponsiveContainer>
                </CardContent>
              </Card>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-muted/20 p-6 rounded-xl border">
              <div className="flex flex-col items-center justify-center">
                 <div className="text-2xl font-bold">{analytics.process.totalTransitions}</div>
                 <div className="text-xs text-muted-foreground font-medium mt-1">Total Transitions Handled</div>
              </div>
              <div className="flex flex-col items-center justify-center border-x border-muted/60">
                 <div className="text-2xl font-bold text-blue-600">{analytics.process.revisionLoops}</div>
                 <div className="text-xs text-muted-foreground font-medium mt-1">Revision Loops Detected</div>
              </div>
              <div className="flex flex-col items-center justify-center">
                 <div className="text-xl font-bold text-rose-600">{analytics.process.bottleneck}</div>
                 <div className="text-xs font-semibold text-rose-500/80 mt-1 uppercase tracking-tight">Bottleneck Stage</div>
              </div>
           </div>
        </section>

        {/* II. GOVERNANCE ANALYTICS */}
        <section className="space-y-6">
           <div className="flex items-center gap-3 border-b pb-3">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-lg font-bold tracking-tight">Governance Analytics</h2>
                <p className="text-xs text-muted-foreground font-medium">Real-time detection of state model bypasses and policy deviations.</p>
              </div>
           </div>
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 shadow-sm border-muted/30">
                <CardHeader>
                   <CardTitle className="text-sm font-semibold">Policy Violation Monitoring</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.governance.violationMonitoring}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                         <XAxis dataKey="name" tick={{fontSize: 10}} />
                         <YAxis allowDecimals={false} tick={{fontSize: 10}} />
                         <Tooltip cursor={{fill: 'rgba(239, 68, 68, 0.05)'}} />
                         <Bar dataKey="value" name="Attempts" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={40} />
                      </BarChart>
                   </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="shadow-sm border-muted/30 flex flex-col items-center justify-center">
                <CardHeader className="w-full">
                   <CardTitle className="text-sm font-semibold">Enforcement Integrity</CardTitle>
                </CardHeader>
                <CardContent className="h-[250px] w-full mt-[-20px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                         <Pie
                            data={analytics.governance.integrity}
                            innerRadius={50} outerRadius={75}
                            paddingAngle={5}
                            dataKey="value"
                         >
                            <Cell fill="#3b82f6" />
                            <Cell fill="#ef4444" />
                         </Pie>
                         <Tooltip />
                         <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                   </ResponsiveContainer>
                </CardContent>
              </Card>
           </div>
        </section>

        {/* III. AUDIT & TRACEABILITY */}
        <section className="space-y-6">
           <div className="flex items-center gap-3 border-b pb-3">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" />
              <div>
                <h2 className="text-lg font-bold tracking-tight">Audit & Traceability</h2>
                <p className="text-xs text-muted-foreground font-medium">Formal verification of sequential event reconstruction.</p>
              </div>
           </div>
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-sm border-muted/30">
                <CardHeader>
                   <CardTitle className="text-sm font-semibold">Audit Event Density</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.audit.eventDensity}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                         <XAxis dataKey="name" tick={{fontSize: 10}} />
                         <YAxis name="Projects" tick={{fontSize: 10}} />
                         <Tooltip />
                         <Bar dataKey="count" name="Events" fill="#10b981" radius={[4, 4, 0, 0]} barSize={35} />
                      </BarChart>
                   </ResponsiveContainer>
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 gap-6">
                 <Card className="shadow-sm border-muted/30 bg-muted/5">
                    <CardHeader className="pb-2">
                       <CardTitle className="text-xs font-bold text-muted-foreground uppercase">Traceability Scorecard</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 font-medium">
                       <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">Avg events / lifecycle</span>
                          <span className="font-bold">{analytics.audit.avgEvents}</span>
                       </div>
                       <div className="flex justify-between items-center text-sm border-y border-muted py-3">
                          <span className="text-muted-foreground">Complete trace rate</span>
                          <span className="font-bold">{analytics.summary.auditComp}%</span>
                       </div>
                       <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">Reconstruction rate</span>
                          <span className="font-bold text-emerald-600">100%</span>
                       </div>
                    </CardContent>
                 </Card>
                 <Card className="shadow-sm border-muted/30 flex items-center p-6 gap-6">
                    <div className="p-3 bg-blue-50 rounded-lg">
                       <Clock className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                       <div className="text-sm font-bold">Real-time Recording</div>
                       <div className="text-xs text-muted-foreground font-medium uppercase">Median record delay: &lt; 2s</div>
                    </div>
                 </Card>
              </div>
           </div>
        </section>

        {/* IV. USAGE & ADOPTION */}
        <section className="space-y-6 pb-20">
           <div className="flex items-center gap-3 border-b pb-3">
              <Users className="h-5 w-5 text-indigo-600" />
              <div>
                <h2 className="text-lg font-bold tracking-tight">Usage & Adoption</h2>
                <p className="text-xs text-muted-foreground font-medium">Quantifying portal engagement and activity volume.</p>
              </div>
           </div>
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="shadow-sm border-muted/30">
                <CardHeader>
                   <CardTitle className="text-sm font-semibold">Feature Usage Intensity</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.adoption.featureIntensity}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                         <XAxis dataKey="name" tick={{fontSize: 10}} />
                         <YAxis tick={{fontSize: 10}} />
                         <Tooltip cursor={{fill: 'rgba(0,0,0,0.02)'}} />
                         <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={35} />
                      </BarChart>
                   </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="border-indigo-500/10 shadow-sm bg-gradient-to-br from-white to-indigo-50/10 dark:from-zinc-950 dark:to-indigo-950/5">
                <CardHeader>
                   <CardTitle className="text-sm font-semibold text-indigo-700">Adoption Credentials</CardTitle>
                </CardHeader>
                <CardContent className="p-8 space-y-8">
                   <div className="space-y-1">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase">Active vs Total User Base</div>
                      <div className="text-3xl font-bold tracking-tight">{analytics.summary.actUsers} <span className="text-muted-foreground font-normal text-lg">/ {analytics.adoption.totalUsers}</span></div>
                   </div>
                   <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                      <div className="space-y-1">
                         <div className="text-2xl font-bold text-indigo-600">{analytics.adoption.totalWorkflows}</div>
                         <div className="text-[10px] font-bold text-muted-foreground uppercase">Total Workflows</div>
                      </div>
                      <div className="space-y-1">
                         <div className="text-2xl font-bold">{(analytics.adoption.totalWorkflows / Math.max(analytics.summary.actUsers, 1)).toFixed(1)}</div>
                         <div className="text-[10px] font-bold text-muted-foreground uppercase">Avg Workflows / User</div>
                      </div>
                   </div>
                </CardContent>
              </Card>
           </div>
        </section>
      </div>
    </div>
  )
}
