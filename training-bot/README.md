# SiteZeus BDR Training Bot

AI-powered cold-call training platform for SiteZeus Business Development Representatives.

## Overview

This platform helps BDRs practice cold calls against realistic AI prospects, scored using configurable rules and SiteZeus-specific company context. It integrates with HubSpot to import successful "Meeting Scheduled" calls as training examples.

### Key Features

- **Practice Calls**: Simulated cold calls against AI prospects with persona-specific behavior
- **Three Personas**: Chief Development Officer, Director of Real Estate, Director of Franchise Development
- **Configurable Scoring**: 8-category rubric with detailed feedback and improvement suggestions
- **HubSpot Integration**: Import successful calls, transcripts, and contact data
- **Training Library**: Upload docs, manage knowledge base, tag by persona/objection
- **Rules Engine**: Admin-configurable scoring rubric, keywords, banned phrases, objection rules
- **Company Context**: SiteZeus positioning, value props, competitor notes, discovery questions
- **Role-Based Access**: Admin, Manager, and Trainee roles with appropriate permissions

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI**: TailwindCSS + shadcn/ui
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: Auth.js (NextAuth v5)
- **AI**: Provider-agnostic (Anthropic Claude / OpenAI GPT-4o)
- **Validation**: Zod
- **Testing**: Vitest

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (with pgvector extension recommended)
- An API key for Anthropic or OpenAI
- HubSpot access token (for CRM integration)

## Quick Start

### 1. Clone and install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required
DATABASE_URL="postgresql://user:password@localhost:5432/bdr_training?schema=public"
AUTH_SECRET="generate-with: openssl rand -base64 32"

# AI Provider (choose one)
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="sk-ant-..."
# OR
AI_PROVIDER="openai"
OPENAI_API_KEY="sk-..."

# HubSpot (optional for MVP, required for sync)
HUBSPOT_ACCESS_TOKEN="pat-..."
```

### 3. Set up database

```bash
npm run setup
```

This generates the Prisma client, pushes the schema, and seeds default data including:
- Admin user (admin@sitezeus.com / changeme123)
- Demo trainee (trainee@sitezeus.com / trainee123)
- Default scoring rules
- SiteZeus company context
- Objection handling training content

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | NextAuth secret key |
| `AUTH_URL` | No | App URL (default: http://localhost:3000) |
| `AI_PROVIDER` | Yes | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | If using Anthropic | Anthropic API key |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI API key |
| `EMBEDDING_PROVIDER` | No | `openai` or `none` (default: none) |
| `HUBSPOT_ACCESS_TOKEN` | For sync | HubSpot private app token |
| `HUBSPOT_CLIENT_ID` | For OAuth | HubSpot OAuth client ID |
| `HUBSPOT_CLIENT_SECRET` | For OAuth | HubSpot OAuth client secret |
| `HUBSPOT_REDIRECT_URI` | For OAuth | OAuth callback URL |
| `HUBSPOT_PORTAL_ID` | No | HubSpot portal ID |
| `ADMIN_EMAIL` | No | Initial admin email (default: admin@sitezeus.com) |
| `ADMIN_PASSWORD` | No | Initial admin password (default: changeme123) |

## Scripts

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run setup        # Generate + push schema + seed
npm run db:migrate   # Run Prisma migrations
npm run db:seed      # Seed default data
npm run db:studio    # Open Prisma Studio
npm run test         # Run tests
npm run typecheck    # TypeScript check
npm run lint         # ESLint
```

## App Sections

### For Trainees
- **Dashboard**: Score trends, recent sessions, quick start
- **Practice Call**: Select persona, difficulty, scenario; chat with AI prospect
- **Call Review**: View past sessions with detailed scoring feedback

### For Admins / Managers
- **Training Library**: Manage imported calls and uploaded docs
- **HubSpot Sync**: Import calls with "Meeting Scheduled" outcome
- **Rules**: Configure scoring rubric, keywords, objection handling rules
- **Company Context**: Edit SiteZeus positioning, personas, competitor notes
- **Admin Settings**: Create and manage users

## Security Considerations

- All HubSpot API calls are server-side only; tokens never reach the browser
- Call transcripts and contact data are treated as sensitive
- Trainees can only view their own practice sessions
- Role-based access control on all API routes
- Passwords hashed with scrypt
- Raw HubSpot JSON stored for debugging but hidden from non-admin users
- No secrets logged or exposed in client bundles
- File uploads validated by extension and parsed server-side
- `.env` is gitignored

## Architecture

```
src/
  app/
    (app)/           # Authenticated app pages
      dashboard/     # Dashboard
      practice/      # Practice call UI
      review/        # Call review + scoring display
      library/       # Training library management
      hubspot/       # HubSpot sync config
      rules/         # Scoring rules editor
      context/       # Company context editor
      admin/         # User management
    api/             # API routes
    login/           # Public login page
  components/        # Shared UI components
  lib/
    ai/              # AI provider abstraction + prompt templates
    hubspot/         # HubSpot API client wrapper
    documents/       # Document parser (docx, pdf, txt)
    knowledge/       # Knowledge retrieval utilities
    auth.ts          # Auth.js config
    db.ts            # Prisma client
    password.ts      # Password hashing
    persona-classifier.ts
  generated/prisma/  # Generated Prisma client
prisma/
  schema.prisma      # Database schema
  seed.ts            # Seed script
```

## License

Internal use only - SiteZeus proprietary.
