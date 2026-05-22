'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    TableBody
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Download, CheckCircle2 } from "lucide-react"
import { fetchAllLabConsumables, approveLabConsumable } from '../../lab-consumables-actions'
import { auth, db } from "@/lib/config"
import { onIdTokenChanged } from "firebase/auth"
import { doc, getDoc } from "firebase/firestore"
import type { User } from "@/types"

export default function ManageLabConsumablesPage() {
    const router = useRouter()
    const { toast } = useToast()

    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [requests, setRequests] = useState<any[]>([])
    const [approvingId, setApprovingId] = useState<string | null>(null)

    useEffect(() => {
        const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const userDocRef = doc(db, "users", firebaseUser.uid)
                const userDocSnap = await getDoc(userDocRef)
                if (userDocSnap.exists()) {
                    setUser({ uid: firebaseUser.uid, ...userDocSnap.data() } as User)
                }
            } else {
                router.push("/login")
            }
        })
        return () => unsubscribe()
    }, [router])

    useEffect(() => {
        if (user) {
            loadRequests()
        }
    }, [user])

    const loadRequests = async () => {
        setIsLoading(true)
        const result = await fetchAllLabConsumables()
        if (result.success && result.data) {
            setRequests(result.data)
        }
        setIsLoading(false)
    }

    const handleApprove = async (id: string) => {
        setApprovingId(id)
        const result = await approveLabConsumable(id)
        if (result.success) {
            toast({ title: "Success", description: "Request approved successfully." })
            setRequests(prev => prev.map(req => req.id === id ? { ...req, status: 'Approved' } : req))
        } else {
            toast({ variant: "destructive", title: "Error", description: result.error || "Failed to approve request." })
        }
        setApprovingId(null)
    }

    const handleDownloadSheet = () => {
        // Generate CSV
        const headers = [
            "Reference No",
            "Applicant Name",
            "Applicant Email ID",
            "Lab Name",
            "Items Description",
            "Qty Present",
            "Qty Required",
            "Justification (Which Purpose for use)",
            "Status",
            "Date Applied"
        ]

        const rows: string[][] = []

        requests.forEach(req => {
            if (req.items && req.items.length > 0) {
                req.items.forEach((item: any) => {
                    rows.push([
                        `"${req.refNo || ''}"`,
                        `"${req.applicantName || ''}"`,
                        `"${req.applicantEmail || ''}"`,
                        `"${req.labName || ''}"`,
                        `"${item.itemsDescription || ''}"`,
                        `"${item.qtyPresent || ''}"`,
                        `"${item.qtyRequired || ''}"`,
                        `"${(item.justification || '').replace(/"/g, '""')}"`,
                        `"${req.status || ''}"`,
                        `"${req.createdAt ? new Date(req.createdAt).toLocaleDateString() : ''}"`
                    ])
                })
            } else {
                // Fallback for older singular records
                rows.push([
                    `"${req.refNo || ''}"`,
                    `"${req.applicantName || ''}"`,
                    `"${req.applicantEmail || ''}"`,
                    `"${req.labName || ''}"`,
                    `"${req.itemsDescription || ''}"`,
                    `"${req.qtyPresent || ''}"`,
                    `"${req.qtyRequired || ''}"`,
                    `"${(req.justification || '').replace(/"/g, '""')}"`,
                    `"${req.status || ''}"`,
                    `"${req.createdAt ? new Date(req.createdAt).toLocaleDateString() : ''}"`
                ])
            }
        })

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `Lab_Consumables_Requests_${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    if (!user) return null

    return (
        <div className="container mx-auto p-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold">Manage Lab Consumables</h1>
                    <p className="text-muted-foreground">View and approve lab consumable requests</p>
                </div>
                <Button onClick={handleDownloadSheet} variant="outline" className="shrink-0">
                    <Download className="mr-2 h-4 w-4" />
                    Download Sheet
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Requests</CardTitle>
                    <CardDescription>
                        Showing all submitted lab consumable requests.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="text-center p-8 text-muted-foreground">
                            No requests found.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Ref No</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Applicant</TableHead>
                                        <TableHead>Lab Name</TableHead>
                                        <TableHead>Item</TableHead>
                                        <TableHead>Qty</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {requests.map(req => (
                                        <TableRow key={req.id}>
                                            <TableCell className="font-medium">{req.refNo || 'N/A'}</TableCell>
                                            <TableCell>{req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A'}</TableCell>
                                            <TableCell>
                                                <div className="font-medium">{req.applicantName}</div>
                                                <div className="text-sm text-muted-foreground">{req.applicantEmail}</div>
                                            </TableCell>
                                            <TableCell>{req.labName}</TableCell>
                                            <TableCell>
                                                {req.items && req.items.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {req.items.map((item: any, i: number) => (
                                                            <div key={i} className="text-sm border-b last:border-0 pb-1 last:pb-0">{item.itemsDescription}</div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    req.itemsDescription
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {req.items && req.items.length > 0 ? (
                                                    <div className="space-y-1">
                                                        {req.items.map((item: any, i: number) => (
                                                            <div key={i} className="text-sm border-b last:border-0 pb-1 last:pb-0">Req: {item.qtyRequired}</div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span className="text-xs text-muted-foreground block">Req: {req.qtyRequired}</span>
                                                        <span className="text-xs text-muted-foreground block">Pres: {req.qtyPresent}</span>
                                                    </>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={req.status === 'Approved' ? 'default' : 'secondary'} className={req.status === 'Approved' ? 'bg-green-600 hover:bg-green-700' : ''}>
                                                    {req.status || 'Pending'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {req.status !== 'Approved' && (
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        onClick={() => handleApprove(req.id)}
                                                        disabled={approvingId === req.id}
                                                    >
                                                        {approvingId === req.id ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <CheckCircle2 className="mr-1 h-4 w-4" />
                                                        )}
                                                        Approve
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
