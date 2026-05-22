import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AccessToken } from "livekit-server-sdk";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

const TokenRequestSchema = z.object({
  category: z
    .enum(["SANITATION", "POTHOLE", "POWER_OUTAGE"])
    .default("SANITATION"),
  language: z.string().default("en"),
  callerName: z.string().optional(),
});

const {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
} = process.env;

type VerifiedSupabaseUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function getBearerToken(headerValue: string | undefined) {
  if (!headerValue?.startsWith("Bearer ")) {
    return null;
  }

  return headerValue.slice("Bearer ".length).trim();
}

async function verifySupabaseAccessToken(
  accessToken: string,
): Promise<VerifiedSupabaseUser | null> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Missing env vars: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY",
    );
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Supabase auth verification failed: ${response.status}`);
  }

  return (await response.json()) as VerifiedSupabaseUser;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (
    !LIVEKIT_URL ||
    !LIVEKIT_API_KEY ||
    !LIVEKIT_API_SECRET ||
    !SUPABASE_URL ||
    !SUPABASE_PUBLISHABLE_KEY
  ) {
    console.error(
      "Missing env vars: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY",
    );
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const accessToken = getBearerToken(req.headers.authorization);
  if (!accessToken) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const parsed = TokenRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { category, language, callerName } = parsed.data;
  const verifiedUser = await verifySupabaseAccessToken(accessToken);
  if (!verifiedUser) {
    return res.status(401).json({ error: "Invalid Supabase session" });
  }

  const roomName = `effi-${category.toLowerCase()}-${language}-${uuidv4().slice(0, 8)}`;
  const participantIdentity = `citizen-${uuidv4().slice(0, 8)}`;
  const participantName =
    callerName ??
    getMetadataString(verifiedUser.user_metadata, "full_name") ??
    getMetadataString(verifiedUser.user_metadata, "name") ??
    verifiedUser.email?.split("@")[0] ??
    "Citizen";

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: participantName,
    metadata: JSON.stringify({ category, language, userId: verifiedUser.id }),
    ttl: "10m",
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return res.json({
    token: await token.toJwt(),
    roomName,
    serverUrl: LIVEKIT_URL,
    category,
    language,
  });
}
