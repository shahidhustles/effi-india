import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as WebBrowser from "expo-web-browser";
import type { ImagePickerAsset } from "expo-image-picker";
import { Alert } from "react-native";
import type { ComplaintCategoryId } from "../constants/config";

WebBrowser.maybeCompleteAuthSession();

const COMPLAINT_EVIDENCE_BUCKET = "complaint-evidence";
const GOOGLE_PROVIDER = "google";

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ComplaintListItem = {
  id: string;
  ticketNumber: string;
  category: ComplaintCategoryId;
  summary: string;
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
};

export type NearbyComplaint = ComplaintListItem & {
  distanceMeters: number;
};

let supabaseClient: SupabaseClient | null = null;

function getRequiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getRedirectUrl() {
  return makeRedirectUri({
    scheme: "effi-india",
  });
}

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  supabaseClient = createClient(
    getRequiredEnv("EXPO_PUBLIC_SUPABASE_URL"),
    getRequiredEnv(
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    ),
    {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    },
  );

  return supabaseClient;
}

export async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    throw new Error(errorCode);
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;

  if (!accessToken || typeof accessToken !== "string") {
    return null;
  }

  if (!refreshToken || typeof refreshToken !== "string") {
    throw new Error("Supabase OAuth callback did not include a refresh token.");
  }

  const { data, error } = await getSupabaseClient().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signInWithGoogle() {
  const redirectTo = getRedirectUrl();
  const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
    provider: GOOGLE_PROVIDER,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw error;
  }

  const authUrl = data?.url;
  if (!authUrl) {
    throw new Error("Supabase did not return an OAuth URL.");
  }

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
  if (result.type === "success") {
    await createSessionFromUrl(result.url);
    return;
  }

  if (result.type !== "cancel") {
    throw new Error("Google sign-in did not complete successfully.");
  }
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) {
    throw error;
  }
}

function sanitizePathPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getFileExtension(asset: ImagePickerAsset): string {
  const fromName = asset.fileName?.split(".").pop()?.toLowerCase();
  if (fromName) {
    return fromName;
  }

  const fromUri = asset.uri.split(".").pop()?.toLowerCase();
  if (fromUri) {
    return fromUri;
  }

  if (asset.mimeType === "image/png") {
    return "png";
  }

  if (asset.mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

function getMimeType(asset: ImagePickerAsset, extension: string): string {
  if (asset.mimeType) {
    return asset.mimeType;
  }

  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function mapComplaintRow(row: {
  id: string;
  ticket_number: string;
  category: ComplaintCategoryId;
  summary: string;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
}): ComplaintListItem {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    category: row.category,
    summary: row.summary,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapProfileRow(row: {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}): Profile {
  return {
    id: row.id,
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select("id, full_name, avatar_url, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapProfileRow(data);
}

export async function fetchRecentComplaints(limit = 5): Promise<ComplaintListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("complaints")
    .select("id, ticket_number, category, summary, status, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapComplaintRow);
}

export async function fetchAllComplaints(): Promise<ComplaintListItem[]> {
  const { data, error } = await getSupabaseClient()
    .from("complaints")
    .select("id, ticket_number, category, summary, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapComplaintRow);
}

export async function fetchNearbyComplaints(
  latitude: number,
  longitude: number,
  radiusMeters = 2000,
): Promise<NearbyComplaint[]> {
  const { data, error } = await getSupabaseClient().rpc("get_nearby_complaints", {
    user_latitude: latitude,
    user_longitude: longitude,
    radius_meters: radiusMeters,
  });

  if (error) {
    throw error;
  }

  return ((data as
    | Array<{
        complaint_id: string;
        ticket_number: string;
        category: ComplaintCategoryId;
        summary: string;
        status: "open" | "in_progress" | "resolved";
        created_at: string;
        distance_meters: number;
      }>
    | null) ?? []
  ).map((row) => ({
    id: row.complaint_id,
    ticketNumber: row.ticket_number,
    category: row.category,
    summary: row.summary,
    status: row.status,
    createdAt: row.created_at,
    distanceMeters: row.distance_meters,
  }));
}

export async function uploadComplaintEvidence({
  asset,
  category,
  roomName,
  requestId,
}: {
  asset: ImagePickerAsset;
  category: ComplaintCategoryId;
  roomName: string;
  requestId: string;
}): Promise<{ path: string; publicUrl: string }> {
  if (!asset.uri) {
    throw new Error("Selected image does not have a valid URI.");
  }

  const fileExtension = getFileExtension(asset);
  const contentType = getMimeType(asset, fileExtension);
  const arrayBuffer = await fetch(asset.uri).then((response) =>
    response.arrayBuffer(),
  );

  const storagePath = [
    sanitizePathPart(category),
    sanitizePathPart(roomName || "room"),
    `${sanitizePathPart(requestId)}-${Date.now()}.${fileExtension}`,
  ].join("/");

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage
    .from(COMPLAINT_EVIDENCE_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage
    .from(COMPLAINT_EVIDENCE_BUCKET)
    .getPublicUrl(storagePath);

  return {
    path: storagePath,
    publicUrl: data.publicUrl,
  };
}

export function getUserDisplayName(user: User | null, profile: Profile | null) {
  const fullName =
    profile?.full_name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split("@")[0] ??
    "Citizen";

  return fullName.trim();
}

export function getUserFirstName(user: User | null, profile: Profile | null) {
  return getUserDisplayName(user, profile).split(/\s+/)[0] ?? "Citizen";
}

export function showOAuthSetupHint(error: unknown) {
  const message = error instanceof Error ? error.message : "Google sign-in failed.";
  Alert.alert("Google Sign-In Failed", message);
}
