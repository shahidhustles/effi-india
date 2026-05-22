import "dotenv/config";
import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
} from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as cartesia from "@livekit/agents-plugin-cartesia";
import * as openai from "@livekit/agents-plugin-openai";
import * as silero from "@livekit/agents-plugin-silero";
import { BackgroundVoiceCancellation } from "@livekit/noise-cancellation-node";
import { fileURLToPath } from "node:url";
import { buildOpeningInstructions, buildSystemPrompt } from "./prompts.js";
import { createComplaintTools } from "./tools.js";
import type {
  ComplaintCategory,
  RoomMetadata,
  SessionState,
  TranscriptSpeaker,
  TranscriptTurn,
} from "./types.js";

const { AgentSessionEventTypes } = voice;

const CARTESIA_VOICE_ID =
  process.env.CARTESIA_HINDI_VOICE_ID ??
  process.env.CARTESIA_VOICE_ID ??
  "79a125e8-cd45-4c13-8a67-188112f4dd22";

const CARTESIA_SUPPORTED_LANGS = new Set([
  "en",
  "hi",
  "ta",
  "te",
  "kn",
  "ml",
  "gu",
  "pa",
  "bn",
  "mr",
]);

const CATEGORY_NAMES: Record<ComplaintCategory, string> = {
  SANITATION: "Sanitation and Garbage",
  POTHOLE: "Pothole and Road Damage",
  POWER_OUTAGE: "Power Outage",
};

function parseSessionMetadata(metadata: string | undefined): RoomMetadata {
  if (!metadata) {
    return { category: "SANITATION", language: "en", userId: null };
  }

  try {
    const parsed = JSON.parse(metadata) as Partial<RoomMetadata>;
    return {
      category: parsed.category ?? "SANITATION",
      language: parsed.language ?? "en",
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
    };
  } catch {
    return { category: "SANITATION", language: "en", userId: null };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeTranscriptSpeaker(role: unknown, type: unknown): TranscriptSpeaker {
  if (role === "user") {
    return "citizen";
  }
  if (role === "assistant") {
    return "agent";
  }
  if (role === "system") {
    return "system";
  }
  if (type === "function_call" || type === "function_call_output") {
    return "tool";
  }
  return "unknown";
}

function extractTranscriptContent(item: Record<string, unknown>): string {
  const content = item.content;
  if (Array.isArray(content)) {
    const parts = content
      .flatMap((part) => {
        if (!isRecord(part)) {
          return [];
        }

        const values = [part.text, part.transcript]
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean);

        return values;
      })
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" ").trim();
    }
  }

  if (item.type === "function_call") {
    const name = typeof item.name === "string" ? item.name : "tool_call";
    const args = typeof item.arguments === "string" ? item.arguments : "";
    return args ? `${name} ${args}` : name;
  }

  if (item.type === "function_call_output" && typeof item.output === "string") {
    return item.output.trim();
  }

  return "";
}

function normalizeTranscriptTurn(item: unknown, turnIndex: number): TranscriptTurn {
  if (!isRecord(item)) {
    return {
      turnIndex,
      speaker: "unknown",
      content: "",
      rawPayload: item,
    };
  }

  return {
    turnIndex,
    speaker: normalizeTranscriptSpeaker(item.role, item.type),
    content: extractTranscriptContent(item),
    rawPayload: item,
  };
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    console.log("[agent] Prewarming Silero VAD...");
    proc.userData.vad = await silero.VAD.load();
    console.log("[agent] Silero VAD ready");
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const participant = await ctx.waitForParticipant();
    const sessionMetadata = parseSessionMetadata(
      participant.metadata || ctx.room.metadata || undefined,
    );
    const state: SessionState = {
      category: sessionMetadata.category,
      language: sessionMetadata.language ?? "en",
      userId: sessionMetadata.userId ?? null,
      callerName: null,
      problemType: null,
      description: null,
      summary: null,
      location: null,
      photoUrl: null,
      transcript: [],
      citizenIdentity: participant.identity,
    };

    console.log(
      `[agent] Joining room: ${ctx.room.name} | category: ${state.category}`,
    );
    console.log(
      `[agent] Citizen participant connected: ${state.citizenIdentity}`,
    );
    console.log(`[agent] Authenticated user: ${state.userId ?? "missing"}`);

    const vad = ctx.proc.userData.vad as silero.VAD;

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

    const llmModel = new openai.LLM({
      model: "openai/gpt-4o",
      baseURL: "https://ai-gateway.vercel.sh/v1",
      apiKey: process.env.VERCEL_AI_GATEWAY_API_KEY,
      temperature: 0.4,
    });

    const tts = new cartesia.TTS({
      model: "sonic-3" as never,
      voice: CARTESIA_VOICE_ID,
      language: "hi",
    });

    const agent = new voice.Agent({
      instructions: buildSystemPrompt(state.category),
      tools: createComplaintTools({ ctx, state }),
    });

    const session = new voice.AgentSession({
      stt,
      llm: llmModel,
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

    let currentTtsLang = "hi";

    session.on(AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (ev.transcript.trim()) {
        console.log(
          `[citizen → agent] "${ev.transcript}" (lang: ${ev.language}, final: ${ev.isFinal})`,
        );
      }

      if (ev.isFinal && ev.language && ev.language !== "multi") {
        const detected = ev.language.split("-")[0];
        state.language = detected;

        const cartesiaLanguage = CARTESIA_SUPPORTED_LANGS.has(detected)
          ? detected
          : "hi";

        if (cartesiaLanguage !== currentTtsLang) {
          currentTtsLang = cartesiaLanguage;
          tts.updateOptions({ language: cartesiaLanguage });
          console.log(`[agent] TTS language switched to: ${cartesiaLanguage}`);
        }
      }
    });

    session.on(AgentSessionEventTypes.ConversationItemAdded, (ev) => {
      state.transcript.push(
        normalizeTranscriptTurn(ev.item as unknown, state.transcript.length),
      );
    });

    session.on(AgentSessionEventTypes.AgentStateChanged, (ev) => {
      console.log(`[agent] State: ${ev.oldState} → ${ev.newState}`);
    });

    session.on(AgentSessionEventTypes.Error, (ev) => {
      console.error("[agent] Session error:", ev.error);
    });

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

    await session.generateReply({
      instructions: buildOpeningInstructions(state.category, state.language),
    });

    console.log(
      `[agent] Session live for room: ${ctx.room.name} | category: ${CATEGORY_NAMES[state.category]}`,
    );
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
  }),
);
