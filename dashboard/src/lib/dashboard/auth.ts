import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

export async function isAdminEmail(email: string | undefined | null) {
  if (!email) {
    return false
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("admin_access")
    .select("email")
    .eq("email", email.toLowerCase())
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    return false
  }

  return Boolean(data)
}

export async function requireAdmin() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  const allowed = await isAdminEmail(user.email)

  if (!allowed) {
    redirect("/unauthorized")
  }

  return user
}
