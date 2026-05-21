import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ImagePickerAsset } from "expo-image-picker";
import type { ComplaintCategoryId } from "../constants/config";

const COMPLAINT_EVIDENCE_BUCKET = "complaint-evidence";

let supabaseClient: SupabaseClient | null = null;

function getRequiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSupabaseClient(): SupabaseClient {
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
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  return supabaseClient;
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
