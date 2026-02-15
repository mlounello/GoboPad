# Build Checklist (Execution Order)

## Day 1 Start

- [ ] Initialize Next.js TypeScript app in `/Users/mikelounello/Documents/GoboPad/apps/web`
- [ ] Add baseline lint/format config
- [ ] Create design token file (`colors`, `fonts`, `spacing`, `radius`, `shadow`)
- [ ] Create app shell routes and layout:
  - Upload
  - Settings
  - Progress
  - Results

## UI and UX

- [ ] Build drag/drop upload component
- [ ] Build size preset chips and custom size input
- [ ] Build quality slider with numeric field
- [ ] Build prefix mode selector
- [ ] Build preview card (source vs padded output)
- [ ] Build progress list and status messages

## Processing Engine (Client-Side)

- [ ] Port `parse_sizes` to TypeScript utility
- [ ] Port canvas size calculation utility
- [ ] Implement browser image decode path
- [ ] Implement black-canvas compose and JPEG export
- [ ] Implement batch generation with cancellation
- [ ] Implement deterministic filename generation

## Export

- [ ] Add ZIP packaging utility
- [ ] Add download flow and browser compatibility checks
- [ ] Add post-run summary (count, names, failures)

## Google Drive

- [ ] Create Google Cloud OAuth client
- [ ] Implement frontend PKCE login flow
- [ ] Implement Drive folder picker
- [ ] Implement file upload to selected folder
- [ ] Add retry/failure statuses

## QA

- [ ] Functional tests with real sample files
- [ ] Chrome/Safari/Edge validation
- [ ] Mobile viewport validation
- [ ] Test guardrails (too many files, huge dimensions, invalid sizes)

## Deploy

- [ ] Deploy app to Vercel free tier
- [ ] Configure Cloudflare DNS for `gobopad.mlounello.com`
- [ ] Set production environment variables (Google OAuth keys)
- [ ] Run production smoke test

## Post-Launch (V1.1 Candidates)

- [ ] Saved presets
- [ ] Project history
- [ ] Optional server-mode processing for huge batches
