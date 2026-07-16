"use client";

import { useState, useTransition } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { removeDocumentAction } from "@/app/(app)/cases/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { looksLikePdf, MAX_STATEMENT_FILE_BYTES } from "@/lib/case-constants";
import { cn } from "@/lib/utils";

import type { DocumentView } from "@/lib/case-view";

interface ContractUploadProps {
  caseId: string;
  document: DocumentView | null;
  onChange: (document: DocumentView | null) => void;
}

/**
 * Signed contract / award letter upload (wizard Step 3). Upload only — no
 * authenticity verification in this phase; the document is evidence for the
 * reviewing officer. One per case; replace by removing first.
 */
export function ContractUpload({ caseId, document, onChange }: ContractUploadProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, startRemoving] = useTransition();

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (!looksLikePdf(file.name, file.type)) {
      toast.error("Only PDF files are accepted for the contract document.");
      return;
    }
    if (file.size > MAX_STATEMENT_FILE_BYTES) {
      toast.error("File is too large — the maximum size is 10 MB.");
      return;
    }

    setProgress(0);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("docType", "CONTRACT");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/cases/${caseId}/documents`);
    xhr.responseType = "json";
    xhr.timeout = 180_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 201 && xhr.response?.document) {
        onChange(xhr.response.document as DocumentView);
        toast.success("Contract document uploaded");
      } else {
        toast.error(
          typeof xhr.response?.error === "string"
            ? xhr.response.error
            : "The upload could not be completed. Please try again.",
        );
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      toast.error("Upload interrupted — check your connection and try again.");
    };
    xhr.ontimeout = () => {
      setProgress(null);
      toast.error("Network timeout — the upload took too long. Please try again.");
    };
    xhr.send(formData);
  }

  function handleRemove() {
    if (!document) return;
    startRemoving(async () => {
      const result = await removeDocumentAction(caseId, document.id);
      if (result.ok) {
        onChange(null);
        toast.success("Contract document removed");
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  }

  if (document) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{document.fileName}</p>
            <p className="text-xs text-muted-foreground">Signed contract / award letter</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={removing}
          onClick={handleRemove}
          aria-label="Remove contract document"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    );
  }

  if (progress !== null) {
    return (
      <div className="rounded-lg border border-border px-3 py-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">Uploading contract…</span>
          <span className="text-muted-foreground">{progress}%</span>
        </div>
        <Progress value={progress} aria-label="Contract upload progress" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed border-border px-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-foreground">Signed Contract / Award Letter</p>
        <p className="text-xs text-muted-foreground">
          Optional — PDF, max 10 MB. Evidence for the reviewing officer.
        </p>
      </div>
      <label
        htmlFor="contract-document-upload"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
      >
        <Upload className="size-3.5" aria-hidden />
        Upload PDF
        <input
          id="contract-document-upload"
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
