import { llm, type JobContext } from "@livekit/agents";
import { z } from "zod";
import { requestClientLocation, requestClientPhoto } from "./rpc.js";
import { insertComplaint } from "./supabase.js";
import { COMPLAINT_CATEGORIES, type SessionState } from "./types.js";

const complaintCategorySchema = z.enum(COMPLAINT_CATEGORIES);

const locationToolResultSchema = z.object({
  status: z.enum(["ok", "denied", "cancelled", "error"]),
  message: z.string().optional(),
  location: z
    .object({
      coords: z.object({
        latitude: z.number(),
        longitude: z.number(),
        accuracy: z.number().nullable(),
        altitude: z.number().nullable(),
        altitudeAccuracy: z.number().nullable(),
        heading: z.number().nullable(),
        speed: z.number().nullable(),
      }),
      timestamp: z.number(),
      mocked: z.boolean().optional(),
    })
    .optional(),
});

const photoToolResultSchema = z.object({
  status: z.enum(["ok", "denied", "cancelled", "error"]),
  message: z.string().optional(),
  photoUrl: z.string().url().optional(),
});

function requireLocation(state: SessionState) {
  if (!state.location) {
    throw new Error("Device location has not been collected yet.");
  }
}

function requirePhotoIfNeeded(state: SessionState) {
  if (state.category !== "POWER_OUTAGE" && !state.photoUrl) {
    throw new Error(
      "Photo evidence is required for sanitation and pothole complaints.",
    );
  }
}

function requireAuthenticatedUser(state: SessionState) {
  if (!state.userId) {
    throw new Error(
      "Authenticated user metadata is missing from the LiveKit session.",
    );
  }
}

export function createComplaintTools({
  ctx,
  state,
}: {
  ctx: JobContext;
  state: SessionState;
}) {
  const requestLocation = llm.tool({
    description:
      "Ask the mobile app for the citizen's current device location. Call this only after you have understood the complaint and told the citizen to tap the location button.",
    parameters: z.object({
      prompt: z
        .string()
        .describe(
          "The short localized sentence you just told the citizen about tapping the location button.",
        ),
    }),
    execute: async ({ prompt }) => {
      try {
        const rawResponse = await requestClientLocation(ctx, state, prompt);
        const parsed = locationToolResultSchema.parse(JSON.parse(rawResponse));

        if (parsed.status === "ok" && parsed.location) {
          state.location = parsed.location;
        }

        return parsed;
      } catch (error) {
        return {
          status: "error" as const,
          message:
            error instanceof Error
              ? error.message
              : "Failed to collect device location.",
        };
      }
    },
  });

  const requestPhoto = llm.tool({
    description:
      "Ask the mobile app for a complaint photo and receive the uploaded public URL. Use this only for sanitation and pothole complaints after location has been collected.",
    parameters: z.object({
      prompt: z
        .string()
        .describe(
          "The short localized sentence you just told the citizen about tapping the photo button.",
        ),
    }),
    execute: async ({ prompt }) => {
      if (state.category === "POWER_OUTAGE") {
        return {
          status: "error" as const,
          message: "Photo collection must not be requested for power outage complaints.",
        };
      }

      try {
        const rawResponse = await requestClientPhoto(ctx, state, prompt);
        const parsed = photoToolResultSchema.parse(JSON.parse(rawResponse));

        if (parsed.status === "ok" && parsed.photoUrl) {
          state.photoUrl = parsed.photoUrl;
        }

        return parsed;
      } catch (error) {
        return {
          status: "error" as const,
          message:
            error instanceof Error
              ? error.message
              : "Failed to collect complaint photo.",
        };
      }
    },
  });

  const registerComplaint = llm.tool({
    description:
      "Register the final complaint in Supabase after required location and category-specific evidence have been collected.",
    parameters: z.object({
      category: complaintCategorySchema.describe(
        "The selected complaint category. Must exactly match the category chosen on the home screen.",
      ),
      problemType: z
        .string()
        .describe(
          "Short snake_case problem slug, such as garbage_overflow, pothole, or power_outage.",
        ),
      description: z
        .string()
        .describe("Citizen-facing complaint description in the citizen language."),
      summary: z
        .string()
        .describe("Short English summary for the admin dashboard."),
      callerName: z
        .string()
        .nullable()
        .optional()
        .describe("Citizen name if known, otherwise null."),
      language: z
        .string()
        .describe("Detected conversation language code such as en, hi, ta."),
    }),
    execute: async ({
      category,
      problemType,
      description,
      summary,
      callerName,
      language,
    }) => {
      if (category !== state.category) {
        throw new Error(
          `Selected category is ${state.category}. Do not register this complaint under ${category}.`,
        );
      }

      requireLocation(state);
      requireAuthenticatedUser(state);
      requirePhotoIfNeeded(state);

      const location = state.location;
      const userId = state.userId;
      if (!location) {
        throw new Error("Device location has not been collected yet.");
      }
      if (!userId) {
        throw new Error(
          "Authenticated user metadata is missing from the LiveKit session.",
        );
      }

      state.problemType = problemType;
      state.description = description;
      state.summary = summary;
      state.callerName = callerName ?? state.callerName;
      state.language = language || state.language;

      const inserted = await insertComplaint({
        userId,
        category: state.category,
        problemType,
        description,
        summary,
        callerName: state.callerName,
        language: state.language,
        location,
        photoUrl: state.photoUrl,
        transcript: state.transcript,
      });

      return {
        complaintId: inserted.complaintId,
        ticketNumber: inserted.ticketNumber,
      };
    },
  });

  return {
    requestLocation,
    requestPhoto,
    registerComplaint,
  };
}
