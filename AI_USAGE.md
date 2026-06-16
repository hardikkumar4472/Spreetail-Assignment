# AI_USAGE.md: AI Collaborator Log

This document records how I utilized the Antigravity AI coding assistant during the development of the SplitFlat features integration. The agent acted as an advanced pair-programming partner—assisting in system design, database modeling, frontend integration, and troubleshooting stack traces.

---

## 1. Role & Strategy
- **Tools Used:** Antigravity (Advanced Agentic Coding Pair) for full-stack tasks execution, plan generation, and schema validation.
- **My Role:** Product Owner and System Architect. I defined the database schemas, timeline constraints, and made key design decisions.
- **AI's Role:** Executing the code modifications, implementing the pairwise audit ledger and chat services, updating dependencies, and building clean UI blocks within custom CSS themes.

---

## 2. Advanced Prompting & Collaboration

Rather than writing unstructured code blocks, we utilized detailed planning and isolated tasks to complete complex integrations:

### Example: Timeline Interception & Date Boundaries
*   **The Problem:** Dynamic residency timelines (Meera moving out, Sam moving in) needed validation during CSV uploads.
*   **The Collaboration:** We isolated the residency verification rules inside `server/services/parser.js` by checking active dates (`joinedAt`, `leftAt`) during CSV parsing and flagging them as `INACTIVE_MEMBER_SPLIT_MEERA` or `INACTIVE_MEMBER_SPLIT_SAM` exceptions.

### Example: LLM Context Assembly
*   **The Collaboration:** We compiled the entire real-time database state (users, active groups, chronological settlements, simplified debt flows) into a structured system prompt, providing Gemini 2.5 Flash with complete contextual integrity to run semantic ledger queries without vector search or SQL injection risks.

---

## 3. Concrete Debugging & Troubleshooting

### Case 1: Non-Interactive Environment Migration Failure
*   **The Challenge:** The agent proposed running `npx prisma migrate dev` to update the Neon PostgreSQL DB with new import job models. However, the command failed because the remote task runner is a non-interactive shell.
*   **The Resolution:** We adapted by running `npx prisma db push`, which successfully synced the database schemas directly to Neon Tech, generated the prisma client, and unblocked server development immediately.

### Case 2: Custom CSS Theme Adaptation
*   **The Challenge:** The reference codebase used Tailwind CSS v4. However, the SplitFlat project styling was built around custom cozy CSS variables (`--bg-primary`, `--accent-color`).
*   **The Resolution:** The agent adapted and wrote pure vanilla React and custom CSS layouts matching the aesthetic variables. This retained SplitFlat's identity and avoided introducing Tailwind dependency bloat.

### Case 3: Pairwise Ledger Date Sorting
*   **The Challenge:** Combining payments and expense splits from separate queries led to mixed-up timelines.
*   **The Resolution:** We sorted the final combined ledger list in JavaScript before calculating the running balance. This ensured a chronologically sound audit trail.
