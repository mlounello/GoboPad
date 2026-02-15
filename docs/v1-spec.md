# GoboPad Web App V1 Spec

## Product Goal

Convert the desktop gobo padding workflow into a branded web application hosted at:

- https://gobopad.mlounello.com

## User Goal

Given one or more images, users can generate multiple padded JPEG variants where the source image occupies configured percentages of the output frame, then download all results or send them to Google Drive.

## Primary Flows

1. Upload image(s)
2. Configure sizes/quality/prefix behavior
3. Preview one sample output
4. Generate variants locally in browser
5. Download ZIP or upload to Google Drive

## V1 In Scope

- Multi-image upload (drag/drop and picker)
- Size presets and custom size entry
- JPEG quality control (1-100)
- Prefix mode:
  - Infer from filename
  - Global custom override
- Determinate progress during generation
- ZIP export (local download)
- Optional Google Drive direct upload
- Branded responsive UI (desktop/mobile)

## V1 Out of Scope

- Multi-user accounts
- Shared history/projects
- Server-side image rendering
- Billing/subscriptions
- Team roles/permissions

## Functional Rules

- No resampling of original pixels
- Each percent `p` computes:
  - `frame_w = round(orig_w / (p / 100))`
  - `frame_h = round(orig_h / (p / 100))`
- Output canvas fill: black (`#000000`)
- Original image centered in output frame
- Output format: JPEG
- Output filename pattern: `PREFIX{percent}.jpg`

## Limits (Cost + Stability Guardrails)

- Maximum files per batch: 25
- Maximum single image dimension: 8000 x 8000
- Maximum total pixels per batch: 120 million
- Maximum generated outputs per batch: 250

## Error Handling

- Reject unsupported file types with clear message
- Reject invalid size entries (`1..100` only)
- Show per-file errors without stopping entire batch
- Offer retry for failed Drive uploads

## Google Drive (Optional in V1)

- OAuth with PKCE
- Requested scope: `drive.file`
- Let user choose destination folder
- Upload generated outputs directly from browser

## Non-Functional Requirements

- Responsive layout at 360px and above
- Keyboard-accessible controls
- Color contrast compliant for primary actions and text
- No persistent backend dependency for core generation flow

## Success Criteria

- User can process and export variants in under 2 minutes for typical phase-1 batch
- Zero backend compute needed for base generation
- End-to-end flow works at production domain
