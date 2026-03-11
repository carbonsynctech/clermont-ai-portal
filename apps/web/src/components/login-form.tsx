"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"magic" | "password">("magic")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const urlError = searchParams.get("error")
    if (urlError) {
      setError(urlError)
    }
  }, [searchParams])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const emailRedirectTo = (() => {
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL

    if (configuredSiteUrl) {
      try {
        return new URL("/auth/callback", configuredSiteUrl).toString()
      } catch {
        // fall through to runtime origin
      }
    }

    if (typeof window !== "undefined") {
      return `${window.location.origin}/auth/callback`
    }

    return undefined
  })()

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
      },
    })

    if (signInError) {
      if (signInError.message.toLowerCase().includes("rate limit")) {
        setError("Please wait a minute before requesting another magic link.")
        setCooldown(60)
      } else {
        setError(signInError.message)
      }
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
    setCooldown(60)
  }

  async function handlePasswordLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    setLoading(false)
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden border-0 p-0 shadow-none">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form
            className="p-6 md:p-8"
            onSubmit={(e) =>
              void (mode === "magic"
                ? handleMagicLink(e)
                : handlePasswordLogin(e))
            }
          >
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <Image
                  src="/fleur-de-lis.png"
                  alt="Fleur-de-lis"
                  width={36}
                  height={36}
                  className="h-12 w-10 object-contain"
                />
                <h1 className="text-2xl font-bold">Clermont AI Portal</h1>
                <p className="text-muted-foreground text-balance">
                  {mode === "magic"
                    ? sent
                      ? "Check your email for a magic link"
                      : "Sign in with a one-time magic link"
                    : "Sign in with your password"}
                </p>
              </div>
              {mode === "password" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </Field>
                  {error ? (
                    <FieldDescription className="text-center text-destructive">
                      {error}
                    </FieldDescription>
                  ) : null}
                  <Field>
                    <Button type="submit" disabled={loading}>
                      {loading ? "Signing in..." : "Sign in"}
                    </Button>
                  </Field>
                </>
              ) : !sent ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </Field>
                  {error ? (
                    <FieldDescription className="text-center text-destructive">
                      {error}
                    </FieldDescription>
                  ) : null}
                  <Field>
                    <Button type="submit" disabled={loading || cooldown > 0}>
                      {loading
                        ? "Sending..."
                        : cooldown > 0
                          ? `Resend in ${cooldown}s`
                          : "Send magic link"}
                    </Button>
                  </Field>
                </>
              ) : (
                <>
                  <FieldDescription className="text-center">
                    We sent a magic link to <strong>{email}</strong>. Click the
                    link in your email to sign in.
                  </FieldDescription>
                  <Field>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSent(false)}
                    >
                      Use a different email
                    </Button>
                  </Field>
                </>
              )}
              <FieldDescription className="text-center">
                <button
                  type="button"
                  className="text-muted-foreground hover:underline text-sm cursor-pointer"
                  onClick={() => {
                    setMode(mode === "magic" ? "password" : "magic")
                    setError(null)
                    setSent(false)
                  }}
                >
                  {mode === "magic"
                    ? "Sign in with password instead"
                    : "Sign in with magic link instead"}
                </button>
              </FieldDescription>
            </FieldGroup>
          </form>
          <div className="bg-muted relative hidden overflow-hidden md:block">
            <Image
              src="/login-side-image.png"
              alt="Login side image"
              fill
              priority
              className="object-cover object-center dark:brightness-[0.2] dark:grayscale"
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center text-white">
        By continuing, you agree to the portal access policies.
      </FieldDescription>
    </div>
  )
}
