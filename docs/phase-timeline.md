# GoboPad Web App Timeline (V1)

Date baseline: February 15, 2026
Planned kickoff: February 16, 2026

## Constraints

- Hosting: Vercel (free tier) behind Cloudflare DNS
- Cost goal: near-zero incremental monthly cost
- Phase 1 audience: internal company usage only
- Data retention: none required
- Expected volume: approximately two images per week

## Architecture Decision (Locked for V1)

- Client-only processing in browser (no processing backend)
- Stateless operation (no database required)
- Optional direct Google Drive upload from browser
- Local ZIP export

## Phase Schedule

### Phase 0: Kickoff and Inputs

- Dates: February 16, 2026 (0.5 day)
- Deliverables:
  - Final v1 scope lock
  - Brand inputs lock (colors, fonts, logo usage)
  - Guardrails lock (file limits, dimension limits, quality limits)

### Phase 1: Branded UI Foundation

- Dates: February 16-17, 2026 (1.5 days)
- Deliverables:
  - Next.js app shell
  - Design tokens (color, typography, spacing, radius, shadows)
  - Responsive layout scaffolding for upload/settings/progress/results

### Phase 2: Browser Processing Pipeline

- Dates: February 18-19, 2026 (2 days)
- Deliverables:
  - TypeScript port of gobo padding logic
  - Batch processing with progress and cancellation
  - Stable output naming and validation

### Phase 3: Export and UX Polish

- Dates: February 20, 2026 (1 day)
- Deliverables:
  - ZIP creation and local download
  - Preview and output summary
  - Error states and user guidance copy

### Phase 4: Google Drive Integration

- Dates: February 23-24, 2026 (2 days)
- Deliverables:
  - Google OAuth (PKCE) flow
  - Folder selection and direct upload
  - Upload result reporting and retry behavior

### Phase 5: QA and Launch

- Dates: February 25-26, 2026 (2 days)
- Deliverables:
  - Cross-browser test pass (Chrome, Safari, Edge)
  - Performance/stability pass under phase-1 usage conditions
  - Production deployment and domain cutover to gobopad.mlounello.com

## Total Duration

- Estimated: 8 to 9 working days

## Scope Cut Option

If schedule compresses, move Google Drive to v1.1 and launch by February 23, 2026 with:

- Upload
- Settings
- Preview
- Browser processing
- ZIP download
