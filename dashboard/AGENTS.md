<!-- BEGIN:nextjs-agent-rules -->
# Next.js 16 & React 19 Environment

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Tech Stack Overview
- **Framework**: Next.js 16 (App Router exclusively)
- **UI & Styling**: Tailwind CSS v4, shadcn/ui components (`components/ui`), `radix-ui`, `lucide-react`.
- **Database/Auth**: `@supabase/ssr` for server-side auth & Realtime.

## General Guidelines
- Keep Server Components the default. Only use `"use client"` when interactivity or React hooks are required.
- Place shared utilities in `src/lib/utils.ts`.
- Prefer Tailwind classes over custom CSS. Use Tailwind v4 conventions.
