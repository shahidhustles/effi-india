import "dotenv/config";
import cors from "cors";
import express from "express";
import { AccessToken } from "livekit-server-sdk";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

const PORT = process.env.TOKEN_SERVER_PORT ?? 3001;

const TokenRequestSchema = z.object({
  department: z
    .enum(["MUNICIPAL", "WATER", "ELECTRICITY"])
    .default("MUNICIPAL"),
  language: z.string().default("en"),
  callerName: z.string().optional(),
});

const app = express();
app.use(cors());
app.use(express.json());

app.post("/api/token", async (req, res) => {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error(
      "Missing env vars: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET",
    );
    res.status(500).json({ error: "Server misconfiguration" });
    return;
  }

  const parsed = TokenRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
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

  res.json({
    token,
    roomName,
    serverUrl: LIVEKIT_URL,
    department,
    language,
  });
});

app.listen(PORT, () => {
  console.log(`Token server listening on http://localhost:${PORT}`);
});
