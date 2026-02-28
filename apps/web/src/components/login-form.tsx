"use client"

import { useState } from "react"
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
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden border-0 p-0 shadow-none">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={(e) => void handleSubmit(e)}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <Image
                  src="/fleur-de-lis.png"
                  alt="Fleur-de-lis"
                  width={36}
                  height={36}
                  className="h-12 w-10 object-contain"
                />
                <h1 className="text-2xl font-bold">AI Content Portal</h1>
                <p className="text-muted-foreground text-balance">
                  {sent
                    ? "Check your email for a magic link"
                    : "Sign in with a one-time magic link"}
                </p>
              </div>
              {!sent ? (
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
                    <Button type="submit" disabled={loading}>
                      {loading ? "Sending..." : "Send magic link"}
                    </Button>
                  </Field>
                  <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                    Or continue with
                  </FieldSeparator>
                  <Field className="grid grid-cols-2 gap-4">
                    <Button variant="outline" type="button">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path
                          d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                          fill="currentColor"
                        />
                      </svg>
                      <span>Google</span>
                    </Button>
                    <Button variant="outline" type="button">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path
                          d="M11.4 24H0V12.6h11.4V24zm12.6 0H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"
                          fill="currentColor"
                        />
                      </svg>
                      <span>Microsoft</span>
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
                This portal sends one-time sign-in links. No password required.
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
