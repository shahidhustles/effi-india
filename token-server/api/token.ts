import type { VercelRequest, VercelResponse } from "@vercel/node";
import { AccessToken } from "livekit-server-sdk";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

const TokenRequestSchema = z.object({
  department: z
    .enum(["MUNICIPAL", "WATER", "ELECTRICITY"])
    .default("MUNICIPAL"),
  language: z.string().default("en"),
  callerName: z.string().optional(),
});

const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — allow the Expo app (any origin for now; tighten if needed)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error(
      "Missing env vars: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET",
    );
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const parsed = TokenRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { department, language, callerName } = parsed.data;

  const roomName = `effi-${department.toLowerCase()}-${language}-${uuidv4().slice(0, 8)}`;
  const participantIdentity = `citizen-${uuidv4().slice(0, 8)}`;
  const participantName = callerName ?? "Citizen";

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: participantName,
    metadata: JSON.stringify({ department, language }),
    ttl: "10m",
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();

  return res.json({
    token,
    roomName,
    serverUrl: LIVEKIT_URL,
    department,
    language,
  });
}
