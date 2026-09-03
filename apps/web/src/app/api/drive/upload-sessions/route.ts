import { createSign } from "crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const MAX_UPLOAD_FILES = 250;
const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;

type UploadFileRequest = {
  clientId: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type UploadSessionRequest = {
  folderName: string;
  files: UploadFileRequest[];
};

type ServiceAccountConfig = {
  kind: "service-account";
  clientEmail: string;
  privateKey: string;
  parentFolderId: string;
};

type OAuthConfig = {
  kind: "oauth";
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  parentFolderId: string;
};

type DriveAuthConfig = OAuthConfig | ServiceAccountConfig;

type TokenCache = {
  cacheKey: string;
  accessToken: string;
  expiresAtMs: number;
};

let tokenCache: TokenCache | null = null;

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sanitizeDriveName(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .replace(/[\x00-\x1f\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .trim();

  return cleaned || fallback;
}

function makeUniqueFileNames(files: UploadFileRequest[]): Array<UploadFileRequest & { driveFileName: string }> {
  const usedNames = new Map<string, number>();

  return files.map((file) => {
    const normalizedName = sanitizeDriveName(file.fileName, "gobopad-output.jpg");
    const priorCount = usedNames.get(normalizedName) ?? 0;
    usedNames.set(normalizedName, priorCount + 1);

    const driveFileName =
      priorCount === 0
        ? normalizedName
        : normalizedName.replace(/\.jpg$/i, `-${priorCount + 1}.jpg`);

    return {
      ...file,
      driveFileName
    };
  });
}

function getDriveAuthConfig(): DriveAuthConfig {
  const oauthClientId = process.env.GOOGLE_DRIVE_CLIENT_ID ?? "";
  const oauthClientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "";
  const oauthRefreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN ?? "";
  const jsonConfig = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const parentFolderId = process.env.GOOGLE_DRIVE_MONOGRAMS_FOLDER_ID ?? "";

  if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
    return {
      kind: "oauth",
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
      refreshToken: oauthRefreshToken,
      parentFolderId
    };
  }

  if (jsonConfig) {
    const parsed = JSON.parse(jsonConfig) as { client_email?: string; private_key?: string };
    return {
      kind: "service-account",
      clientEmail: parsed.client_email ?? "",
      privateKey: parsed.private_key ?? "",
      parentFolderId
    };
  }

  return {
    kind: "service-account",
    clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
    privateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    parentFolderId
  };
}

function validateConfig(config: DriveAuthConfig): void {
  const hasAuth =
    config.kind === "oauth"
      ? Boolean(config.clientId && config.clientSecret && config.refreshToken)
      : Boolean(config.clientEmail && config.privateKey);

  if (!hasAuth || !config.parentFolderId) {
    throw new Error("Drive upload is not configured.");
  }
}

function validateRequest(body: UploadSessionRequest): void {
  if (!body.folderName || !Array.isArray(body.files) || body.files.length === 0) {
    throw new Error("Missing folder name or files.");
  }
  if (body.files.length > MAX_UPLOAD_FILES) {
    throw new Error(`Too many files. Maximum is ${MAX_UPLOAD_FILES}.`);
  }

  const totalBytes = body.files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_UPLOAD_BYTES) {
    throw new Error("Generated files are too large to upload in one batch.");
  }

  for (const file of body.files) {
    if (!file.clientId || !file.fileName || file.mimeType !== "image/jpeg" || file.size <= 0) {
      throw new Error("Only generated JPEG files can be uploaded.");
    }
  }
}

function createJwt(config: ServiceAccountConfig): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const claimSet = {
    iss: config.clientEmail,
    scope: DRIVE_SCOPE,
    aud: TOKEN_URL,
    exp: nowSeconds + 3600,
    iat: nowSeconds
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`;
  const signature = createSign("RSA-SHA256").update(unsignedJwt).sign(config.privateKey);

  return `${unsignedJwt}.${base64Url(signature)}`;
}

async function readGoogleError(response: Response, fallback: string): Promise<string> {
  const raw = await response.text().catch(() => "");
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as { error?: string | { message?: string }; error_description?: string };
    const message =
      typeof parsed.error === "string"
        ? parsed.error_description || parsed.error
        : parsed.error?.message || parsed.error_description;

    return message ? `${fallback}: ${message}` : fallback;
  } catch {
    return `${fallback}: ${raw.slice(0, 240)}`;
  }
}

async function getServiceAccountAccessToken(config: ServiceAccountConfig): Promise<string> {
  const cacheKey = `${config.kind}:${config.clientEmail}`;
  if (tokenCache && tokenCache.cacheKey === cacheKey && tokenCache.expiresAtMs > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: createJwt(config)
    })
  });

  if (!response.ok) {
    throw new Error(await readGoogleError(response, "Unable to authorize Drive upload"));
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Drive authorization did not return an access token.");
  }

  tokenCache = {
    cacheKey,
    accessToken: data.access_token,
    expiresAtMs: Date.now() + (data.expires_in ?? 3600) * 1000
  };

  return data.access_token;
}

async function getOAuthAccessToken(config: OAuthConfig): Promise<string> {
  const cacheKey = `${config.kind}:${config.clientId}`;
  if (tokenCache && tokenCache.cacheKey === cacheKey && tokenCache.expiresAtMs > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    throw new Error(await readGoogleError(response, "Unable to refresh Drive access"));
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Drive authorization did not return an access token.");
  }

  tokenCache = {
    cacheKey,
    accessToken: data.access_token,
    expiresAtMs: Date.now() + (data.expires_in ?? 3600) * 1000
  };

  return data.access_token;
}

async function getAccessToken(config: DriveAuthConfig): Promise<string> {
  if (config.kind === "oauth") {
    return await getOAuthAccessToken(config);
  }

  return await getServiceAccountAccessToken(config);
}

async function createDriveFolder(accessToken: string, folderName: string, parentFolderId: string): Promise<string> {
  const response = await fetch(`${DRIVE_FILES_URL}?fields=id&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: sanitizeDriveName(folderName, "gobopad-output"),
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId]
    })
  });

  if (!response.ok) {
    throw new Error(await readGoogleError(response, "Unable to create Drive subfolder"));
  }

  const data = (await response.json()) as { id?: string };
  if (!data.id) {
    throw new Error("Drive did not return a subfolder ID.");
  }

  return data.id;
}

async function createUploadSession(
  accessToken: string,
  folderId: string,
  file: UploadFileRequest & { driveFileName: string }
): Promise<{ clientId: string; fileName: string; uploadUrl: string }> {
  const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=resumable&fields=id,name&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": file.mimeType,
      "X-Upload-Content-Length": String(file.size)
    },
    body: JSON.stringify({
      name: file.driveFileName,
      mimeType: file.mimeType,
      parents: [folderId]
    })
  });

  const uploadUrl = response.headers.get("location");
  if (!response.ok || !uploadUrl) {
    throw new Error(await readGoogleError(response, `Unable to start Drive upload for ${file.driveFileName}`));
  }

  return {
    clientId: file.clientId,
    fileName: file.driveFileName,
    uploadUrl
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UploadSessionRequest;
    validateRequest(body);

    const config = getDriveAuthConfig();
    validateConfig(config);

    const accessToken = await getAccessToken(config);
    const folderName = sanitizeDriveName(body.folderName, "gobopad-output");
    const folderId = await createDriveFolder(accessToken, folderName, config.parentFolderId);
    const files = makeUniqueFileNames(body.files);
    const sessions = [];

    for (const file of files) {
      sessions.push(await createUploadSession(accessToken, folderId, file));
    }

    return NextResponse.json({
      folderName,
      folderId,
      sessions
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drive upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
