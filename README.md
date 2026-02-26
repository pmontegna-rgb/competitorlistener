# Competitor & Partner News

Minimal monitor for restaurant POS competitors and partners.

## Requirements implemented

- RSS feed collection for competitors and partners
- Web scrapers/listeners for competitors and partners
- LinkedIn listeners for competitors and partners (company + employee-oriented LinkedIn discovery feeds)
- Top 10 restaurant POS competitors (SpotOn excluded)
- Partner focus list:
  - Shogo
  - Davo
  - Chowly
  - Margin Edge
  - Reddie
  - 7shifts
  - DoorDash
  - Uber Eats
  - Popmen
  - Loman
  - Parafin
  - Deliverect
- Filter by group: Competitor vs Partner
- Filter by individual entity
- Filter by channel and announcement class
- Date range filter: start and end date (calendar)
- Strategic-only mode (product/business/partnership classes)
- Strict confidence gate: only returns items with confidence >= 80%
- Impact scores removed
- Tags removed except POS/Partner label
- Timestamp shown as event date (feed publish date, page update/change date, or LinkedIn event date)
- Minimalist clickable posts
- No paid services used
- Announcement classifier categories:
  - product_announcement
  - business_announcement
  - partnership_agreement
  - pricing_update
  - leadership_hiring
  - press_coverage
  - general_update
- Analyst Note summary on each card:
  - What happened
  - Why it matters
  - What to watch
- Persistent change memory for analysis:
  - version history per source URL (`snapshotHistory`)
  - observation timeline (`observations`)

## Run

```bash
npm start
```

Open:

- `http://localhost:8787`

Manual collection run:

```bash
npm run collect
```

## API

- `GET /api/feed`
  - Query: `group`, `entity`, `channel`, `announcement`, `strategicOnly`, `start`, `end`, `search`, `limit`
- `POST /api/refresh`
- `GET /api/meta`
- `GET /api/history`
  - Query: `entity`, `channel`, `url`, `limit`

## Environment

See `.env.example`:

- `PORT`
- `REFRESH_HOURS`
- `DATA_FILE`
- `MAX_ITEMS`
- `FETCH_TIMEOUT_MS`
- `MIN_CONFIDENCE` (default `0.8`)
- `MAX_HISTORY_PER_SOURCE` (default `80`)
- `MAX_OBSERVATIONS` (default `12000`)
- `AI_NOTES_MODE` (`rules` or `openai`)
- `OPENAI_API_KEY` (required only when `AI_NOTES_MODE=openai`)
- `OPENAI_MODEL` (default `gpt-5`)
- `MAX_AI_NOTES_PER_RUN` (default `25`)

The server auto-loads a local `.env` file at startup.

## Vercel deployment

1. Push repo to GitHub.
2. Import repo in Vercel.
3. Set environment variables from `.env` in Vercel project settings.
4. Deploy.

`vercel.json` includes:
- Node 20 runtime for `api/*.js`

### Important persistence note

This app currently persists state in `data/store.json`.  
On Vercel, filesystem state is ephemeral, so historical memory may reset between deployments/invocations.

For durable Vercel persistence, next step is moving store/state to a hosted DB/KV/object store.

Collection on Vercel is manual for this POC:
- Click `Refresh` in the UI, or
- call `POST /api/refresh`
