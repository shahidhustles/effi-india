# Effi India — Updated Project Architecture

Effi India is a multilingual AI-assisted civic complaint system focused on three complaint types:

- `Sanitation`
- `Potholes`
- `Power Outage`

The current repo already contains a working voice-call stack with `mobile/`, `agent/`, `token-server/`, and a starter `dashboard/`. This document updates the project definition to the new architecture where the voice agent no longer asks the user to manually describe their location. Instead, the mobile app collects structured device location and photo evidence through app-side actions triggered during the voice conversation.

## 1. Core Product Goal

The user should be able to:

1. Open the mobile app.
2. Choose one of the three complaint categories.
3. Speak naturally in their preferred language.
4. Share device location when the agent asks for it.
5. Share a photo when the complaint type needs evidence.
6. Have the final complaint registered in Supabase.

The admin dashboard should receive newly created complaints in real time through Supabase Realtime.

## 2. Updated User Flow

### Step 1: Home Screen

The home screen presents three choices:

- `Sanitation`
- `Potholes`
- `Power Outage`

After selecting one, the user starts the voice interaction.

### Step 2: Voice Session Screen

The call screen contains:

- An audio waveform / voice visualizer at the top.
- A live transcript / chat-style transcription area below it.
- Contextual action buttons below the transcript when the agent requests them.

The app will require access to:

- `Microphone`
- `Location`
- `Camera`

### Step 3: Complaint Collection

The citizen speaks naturally. The voice agent extracts:

- Complaint description
- Complaint category confirmation
- Caller name, if mentioned
- Language being spoken

Unlike the previous architecture, the agent does not rely on a spoken address as the main location source.

### Step 4: Location Tool Call

Once the agent has enough complaint context, it triggers the location tool.

The UI should then:

- Show an AI transcript message such as: `Please share your location by clicking the button below.`
- Render a `Mark Location` button below the transcript.

When the user taps the button, the app retrieves device location and sends structured location data back to the voice agent. The returned payload should include at least:

- `latitude`
- `longitude`
- `accuracy`
- `captured_at`

Optional derived metadata can also be included later, such as a reverse-geocoded address.

### Step 5: Photo Tool Call

For `Sanitation` and `Potholes`, the agent then asks for image evidence.

The UI should then:

- Show an AI transcript message asking for a photo.
- Render a `Take Photo` or `Upload Photo` action below the transcript.

This step is skipped for `Power Outage`, where location alone is treated as sufficient evidence for MVP flow.

The captured photo is uploaded to Supabase Storage, and the public URL is returned to the voice agent.

### Step 6: Final Ticket Registration

After the agent has the structured complaint details, it performs the final registration tool call. That tool writes the complete complaint into Supabase using:

- Category
- Complaint description
- Caller name if available
- Device location fields
- Photo URL when applicable
- Transcript summary
- Source language
- Timestamps

## 3. Updated System Architecture

```text
Mobile App
  -> starts LiveKit voice session
  -> renders transcript and action buttons
  -> provides device location
  -> captures and uploads complaint photo

Token Server
  -> issues LiveKit room token
  -> passes initial session metadata

Voice Agent
  -> handles multilingual conversation
  -> extracts complaint + name
  -> requests location through a client-side action
  -> requests photo only for sanitation and pothole complaints
  -> registers final complaint

Supabase
  -> stores complaint records
  -> stores evidence images
  -> broadcasts new complaints through Realtime

Admin Dashboard
  -> subscribes to realtime complaint inserts/updates
  -> shows complaint details, status, transcript, location, and image evidence
```

## 4. Component Responsibilities

### `mobile/`

Responsible for:

- Category selection
- Joining the LiveKit room
- Displaying waveform and transcript
- Handling user permissions
- Rendering `Mark Location` and `Take Photo` buttons when instructed
- Returning tool results to the agent
- Uploading images to Supabase Storage

### `agent/`

Responsible for:

- Multilingual voice conversation
- Complaint understanding
- Caller name extraction
- Tool-calling orchestration
- Conditional evidence collection logic
- Final complaint registration to Supabase

### `token-server/`

Responsible for:

- Generating LiveKit tokens
- Creating room/session metadata for the call
- Passing the selected complaint category into the session

### `dashboard/`

Responsible for:

- Real-time admin complaint feed
- Complaint detail view
- Evidence preview
- Transcript display
- Status management

### `Supabase`

Responsible for:

- `complaints` data storage
- `complaint_media` or photo storage
- Realtime subscriptions
- Row-level security and admin access rules

## 5. Repo-Grounded Current State

This repository currently has:

- `mobile/`: Expo React Native app with a home screen and active call screen.
- `agent/`: LiveKit voice agent using Deepgram, Cartesia, and OpenAI-compatible LLM calls.
- `token-server/`: Vercel serverless token endpoint for LiveKit room access.
- `dashboard/`: Next.js starter app with Supabase packages installed but not yet wired to complaint data.

Important current limitation:

- The current agent still asks for a spoken location/address and only has a demo `registerComplaint` tool.
- The current mobile call screen does not yet expose transcript history, tool-driven buttons, photo capture, or location return flow.
- The current category model still reflects the older labels such as `WATER`, which must be aligned with the updated civic categories.

## 6. Proposed Complaint Record Shape

The final complaint record should support at least:

```ts
type Complaint = {
  id: string;
  category: "sanitation" | "pothole" | "power_outage";
  description: string;
  caller_name: string | null;
  language: string;
  latitude: number;
  longitude: number;
  location_accuracy: number | null;
  address_text: string | null;
  photo_url: string | null;
  transcript: unknown;
  status: "open" | "in_progress" | "resolved";
  created_at: string;
  updated_at: string;
};
```

For MVP:

- `photo_url` is required for `sanitation` and `pothole`.
- `photo_url` is optional for `power_outage`.

## 7. Realtime Admin Dashboard Behavior

The admin dashboard should subscribe to Supabase Realtime for complaint inserts and status updates.

The dashboard should show:

- Complaint category
- Description
- Caller name
- Map/location data
- Evidence image when present
- Transcript or transcript summary
- Created time
- Current resolution status

This removes the need for manual polling and makes the demo feel operational as soon as the complaint is registered.

## 8. Key Product Rules

- The voice agent remains multilingual.
- The transcript shown on the mobile screen should reflect both user and AI turns.
- The agent should request structured location instead of relying on spoken address.
- Photo evidence is mandatory for `Sanitation` and `Potholes`.
- Photo evidence is skipped for `Power Outage`.
- Final complaint registration should happen only after the required structured inputs are available.

## 9. Main Migration From Old Architecture

Old approach:

- Agent asked the citizen to verbally describe location/address.
- Registration depended mainly on speech-extracted location text.

New approach:

- Agent asks the app to collect device location.
- App explicitly surfaces tool-driven UI actions.
- Photo evidence becomes part of the complaint pipeline.
- Supabase becomes the final source of truth for complaint records and realtime admin updates.

## 10. Immediate Build Direction

The next implementation phase should focus on:

1. Updating category names across the current app.
2. Adding transcript-driven tool UI to the mobile call screen.
3. Replacing spoken-location collection with device location collection.
4. Adding conditional image capture and Supabase Storage upload.
5. Registering the final complaint directly into Supabase.
6. Wiring the admin dashboard to Supabase Realtime.
