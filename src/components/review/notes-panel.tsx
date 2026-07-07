"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";

import { addNoteAction } from "@/app/(app)/review/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";

export interface NoteView {
  id: string;
  author: string;
  content: string;
  createdAt: string; // ISO
}

/** Internal officer notes — never rendered anywhere contractor-facing. */
export function NotesPanel({ caseId, notes }: { caseId: string; notes: NoteView[] }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);

  async function handleAdd() {
    setPending(true);
    const result = await addNoteAction(caseId, content);
    setPending(false);
    if (result.ok) {
      setContent("");
      toast.success("Note added");
      router.refresh();
    } else if (result.error) {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <StickyNote className="size-4 text-muted-foreground" aria-hidden />
          Internal Notes
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Visible to bank staff only — never shown to the applicant.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Add an internal note…"
            aria-label="New internal note"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleAdd}
            disabled={pending || !content.trim()}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Add Note
          </Button>
        </div>

        {notes.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                  {note.content}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {note.author} · {formatDateTime(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
