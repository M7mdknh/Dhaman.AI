"use client";

import { useState, useTransition } from "react";
import { Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { removeDocumentAction } from "@/app/(app)/cases/actions";
import { DocumentRow } from "@/components/cases/summary-sections";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { looksLikePdf, MAX_STATEMENT_FILE_BYTES, STATEMENT_YEARS } from "@/lib/case-constants";
import { cn } from "@/lib/utils";

import type { DocumentView } from "@/lib/case-view";

interface DocumentsStepProps {
  caseId: string;
  documents: DocumentView[];
  onDocumentsChange: (documents: DocumentView[]) => void;
  onBack: () => void;
  onContinue: () => void;
}

/** Generous ceiling for one upload attempt — a 10 MB PDF on slow mobile data. */
const UPLOAD_TIMEOUT_MS = 180_000;

/** Maps a failed HTTP response without a server-provided message to an honest,
 * specific reason — never a bare "Upload failed". */
function statusMessage(status: number): string {
  if (status === 401) return "Your session has expired. Please sign in again and retry the upload.";
  if (status === 413)
    return "The server connection cannot carry a file this large in one piece. Retry the upload — it will be sent directly to secure storage instead.";
  if (status >= 500)
    return `The server had a problem saving the upload (HTTP ${status}). Please retry in a moment.`;
  return `The upload was rejected (HTTP ${status}). Please retry in a moment.`;
}

/** Reads a fetch Response as JSON, tolerating non-JSON error pages. */
async function safeJson(response: Response): Promise<{ [k: string]: unknown } | null> {
  try {
    return (await response.json()) as { [k: string]: unknown };
  } catch {
    return null;
  }
}

/** A direct-to-storage PUT failure (network/CORS/storage) — recoverable by
 * falling back to the through-the-server upload. */
class DirectPutError extends Error {}

/** PUTs the file straight to storage with progress (direct path). */
function putDirect(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new DirectPutError(`storage rejected the upload (HTTP ${xhr.status})`));
    xhr.onerror = () => reject(new DirectPutError("network error during direct upload"));
    xhr.ontimeout = () => reject(new DirectPutError("direct upload timed out"));
    xhr.send(file);
  });
}

/** Through-the-server multipart upload (local dev / fallback path). */
function uploadMultipart(
  caseId: string,
  file: File,
  fiscalYear: number,
  onProgress: (percent: number) => void,
): Promise<DocumentView> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fiscalYear", String(fiscalYear));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/cases/${caseId}/documents`);
    xhr.responseType = "json";
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 201 && xhr.response?.document) {
        resolve(xhr.response.document as DocumentView);
      } else {
        // A non-JSON body (a proxy or platform error page) must never hide
        // the real reason — derive it from the HTTP status instead.
        reject(new Error(xhr.response?.error ?? statusMessage(xhr.status)));
      }
    };
    xhr.onerror = () =>
      reject(new Error("Upload interrupted — check your connection and try again."));
    xhr.ontimeout = () =>
      reject(new Error("Network timeout — the upload took too long. Check your connection and try again."));
    xhr.send(formData);
  });
}

/**
 * Uploads a statement. Preferred path: presigned DIRECT upload to storage
 * (the bytes never pass through the app server, so the 10 MB limit holds on
 * any host), then a small finalize call registers the verified document.
 * Falls back automatically to the multipart route when direct upload is
 * unavailable (local disk storage) or fails mid-flight (e.g. storage CORS).
 */
async function uploadStatement(
  caseId: string,
  file: File,
  fiscalYear: number,
  onProgress: (percent: number) => void,
): Promise<DocumentView> {
  // Step 1: ask for a direct-to-storage upload slot. A VALIDATION answer
  // (JSON error: wrong type, duplicate year, too large…) is final and is
  // surfaced as-is. A TRANSPORT failure (endpoint unreachable, non-JSON
  // platform error page) is not an answer — fall back to the multipart path.
  let uploadUrl: string | null = null;
  let storageKey: string | null = null;
  const presign = await fetch(`/api/cases/${caseId}/documents/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // A stalled server must never leave the user staring at 0% forever.
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      fiscalYear,
    }),
  }).catch(() => null);
  if (presign) {
    const presignBody = await safeJson(presign);
    if (presign.ok) {
      uploadUrl = typeof presignBody?.uploadUrl === "string" ? presignBody.uploadUrl : null;
      storageKey = typeof presignBody?.storageKey === "string" ? presignBody.storageKey : null;
    } else if (typeof presignBody?.error === "string") {
      throw new Error(presignBody.error);
    }
  }

  if (uploadUrl && storageKey) {
    try {
      // Direct PUT carries the file: it owns 0–95% of the progress bar; the
      // finalize round-trip is the last 5%.
      await putDirect(uploadUrl, file, (pct) => onProgress(Math.min(95, Math.round(pct * 0.95))));
      const finalize = await fetch(`/api/cases/${caseId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Verification re-reads the object from storage server-side — allow
        // for that, but never hang indefinitely.
        signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ storageKey, fileName: file.name, fiscalYear }),
      }).catch(() => {
        throw new Error(
          "The file reached secure storage but could not be verified in time. Retry the upload.",
        );
      });
      const finalizeBody = await safeJson(finalize);
      if (finalize.ok && finalizeBody?.document) {
        onProgress(100);
        return finalizeBody.document as DocumentView;
      }
      throw new Error(
        typeof finalizeBody?.error === "string"
          ? finalizeBody.error
          : statusMessage(finalize.status),
      );
    } catch (error) {
      // Only a failed direct PUT falls back to the server path; a rejected
      // finalize is a real answer and is surfaced as-is.
      if (!(error instanceof DirectPutError)) throw error;
      onProgress(0);
    }
  }

  return uploadMultipart(caseId, file, fiscalYear, onProgress);
}

export function DocumentsStep({
  caseId,
  documents,
  onDocumentsChange,
  onBack,
  onContinue,
}: DocumentsStepProps) {
  const [progressByYear, setProgressByYear] = useState<Record<number, number>>({});
  // A failed upload keeps its File so "Try again" retries in place — the
  // user never re-picks the file or restarts the wizard.
  const [failedByYear, setFailedByYear] = useState<Record<number, { file: File; error: string }>>(
    {},
  );
  const [removing, startRemoving] = useTransition();

  async function handleFile(fiscalYear: number, file: File | undefined) {
    if (!file) return;
    if (!looksLikePdf(file.name, file.type)) {
      toast.error("Only PDF files are accepted for audited financial statements.");
      return;
    }
    if (file.size > MAX_STATEMENT_FILE_BYTES) {
      toast.error(
        `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the maximum size is 10 MB. ` +
          "Export the audited financial statements section as a smaller PDF.",
      );
      return;
    }

    setFailedByYear((f) => {
      const next = { ...f };
      delete next[fiscalYear];
      return next;
    });
    setProgressByYear((p) => ({ ...p, [fiscalYear]: 0 }));
    try {
      const document = await uploadStatement(caseId, file, fiscalYear, (percent) =>
        setProgressByYear((p) => ({ ...p, [fiscalYear]: percent })),
      );
      onDocumentsChange([...documents, document]);
      toast.success(`FY ${fiscalYear} statement uploaded`);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "The upload could not be completed. Please try again.";
      setFailedByYear((f) => ({ ...f, [fiscalYear]: { file, error: message } }));
      toast.error(message);
    } finally {
      setProgressByYear((p) => {
        const next = { ...p };
        delete next[fiscalYear];
        return next;
      });
    }
  }

  function handleRemove(document: DocumentView) {
    startRemoving(async () => {
      const result = await removeDocumentAction(caseId, document.id);
      if (result.ok) {
        onDocumentsChange(documents.filter((d) => d.id !== document.id));
        toast.success(`FY ${document.fiscalYear} statement removed`);
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audited IFRS Financial Statements</CardTitle>
        <CardDescription>
          Upload your <span className="font-medium text-foreground">latest</span> audited
          financial statement to get an underwriting assessment in seconds. Earlier years are
          optional — they deepen the historical trend analysis. PDF only, maximum 10 MB per
          file. Analysis begins automatically after submission.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {STATEMENT_YEARS.map((year) => {
          const document = documents.find((d) => d.fiscalYear === year);
          const progress = progressByYear[year];
          const failed = failedByYear[year];
          const inputId = `statement-${year}`;

          return (
            <div key={year} className="space-y-2">
              {!document && progress === undefined && failed ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-3">
                  <p className="text-sm font-medium text-foreground">
                    FY {year} — {failed.file.name} could not be uploaded
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{failed.error}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleFile(year, failed.file)}
                    >
                      Try again
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setFailedByYear((f) => {
                          const next = { ...f };
                          delete next[year];
                          return next;
                        })
                      }
                    >
                      Choose a different file
                    </Button>
                  </div>
                </div>
              ) : document ? (
                <DocumentRow document={document}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={removing}
                    onClick={() => handleRemove(document)}
                    aria-label={`Remove FY ${year} statement`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </DocumentRow>
              ) : progress !== undefined ? (
                <div className="rounded-lg border border-border px-3 py-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">
                      Uploading FY {year} statement…
                    </span>
                    <span className="text-muted-foreground">{progress}%</span>
                  </div>
                  <Progress value={progress} aria-label={`FY ${year} upload progress`} />
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">Fiscal Year {year}</p>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          year === STATEMENT_YEARS[0]
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {year === STATEMENT_YEARS[0] ? "Latest · Recommended" : "Optional"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Audited IFRS financial statement (PDF)
                    </p>
                  </div>
                  <label
                    htmlFor={inputId}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
                  >
                    <Upload className="size-3.5" aria-hidden />
                    Upload PDF
                    <input
                      id={inputId}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="sr-only"
                      onChange={(event) => {
                        void handleFile(year, event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          );
        })}
        {documents.length === 0 && (
          <p className="text-xs text-muted-foreground">
            At least one audited statement is required before the case can be submitted.
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onContinue}>
          Continue to Review
        </Button>
      </CardFooter>
    </Card>
  );
}
