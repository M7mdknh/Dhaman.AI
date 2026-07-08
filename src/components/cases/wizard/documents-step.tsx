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
import { MAX_STATEMENT_FILE_BYTES, STATEMENT_YEARS } from "@/lib/case-constants";
import { cn } from "@/lib/utils";

import type { DocumentView } from "@/lib/case-view";

interface DocumentsStepProps {
  caseId: string;
  documents: DocumentView[];
  onDocumentsChange: (documents: DocumentView[]) => void;
  onBack: () => void;
  onContinue: () => void;
}

/** Uploads with XHR (not a server action) so real progress can be shown. */
function uploadStatement(
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
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 201 && xhr.response?.document) {
        resolve(xhr.response.document as DocumentView);
      } else {
        reject(new Error(xhr.response?.error ?? "Upload failed. Please try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(formData);
  });
}

export function DocumentsStep({
  caseId,
  documents,
  onDocumentsChange,
  onBack,
  onContinue,
}: DocumentsStepProps) {
  const [progressByYear, setProgressByYear] = useState<Record<number, number>>({});
  const [removing, startRemoving] = useTransition();

  async function handleFile(fiscalYear: number, file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted for audited financial statements.");
      return;
    }
    if (file.size > MAX_STATEMENT_FILE_BYTES) {
      toast.error("File is too large — the maximum size is 10 MB.");
      return;
    }

    setProgressByYear((p) => ({ ...p, [fiscalYear]: 0 }));
    try {
      const document = await uploadStatement(caseId, file, fiscalYear, (percent) =>
        setProgressByYear((p) => ({ ...p, [fiscalYear]: percent })),
      );
      onDocumentsChange([...documents, document]);
      toast.success(`FY ${fiscalYear} statement uploaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
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
          const inputId = `statement-${year}`;

          return (
            <div key={year} className="space-y-2">
              {document ? (
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
                      accept="application/pdf"
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
