"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { auth } from "@/lib/config"
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

// This is a simplified, non-functional context to prevent build errors.
// The original file was incompatible with this project's structure.

interface AuthContextType {
  user: FirebaseUser | null
  loading: boolean
  initialLoadComplete: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)

      // Sync role to Realtime Database for security rules
      if (firebaseUser) {
        try {
          const { db, db_rtdb } = await import('@/lib/config');
          const { doc, getDoc } = await import('firebase/firestore');
          const { ref: rtdbRef, set: rtdbSet } = await import('firebase/database');

          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.role) {
              await rtdbSet(rtdbRef(db_rtdb, `users/${firebaseUser.uid}/role`), userData.role);
            }
          }
        } catch (error) {
          console.error("Error syncing role to RTDB:", error);
        }
      }

      if (!initialLoadComplete) {
        setInitialLoadComplete(true)
      }
    })
    return () => unsubscribe()
  }, [initialLoadComplete])




  const logout = async () => {
    await auth.signOut()
    router.push("/")
    toast({ title: "Signed Out" })
  }

  const value: AuthContextType = {
    user,
    loading,
    initialLoadComplete,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
