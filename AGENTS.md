# Effi India — AI Agent Instructions

This project is a multilingual AI-assisted civic complaint system. It contains several related but independent services. 

## Project Architecture & Structure

The codebase is split into the following main directories:

- **`mobile/`**: Expo React Native mobile application for end users.
  - Run app: `pnpm run android` or `pnpm run ios`
- **`agent/`**: LiveKit voice agent built with Node.js and TypeScript. Coordinates the AI conversation, tool execution, and database insertion.
  - Run agent: `pnpm run dev`
- **`dashboard/`**: Next.js 15+ admin web application to view real-time complaints.
  - Run dashboard: `pnpm run dev`
  - *Note*: See [dashboard/AGENTS.md](dashboard/AGENTS.md) for Next.js specific instructions.
- **`token-server/`**: Vercel Serverless Function to generate LiveKit access tokens for the mobile client.
- **`supabase/`**: Database migrations and configuration.

## Development Workflows

- Run each service from its respective directory.
- There is no central unified `package.json` for running everything in parallel yet.
- Follow the conventions outlined in [PROJECT.md](PROJECT.md) for data flow and structural choices. The architecture specifically uses the *device location* triggered via tools (not spoken location) and fetches photo evidence via Supabase Storage for `Sanitation` and `Pothole` categories.

## Commands

- To test the database changes: Execute the `.sql` schema changes located in `/supabase/migrations`.

## Tips

- Always check `PROJECT.md` if deciding on changes related to where address details or images should come from.
- When working on the dashboard, remember it is an App Router Next.js application. Check deprecation usages.
- For LiveKit logic, look closely at `agent/src/agent.ts` and `agent/src/tools.ts`.
