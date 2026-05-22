export const COMPLAINT_CATEGORIES = [
  "SANITATION",
  "POTHOLE",
  "POWER_OUTAGE",
] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export interface RoomMetadata {
  category: ComplaintCategory;
  language?: string;
  userId?: string | null;
}

export interface LocationPayload {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
  mocked?: boolean;
}

export type RpcToolStatus = "ok" | "denied" | "cancelled" | "error";

export interface RpcToolRequestPayload {
  requestId: string;
  category: ComplaintCategory;
  language: string;
  reason: "location" | "photo";
  prompt: string;
}

export interface LocationToolResult {
  status: RpcToolStatus;
  message?: string;
  location?: LocationPayload;
}

export interface PhotoToolResult {
  status: RpcToolStatus;
  message?: string;
  photoUrl?: string;
}

export type TranscriptSpeaker =
  | "citizen"
  | "agent"
  | "system"
  | "tool"
  | "unknown";

export interface TranscriptTurn {
  turnIndex: number;
  speaker: TranscriptSpeaker;
  content: string;
  rawPayload: unknown;
}

export interface SessionState {
  category: ComplaintCategory;
  language: string;
  userId: string | null;
  callerName: string | null;
  problemType: string | null;
  description: string | null;
  summary: string | null;
  location: LocationPayload | null;
  photoUrl: string | null;
  transcript: TranscriptTurn[];
  citizenIdentity: string | null;
}

export interface ComplaintInsertInput {
  userId: string;
  category: ComplaintCategory;
  problemType: string;
  description: string;
  summary: string;
  callerName: string | null;
  language: string;
  location: LocationPayload;
  photoUrl: string | null;
  transcript: TranscriptTurn[];
}

export const LOCATION_RPC_METHOD = "effi.provide_location";
export const PHOTO_RPC_METHOD = "effi.provide_photo";
export const COMPLAINT_EVIDENCE_BUCKET = "complaint-evidence";
