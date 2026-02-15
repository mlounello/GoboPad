# Google Drive Setup (Client-Only)

## 1. Create OAuth Client

1. Open Google Cloud Console.
2. Create or select a project.
3. Enable the Google Drive API.
4. Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized JavaScript origins:
     - `http://localhost:3000`
     - `https://gobopad.mlounello.com` (when deployed)
5. Copy the client ID.

## 2. Configure Local Env

Create `/Users/mikelounello/Documents/GoboPad/apps/web/.env.local` with:

```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_oauth_client_id
NEXT_PUBLIC_GOOGLE_API_KEY=your_google_api_key
```

## 2.1 Create API Key (for visual folder picker)

1. In Google Cloud Console, open APIs & Services > Credentials.
2. Create API key.
3. Restrict the key:
   - Application restrictions: HTTP referrers
   - Allowed referrers:
     - `http://localhost:3000/*`
     - `https://gobopad.mlounello.com/*`
4. API restrictions:
   - Restrict key to Google Drive API.

## 3. What The App Uses

- OAuth scopes:
  - `https://www.googleapis.com/auth/drive.file`
  - `https://www.googleapis.com/auth/drive.metadata.readonly`
- Upload mode: direct browser upload to Drive API (no backend relay)
- Folder destination:
  - Visual Google Picker folder chooser (requires `NEXT_PUBLIC_GOOGLE_API_KEY`)
  - If blank, uploads to My Drive root
- Local persistence:
  - Remembers selected destination folder on this device
  - Attempts silent reconnect on return (when browser Google session is active)
