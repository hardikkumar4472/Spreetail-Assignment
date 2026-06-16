# SplitFlat - Shared Flat Expenses Tracker

A specialized shared household expense manager designed for flatmates with variable move-in/move-out timelines.

## Features
- **Smart CSV Ingestion**: Preview uploaded CSV files, automatically resolve duplicate transactions, and fix data inconsistencies.
- **Timeline-Enforced Splitting**: Automatically splits expenses only among flatmates who were actively living in the flat at the time of the transaction.
- **Greedy Debt Simplification**: Simplifies a complex network of debts to minimize the total number of transactions required to settle up.
- **Transparent Audit Trails**: Real-time auditing from overall net balances down to individual pairwise ledger entries.
- **AI Flatmate Assistant**: Ask questions about the flat's balances or transaction history in plain English, powered by Google Gemini.

## Tech Stack
- **Frontend**: React (Vite, TailwindCSS-compatible vanilla styling, Lucide React icons)
- **Backend**: Node.js & Express
- **Database ORM**: Prisma (configured for PostgreSQL)

## Setup & Running Locally

### Backend Setup
1. Navigate to `/server`.
2. Install dependencies: `npm install`
3. Configure your environment variables in `.env`:
   ```env
   PORT=3001
   DATABASE_URL="postgresql://user:pass@host:port/db"
   DEFAULT_USD_RATE=83.5
   GEMINI_API_KEY="your-api-key"
   ```
4. Push the Prisma schema and seed the database:
   ```bash
   npx prisma db push
   node seed.js
   ```
5. Start the server: `npm run dev`

### Frontend Setup
1. Navigate to `/client`.
2. Install dependencies: `npm install`
3. Configure env variables in `.env` (optional):
   ```env
   VITE_API_URL=http://localhost:3001
   ```
4. Start the Vite dev server: `npm run dev`
