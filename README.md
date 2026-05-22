# Effi India 🇮🇳

Effi India is an AI-assisted, multilingual civic complaint system designed to streamline the reporting and resolution of public issues (like potholes, sanitation, and power outages). Citizens can bypass complex forms and simply converse with an AI voice agent in their local language to log complaints effectively with real-time evidence.

## 🏗️ Project Architecture

This repository is a monorepo consisting of several independent yet deeply integrated services:

### 1. **Mobile App** (`/mobile`)
An end-user mobile application built with **Expo React Native**. It allows citizens to seamlessly log in, view nearby issues, and initiate a LiveKit voice call with the AI agent. It actively interacts with the conversational AI by listening to RPC (Remote Procedure Call) commands for actions like capturing hardware GPS coordinates or taking photo evidence.

### 2. **AI Voice Agent** (`/agent`)
The backend conversational brain built with **Node.js, TypeScript, and LiveKit**. 
- Handles the Audio stream, VAD (Voice Activity Detection), STT (Multi-language transcription via Deepgram).
- Uses OpenAI GPT-4o for dynamic reasoning and Cartesia for regional Text-To-Speech.
- Enforces logic paths (e.g. asking for photos if the complaint category is `Pothole`) and triggers RPC calls to the user's mobile app.
- Finally writes the compiled complaint into the database using Supabase.

### 3. **Admin Dashboard** (`/dashboard`)
A **Next.js 16** (App Router) web application featuring Tailwind CSS and shadcn/ui. Built for government or administrative personnel to view, track, and manage incoming complaints in real-time. Connected securely to Supabase and styled for rapid administrative action.

### 4. **Token Server** (`/token-server`)
A **Vercel Serverless Function** providing secure LiveKit JWT access tokens for the mobile client. It intercepts incoming client requests, validates their Supabase auth session, issues a connection token with metadata about the caller (category, language), and returns it to the client.

### 5. **Database Setup** (`/supabase`)
Contains the Postgres migration files, Row Level Security (RLS) policies, Custom RPC functions, and Storage buckets configuration required for setting up the Supabase backend.

---

## 💻 Tech Stack

- **Frontend / Client:** React Native, Expo, React 19, Next.js (App Router), Tailwind CSS v4, shadcn/ui.
- **AI / Voice Infrastructure:** LiveKit Agents framework, Deepgram (STT), OpenAI (LLM), Cartesia (TTS).
- **Backend / Authentication:** Node.js, Vercel Serverless, Supabase (Postgres, Storage, Auth).

---

## 🚀 Getting Started

There is no central unified script to run all apps at once; each service should be started individually from its respective directory.

### Prerequisites
Ensure you have `pnpm` and `Node.js` installed. A configured Supabase project and LiveKit Cloud instance are required.

### 1. Start the Voice Agent
```bash
cd agent
pnpm install
pnpm run dev
```

### 2. Start the Admin Dashboard
```bash
cd dashboard
pnpm install
pnpm run dev
```

### 3. Start the Mobile Client
```bash
cd mobile
pnpm install
pnpm run start # Start the Expo server
pnpm run ios   # Or pnpm run android
```

### 4. Database Schema
To prepare the database:
Navigate to the `/supabase/migrations/` directory and run all `.sql` scripts sequentially against your Supabase Postgres database.

---

## 📖 Development Workflows & Standards

- **Locational Data & Evidence:** The architecture favors hardware device location capabilities (triggered via Remote Procedure Calls) rather than transcribed spoken locations. Photo evidence is uploaded to Supabase Storage by the client, and the agent ties the Storage path to the Postgres record.
- **Next.js Conventions:** For the admin panel inside `/dashboard`, follow Next.js App Router guidelines and utilize Next.js Server Actions for mutations.
- **AI Agent Tooling:** Tooling definitions and the integration logic for handling LLM tool calls reside in `agent/src/tools.ts` and `agent/src/agent.ts`.

See [PROJECT.md](PROJECT.md) and [AGENTS.md](AGENTS.md) for more in-depth operational instructions.
