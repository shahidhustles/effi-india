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

const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const { category, language, callerName } = parsed.data;

  const roomName = `effi-${category.toLowerCase()}-${language}-${uuidv4().slice(0, 8)}`;
  const participantIdentity = `citizen-${uuidv4().slice(0, 8)}`;
  const participantName = callerName ?? "Citizen";

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: participantName,
    metadata: JSON.stringify({ category, language }),
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
