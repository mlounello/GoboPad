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
import { buildZipBlob, downloadBlob, makeZipFileName } from "@/lib/zip";

const SIZE_OPTIONS = [100, 75, 50, 33, 25, 10];

type ClientKind = "couple" | "individual" | "company";

type DriveUploadSession = {
  clientId: string;
  fileName: string;
  uploadUrl: string;
};

function compactName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "");
}

function firstWord(value: string): string {
  return value.trim().split(/\s+/)[0] ?? "";
}

function firstInitial(value: string): string {
  return compactName(value).charAt(0).toUpperCase();
}

function companyPrefix(value: string): string {
  const words = value
    .trim()
    .split(/\s+/)
    .map((word) => compactName(word))
    .filter(Boolean);

  if (words.length <= 1) {
    return words[0] ?? "";
  }

  return words.map((word) => word.charAt(0).toUpperCase()).join("");
}

function makeClientFolderName(kind: ClientKind, partnerOne: string, partnerTwo: string, clientName: string): string {
  if (kind === "couple") {
    return `${compactName(partnerOne)}${compactName(partnerTwo)}`;
  }

  return compactName(clientName);
}

function makePrefix(kind: ClientKind, partnerOne: string, partnerTwo: string, clientName: string): string {
  if (kind === "couple") {
    return `${firstInitial(partnerOne)}${firstInitial(partnerTwo)}`;
  }
  if (kind === "company") {
    return companyPrefix(clientName);
  }

  return compactName(firstWord(clientName));
}

function makeDownloadFolderName(
  kind: ClientKind,
  partnerOne: string,
  partnerTwo: string,
  clientName: string,
  entertainer: string
): string {
  const clientFolderName = makeClientFolderName(kind, partnerOne, partnerTwo, clientName);
  const entertainerName = compactName(entertainer);

  if (!clientFolderName && !entertainerName) {
    return "gobopad-output";
  }
  if (!entertainerName) {
    return clientFolderName;
  }
  if (!clientFolderName) {
    return `GoboPad (${entertainerName})`;
  }

  return `${clientFolderName} (${entertainerName})`;
}

function hasRequiredEventDetails(kind: ClientKind, partnerOne: string, partnerTwo: string, clientName: string, entertainer: string): boolean {
  if (!compactName(entertainer)) {
    return false;
  }
  if (kind === "couple") {
    return Boolean(compactName(partnerOne) && compactName(partnerTwo));
  }

  return Boolean(compactName(clientName));
}

export default function HomePage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<number[]>(() => parseSizes(DEFAULT_SIZES));
  const [quality, setQuality] = useState(100);
  const [clientKind, setClientKind] = useState<ClientKind>("couple");
  const [partnerOneName, setPartnerOneName] = useState("");
  const [partnerTwoName, setPartnerTwoName] = useState("");
  const [clientName, setClientName] = useState("");
  const [entertainerName, setEntertainerName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [driveProgressDone, setDriveProgressDone] = useState(0);
  const [driveProgressTotal, setDriveProgressTotal] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Add event details and images to begin.");
  const [errors, setErrors] = useState<string[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [generated, setGenerated] = useState<GeneratedVariant[]>([]);
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string | null>(null);
  const [outputPreviewUrl, setOutputPreviewUrl] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedSizes = useMemo(() => {
    try {
      return { values: parseSizes(selectedSizes.join(",")), error: "" };
    } catch (error) {
      return { values: [] as number[], error: error instanceof Error ? error.message : "Invalid sizes value." };
    }
  }, [selectedSizes]);

  const derivedPrefix = useMemo(
    () => makePrefix(clientKind, partnerOneName, partnerTwoName, clientName),
    [clientKind, partnerOneName, partnerTwoName, clientName]
  );

  const downloadFolderName = useMemo(
    () => makeDownloadFolderName(clientKind, partnerOneName, partnerTwoName, clientName, entertainerName),
    [clientKind, partnerOneName, partnerTwoName, clientName, entertainerName]
  );
  const eventDetailsComplete = useMemo(
    () => hasRequiredEventDetails(clientKind, partnerOneName, partnerTwoName, clientName, entertainerName),
    [clientKind, partnerOneName, partnerTwoName, clientName, entertainerName]
  );

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

  function clearGeneratedOutput() {
    setGenerated([]);
    setOutputPreviewUrl(null);
    setDriveProgressDone(0);
    setDriveProgressTotal(0);
  }

  function updateEventField(update: () => void) {
    update();
    clearGeneratedOutput();
  }

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
    clearGeneratedOutput();
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
    clearGeneratedOutput();
  }

  function toggleSize(size: number) {
    setSelectedSizes((current) => {
      if (current.includes(size)) {
        return current.filter((value) => value !== size);
      }

      return SIZE_OPTIONS.filter((value) => current.includes(value) || value === size);
    });
    clearGeneratedOutput();
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
      if (!eventDetailsComplete) {
        throw new Error("Complete the event fields before processing images.");
      }

      setStatusMessage("Validating image limits...");
      await checkImageGuardrails(selectedFiles);

      setIsGenerating(true);
      setProgressDone(0);
      setProgressTotal(outputEstimate);
      setStatusMessage("Generating variants locally...");

      const generatedAll: GeneratedVariant[] = [];
      const perFileErrors: string[] = [];

      for (const file of selectedFiles) {
        if (cancelRef.current) {
          break;
        }

        try {
          const variants = await generateVariantsForFile(
            file,
            parsedSizes.values,
            quality,
            derivedPrefix,
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

  async function uploadFilesToDrive() {
    if (generated.length === 0) {
      return;
    }

    setErrors([]);
    setIsUploadingToDrive(true);
    setDriveProgressDone(0);
    setDriveProgressTotal(generated.length);
    setStatusMessage("Creating Drive folder...");

    try {
      const response = await fetch("/api/drive/upload-sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          folderName: downloadFolderName,
          files: generated.map((variant, index) => ({
            clientId: String(index),
            fileName: variant.fileName,
            mimeType: "image/jpeg",
            size: variant.blob.size
          }))
        })
      });

      const body = (await response.json().catch(() => null)) as
        | { error?: string; folderName?: string; sessions?: DriveUploadSession[] }
        | null;

      if (!response.ok || !body?.sessions) {
        throw new Error(body?.error || "Unable to start Drive upload.");
      }

      setStatusMessage(`Uploading files to Monograms/${body.folderName || downloadFolderName}...`);

      for (const session of body.sessions) {
        const variant = generated[Number(session.clientId)];
        if (!variant) {
          throw new Error(`Missing generated file for ${session.fileName}.`);
        }

        const uploadResponse = await fetch(session.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "image/jpeg"
          },
          body: variant.blob
        });

        if (!uploadResponse.ok) {
          throw new Error(`Drive upload failed for ${session.fileName}.`);
        }

        setDriveProgressDone((prev) => prev + 1);
      }

      setStatusMessage(`Uploaded ${generated.length} file(s) to Monograms/${body.folderName || downloadFolderName}.`);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Drive upload failed."]);
    } finally {
      setIsUploadingToDrive(false);
    }
  }

  const canGenerate = selectedFiles.length > 0 && !parsedSizes.error && !isGenerating && eventDetailsComplete;
  const progressPercent = progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;
  const driveProgressPercent =
    driveProgressTotal > 0 ? Math.round((driveProgressDone / driveProgressTotal) * 100) : 0;

  return (
    <main className="page-wrap">
      <section className="panel hero">
        <div className="brand-row">
          <Image src="/GoboPad_Logo.png" alt="GoboPad logo" width={72} height={72} className="brand-logo" priority />
          <h2>GoboPad</h2>
        </div>
        <h1>Generate Gobo Variants In Browser</h1>
        <p>Enter the event details, upload images, choose output percentages, and export all generated files as a ZIP.</p>
      </section>

      <section className="grid">
        <article className="panel card span-4">
          <h3>1. Event</h3>
          <p>These fields create the file prefix and download folder name automatically.</p>

          <div className="form-grid">
            <label>
              <span>Client type</span>
              <select
                value={clientKind}
                required
                onChange={(event) =>
                  updateEventField(() => {
                    setClientKind(event.target.value as ClientKind);
                  })
                }
              >
                <option value="couple">Couple</option>
                <option value="individual">Individual</option>
                <option value="company">Company</option>
              </select>
            </label>

            {clientKind === "couple" ? (
              <div className="two-column-fields">
                <label>
                  <span>Partner 1</span>
                  <input
                    value={partnerOneName}
                    onChange={(event) =>
                      updateEventField(() => {
                        setPartnerOneName(event.target.value);
                      })
                    }
                    placeholder="Krysta"
                    required
                  />
                </label>
                <label>
                  <span>Partner 2</span>
                  <input
                    value={partnerTwoName}
                    onChange={(event) =>
                      updateEventField(() => {
                        setPartnerTwoName(event.target.value);
                      })
                    }
                    placeholder="Mike"
                    required
                  />
                </label>
              </div>
            ) : (
              <label>
                <span>{clientKind === "company" ? "Company name" : "Client name"}</span>
                <input
                  value={clientName}
                  onChange={(event) =>
                    updateEventField(() => {
                      setClientName(event.target.value);
                    })
                  }
                  placeholder={clientKind === "company" ? "Conway Entertainment" : "Maya"}
                  required
                />
              </label>
            )}

            <label>
              <span>Entertainer</span>
              <input
                value={entertainerName}
                onChange={(event) =>
                  updateEventField(() => {
                    setEntertainerName(event.target.value);
                  })
                }
                placeholder="Adam"
                required
              />
            </label>

            <div className="derived-box">
              <p>
                Prefix: <strong>{derivedPrefix || "Add client details"}</strong>
              </p>
              <p>
                Folder: <strong>{downloadFolderName}</strong>
              </p>
            </div>
            <p className="helper-text">
              Couples use initials, like KM or AJ. Multi-word companies use initials, like TBF. One-word companies
              and individual clients use the first word.
            </p>
          </div>
        </article>

        <article className="panel card span-8">
          <h3>2. Upload</h3>
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
      </section>

      <section className="grid">
        <article className="panel card span-8">
          <h4>3. Settings</h4>
          <div className="form-grid">
            <div>
              <span>Sizes (%)</span>
              <div className="size-grid">
                {SIZE_OPTIONS.map((size) => (
                  <label key={size} className="size-option">
                    <input type="checkbox" checked={selectedSizes.includes(size)} onChange={() => toggleSize(size)} />
                    <span>{size}%</span>
                  </label>
                ))}
              </div>
            </div>

            <label>
              <span>JPEG quality: {quality}</span>
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(event) =>
                  updateEventField(() => {
                    setQuality(Number(event.target.value));
                  })
                }
              />
            </label>
          </div>
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

      <section className="grid">
        <article className="panel card span-12">
          <h3>4. Generate</h3>
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
              className="btn btn-primary"
              type="button"
              disabled={generated.length === 0 || isUploadingToDrive}
              onClick={uploadFilesToDrive}
            >
              {isUploadingToDrive ? "Uploading..." : "Upload Files"}
            </button>
          </div>

          <div className="progress-wrap" aria-live="polite">
            <div className="progress-bar" style={{ width: `${progressPercent}%` }} />
          </div>
          <p>
            Progress: {progressDone}/{progressTotal || outputEstimate} ({progressPercent}%)
          </p>
          <p>Estimated outputs: {outputEstimate}</p>
          <p className="helper-text">Output folder: {downloadFolderName}</p>
          {isUploadingToDrive || driveProgressTotal > 0 ? (
            <div className="drive-upload-status">
              <div className="progress-wrap" aria-live="polite">
                <div className="progress-bar" style={{ width: `${driveProgressPercent}%` }} />
              </div>
              <p>
                Drive upload: {driveProgressDone}/{driveProgressTotal} ({driveProgressPercent}%)
              </p>
            </div>
          ) : null}

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
      </section>
    </main>
  );
}
