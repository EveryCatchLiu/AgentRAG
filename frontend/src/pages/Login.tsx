import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        alert("Check your email for the confirmation link.")
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate("/chat")
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#faf8f5]">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[#e8e0d5] bg-white p-8 shadow-sm">
        <div className="flex justify-center">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#e8954c] to-[#d4704a]"></div>
        </div>
        <h1 className="text-2xl font-semibold text-center text-[#3d3530]">AgentRAG</h1>
        <h2 className="text-lg font-medium text-center text-[#9e8b78]">
          {isSignUp ? "Create an account" : "Sign in"}
        </h2>

        {error && (
          <p className="text-sm text-[#dc5a5a] text-center bg-[#fef9f6] py-2 rounded-lg">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-[#e8e0d5] bg-white px-4 py-2.5 text-sm text-[#5c4a3a] placeholder-[#b8a48e] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#e8954c]/30 focus:border-[#e8954c]/40"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl border border-[#e8e0d5] bg-white px-4 py-2.5 text-sm text-[#5c4a3a] placeholder-[#b8a48e] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#e8954c]/30 focus:border-[#e8954c]/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-br from-[#e8954c] to-[#d4704a] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Please wait..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-[#b8a48e]">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-[#8b5e3c] hover:underline font-medium"
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>
    </div>
  )
}
