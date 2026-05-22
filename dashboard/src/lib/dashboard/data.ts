import { createClient } from "@/lib/supabase/server"

import type { AdminComplaintRow, ComplaintDetail } from "./types"

export async function getAdminComplaintFeed() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_admin_complaint_feed")

  if (error) {
    throw new Error(error.message)
  }

  return (data ?? []) as AdminComplaintRow[]
}

export async function getComplaintDetail(id: string) {
  const supabase = await createClient()

  const { data: complaint, error: complaintError } = await supabase
    .from("complaints")
    .select(
      "id,ticket_number,category,problem_type,description,summary,caller_name,language,status,created_at,updated_at"
    )
    .eq("id", id)
    .single()

  if (complaintError) {
    throw new Error(complaintError.message)
  }

  const [{ data: location, error: locationError }, { data: evidence, error: evidenceError }, { data: transcript, error: transcriptError }] =
    await Promise.all([
      supabase
        .from("complaint_locations")
        .select("latitude,longitude,accuracy,captured_at,mocked")
        .eq("complaint_id", id)
        .maybeSingle(),
      supabase
        .from("complaint_evidence")
        .select("id,public_url,storage_bucket,storage_path,created_at")
        .eq("complaint_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("complaint_transcript_turns")
        .select("id,turn_index,speaker,content,created_at")
        .eq("complaint_id", id)
        .order("turn_index", { ascending: true }),
    ])

  if (locationError) {
    throw new Error(locationError.message)
  }

  if (evidenceError) {
    throw new Error(evidenceError.message)
  }

  if (transcriptError) {
    throw new Error(transcriptError.message)
  }

  return {
    ...complaint,
    location,
    evidence: evidence ?? [],
    transcript: transcript ?? [],
  } as ComplaintDetail
}
