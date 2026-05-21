# Updation Plan

This file maps the current repository to the new architecture and lists the concrete updates needed before implementation starts.

## 1. Goal of the Update

Move from the current voice-only complaint collection flow to a tool-assisted flow where:

- complaint details are spoken,
- location comes from the user’s phone,
- photo evidence is collected when needed,
- and the final complaint is written to Supabase and reflected live in the admin dashboard.

## 2. Current State vs Target State

### Current state

- `mobile/app/index.tsx` lets the user select an older department model and start the interaction.
- `mobile/app/call.tsx` has a waveform-focused voice screen, but no transcript timeline and no tool-action buttons.
- `agent/src/agent.ts` still instructs the assistant to ask for a spoken location/address.
- `registerComplaint` is still a demo tool that only logs and returns a generated ticket ID.
- `token-server/api/token.ts` still uses the old category enum: `MUNICIPAL | WATER | ELECTRICITY`.
- `dashboard/` is still mostly starter scaffolding.

### Target state

- Home screen offers `Sanitation`, `Potholes`, and `Power Outage`.
- Call screen shows waveform, transcript, and context-sensitive action buttons.
- Agent asks the app for structured device location instead of asking the user to speak their address.
- Agent asks for a photo only for sanitation and pothole complaints.
- Photo is uploaded to Supabase Storage.
- Final complaint is inserted into Supabase.
- Dashboard updates in real time from Supabase Realtime.

## 3. Update Areas

### 3.1 Mobile App

#### UI flow updates

- Replace the current department cards with the updated complaint categories.
- Keep the home screen as the entry point, but update the labels, descriptions, and IDs to match the new complaint model.
- Redesign the call screen so it has:
  - waveform on top,
  - transcript/chat area below,
  - tool-triggered actions below the transcript.

#### Permissions

- Add microphone permission handling required for the call.
- Add location permission flow for the `Mark Location` step.
- Add camera or image-picker permission flow for the photo step.

#### Transcript and tool UI

- Maintain ordered transcript state for both:
  - citizen utterances,
  - agent responses.
- Detect when the agent triggers a location request and show `Mark Location`.
- Detect when the agent triggers a photo request and show `Take Photo`.
- Prevent duplicate submissions if the user taps the same action more than once.

#### Device location capture

- Retrieve structured GPS coordinates from the device.
- Return the result to the agent in a format the final complaint tool can consume.
- Capture at least:
  - latitude,
  - longitude,
  - accuracy,
  - timestamp.

#### Photo capture and upload

- Skip this step entirely for `Power Outage`.
- For `Sanitation` and `Potholes`, allow the user to take or choose a photo.
- Upload the final image to Supabase Storage.
- Return the public URL back to the voice agent.

### 3.2 Voice Agent

#### Prompt changes

The system prompt in `agent/src/agent.ts` must be changed so the assistant:

- does not ask the user to verbally provide their address as the main location source,
- explicitly asks the user to use the app button for location,
- explicitly asks for photo evidence only for categories that require it,
- remains multilingual across the full flow.

#### Tool changes

The current single `registerComplaint` tool is not enough. The new flow needs at least three responsibilities:

1. `request_location`
2. `request_photo`
3. `register_complaint`

Suggested behavior:

- `request_location` pauses the flow until app-side location data is returned.
- `request_photo` pauses the flow until app-side photo upload completes and a URL is returned.
- `register_complaint` performs the final write to Supabase.

#### Conversation logic

The agent should:

1. understand the complaint,
2. infer or confirm the category,
3. extract caller name if present,
4. call `request_location`,
5. call `request_photo` only when category is `sanitation` or `pothole`,
6. call `register_complaint` only after all required fields are available.

#### Supabase integration

The final complaint tool should stop being a console-log demo and should instead:

- insert the complaint into Supabase,
- optionally store transcript payload,
- return a real complaint ID or ticket ID to the citizen.

### 3.3 Token Server

- Update `token-server/api/token.ts` to align with the new category model.
- Pass the new complaint category as session metadata for the agent.
- Keep token generation focused on session setup only; do not move complaint registration logic into the token server.

### 3.4 Supabase

#### Database work

Create or update schema for a complaints table with fields such as:

- `id`
- `category`
- `description`
- `caller_name`
- `language`
- `latitude`
- `longitude`
- `location_accuracy`
- `address_text`
- `photo_url`
- `transcript`
- `status`
- `created_at`
- `updated_at`

#### Storage work

- Create a storage bucket for complaint evidence images.
- Decide public vs signed URL access strategy.
- For MVP demo, public read URLs are simplest if the dashboard needs direct rendering.

#### Realtime work

- Enable realtime for complaint inserts and updates.
- Subscribe from the dashboard so new complaints appear without page refresh.

#### Security work

- Define RLS policies for admin access.
- Keep service-role writes limited to backend/agent flows only.

### 3.5 Admin Dashboard

The dashboard currently needs actual product wiring, not just UI scaffolding.

Required views:

- complaint list,
- complaint detail view,
- evidence image preview,
- transcript display,
- realtime updates.

The complaint detail view should be able to show:

- category,
- description,
- caller name,
- created time,
- status,
- coordinates or map-ready location fields,
- photo when available.

## 4. Category Alignment Needed First

This needs to be cleaned up before deeper implementation, because the repo still uses older naming.

Current repo labels still imply an older model:

- `MUNICIPAL`
- `WATER`
- `ELECTRICITY`

New product labels should become:

- `SANITATION`
- `POTHOLE`
- `POWER_OUTAGE`

This change affects:

- mobile config/constants,
- token server request schema,
- agent department/category logic,
- any future Supabase enum or validation logic.

## 5. Recommended Build Sequence

1. Align categories across `mobile/`, `agent/`, and `token-server/`.
2. Add transcript state and tool-action placeholders in `mobile/app/call.tsx`.
3. Add agent-side location/photo request tools and update prompt flow.
4. Create Supabase schema and storage bucket.
5. Replace demo complaint registration with a real Supabase insert.
6. Add photo upload from the mobile app.
7. Wire dashboard list/detail pages to Supabase Realtime.

## 6. Edge Cases To Handle

- User denies location permission.
- User denies camera permission.
- GPS returns low-accuracy coordinates.
- Photo upload fails after capture.
- User ends the call before required evidence is submitted.
- Agent asks for photo in a `power_outage` flow by mistake.
- Duplicate tool triggers cause double submissions.
- Transcript and tool state go out of sync during reconnection.
- Location is captured but photo is skipped or delayed.
- Supabase insert succeeds but transcript persistence fails.

## 7. Questions Requiring Product Confirmation

- Should location and camera permissions be requested upfront when the call screen opens, or only when each tool is triggered?
- For `Power Outage`, should photo be completely disallowed, or allowed as optional extra evidence?
- Do we want raw full transcript stored in Supabase, or only a summarized complaint plus visible mobile transcript during the call?
- Should the dashboard show a map widget immediately in MVP, or is showing coordinates plus image enough for the first version?

## 8. What This File Is For

This file is the migration checklist before coding the new architecture. The actual implementation should now be driven by this structure instead of the older spoken-location flow.
