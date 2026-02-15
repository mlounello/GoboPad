import type { GeneratedVariant } from "@/lib/padder";

const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const GOOGLE_API_SCRIPT = "https://apis.google.com/js/api.js";
const DRIVE_SCOPE = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata.readonly"
].join(" ");

export type DriveFolder = {
  id: string;
  name: string;
};

export type DriveUser = {
  displayName: string;
  emailAddress: string;
};

export class DriveUploadError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DriveUploadError";
    this.status = status;
  }
}

function sanitizeDriveName(raw: string): string {
  const cleaned = raw.trim().replace(/[\x00-\x1f/\\]+/g, "_");
  return cleaned || "output.jpg";
}

export async function ensureGoogleIdentityScript(): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
  if (existing) {
    if (window.google?.accounts?.oauth2) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity script.")), {
        once: true
      });
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity script."));
    document.head.appendChild(script);
  });
}

export async function ensureGoogleApiScript(): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>('script[data-google-api="true"]');
  if (existing) {
    if (window.gapi?.load) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google API script.")), { once: true });
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_API_SCRIPT;
    script.async = true;
    script.defer = true;
    script.dataset.googleApi = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google API script."));
    document.head.appendChild(script);
  });
}

export async function requestGoogleDriveAccessToken(clientId: string, prompt: "" | "consent" = "consent"): Promise<string> {
  if (!clientId.trim()) {
    throw new Error("Missing Google client ID. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID.");
  }

  await ensureGoogleIdentityScript();
  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google OAuth client is unavailable in this browser.");
  }

  return await new Promise<string>((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error || "Google sign-in did not return an access token."));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: () => reject(new Error("Google sign-in failed."))
    });
    tokenClient.requestAccessToken({ prompt });
  });
}

export async function renewGoogleDriveAccessToken(clientId: string): Promise<string> {
  return await requestGoogleDriveAccessToken(clientId, "");
}

export function disconnectGoogleToken(accessToken: string): void {
  if (!window.google?.accounts?.oauth2 || !accessToken) {
    return;
  }
  window.google.accounts.oauth2.revoke(accessToken);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read blob for Drive upload."));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read blob for Drive upload."));
    reader.readAsDataURL(blob);
  });
}

export async function uploadVariantsToGoogleDrive(
  variants: GeneratedVariant[],
  accessToken: string,
  folderId: string,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const total = variants.length;
  let done = 0;
  const parent = folderId.trim();

  for (const variant of variants) {
    const fileName = sanitizeDriveName(variant.fileName);
    const metadata: { name: string; parents?: string[] } = { name: fileName };
    if (parent) {
      metadata.parents = [parent];
    }

    const base64Data = await blobToBase64(variant.blob);
    const boundary = `gobopad-${crypto.randomUUID()}`;
    const delimiter = `--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartBody =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      "\r\n" +
      delimiter +
      "Content-Type: image/jpeg\r\n" +
      "Content-Transfer-Encoding: base64\r\n\r\n" +
      base64Data +
      closeDelimiter;

    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    });

    if (!response.ok) {
      const body = await response.text();
      throw new DriveUploadError(`Drive upload failed for ${fileName}: ${body || response.statusText}`, response.status);
    }

    done += 1;
    onProgress?.(done, total);
  }
}

export async function getDriveUser(accessToken: string): Promise<DriveUser> {
  const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Unable to fetch Drive account: ${body || response.statusText}`);
  }
  const data = (await response.json()) as { user?: DriveUser };
  if (!data.user) {
    throw new Error("Unable to determine connected Drive account.");
  }
  return data.user;
}

export async function createDriveFolder(
  accessToken: string,
  folderName: string,
  parentFolderId: string
): Promise<DriveFolder> {
  const metadata: { name: string; mimeType: string; parents?: string[] } = {
    name: folderName.trim() || "gobopad-output",
    mimeType: "application/vnd.google-apps.folder"
  };

  if (parentFolderId.trim()) {
    metadata.parents = [parentFolderId.trim()];
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8"
    },
    body: JSON.stringify(metadata)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Unable to create Drive folder: ${body || response.statusText}`);
  }

  const data = (await response.json()) as DriveFolder;
  return {
    id: data.id,
    name: data.name
  };
}

async function loadPickerModule(): Promise<void> {
  await ensureGoogleApiScript();
  if (!window.gapi?.load) {
    throw new Error("Google API client unavailable.");
  }

  await new Promise<void>((resolve) => {
    window.gapi!.load("picker", () => resolve());
  });
}

export async function pickDriveFolder(accessToken: string, apiKey: string): Promise<DriveFolder | null> {
  if (!apiKey.trim()) {
    throw new Error("Missing Google API key. Set NEXT_PUBLIC_GOOGLE_API_KEY.");
  }

  await loadPickerModule();
  if (!window.google?.picker) {
    throw new Error("Google Picker is unavailable.");
  }

  return await new Promise<DriveFolder | null>((resolve) => {
    const view = new window.google!.picker!.DocsView(window.google!.picker!.ViewId.FOLDERS);
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(true);
    view.setMimeTypes("application/vnd.google-apps.folder");

    const picker = new window.google!.picker!.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setOrigin(window.location.origin)
      .setCallback((data) => {
        if (data.action === window.google!.picker!.Action.PICKED && data.docs && data.docs.length > 0) {
          const first = data.docs[0];
          resolve({ id: first.id, name: first.name });
          return;
        }
        if (data.action === window.google!.picker!.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    picker.setVisible(true);
  });
}
