"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { EmrSanctionForm } from "@/components/incentives/emr-sanction-form"
import type { User } from "@/types"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"

export default function EmrSanctionPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser)
      if (!parsedUser.allowedModules?.includes("incentive-claim")) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to view this page.",
          variant: "destructive",
        })
        router.replace("/dashboard")
        return
      }
      setUser(parsedUser)
    } else {
      router.replace("/login")
    }
    setLoading(false)
  }, [router, toast])

  if (loading || !user) {
    return (
      <div className="container mx-auto py-10 space-y-8">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-10 pb-20 px-4">
      <PageHeader
        showBackButton
        backButtonHref="/dashboard/incentive-claim?tab=apply"
      />

      <div className="mt-8">
        <EmrSanctionForm user={user} />
      </div>
    </div>
  )
}
