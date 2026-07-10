import { ExternalLink, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DOCUMENT_STATUS_META } from "@/lib/case-constants";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { DocumentProcessingStatus } from "@/generated/prisma/enums";

export interface ReviewDocumentView {
  id: string;
  fileName: string;
  fileSize: number;
  fiscalYear: number | null;
  processingStatus: DocumentProcessingStatus;
  extractionError: string | null;
}

/** IFRS uploads with their extraction status; opens the authenticated preview. */
export function DocumentsPanel({ documents }: { documents: ReviewDocumentView[] }) {
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">No financial statements uploaded.</p>;
  }
  return (
    <ul className="space-y-2">
      {documents.map((doc) => {
        const status = DOCUMENT_STATUS_META[doc.processingStatus];
        return (
          <li
            key={doc.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <FileText className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">
                {doc.fiscalYear ? `FY ${doc.fiscalYear} — ` : ""}
                {doc.fileName}
              </p>
              <p className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</p>
              {doc.extractionError && (
                <p className="mt-1 text-xs text-red-600">{doc.extractionError}</p>
              )}
            </div>
            <Badge variant="outline" className={cn("font-medium", status.className)}>
              {status.label}
            </Badge>
            <a
              href={`/api/documents/${doc.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
            >
              Preview
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
