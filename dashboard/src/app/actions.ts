"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireAdmin } from "@/lib/dashboard/auth"
import type { ComplaintStatus } from "@/lib/dashboard/types"
import { createClient } from "@/lib/supabase/server"

const VALID_STATUSES = new Set<ComplaintStatus>([
  "open",
  "in_progress",
  "resolved",
])

export async function updateComplaintStatus(id: string, status: ComplaintStatus) {
  await requireAdmin()

  if (!VALID_STATUSES.has(status)) {
    throw new Error("Invalid complaint status")
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("complaints")
    .update({ status })
    .eq("id", id)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
