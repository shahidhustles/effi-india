import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const app = express();
app.use(cors());
app.use(express.json());

// ─── Validation ────────────────────────────────────────────────────────────────

const TokenRequestSchema = z.object({
  department: z.enum(['MUNICIPAL', 'WATER', 'ELECTRICITY']).default('MUNICIPAL'),
  // Accept any language code — the agent auto-detects spoken language anyway.
  // This field is only stored as metadata; it no longer locks the agent's language.
  language: z.string().default('en'),
  callerName: z.string().optional(),
});

// ─── Env validation ─────────────────────────────────────────────────────────────

const {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  PORT = '3001',
} = process.env;

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('Missing required env vars: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET');
  process.exit(1);
}

// ─── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /token
 * Generates a LiveKit participant token for the citizen app.
 * The agent worker auto-dispatches into any new room.
 */
app.post('/token', async (req: Request, res: Response) => {
  const parsed = TokenRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }

  const { department, language, callerName } = parsed.data;

  // Room name encodes dept + language so the agent can read them from room metadata
  const roomName = `effi-${department.toLowerCase()}-${language}-${uuidv4().slice(0, 8)}`;
  const participantIdentity = `citizen-${uuidv4().slice(0, 8)}`;
  const participantName = callerName ?? 'Citizen';

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: participantName,
    // Room metadata passed to the agent so it knows dept + language
    metadata: JSON.stringify({ department, language }),
    ttl: '10m',
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

/**
 * GET /health
 * Simple health check for the mobile app to verify the server is up.
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(Number(PORT), () => {
  console.log(`[token-server] Running on http://localhost:${PORT}`);
  console.log(`[token-server] POST /token  →  generates LiveKit JWT`);
  console.log(`[token-server] GET  /health →  server health check`);
});

export default app;
