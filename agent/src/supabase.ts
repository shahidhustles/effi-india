import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  COMPLAINT_EVIDENCE_BUCKET,
  type ComplaintInsertInput,
} from "./types.js";

let supabaseAdminClient: SupabaseClient | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  supabaseAdminClient = createClient(
    getRequiredEnv("SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  return supabaseAdminClient;
}

function generateTicketNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const nonce = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `EFF-${stamp}-${nonce}`;
}

function parseStoragePath(photoUrl: string | null): string | null {
  if (!photoUrl) {
    return null;
  }

  const marker = `/storage/v1/object/public/${COMPLAINT_EVIDENCE_BUCKET}/`;
  const markerIndex = photoUrl.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  return photoUrl.slice(markerIndex + marker.length) || null;
}

export async function insertComplaint(input: ComplaintInsertInput) {
  const supabase = getSupabaseAdminClient();
  const ticketNumber = generateTicketNumber();
  const storagePath = parseStoragePath(input.photoUrl);

  const { data, error } = await supabase.rpc("create_complaint_ticket", {
    complaint_payload: {
      ticket_number: ticketNumber,
      category: input.category,
      problem_type: input.problemType,
      description: input.description,
      summary: input.summary,
      caller_name: input.callerName,
      language: input.language,
      status: "open",
      location: input.location,
      photo_url: input.photoUrl,
      storage_bucket: input.photoUrl ? COMPLAINT_EVIDENCE_BUCKET : null,
      storage_path: storagePath,
      transcript_turns: input.transcript.map((turn) => ({
        turn_index: turn.turnIndex,
        speaker: turn.speaker,
        content: turn.content,
        raw_payload: turn.rawPayload,
      })),
    },
  });

  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }

  const inserted = Array.isArray(data) ? data[0] : data;
  if (!inserted?.complaint_id || !inserted?.ticket_number) {
    throw new Error("Supabase insert failed: complaint RPC returned no result.");
  }

  return {
    complaintId: inserted.complaint_id as string,
    ticketNumber: inserted.ticket_number as string,
  };
}
