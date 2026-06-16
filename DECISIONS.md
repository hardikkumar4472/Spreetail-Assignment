# DECISIONS.md: Architectural & System Design Log

This document outlines the core engineering decisions, system design trade-offs, and product logic implemented in SplitFlat.

---

## 1. Stack Selection: Retaining React 18 & Plain CSS
* **Context:** The reference folder utilized React 19 and Tailwind CSS v4, whereas the current codebase ran on React 18 and a customized CSS variables stylesheet.
* **Decision:** We chose to retain React 18 and avoid installing Tailwind CSS.
* **Rationale:** Keeping the technology stack minimal and matching the warm, cozy palette variables (`--bg-primary`, `--accent-color`) keeps client bundle sizes low, preserves visual styling coherence, and prevents hydration or library mismatch issues in React 18 environments.

---

## 2. Pinned Prisma v5.14.0 over Prisma v6
* **Context:** The reference codebase used Prisma v6.19.3. The current codebase was configured with Prisma v5.14.0.
* **Decision:** Retained Prisma v5.14.0.
* **Rationale:** Upgrading Prisma versions changes compiler dependencies and query optimizations. To maintain stability on the existing PostgreSQL Neon database instance, we kept the current version and updated only the schema structures.

---

## 3. Database Sync: db push over migrations
* **Context:** Running `prisma migrate dev` on the remote Neon database failed in a non-interactive shell.
* **Decision:** We used `npx prisma db push`.
* **Rationale:** Pushing schema changes is non-interactive, making it perfect for automated build systems. It directly syncs the tables (`ImportJob`, `ImportAnomaly`) to Postgres without creating migration files that could mismatch between developers.

---

## 4. DB Entity Adaptation: Settlements vs Payments
* **Context:** The reference codebase tracked settling up transactions in a `Payment` table. The current project used the `Settlement` model.
* **Decision:** Mapped all pairwise audit ledger calculations and CSV resolution ingestion routines to the `Settlement` model.
* **Rationale:** By reusing `Settlement` (and mapping relations to `paidBy` and `receivedBy`), we avoided duplicating payment data structures and kept queries clean.

---

## 5. Rohan's Pair-wise Audit Ledger
* **Context:** Rohan requested a "no magic numbers" transparent audit trail showing the exact bills and payments composing any balance between two members.
* **Decision:** Implemented a localizedpairwise ledger algorithm in `services/ledger.js`.
* **Rationale:** The pairwise ledger isolates transactions involving only two selected roommates, displaying chronologically sorted splits, settlements, and a running balance. It explains the exact math behind the debts.

---

## 6. Prompt Context Ingestion for Gemini Assistant
* **Context:** Integrating an AI chat assistant to perform semantic calculations on the ledger.
* **Decision:** We query the full database state and feed it directly into Gemini 2.5 Flash's system prompt.
* **Rationale:** Since flatmate transaction datasets are tiny (well under 100,000 tokens), they fit easily inside Gemini's 1M+ context window. This approach eliminates the need for expensive Vector DB infrastructure or complex RAG setups.
