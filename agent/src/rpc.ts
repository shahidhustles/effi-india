import type { JobContext } from "@livekit/agents";
import type { RpcError } from "@livekit/rtc-node";
import {
  LOCATION_RPC_METHOD,
  PHOTO_RPC_METHOD,
  type RpcToolRequestPayload,
  type SessionState,
} from "./types.js";

function createRequestId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureCitizenIdentity(
  ctx: JobContext,
  state: SessionState,
): Promise<string> {
  if (state.citizenIdentity) {
    return state.citizenIdentity;
  }

  const participant = await ctx.waitForParticipant();
  state.citizenIdentity = participant.identity;
  return participant.identity;
}

async function performClientRpc(
  ctx: JobContext,
  state: SessionState,
  method: string,
  payload: RpcToolRequestPayload,
  responseTimeout: number,
): Promise<string> {
  if (!ctx.room.localParticipant) {
    throw new Error("Local LiveKit participant is unavailable");
  }

  const destinationIdentity = await ensureCitizenIdentity(ctx, state);

  try {
    return await ctx.room.localParticipant.performRpc({
      destinationIdentity,
      method,
      payload: JSON.stringify(payload),
      responseTimeout,
    });
  } catch (error) {
    const rpcError = error as RpcError;
    throw new Error(
      `RPC ${method} failed: ${rpcError.message ?? "Unknown LiveKit RPC error"}`,
    );
  }
}

export async function requestClientLocation(
  ctx: JobContext,
  state: SessionState,
  prompt: string,
): Promise<string> {
  return performClientRpc(
    ctx,
    state,
    LOCATION_RPC_METHOD,
    {
      requestId: createRequestId("location"),
      category: state.category,
      language: state.language,
      reason: "location",
      prompt,
    },
    20_000,
  );
}

export async function requestClientPhoto(
  ctx: JobContext,
  state: SessionState,
  prompt: string,
): Promise<string> {
  return performClientRpc(
    ctx,
    state,
    PHOTO_RPC_METHOD,
    {
      requestId: createRequestId("photo"),
      category: state.category,
      language: state.language,
      reason: "photo",
      prompt,
    },
    45_000,
  );
}
