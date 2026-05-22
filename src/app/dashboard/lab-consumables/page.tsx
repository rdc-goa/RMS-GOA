'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Beaker, Send } from "lucide-react"
import { submitLabConsumable } from '../../lab-consumables-actions'
import { auth, db } from "@/lib/config"
import { onIdTokenChanged } from "firebase/auth"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { doc, getDoc } from "firebase/firestore"
import type { User } from "@/types"

const LAB_OPTIONS = [
    "ICMR Lab",
    "Climate Change Lab",
    "Environmental Science Lab",
    "Cancer Instrument & Mycology Instruments",
    "Central Sophisticated Lab",
    "Biosensors Research Lab",
    "Parental Lab",
    "Animal Cell Culture & Immunobiochemistry",
    "Centre Research Lab",
    "Material Synthesis Lab",
    "Instruments Lab",
    "GC Room",
    "Chemistry & Catalysis Lab",
    "Biomatocial Regenerative Mediline Lab (Praposed)",
    "GC-MS Room",
    "Microbiology/Mycology Research Lab",
    "Cell & Developmental Biology Lab",
    "Immunodiagnostics for Infectious Diseases",
    "Clinical Genetics and Bioinformatics Lab",
    "Bioinformatics Lab",
    "Chemistry Lab",
    "Immunobiochemistry Lab",
    "Green Energy Lab",
    "Newly Developed Lab"
]

const ITEMS_OPTIONS = [
    "Coverslip (round) 12mm diameter",
    "Coverslip (square)",
    "Forceps",
    "Vim dishwash",
    "Dettol handwash",
    "Face mask",
    "Glass slides",
    "Serological pipette handle",
    "Sanitizer",
    "Aluminum foil",
    "Tissue roll",
    "Red top Tube (5ml)",
    "EDTA Purple top tube (10ml)",
    "Cotton roll",
    "Room freshener",
    "White Board markers",
    "Permanent marker (black)",
    "White board marker duster",
    "Plastic Pasteur pipette (5ml)",
    "Rubber bulb",
    "Cello tape",
    "Saran wrap",
    "Matchbox",
    "10 ml syringe",
    "5 ml syringe",
    "Nitrile glove box",
    "Latex glove box",
    "Bio Hazard waste bags (Big/small)",
    "Wash sponge (steel)",
    "Head Cap",
    "1 ml syringe",
    "15 ml syringe",
    "Glassware brush",
    "Plastic Tray (Big /Small)",
    "Spray Bottle",
    "First Aid Kit",
    "Lyzol",
    "Lab Coat",
    "Dust cleaning Clothes"
]

export default function LabConsumablesPage() {
    const router = useRouter()
    const { toast } = useToast()

    const [user, setUser] = useState<User | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [labName, setLabName] = useState("")
    const [items, setItems] = useState(
        ITEMS_OPTIONS.map(item => ({
            itemsDescription: item,
            qtyPresent: "",
            qtyRequired: "",
            justification: ""
        }))
    )

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

    const handleItemChange = (index: number, field: string, value: string) => {
        setItems(prev => {
            const newItems = [...prev]
            newItems[index] = { ...newItems[index], [field]: value }
            return newItems
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!user) return

        setIsLoading(true)

        const selectedItems = items.filter(item => item.qtyRequired && parseInt(item.qtyRequired) > 0)

        if (!labName) {
            toast({ variant: "destructive", title: "Error", description: "Please select a Lab Name." })
            setIsLoading(false)
            return
        }

        if (selectedItems.length === 0) {
            toast({ variant: "destructive", title: "Error", description: "Please fill the required quantity for at least one item." })
            setIsLoading(false)
            return
        }

        const submitData = {
            uid: user.uid,
            applicantName: user.name,
            applicantEmail: user.email,
            labName,
            items: selectedItems
        }

        const result = await submitLabConsumable(submitData)

        setIsLoading(false)

        if (result.success) {
            toast({
                title: "Success",
                description: `Your lab consumable request has been submitted. Reference No: ${result.refNo}`,
            })
            setLabName("")
            setItems(ITEMS_OPTIONS.map(item => ({ itemsDescription: item, qtyPresent: "", qtyRequired: "", justification: "" })))
        } else {
            toast({
                variant: "destructive",
                title: "Error",
                description: result.error || "Failed to submit request",
            })
        }
    }

    if (!user) return null

    return (
        <div className="container mx-auto p-4 max-w-4xl">
            <div className="flex items-center gap-3 mb-6">
                <Beaker className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">Lab Consumables Request</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Submit New Request</CardTitle>
                    <CardDescription>
                        Fill out the form below to request consumables for your lab.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="applicantName">Applicant Name</Label>
                                <Input id="applicantName" value={user.name} disabled />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="applicantEmail">Applicant Email ID</Label>
                                <Input id="applicantEmail" value={user.email} disabled />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="labName">Lab Name</Label>
                            <Select value={labName} onValueChange={setLabName} required>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a lab" />
                                </SelectTrigger>
                                <SelectContent>
                                    {LAB_OPTIONS.map(lab => (
                                        <SelectItem key={lab} value={lab}>{lab}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-lg font-medium">Items Requested</h3>
                            <p className="text-sm text-muted-foreground">Fill in the quantities for the items you need. Leave the ones you do not need blank.</p>

                            <div className="border rounded-md max-h-[500px] overflow-y-auto">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                                        <TableRow>
                                            <TableHead className="w-[30%]">Items Description</TableHead>
                                            <TableHead className="w-[15%]">Qty Present</TableHead>
                                            <TableHead className="w-[15%]">Qty Required</TableHead>
                                            <TableHead className="w-[40%]">Justification (Which Purpose for use)</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {items.map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-medium text-xs md:text-sm">{item.itemsDescription}</TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        value={item.qtyPresent}
                                                        onChange={(e) => handleItemChange(index, 'qtyPresent', e.target.value)}
                                                        placeholder="0"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        value={item.qtyRequired}
                                                        onChange={(e) => handleItemChange(index, 'qtyRequired', e.target.value)}
                                                        placeholder="0"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        value={item.justification}
                                                        onChange={(e) => handleItemChange(index, 'justification', e.target.value)}
                                                        placeholder="Purpose..."
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button type="submit" disabled={isLoading} className="w-full md:w-auto">
                                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Submit Request
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
