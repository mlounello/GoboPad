"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SIZES,
  MAX_FILES,
  MAX_TOTAL_OUTPUTS,
  type GeneratedVariant,
  checkImageGuardrails,
  generateVariantsForFile,
  getOutputEstimate,
  parseSizes,
  validateFileCount
} from "@/lib/padder";
import {
  createDriveFolder,
  DriveUploadError,
  disconnectGoogleToken,
  getDriveUser,
  pickDriveFolder,
  renewGoogleDriveAccessToken,
  requestGoogleDriveAccessToken,
  type DriveUser,
  uploadVariantsToGoogleDrive
} from "@/lib/google-drive";
import { buildZipBlob, downloadBlob, makeZipFileName } from "@/lib/zip";

const PRESET_SIZES = ["100,75,50,33,25,10", "100,80,60,40,20", "100,50,25,10"];
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
const STORAGE_DRIVE_FOLDER_ID = "gobopad.drive.folder_id";
const STORAGE_DRIVE_FOLDER_NAME = "gobopad.drive.folder_name";
const STORAGE_DRIVE_ACCOUNT_EMAIL = "gobopad.drive.account_email";
const STORAGE_DRIVE_ACCOUNT_NAME = "gobopad.drive.account_name";

export default function HomePage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sizesInput, setSizesInput] = useState(DEFAULT_SIZES);
  const [quality, setQuality] = useState(95);
  const [downloadFolderName, setDownloadFolderName] = useState("gobopad-output");
  const [prefixMode, setPrefixMode] = useState<"infer" | "custom">("infer");
  const [prefixInput, setPrefixInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Add images to begin.");
  const [errors, setErrors] = useState<string[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [generated, setGenerated] = useState<GeneratedVariant[]>([]);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [outputPreviewUrl, setOutputPreviewUrl] = useState<string | null>(null);
  const [driveFolderId, setDriveFolderId] = useState("");
  const [driveFolderName, setDriveFolderName] = useState("My Drive root");
  const [driveUser, setDriveUser] = useState<DriveUser | null>(null);
  const [driveAccessToken, setDriveAccessToken] = useState("");
  const [isDriveConnecting, setIsDriveConnecting] = useState(false);
  const [isDriveUploading, setIsDriveUploading] = useState(false);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [driveProgressDone, setDriveProgressDone] = useState(0);
  const [driveProgressTotal, setDriveProgressTotal] = useState(0);
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedSizes = useMemo(() => {
    try {
      return { values: parseSizes(sizesInput), error: "" };
    } catch (error) {
      return { values: [] as number[], error: error instanceof Error ? error.message : "Invalid sizes value." };
    }
  }, [sizesInput]);

  const outputEstimate = getOutputEstimate(selectedFiles.length, parsedSizes.values.length);

  useEffect(() => {
    if (selectedFiles.length === 0) {
      setSourcePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFiles[0]);
    setSourcePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFiles]);

  useEffect(() => {
    if (generated.length === 0) {
      setOutputPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(generated[0].blob);
    setOutputPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [generated]);

  function clearPersistedDriveSelection() {
    localStorage.removeItem(STORAGE_DRIVE_FOLDER_ID);
    localStorage.removeItem(STORAGE_DRIVE_FOLDER_NAME);
    localStorage.removeItem(STORAGE_DRIVE_ACCOUNT_EMAIL);
    localStorage.removeItem(STORAGE_DRIVE_ACCOUNT_NAME);
  }

  function persistDriveFolder(folderId: string, folderName: string) {
    localStorage.setItem(STORAGE_DRIVE_FOLDER_ID, folderId);
    localStorage.setItem(STORAGE_DRIVE_FOLDER_NAME, folderName);
  }

  function persistDriveAccount(user: DriveUser) {
    localStorage.setItem(STORAGE_DRIVE_ACCOUNT_EMAIL, user.emailAddress);
    localStorage.setItem(STORAGE_DRIVE_ACCOUNT_NAME, user.displayName);
  }

  function clearSelectedFolderOnly() {
    localStorage.removeItem(STORAGE_DRIVE_FOLDER_ID);
    localStorage.removeItem(STORAGE_DRIVE_FOLDER_NAME);
    setDriveFolderId("");
    setDriveFolderName("My Drive root");
  }

  useEffect(() => {
    const persistedFolderId = localStorage.getItem(STORAGE_DRIVE_FOLDER_ID) ?? "";
    const persistedFolderName = localStorage.getItem(STORAGE_DRIVE_FOLDER_NAME) ?? "My Drive root";
    const persistedEmail = localStorage.getItem(STORAGE_DRIVE_ACCOUNT_EMAIL) ?? "";
    const persistedName = localStorage.getItem(STORAGE_DRIVE_ACCOUNT_NAME) ?? "";

    setDriveFolderId(persistedFolderId);
    setDriveFolderName(persistedFolderName);
    if (persistedEmail) {
      setDriveUser({
        emailAddress: persistedEmail,
        displayName: persistedName || persistedEmail
      });
    }
  }, []);

  function setIncomingFiles(fileList: FileList | null) {
    if (!fileList) {
      return;
    }

    const incoming = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    const map = new Map<string, File>();
    [...selectedFiles, ...incoming].forEach((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      map.set(key, file);
    });

    const deduped = Array.from(map.values()).slice(0, MAX_FILES);
    setSelectedFiles(deduped);
    setErrors([]);
    if (deduped.length < selectedFiles.length + incoming.length) {
      setStatusMessage(`Some files were skipped. Maximum ${MAX_FILES} files per batch.`);
    } else {
      setStatusMessage(`${deduped.length} file(s) ready.`);
    }
  }

  function removeFile(index: number) {
    const next = [...selectedFiles];
    next.splice(index, 1);
    setSelectedFiles(next);
  }

  async function runGeneration() {
    setErrors([]);
    setFileErrors([]);
    setGenerated([]);
    cancelRef.current = false;

    try {
      validateFileCount(selectedFiles);
      if (parsedSizes.error) {
        throw new Error(parsedSizes.error);
      }
      if (outputEstimate > MAX_TOTAL_OUTPUTS) {
        throw new Error(`Estimated outputs (${outputEstimate}) exceed limit (${MAX_TOTAL_OUTPUTS}).`);
      }
      if (quality < 1 || quality > 100) {
        throw new Error("JPEG quality must be 1 to 100.");
      }

      setStatusMessage("Validating image limits...");
      await checkImageGuardrails(selectedFiles);

      setIsGenerating(true);
      setProgressDone(0);
      setProgressTotal(outputEstimate);
      setStatusMessage("Generating variants locally...");

      const generatedAll: GeneratedVariant[] = [];
      const perFileErrors: string[] = [];
      const prefixOverride = prefixMode === "custom" ? prefixInput.trim() : "";

      for (const file of selectedFiles) {
        if (cancelRef.current) {
          break;
        }

        try {
          const variants = await generateVariantsForFile(
            file,
            parsedSizes.values,
            quality,
            prefixOverride,
            () => cancelRef.current,
            () => setProgressDone((prev) => prev + 1)
          );
          generatedAll.push(...variants);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to process file.";
          perFileErrors.push(`${file.name}: ${message}`);
        }
      }

      setGenerated(generatedAll);
      setFileErrors(perFileErrors);

      if (cancelRef.current) {
        setStatusMessage("Generation canceled.");
      } else if (generatedAll.length === 0) {
        setStatusMessage("No outputs were generated.");
      } else {
        setStatusMessage(`Generated ${generatedAll.length} images.`);
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Generation failed."]);
    } finally {
      setIsGenerating(false);
    }
  }

  async function downloadZip() {
    if (generated.length === 0) {
      return;
    }
    setStatusMessage("Creating ZIP...");
    const zipBlob = await buildZipBlob(generated, downloadFolderName);
    downloadBlob(zipBlob, makeZipFileName(downloadFolderName));
    setStatusMessage("ZIP downloaded.");
  }

  async function connectDrive() {
    setErrors([]);
    setIsDriveConnecting(true);
    try {
      const token = await requestGoogleDriveAccessToken(GOOGLE_CLIENT_ID);
      setDriveAccessToken(token);
      const user = await getDriveUser(token);
      const persistedEmail = localStorage.getItem(STORAGE_DRIVE_ACCOUNT_EMAIL);
      if (persistedEmail && persistedEmail !== user.emailAddress) {
        clearSelectedFolderOnly();
      }
      setDriveUser(user);
      persistDriveAccount(user);
      setStatusMessage("Google Drive connected.");
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Failed to connect Google Drive."]);
    } finally {
      setIsDriveConnecting(false);
    }
  }

  function disconnectDrive() {
    disconnectGoogleToken(driveAccessToken);
    setDriveAccessToken("");
    setDriveUser(null);
    clearPersistedDriveSelection();
    setDriveFolderId("");
    setDriveFolderName("My Drive root");
    setStatusMessage("Google Drive disconnected.");
  }

  async function chooseDriveFolder() {
    if (!driveAccessToken) {
      return;
    }

    setErrors([]);
    setIsDrivePickerOpen(true);
    try {
      const folder = await pickDriveFolder(driveAccessToken, GOOGLE_API_KEY);
      if (!folder) {
        return;
      }
      setDriveFolderId(folder.id);
      setDriveFolderName(folder.name);
      persistDriveFolder(folder.id, folder.name);
      setStatusMessage(`Selected Drive folder: ${folder.name}`);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Failed to open Drive folder picker."]);
    } finally {
      setIsDrivePickerOpen(false);
    }
  }

  async function uploadToDrive() {
    if (!driveAccessToken || generated.length === 0) {
      return;
    }

    setErrors([]);
    setIsDriveUploading(true);
    setDriveProgressDone(0);
    setDriveProgressTotal(generated.length);
    setStatusMessage("Creating Drive folder...");

    try {
      let token = driveAccessToken;
      let uploadParentFolderId = driveFolderId;
      let createdFolderName = downloadFolderName.trim() || "gobopad-output";
      const upload = async () => {
        const createdFolder = await createDriveFolder(token, createdFolderName, uploadParentFolderId);
        uploadParentFolderId = createdFolder.id;
        createdFolderName = createdFolder.name;
        setStatusMessage(`Uploading files to Drive folder "${createdFolderName}"...`);

        await uploadVariantsToGoogleDrive(generated, token, uploadParentFolderId, (done, total) => {
          setDriveProgressDone(done);
          setDriveProgressTotal(total);
        });
      };

      try {
        await upload();
      } catch (error) {
        if (error instanceof DriveUploadError && error.status === 401) {
          token = await renewGoogleDriveAccessToken(GOOGLE_CLIENT_ID);
          setDriveAccessToken(token);
          await upload();
        } else {
          throw error;
        }
      }

      setStatusMessage(`Uploaded ${generated.length} file(s) to Drive folder "${createdFolderName}".`);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Drive upload failed."]);
    } finally {
      setIsDriveUploading(false);
    }
  }

  const canGenerate = selectedFiles.length > 0 && !parsedSizes.error && !isGenerating;
  const progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;
  const driveProgressPercent = driveProgressTotal > 0 ? Math.round((driveProgressDone / driveProgressTotal) * 100) : 0;

  return (
    <main className="page-wrap">
      <section className="panel hero">
        <div className="brand-row">
          <Image src="/GoboPad_Logo.png" alt="GoboPad logo" width={72} height={72} className="brand-logo" priority />
          <h2>GoboPad</h2>
        </div>
        <h1>Generate Gobo Variants In Browser</h1>
        <p>Upload images, choose output percentages, and export all generated files as a ZIP with no backend compute.</p>
      </section>

      <section className="grid">
        <article className="panel card span-4">
          <h3>1. Upload</h3>
          <p>Drag and drop files here or browse from disk. Supported: JPG, PNG, TIFF, BMP, WebP.</p>

          <label
            className="dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setIncomingFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setIncomingFiles(event.target.files)}
            />
            <span>Drop images here</span>
            <button className="btn btn-secondary" type="button" onClick={() => fileInputRef.current?.click()}>
              Select Images
            </button>
          </label>

          <div className="file-list">
            {selectedFiles.map((file, index) => (
              <div key={`${file.name}-${file.lastModified}`} className="file-row">
                <p>{file.name}</p>
                <button className="btn btn-secondary btn-mini" type="button" onClick={() => removeFile(index)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="panel card span-8">
          <h4>2. Settings</h4>
          <div className="form-grid">
            <label>
              <span>Sizes (%)</span>
              <input value={sizesInput} onChange={(event) => setSizesInput(event.target.value)} />
            </label>

            <div className="chip-row">
              {PRESET_SIZES.map((preset) => (
                <button key={preset} className="btn btn-secondary btn-mini" type="button" onClick={() => setSizesInput(preset)}>
                  {preset}
                </button>
              ))}
            </div>

            <label>
              <span>JPEG quality: {quality}</span>
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
              />
            </label>

            <label>
              <span>Download folder name</span>
              <input
                value={downloadFolderName}
                onChange={(event) => setDownloadFolderName(event.target.value)}
                placeholder="gobopad-output"
              />
              <p className="helper-text">
                This name is used for your ZIP filename and the Drive subfolder created during upload.
              </p>
            </label>

            <label>
              <span>Prefix Mode</span>
              <select value={prefixMode} onChange={(event) => setPrefixMode(event.target.value as "infer" | "custom")}>
                <option value="infer">Infer from file name</option>
                <option value="custom">Custom prefix</option>
              </select>
              <p className="helper-text">
                Infer uses the source filename base (example: MZ100.jpg becomes MZ25.jpg). Custom uses your exact
                prefix for all outputs.
              </p>
            </label>

            {prefixMode === "custom" ? (
              <label>
                <span>Custom prefix</span>
                <input value={prefixInput} onChange={(event) => setPrefixInput(event.target.value)} placeholder="BE" />
              </label>
            ) : null}
          </div>
        </article>
      </section>

      <section className="grid">
        <article className="panel card span-8">
          <h3>3. Generate</h3>
          <p>{statusMessage}</p>
          <div className="btn-row">
            <button className="btn btn-primary" type="button" disabled={!canGenerate} onClick={runGeneration}>
              {isGenerating ? "Generating..." : "Generate Variants"}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!isGenerating}
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              Cancel
            </button>
            <button className="btn btn-secondary" type="button" disabled={generated.length === 0} onClick={downloadZip}>
              Download ZIP
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={isDriveConnecting || !GOOGLE_CLIENT_ID}
              onClick={connectDrive}
            >
              {driveAccessToken ? "Reconnect Drive" : isDriveConnecting ? "Connecting..." : "Connect Google Drive"}
            </button>
            <button className="btn btn-secondary" type="button" disabled={!driveAccessToken} onClick={disconnectDrive}>
              Disconnect Drive
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!driveAccessToken || !GOOGLE_API_KEY || isDrivePickerOpen}
              onClick={chooseDriveFolder}
            >
              {isDrivePickerOpen ? "Opening Picker..." : "Choose Folder"}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!driveAccessToken || generated.length === 0 || isDriveUploading}
              onClick={uploadToDrive}
            >
              {isDriveUploading ? "Uploading..." : "Upload To Drive"}
            </button>
          </div>

          <div className="progress-wrap" aria-live="polite">
            <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
          </div>
          <p>
            Progress: {progressDone}/{progressTotal || outputEstimate} ({progressPercent}%)
          </p>
          <p>Estimated outputs: {outputEstimate}</p>
          <div className="form-grid drive-box">
            {driveUser ? (
              <p className="helper-text">
                Connected as: {driveUser.displayName} ({driveUser.emailAddress})
              </p>
            ) : null}
            <p className="helper-text">Selected destination: {driveFolderName}</p>
            <p className="helper-text">
              {GOOGLE_CLIENT_ID
                ? GOOGLE_API_KEY
                  ? "Drive is enabled. Connect Drive, use Choose Folder (picker) to set destination, then upload generated files."
                  : "Drive upload works. Add NEXT_PUBLIC_GOOGLE_API_KEY to enable visual folder picker."
                : "Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment to enable Drive uploads."}
            </p>
            {!driveFolderId ? <p className="helper-text">No folder selected. Upload will use My Drive root.</p> : null}
            {isDriveUploading || driveProgressTotal > 0 ? (
              <>
                <div className="progress-wrap" aria-live="polite">
                  <div className="progress-bar" style={{ width: `${driveProgressPercent}%` }} />
                </div>
                <p>
                  Drive upload: {driveProgressDone}/{driveProgressTotal} ({driveProgressPercent}%)
                </p>
              </>
            ) : null}
          </div>

          {parsedSizes.error ? <p className="error-text">{parsedSizes.error}</p> : null}
          {errors.length > 0 ? (
            <div className="error-block">
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}
          {fileErrors.length > 0 ? (
            <div className="error-block">
              {fileErrors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}
        </article>

        <article className="panel card span-4">
          <h4>Preview</h4>
          <p>Source and first generated output.</p>
          <div className="preview-stack">
            <div className="preview-box">
              {sourcePreviewUrl ? (
                // Blob URLs are generated at runtime and cannot be used with next/image optimization.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sourcePreviewUrl} alt="Source preview" />
              ) : (
                <p>No source</p>
              )}
            </div>
            <div className="preview-box">
              {outputPreviewUrl ? (
                // Blob URLs are generated at runtime and cannot be used with next/image optimization.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={outputPreviewUrl} alt="Output preview" />
              ) : (
                <p>No output</p>
              )}
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
