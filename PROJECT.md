# Effi India — Project Document

> AI voice call center for Indian municipal services. Semester project inspired by EffiGov (YC S25).
> Scope: showcase demo, not production deployment.

---

## Table of Contents

1. [What We Are Building](#1-what-we-are-building)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [System Architecture](#4-system-architecture)
5. [Database Schema](#5-database-schema)
6. [Voice AI Pipeline](#6-voice-ai-pipeline)
7. [Backend API](#7-backend-api)
8. [Mobile App](#8-mobile-app)
9. [Admin Dashboard](#9-admin-dashboard)
10. [Multilingual Support](#10-multilingual-support)
11. [Department Routing Logic](#11-department-routing-logic)
12. [Environment Variables](#12-environment-variables)
13. [Build Sequence](#13-build-sequence)
14. [Key Data Flows](#14-key-data-flows)
15. [Demo Script](#15-demo-script)

---

## 1. What We Are Building

**Effi India** is an AI-powered voice call center for Indian citizens to report civic problems to three government departments — without waiting on hold, without speaking English, and without navigating IVR menus.

A citizen opens the mobile app, taps "Report an Issue", and speaks naturally in Hindi (or any of 9 Indian languages). An AI voice agent understands the complaint, collects the necessary details, creates a service ticket, and confirms receipt — all within a single 60–90 second call.

Department officers log into an admin dashboard to view tickets, read AI-generated summaries, listen to transcripts, and mark issues as resolved.

### Inspiration

- **EffiGov** (effigov.com) — YC S25 company building an AI OS for US local governments. Already live in Huber Heights, Ohio (pop. 43k) and Sumter County, Florida (pop. 160k), automating 50–70% of constituent calls.
- **India context** — India has 4,000+ urban local bodies (ULBs). Most have no 311-equivalent. Citizens are forced to visit offices or wait for manually answered phones.

### Target Departments

| Department | Indian Context | Common Request Types |
|---|---|---|
| Municipal Services | BMC (Mumbai), BBMP (Bengaluru), NMMC (Navi Mumbai) | Potholes, garbage pickup, broken streetlights, stray animals |
| Water & Sanitation | Jal Jeevan Mission, state Jal Boards, Jal Shakti Abhiyan | Water supply outages, billing disputes, pipe leaks, contamination |
| Electricity (DISCOM) | MSEDCL, BESCOM, TSSPDCL, APEPDCL | Power outages, billing disputes, meter faults, new connections |

---

## 2. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Monorepo | Turborepo + pnpm workspaces | Shared types across apps, fast builds |
| Mobile App | React Native (Expo managed) | Cross-platform iOS + Android, Expo Go for demo |
| Admin Dashboard | Next.js 14 (App Router) | Server Components, Server Actions, easy Supabase auth |
| Backend API | Node.js + Express | Same language as frontend, rich LiveKit SDK support |
| Voice Agent | `@livekit/agents` (Node.js) | Official LiveKit agent framework with STT/TTS plugins |
| Database | Supabase (PostgreSQL) | Managed Postgres + Auth + Realtime built-in |
| Auth | Supabase Auth | Admin-only auth, email/password |
| Real-time | Supabase Realtime | Admin dashboard live ticket updates |
| Voice Infra | LiveKit Cloud | WebRTC rooms for citizen ↔ AI voice calls |
| STT | Deepgram `nova-2` | Best-in-class accuracy, auto language detection for Indian languages |
| TTS | Cartesia `sonic-3` | Native Indian language support (9 languages), ultra-low latency |
| LLM | OpenAI GPT-4o | Best multilingual reasoning, reliable structured output |
| Styling (Admin) | Tailwind CSS + shadcn/ui | Fast, consistent UI components |

---

## 3. Repository Structure

```
effi-india/
│
├── apps/
│   ├── mobile/                    # React Native (Expo)
│   ├── admin/                     # Next.js 14 admin dashboard
│   └── backend/                   # Node.js + Express API + LiveKit Agent
│
├── packages/
│   └── shared/                    # Shared TypeScript types & constants
│       └── src/
│           ├── types/
│           │   ├── ticket.ts
│           │   ├── call.ts
│           │   ├── department.ts
│           │   └── transcript.ts
│           └── constants/
│               ├── departments.ts
│               └── languages.ts
│
├── supabase/
│   └── migrations/
│       ├── 001_create_departments.sql
│       ├── 002_create_tickets.sql
│       ├── 003_create_calls.sql
│       ├── 004_create_transcripts.sql
│       └── 005_seed_departments.sql
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── PROJECT.md                     # This file
```

### apps/mobile structure

```
apps/mobile/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx              # Home: select dept, tap to call
│   │   └── reports.tsx            # My past complaint tickets
│   ├── call/
│   │   └── [room].tsx             # Active call screen (LiveKit room)
│   └── _layout.tsx
├── components/
│   ├── DepartmentCard.tsx
│   ├── CallControls.tsx
│   ├── WaveformAnimation.tsx
│   └── LanguagePicker.tsx
├── hooks/
│   ├── useLiveKitCall.ts
│   └── useTickets.ts
├── services/
│   ├── api.ts                     # Backend API calls
│   └── livekit.ts                 # Token fetch + room join
├── constants/
│   └── departments.ts
└── app.json
```

### apps/admin structure

```
apps/admin/
├── app/
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx
│   ├── dashboard/
│   │   ├── layout.tsx             # Sidebar + nav
│   │   ├── page.tsx               # Overview: stats cards
│   │   ├── tickets/
│   │   │   ├── page.tsx           # Tickets list with filters
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Ticket detail + transcript
│   │   └── departments/
│   │       └── page.tsx           # Dept config (future)
│   └── layout.tsx
├── components/
│   ├── StatsCard.tsx
│   ├── TicketsTable.tsx
│   ├── TranscriptViewer.tsx
│   ├── StatusBadge.tsx
│   └── DepartmentBadge.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # Browser Supabase client
│   │   └── server.ts              # Server Supabase client
│   └── utils.ts
└── middleware.ts                  # Supabase Auth route protection
```

### apps/backend structure

```
apps/backend/
├── src/
│   ├── routes/
│   │   ├── calls.ts               # POST /calls/token
│   │   ├── tickets.ts             # CRUD /tickets
│   │   └── departments.ts         # GET /departments
│   ├── agent/
│   │   ├── index.ts               # LiveKit agent entry point
│   │   ├── pipeline.ts            # STT → LLM → TTS pipeline
│   │   ├── intent.ts              # GPT-4o intent router
│   │   └── prompts.ts             # System prompts (multilingual)
│   ├── db/
│   │   └── supabase.ts            # Supabase server client
│   ├── middleware/
│   │   └── auth.ts                # API key auth for internal routes
│   └── index.ts                   # Express app entry
├── .env.example
└── package.json
```

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CITIZEN (Mobile App)                      │
│              React Native / Expo                             │
│   - Selects dept + language                                  │
│   - Fetches LiveKit token from backend                       │
│   - Joins LiveKit room                                       │
│   - Speaks, hears AI response                                │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebRTC (audio)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   LIVEKIT CLOUD                              │
│              Real-time audio room                            │
│   - Room created per call                                    │
│   - Citizen + AI Agent both join the room                    │
└──────────┬──────────────────────────┬───────────────────────┘
           │ audio stream             │ audio stream
           ▼                          ▼
┌──────────────────────────────────────────────────────────────┐
│                 VOICE AI AGENT (Node.js)                      │
│            @livekit/agents framework                          │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │ Deepgram    │   │   GPT-4o     │   │  Cartesia        │  │
│  │ STT         │──▶│   Intent     │──▶│  TTS             │  │
│  │ nova-2      │   │   Router +   │   │  sonic-3         │  │
│  │ auto-lang   │   │   Responder  │   │  Indian langs    │  │
│  └─────────────┘   └──────┬───────┘   └──────────────────┘  │
│                           │                                  │
│                           │ ticket data                      │
│                           ▼                                  │
│                  ┌────────────────┐                          │
│                  │  Supabase DB   │                          │
│                  │  tickets table │                          │
│                  └────────────────┘                          │
└──────────────────────────────────────────────────────────────┘
                       │
                       │ REST API
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  EXPRESS API SERVER                          │
│   /calls/token   /tickets   /departments                     │
└─────────────────────────────────────────────────────────────┘
                       │
                       │ Supabase JS
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                SUPABASE (PostgreSQL)                         │
│   departments | tickets | calls | transcripts               │
│   + Supabase Auth  + Supabase Realtime                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ Realtime subscription
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              ADMIN DASHBOARD (Next.js 14)                    │
│   /dashboard         - stats overview                        │
│   /dashboard/tickets - live ticket feed                      │
│   /dashboard/tickets/[id] - detail + transcript + actions   │
│   Supabase Auth protected                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Database Schema

All tables live in Supabase (PostgreSQL). Admin users are managed by Supabase Auth (`auth.users`).

### departments

```sql
CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,        -- "Municipal Services"
  code        TEXT NOT NULL UNIQUE, -- "MUNICIPAL"
  description TEXT,
  keywords    TEXT[],               -- ["pothole","garbage","streetlight"]
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### tickets

```sql
CREATE TABLE tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id   UUID REFERENCES departments(id),
  caller_phone    TEXT,
  caller_name     TEXT,
  language        TEXT NOT NULL,         -- "hi", "ta", "en", etc.
  problem_type    TEXT NOT NULL,         -- "pothole", "power_outage", etc.
  description     TEXT,                  -- AI-extracted summary
  location        TEXT,                  -- extracted from call
  status          TEXT DEFAULT 'open',   -- open | in_progress | resolved | escalated
  priority        TEXT DEFAULT 'normal', -- low | normal | high | urgent
  assigned_to     UUID,                  -- references auth.users(id)
  call_id         UUID,                  -- set after call ends
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### calls

```sql
CREATE TABLE calls (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           UUID REFERENCES tickets(id),
  livekit_room_name   TEXT NOT NULL,
  duration_seconds    INTEGER,
  language_detected   TEXT,            -- final detected language
  status              TEXT DEFAULT 'active', -- active | completed | dropped
  started_at          TIMESTAMPTZ DEFAULT now(),
  ended_at            TIMESTAMPTZ
);
```

### transcripts

```sql
CREATE TABLE transcripts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id    UUID REFERENCES calls(id) ON DELETE CASCADE,
  speaker    TEXT NOT NULL,   -- "citizen" | "ai"
  text       TEXT NOT NULL,   -- what was said
  language   TEXT,            -- language of this turn
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast call transcript lookups
CREATE INDEX transcripts_call_id_idx ON transcripts(call_id, created_at);
```

### Seed data (departments)

```sql
INSERT INTO departments (name, code, description, keywords) VALUES
(
  'Municipal Services',
  'MUNICIPAL',
  'BMC/BBMP-style complaints for roads, sanitation, and public infrastructure',
  ARRAY['pothole', 'garbage', 'streetlight', 'stray animal', 'road', 'drainage',
        'gutter', 'park', 'footpath', 'encroachment', 'noise', 'dust',
        'gadhha', 'sadak', 'kachra', 'batti']  -- Hindi keywords too
),
(
  'Water & Sanitation',
  'WATER',
  'Jal Jeevan Mission / state water boards — supply, billing, and infrastructure',
  ARRAY['water', 'supply', 'pipe', 'leak', 'billing', 'meter', 'sewage',
        'pani', 'paani', 'nal', 'paani ka bill', 'naali']
),
(
  'Electricity',
  'ELECTRICITY',
  'DISCOM complaints — MSEDCL, BESCOM, TSSPDCL, APEPDCL',
  ARRAY['power', 'outage', 'electricity', 'billing', 'meter', 'transformer',
        'wire', 'light', 'bijli', 'current', 'watt', 'load shedding']
);
```

### Row Level Security (RLS)

```sql
-- Tickets: only authenticated admins can update/delete
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Public read for the agent (using service role key)
-- Admin read/write
CREATE POLICY "Admins can do everything on tickets"
  ON tickets FOR ALL
  USING (auth.role() = 'authenticated');

-- Same for other tables
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything on calls" ON calls FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can do everything on transcripts" ON transcripts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Anyone can read departments" ON departments FOR SELECT USING (true);
```

---

## 6. Voice AI Pipeline

The voice agent is the core of the system. It runs as a Node.js process using `@livekit/agents`.

### How it works

```
1. Citizen joins LiveKit room (from mobile app)
2. Agent process detects new room → joins automatically
3. Agent subscribes to citizen's audio track
4. Pipeline loop (until call ends):
   a. Deepgram receives audio → streams text back (STT)
   b. Agent accumulates transcript until end of utterance
   c. GPT-4o receives full conversation history + system prompt
   d. GPT-4o returns: { response_text, intent, department, extracted_data }
   e. Cartesia converts response_text → audio
   f. Agent publishes audio back to LiveKit room
5. On call end:
   a. Agent inserts final ticket into Supabase
   b. Saves all transcript turns
   c. Updates call record with duration + language
```

### GPT-4o System Prompt (condensed)

```
You are Effi, an AI assistant for Indian municipal services.
You speak with citizens in their language (Hindi, Tamil, Bengali, Telugu, 
Gujarati, Kannada, Malayalam, Marathi, Punjabi, or English).

ALWAYS respond in the SAME language the citizen is using.
If they mix Hindi and English (Hinglish), respond in Hinglish.

Your job:
1. Greet the citizen warmly.
2. Ask what problem they want to report.
3. Identify the department: MUNICIPAL, WATER, or ELECTRICITY.
4. Collect: (a) brief description, (b) location/address, (c) caller name (optional).
5. Confirm the details back to them.
6. Tell them a ticket number will be generated and they will be contacted.
7. End the call politely.

When you have enough information, include this JSON in your response:
<ticket>
{
  "department": "MUNICIPAL|WATER|ELECTRICITY",
  "problem_type": "short_slug",
  "description": "one sentence summary",
  "location": "extracted location",
  "caller_name": "name or null",
  "language": "hi|ta|en|..."
}
</ticket>

Available departments and their problem types:
- MUNICIPAL: pothole, garbage_pickup, broken_streetlight, stray_animal, 
             road_damage, drainage_block, park_maintenance, encroachment
- WATER: supply_outage, pipe_leak, billing_dispute, meter_fault, 
         water_contamination, new_connection
- ELECTRICITY: power_outage, billing_dispute, meter_fault, transformer_issue,
               dangerous_wire, new_connection, load_shedding
```

### Intent parser (intent.ts)

The agent response is parsed for the `<ticket>...</ticket>` XML block. When found:
1. Insert row into `tickets` table
2. Update `calls` table with `ticket_id`
3. Agent sends a closing message to the citizen

---

## 7. Backend API

**Base URL (dev):** `http://localhost:3001`

### Endpoints

#### `POST /calls/token`

Generates a LiveKit access token for the citizen to join a room.

**Request body:**
```json
{
  "department": "MUNICIPAL",
  "language": "hi",
  "caller_phone": "+91XXXXXXXXXX"  // optional
}
```

**Response:**
```json
{
  "token": "<livekit_jwt>",
  "room_name": "call-uuid-here",
  "ws_url": "wss://your-livekit-cloud-url"
}
```

**What it does internally:**
1. Generates a unique room name (`call-${uuidv4()}`)
2. Creates a LiveKit `AccessToken` with `roomJoin` and `canPublish` grants
3. Creates a pending `calls` row in Supabase
4. Returns token + room info to the mobile app

#### `GET /tickets`

Returns a list of tickets. Supports filters:

| Query param | Type | Example |
|---|---|---|
| `department` | string | `MUNICIPAL` |
| `status` | string | `open` |
| `language` | string | `hi` |
| `page` | number | `1` |
| `limit` | number | `20` |

**Response:**
```json
{
  "tickets": [...],
  "total": 142,
  "page": 1
}
```

#### `GET /tickets/:id`

Single ticket with its call and transcript.

**Response:**
```json
{
  "ticket": { ... },
  "call": { "duration_seconds": 73, "language_detected": "hi" },
  "transcripts": [
    { "speaker": "ai", "text": "Namaste! Aap kya problem report karna chahte hain?", "created_at": "..." },
    { "speaker": "citizen", "text": "Meri gali mein ek bada gadhha hai", "created_at": "..." },
    ...
  ]
}
```

#### `PATCH /tickets/:id`

Update ticket status or assignment.

**Request body:**
```json
{
  "status": "resolved",
  "assigned_to": "admin-user-uuid"
}
```

#### `GET /departments`

Returns all 3 departments with their metadata.

---

## 8. Mobile App

### Screens

#### Home Screen (`app/(tabs)/index.tsx`)

- App name + tagline ("Apni Shikayat, Abhi Darj Karein")
- Three department cards (Municipal, Water, Electricity) with icons
- Tapping a card → language picker modal → starts call
- Bottom tab: Home | My Reports

#### Call Screen (`app/call/[room].tsx`)

- Animated waveform (pulsing when AI is speaking)
- Department name + language shown at top
- Status text: "Connecting..." → "Effi is listening..." → "Effi is speaking..."
- Mute button
- End Call button (red)
- On end: shows "Ticket Submitted" card with ticket reference number

#### My Reports Screen (`app/(tabs)/reports.tsx`)

- List of past tickets (stored locally + fetched from API by phone number)
- Each row: department icon, problem type, date, status badge
- Tap to see details

### LiveKit Integration Flow

```typescript
// services/livekit.ts
async function startCall(department: string, language: string) {
  // 1. Fetch token from backend
  const { token, room_name, ws_url } = await api.post('/calls/token', {
    department, language
  });

  // 2. Join LiveKit room
  const room = new Room();
  await room.connect(ws_url, token);

  // 3. Enable microphone
  await room.localParticipant.setMicrophoneEnabled(true);

  return { room, room_name };
}
```

### Language Picker

- Shows flag + language name for each supported language
- Defaults to Hindi
- Selection is stored in AsyncStorage for next time
- Language code is passed to backend when requesting token
- Backend passes it to the agent as room metadata

### Supported Languages (Mobile)

| Display Name | Code | Script shown in picker |
|---|---|---|
| English | en | English |
| Hindi | hi | हिन्दी |
| Tamil | ta | தமிழ் |
| Bengali | bn | বাংলা |
| Telugu | te | తెలుగు |
| Gujarati | gu | ગુજરાતી |
| Kannada | kn | ಕನ್ನಡ |
| Malayalam | ml | മലയാളം |
| Marathi | mr | मराठी |
| Punjabi | pa | ਪੰਜਾਬੀ |

---

## 9. Admin Dashboard

### Authentication

- Supabase Auth (email + password)
- `middleware.ts` checks session; redirects unauthenticated users to `/login`
- Session managed via Supabase SSR cookie helpers

### Pages

#### `/dashboard` — Overview

**Stats cards (top row):**
- Total tickets today
- Open tickets
- Tickets resolved today
- Average call duration

**Charts (below):**
- Tickets by department (pie chart)
- Tickets by language (bar chart)
- Ticket volume over last 7 days (line chart)

**Recent activity:** Last 10 tickets as a mini-table

#### `/dashboard/tickets` — Ticket List

- Full table with columns: ID, Department, Language, Problem Type, Location, Status, Priority, Created At
- Filters: Department (dropdown), Status (dropdown), Language (dropdown), search
- Status badges: open (yellow), in_progress (blue), resolved (green), escalated (red)
- Supabase Realtime subscription: new tickets appear instantly without refresh
- Pagination: 20 per page

#### `/dashboard/tickets/[id]` — Ticket Detail

**Left panel — Ticket Info:**
- All ticket fields
- Status dropdown (can be changed inline → Server Action updates DB)
- Assign to admin dropdown
- Priority selector
- Created at / Updated at

**Right panel — Call & Transcript:**
- Call duration, detected language, call start time
- Full transcript in a scrollable view:
  - Citizen messages: right-aligned, gray bubble
  - AI messages: left-aligned, indigo bubble
  - Timestamps on each bubble

**Action buttons (bottom):**
- Mark as Resolved
- Escalate
- Add internal note (future)

---

## 10. Multilingual Support

### Strategy

Each layer handles language independently but consistently:

```
Citizen speaks in Hindi
  → Deepgram detects "hi" automatically (detect_language: true)
  → Transcript saved with language="hi"
  → GPT-4o sees "hi" transcript → responds in Hindi
  → Response language tag "hi" sent to Cartesia
  → Cartesia renders Hindi audio with native voice
```

### Deepgram Config

```typescript
const deepgramOptions = {
  model: 'nova-2',
  detect_language: true,          // auto-detect
  punctuate: true,
  smart_format: true,
  interim_results: true,          // for real-time feel
  utterance_end_ms: 1000,         // end of utterance detection
};
```

**Note:** Deepgram `nova-2` supports Hindi, Tamil, and other Indian languages. For best accuracy, if the citizen pre-selects their language in the app, we pass it explicitly: `language: 'hi'` instead of using auto-detect.

### Cartesia Config

```typescript
const cartesiaOptions = {
  model_id: 'sonic-3',
  language: detectedLanguage,     // "hi", "ta", "mr", etc.
  voice: { mode: 'id', id: VOICE_IDS[detectedLanguage] },
  output_format: {
    container: 'raw',
    encoding: 'pcm_s16le',
    sample_rate: 16000
  }
};
```

### Voice IDs per Language

We use Cartesia's pre-built voices. These should be verified in the Cartesia dashboard and stored in the agent's config:

```typescript
// agent/config.ts
export const CARTESIA_VOICE_IDS: Record<string, string> = {
  en: 'CARTESIA_VOICE_ID_EN',
  hi: 'CARTESIA_VOICE_ID_HI',
  ta: 'CARTESIA_VOICE_ID_TA',
  bn: 'CARTESIA_VOICE_ID_BN',
  te: 'CARTESIA_VOICE_ID_TE',
  gu: 'CARTESIA_VOICE_ID_GU',
  kn: 'CARTESIA_VOICE_ID_KN',
  ml: 'CARTESIA_VOICE_ID_ML',
  mr: 'CARTESIA_VOICE_ID_MR',
  pa: 'CARTESIA_VOICE_ID_PA',
};
```

---

## 11. Department Routing Logic

The LLM handles routing. The system prompt lists all departments and problem types. GPT-4o chooses the correct department based on the conversation.

### Fallback routing (keyword-based)

If the LLM fails or doesn't include a `<ticket>` block within 3 turns, a fallback keyword matcher runs on the transcript:

```typescript
// agent/intent.ts
const DEPARTMENT_KEYWORDS = {
  MUNICIPAL: ['pothole', 'garbage', 'streetlight', 'gadhha', 'kachra', 'batti', 'sadak'],
  WATER:     ['water', 'pani', 'paani', 'nal', 'pipe', 'supply', 'sewage'],
  ELECTRICITY: ['bijli', 'current', 'power', 'light', 'meter', 'watt'],
};

function fallbackRoute(transcript: string): DepartmentCode {
  const lower = transcript.toLowerCase();
  let scores = { MUNICIPAL: 0, WATER: 0, ELECTRICITY: 0 };
  for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[dept as DepartmentCode]++;
    }
  }
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] as DepartmentCode;
}
```

---

## 12. Environment Variables

### apps/backend/.env

```bash
# Server
PORT=3001
NODE_ENV=development

# LiveKit
LIVEKIT_API_KEY=your_livekit_api_key
LIVEKIT_API_SECRET=your_livekit_api_secret
LIVEKIT_URL=wss://your-project.livekit.cloud

# Deepgram
DEEPGRAM_API_KEY=your_deepgram_api_key

# Cartesia
CARTESIA_API_KEY=your_cartesia_api_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # backend uses service role (bypasses RLS)
```

### apps/admin/.env.local

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # server-side only
```

### apps/mobile/.env

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3001     # or ngrok URL for device testing
```

### Where to get keys

| Service | URL |
|---|---|
| LiveKit | https://cloud.livekit.io — create a project, get API key + secret + WSS URL |
| Deepgram | https://console.deepgram.com — create API key |
| Cartesia | https://play.cartesia.ai — create API key, browse voices by language |
| OpenAI | https://platform.openai.com/api-keys |
| Supabase | https://supabase.com/dashboard — create project, get URL + anon key + service role key |

---

## 13. Build Sequence

Build in this order to minimize blocked work:

### Phase 1 — Foundation (Day 1)

- [ ] Initialize Turborepo monorepo with pnpm workspaces
- [ ] Create `packages/shared` with TypeScript types
- [ ] Create Supabase project
- [ ] Run all 5 migration SQL files
- [ ] Verify tables + seed data in Supabase dashboard

### Phase 2 — Backend API (Day 1–2)

- [ ] Scaffold Express app (`apps/backend`)
- [ ] `/calls/token` endpoint (LiveKit JWT generation)
- [ ] `/tickets` CRUD endpoints
- [ ] `/departments` endpoint
- [ ] Supabase client setup (`db/supabase.ts`)
- [ ] Test with curl / Postman

### Phase 3 — Voice Agent (Day 2–3)

- [ ] Set up `@livekit/agents` worker in `apps/backend/src/agent/`
- [ ] Configure Deepgram STT plugin
- [ ] Wire up GPT-4o with system prompt
- [ ] Configure Cartesia TTS plugin
- [ ] Implement `<ticket>` block parser
- [ ] Auto-insert ticket on parse
- [ ] Test with LiveKit CLI or playground

### Phase 4 — Mobile App (Day 3–4)

- [ ] Create Expo app (`apps/mobile`)
- [ ] Home screen with 3 department cards
- [ ] Language picker modal
- [ ] Token fetch → LiveKit room join
- [ ] Call screen with waveform animation
- [ ] End call → show ticket confirmation
- [ ] My Reports screen

### Phase 5 — Admin Dashboard (Day 4–5)

- [ ] Create Next.js app (`apps/admin`)
- [ ] Supabase Auth + middleware
- [ ] Login page
- [ ] Dashboard overview with stats
- [ ] Tickets list with Supabase Realtime
- [ ] Ticket detail page with transcript
- [ ] Status update Server Action

### Phase 6 — Integration & Demo Prep (Day 5–6)

- [ ] End-to-end test: call → ticket → admin dashboard
- [ ] Seed realistic demo tickets in all 3 departments
- [ ] Seed demo transcripts
- [ ] Polish mobile UI
- [ ] Polish admin UI
- [ ] Prepare demo script (see Section 15)

---

## 14. Key Data Flows

### Flow 1: Citizen Makes a Call

```
1. Citizen opens app
2. Selects "Municipal Services"
3. Selects language "Hindi"
4. App calls: POST /calls/token { department: "MUNICIPAL", language: "hi" }
5. Backend:
   a. Generates room name: "call-8f3a2c..."
   b. Creates LiveKit JWT
   c. Inserts pending row in `calls` table
   d. Returns { token, room_name, ws_url }
6. App joins LiveKit room with token
7. LiveKit Agent process detects new room → joins
8. Agent greets citizen in Hindi via Cartesia TTS
9. Citizen speaks → Deepgram transcribes → saved to `transcripts`
10. GPT-4o generates response → saved to `transcripts`
11. Agent speaks response via Cartesia
12. ... conversation continues ...
13. GPT-4o returns <ticket> block
14. Agent inserts ticket into `tickets` table
15. Agent tells citizen their ticket number
16. Call ends
17. Agent updates `calls` row: duration, ended_at, status=completed
18. Admin dashboard receives Realtime event → new ticket appears
```

### Flow 2: Admin Resolves a Ticket

```
1. Admin logs into dashboard (Supabase Auth)
2. Sees new ticket in real-time feed
3. Clicks ticket → detail page
4. Reads transcript
5. Clicks "Mark as Resolved"
6. Next.js Server Action: PATCH /tickets/:id { status: "resolved" }
7. Supabase updates ticket
8. Status badge updates on list page
```

---

## 15. Demo Script

For the semester presentation:

### Setup before demo

1. Have admin dashboard open on one screen (logged in)
2. Have mobile app running on a phone or emulator
3. Have 5–10 pre-seeded realistic tickets already in the dashboard
4. Make sure all API keys are valid

### Live demo sequence

**Step 1 — Show the problem (30 sec)**
> "Today in India, if you want to report a pothole, you either visit a government office or call a number that rings for 20 minutes. There's no 24/7 solution, and it only works in English."

**Step 2 — Open the mobile app (1 min)**
> "This is our citizen app. I select Municipal Services, then Hindi — because most citizens in India are more comfortable in their native language."

> Tap "Report Issue" → language picker → Hindi → call starts

**Step 3 — Live call demo (2 min)**
> Speak in Hindi: "Meri gali mein ek bada gadhha hai, log gir rahe hain"
> (My street has a big pothole, people are falling)

> AI responds in Hindi, asks for location

> Respond: "Andheri West, Lokhandwala main road ke paas"

> AI confirms, says ticket is being created

> End call

**Step 4 — Show the ticket appeared (30 sec)**
> Switch to admin dashboard — new ticket is live in the feed, in real-time, no refresh needed

**Step 5 — Show ticket detail (1 min)**
> Click the ticket → show full Hindi transcript, AI-extracted location, department auto-classified as Municipal

> Click "Mark as Resolved" → status updates instantly

**Step 6 — Show stats (30 sec)**
> Go back to overview — show charts, dept breakdown, language breakdown

**Total demo time: ~5–6 minutes**

---

## Notes & Decisions Log

| Date | Decision | Reason |
|---|---|---|
| Mar 2026 | Expo managed workflow | Fastest to build for demo, LiveKit RN SDK supports it |
| Mar 2026 | Supabase Auth for admin only | Citizens don't need accounts — phone number is sufficient identifier |
| Mar 2026 | Node.js agent (not Python) | Keeps stack uniform, `@livekit/agents` Node SDK is mature enough |
| Mar 2026 | Cartesia sonic-3 | Only TTS provider with native Hindi/Tamil/Bengali/Telugu/Gujarati/Kannada/Malayalam/Marathi/Punjabi support |
| Mar 2026 | Deepgram nova-2 with detect_language | Better than Whisper for streaming real-time STT with Indian accents |
| Mar 2026 | GPT-4o for routing | Handles Hinglish, code-switching, and structured JSON extraction reliably |
| Mar 2026 | Turborepo + pnpm | Shared types between mobile, admin, and backend without duplication |
| Mar 2026 | No citizen auth | Demo scope — phone number used as soft identifier only |
| Mar 2026 | 3 departments only | Manageable scope for semester project, covers most urban civic pain points |
