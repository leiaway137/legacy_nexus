# Project State: Legacy Nexus

## Project Overview
Legacy Nexus is a digital ecosystem dedicated to preserving and cross-referencing personal histories, life wisdom, and generational stories. It utilizes a **Transcript-Only architecture** to minimize storage costs and maximize searchability. 

## Core Features
1. **The 'Transcript-Only' Architecture**: Audio/video is discarded after transcription to maintain a near-zero cost storage footprint while allowing deep indexing.
2. **AI Interviewer**: Dynamic, context-aware AI sessions (powered by Gemini/local LLMs) that generate customized follow-up questions for the LegacyKeeper based on past interactions.
3. **Source-Grounded Insights**: RAG pipelines (NotebookLM-style) generate wisdom and synthesize experiences directly and exclusively from uploaded user transcripts.
4. **NexusLink**: An organic, grassroots expansion strategy. The AI extracts names of referenced individuals, cross-references them against the global user base, and either alerts existing users or sends email invitations to non-users to contribute their perspective on shared events.

## Current Infrastructure & Tech Stack
The project was recently migrated to a fully local development infrastructure to avoid cloud costs.
- **Framework**: Next.js 16.2.2 (App Router)
- **UI/Styling**: React 19, Tailwind CSS v4, Framer Motion, Radix UI.
- **Authentication**: NextAuth.js
- **Database (Relational)**: `better-sqlite3` (Replaced MongoDB)
- **Vector Database**: `@lancedb/lancedb` (Replaced Pinecone)
- **AI Models**: Google Gemini via `@google/genai` and `@ai-sdk/openai` connecting to LM Studio/vLLM for local LLM routing.
- **Document Processing**: `pdf-parse`

## Recent Major Transitions
- **Local Database Migration**: The application was decoupled from MongoDB and Pinecone. It now uses a `.data/` directory at the project root to store its local SQLite database (`nexus.db`) and LanceDB vector store (`vector-store/`).
- **Local LLM Integration**: The project has been refactored to support routing standard LLM requests to local hardware (e.g., RTX 6000 running Qwen models) to drastically lower token costs during prototyping and deep RAG synthesis.
