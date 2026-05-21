import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { User, Session } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      // Timeout after 5 seconds to prevent infinite loading
      const timeout = setTimeout(() => {
        if (!cancelled) setLoading(false)
      }, 5000)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!cancelled) {
          setSession(session)
          setUser(session?.user ?? null)
        }
      } catch {
        if (!cancelled) {
          setUser(null)
          setSession(null)
        }
      } finally {
        clearTimeout(timeout)
        if (!cancelled) setLoading(false)
      }
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
