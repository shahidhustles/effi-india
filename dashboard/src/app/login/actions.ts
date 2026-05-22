"use server"

import { headers } from "next/headers"

import { createClient } from "@/lib/supabase/server"

export type LoginState = {
  status: "idle" | "success" | "error"
  message: string
}

export async function sendMagicLink(
  _previousState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()

  if (!email) {
    return { status: "error", message: "Enter an admin email address." }
  }

  const headerStore = await headers()
  const origin = headerStore.get("origin")

  if (!origin) {
    return { status: "error", message: "Could not determine dashboard URL." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: true,
    },
  })

  if (error) {
    return { status: "error", message: error.message }
  }

  return {
    status: "success",
    message: "Check your email for the dashboard sign-in link.",
  }
}
