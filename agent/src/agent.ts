import "dotenv/config";
import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  llm,
  voice,
} from "@livekit/agents";

const { AgentSessionEventTypes } = voice;
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as cartesia from "@livekit/agents-plugin-cartesia";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import { BackgroundVoiceCancellation } from "@livekit/noise-cancellation-node";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Department = "MUNICIPAL" | "WATER" | "ELECTRICITY";

interface RoomMetadata {
  department: Department;
  language?: string; // optional hint, not enforced
}

// ─── Cartesia voice ID ────────────────────────────────────────────────────────
// Use the Indian Hindi voice from env — gives an Indian accent across all
// Indian languages. sonic-3 supports hi, ta, mr, bn, te, gu, kn, ml, pa etc.
// CARTESIA_HINDI_VOICE_ID should be an Indian voice from https://play.cartesia.ai
const CARTESIA_VOICE_ID =
  process.env.CARTESIA_HINDI_VOICE_ID ??
  process.env.CARTESIA_VOICE_ID ??
  "79a125e8-cd45-4c13-8a67-188112f4dd22";

// ─── Department display names ──────────────────────────────────────────────────

const DEPT_NAMES: Record<Department, string> = {
  MUNICIPAL: "Municipal Services",
  WATER: "Water & Sanitation",
  ELECTRICITY: "Electricity",
};

// ─── System prompt factory ────────────────────────────────────────────────────

function buildSystemPrompt(department: Department): string {
  const deptName = DEPT_NAMES[department];

  return `You are Effi, an AI voice assistant for Indian municipal services, working for the ${deptName} department.

LANGUAGE RULE (highest priority — follow this above everything else):
- Automatically detect the language the citizen is speaking and respond in that EXACT same language.
- You support ALL languages including but not limited to: Hindi, English, Tamil, Bengali, Telugu, Gujarati, Kannada, Malayalam, Marathi, Punjabi, Odia, Assamese, Urdu, and any other language the citizen uses.
- If the citizen switches languages mid-conversation, switch immediately with them.
- If the citizen uses Hinglish (mixed Hindi + English), respond in Hinglish.
- NEVER tell the citizen you only support certain languages. You support whatever language they speak.
- NEVER respond in a language the citizen did not use.

VOICE RULES (critical for voice UX):
- Keep every response SHORT — 1 to 3 sentences maximum.
- No bullet points, no lists, no markdown, no emojis.
- Speak naturally as if on a phone call.

YOUR JOB:
Help citizens of India report civic problems to the ${deptName} department.
${getDepartmentProblems(department)}

CONVERSATION FLOW:
1. Greet warmly and ask what problem they want to report. (1 sentence)
2. Listen, then ask for their location or address. (1 sentence)
3. Optionally ask for their name if they haven't given it.
4. Confirm the complaint back to them in one sentence.
5. Tell them their complaint has been registered and they will receive follow-up.
6. End the call warmly.

TOOLS:
- Use the "registerComplaint" tool once you have: problem description AND location.
- Do NOT call the tool until you have both pieces of information.
- After calling the tool, confirm to the citizen with the ticket number returned.

IMPORTANT:
- You represent the government. Be respectful, patient, and professional.
- If the citizen is upset, acknowledge their frustration first before asking questions.
- If you don't understand, ask them to repeat — never guess.
- Never promise specific timelines you can't guarantee.`;
}

function getDepartmentProblems(dept: Department): string {
  const problems: Record<Department, string> = {
    MUNICIPAL:
      "Potholes and road damage, garbage collection, broken streetlights, stray animals, drainage blockage, illegal encroachment.",
    WATER:
      "Water supply outages, pipe leaks, billing disputes, water contamination, low water pressure, new connection requests.",
    ELECTRICITY:
      "Power outages, billing disputes, meter faults, dangerous wires, transformer issues, new connection requests.",
  };
  return problems[dept];
}

// ─── LLM tool — registerComplaint ────────────────────────────────────────────

const registerComplaint = llm.tool({
  description:
    "Register a citizen complaint after collecting their problem description and location. Call this only once you have both the problem and location.",
  parameters: z.object({
    problemType: z
      .string()
      .describe(
        "Short slug describing the problem, e.g. pothole, power_outage, pipe_leak",
      ),
    description: z
      .string()
      .describe("Brief description of the complaint in the citizen language"),
    location: z
      .string()
      .describe("Address or location of the problem as stated by the citizen"),
    callerName: z
      .string()
      .optional()
      .describe("Name of the citizen if provided"),
    language: z
      .string()
      .describe("Detected language code of the conversation, e.g. hi, en, ta"),
  }),
  execute: async ({
    problemType,
    description,
    location,
    callerName,
    language,
  }) => {
    // Generate a simple ticket number for demo purposes.
    // In the full system, this would insert into Supabase and return the real ticket ID.
    const ticketId = `EFF-${Date.now().toString(36).toUpperCase()}`;

    console.log("[agent] Complaint registered:", {
      ticketId,
      problemType,
      description,
      location,
      callerName,
      language,
      timestamp: new Date().toISOString(),
    });

    return {
      ticketId,
      message: `Complaint registered successfully. Ticket ID: ${ticketId}`,
    };
  },
});

// ─── Agent definition ─────────────────────────────────────────────────────────

export default defineAgent({
  /**
   * prewarm runs once per worker process at startup.
   * We load the Silero VAD model here so it's ready when a call comes in.
   */
  prewarm: async (proc: JobProcess) => {
    console.log("[agent] Prewarming — loading Silero VAD model...");
    proc.userData.vad = await silero.VAD.load();
    console.log("[agent] Silero VAD ready");
  },

  /**
   * entry is called for every new room the agent joins.
   */
  entry: async (ctx: JobContext) => {
    // ── Parse room metadata ───────────────────────────────────────────────────
    let department: Department = "MUNICIPAL";

    try {
      const meta: RoomMetadata = JSON.parse(ctx.room.metadata ?? "{}");
      if (meta.department) department = meta.department;
    } catch {
      console.warn("[agent] Could not parse room metadata, using defaults");
    }

    console.log(`[agent] Joining room: ${ctx.room.name} | dept: ${department}`);

    // ── Connect to the room ───────────────────────────────────────────────────
    await ctx.connect();

    // ── Build the voice pipeline ──────────────────────────────────────────────
    const vad = ctx.proc.userData.vad as silero.VAD;

    // STT: nova-3 with language:'multi' enables Deepgram's multilingual
    // codeswitching — auto-detects Hindi, Marathi, Tamil, English, etc.
    // IMPORTANT: punctuate & smartFormat MUST be false for language=multi;
    // Deepgram returns HTTP 400 if they're enabled with codeswitching.
    // endpointing=100 is Deepgram's recommended value for multilingual streams.
    const stt = new deepgram.STT({
      model: "nova-3",
      language: "multi",
      interimResults: true,
      punctuate: false,
      smartFormat: false,
      endpointing: 100,
      noDelay: true,
      sampleRate: 16000,
    });

    const lmm = new openai.LLM({
      model: "openai/gpt-4o",
      baseURL: "https://ai-gateway.vercel.sh/v1",
      apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY,
      temperature: 0.7,
    });

    // TTS: sonic-3 is Cartesia's multilingual model supporting all major Indian
    // languages: hi, ta, mr, bn, te, gu, kn, ml, pa, and also en.
    // Using CARTESIA_HINDI_VOICE_ID (Indian voice) with language:'hi' ensures:
    //   • Hindi/Marathi/Indian-language output sounds native.
    //   • English output carries an Indian accent (desired for this app).
    // NOTE: speed must be numeric for sonic-3 (string "normal" causes invalid JSON).
    // Omitting speed entirely uses the default (1.0).
    const tts = new cartesia.TTS({
      model: "sonic-3" as any,
      voice: CARTESIA_VOICE_ID,
      language: "hi",
    });

    // ── Build the agent ───────────────────────────────────────────────────────
    const agent = new voice.Agent({
      instructions: buildSystemPrompt(department),
      tools: { registerComplaint },
    });

    // ── Create and start the session ──────────────────────────────────────────
    // turnDetection: 'vad' — Silero VAD handles turn boundaries purely from
    // audio energy. This avoids the MultilingualModel issue where 'multi' is
    // not a real language code, causing "Language multi not supported" warnings.
    // VAD-based detection is language-agnostic and works for all Indian languages.
    const session = new voice.AgentSession({
      stt,
      llm: lmm,
      tts,
      vad,
      turnDetection: "vad",
      voiceOptions: {
        allowInterruptions: true,
        minInterruptionDuration: 600,
        minEndpointingDelay: 400,
        maxEndpointingDelay: 3500,
      },
    });

    // ── Event listeners ───────────────────────────────────────────────────────
    session.on(AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (ev.transcript.trim()) {
        console.log(
          `[citizen → agent] "${ev.transcript}" (final: ${ev.isFinal})`,
        );
      }
    });

    session.on(AgentSessionEventTypes.AgentStateChanged, (ev) => {
      console.log(`[agent] State: ${ev.oldState} → ${ev.newState}`);
    });

    session.on(AgentSessionEventTypes.Error, (ev) => {
      console.error("[agent] Session error:", ev.error);
    });

    // ── Start the session ─────────────────────────────────────────────────────
    await session.start({
      agent,
      room: ctx.room,
      inputOptions: {
        audioEnabled: true,
        noiseCancellation: BackgroundVoiceCancellation(),
      },
      outputOptions: {
        audioEnabled: true,
        transcriptionEnabled: true,
      },
    });

    // ── Opening greeting ──────────────────────────────────────────────────────
    // Greet in English — a neutral, universally understood opener.
    // The agent will immediately switch to the citizen's language on their
    // first utterance, per the LANGUAGE RULE in the system prompt.
    await session.generateReply({
      instructions: `Greet the citizen warmly and briefly. Say you are Effi, a ${DEPT_NAMES[department]} assistant. Ask what problem they want to report. Keep it to ONE sentence. Speak in English.`,
    });

    console.log(`[agent] Session live for room: ${ctx.room.name}`);
  },
});

// ─── Worker entry point ────────────────────────────────────────────────────────

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
  }),
);
