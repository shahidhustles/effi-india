export type ComplaintCategory = "SANITATION" | "POTHOLE" | "POWER_OUTAGE"

export type ComplaintStatus = "open" | "in_progress" | "resolved"

export type AdminComplaintRow = {
  id: string
  ticket_number: string
  category: ComplaintCategory
  problem_type: string
  summary: string
  caller_name: string | null
  status: ComplaintStatus
  created_at: string
  updated_at: string
  latitude: number | null
  longitude: number | null
  photo_url: string | null
  cluster_count: number
  is_cluster_priority: boolean
  priority_label: string
}

export type ComplaintEvidence = {
  id: string
  public_url: string
  storage_bucket: string | null
  storage_path: string | null
  created_at: string
}

export type ComplaintTranscriptTurn = {
  id: string
  turn_index: number
  speaker: "citizen" | "agent" | "system" | "tool" | "unknown"
  content: string
  created_at: string
}

export type ComplaintDetail = {
  id: string
  ticket_number: string
  category: ComplaintCategory
  problem_type: string
  description: string
  summary: string
  caller_name: string | null
  language: string
  status: ComplaintStatus
  created_at: string
  updated_at: string
  location: {
    latitude: number
    longitude: number
    accuracy: number | null
    captured_at: string
    mocked: boolean | null
  } | null
  evidence: ComplaintEvidence[]
  transcript: ComplaintTranscriptTurn[]
}
