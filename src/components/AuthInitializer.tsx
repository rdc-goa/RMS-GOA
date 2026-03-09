
"use client"

import { useEffect, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "@/lib/config"
import { Skeleton } from "@/components/ui/skeleton"

export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Once we get the first response from Firebase auth, we know the connection is established.
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  if (loading) {
    // This provides a full-page loading skeleton while Firebase connects.
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="w-full max-w-4xl space-y-4 p-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
