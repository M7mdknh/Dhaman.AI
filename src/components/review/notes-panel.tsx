"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";

import { addNoteAction } from "@/app/(app)/review/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface NoteView {
  id: string;
  author: string;
  content: string;
  createdAt: string; // ISO
}

/** Internal officer notes — never rendered anywhere contractor-facing. */
export function NotesPanel({
  caseId,
  notes,
  authorName,
}: {
  caseId: string;
  notes: NoteView[];
  /** The signed-in author — used only to label the optimistic note. */
  authorName: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();
  // Optimistic notes derive from the server `notes`, so a real note replaces
  // its optimistic twin automatically after router.refresh().
  const [optimisticNotes, addOptimistic] = useOptimistic(
    notes,
    (state, pending: NoteView) => [pending, ...state],
  );
  const pendingId = useRef(0);

  function handleAdd() {
    const text = content.trim();
    if (!text) return;
    const note: NoteView = {
      id: `optimistic-${pendingId.current++}`,
      author: authorName,
      content: text,
      createdAt: new Date().toISOString(),
    };
    setContent("");
    startTransition(async () => {
      addOptimistic(note);
      const result = await addNoteAction(caseId, text);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error ?? "Could not add the note.");
        setContent(text); // restore so the officer doesn't lose their words
      }
    });
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
            onKeyDown={(e) => {
              // ⌘/Ctrl+Enter submits — the note-taker's expected shortcut.
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            rows={3}
            maxLength={4000}
            placeholder="Add an internal note…"
            aria-label="New internal note"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleAdd} disabled={!content.trim()}>
              {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Add Note
            </Button>
            <span className="text-[11px] text-muted-foreground">⌘↵ to save</span>
          </div>
        </div>

        {optimisticNotes.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {optimisticNotes.map((note) => {
              const optimistic = note.id.startsWith("optimistic-");
              return (
                <li
                  key={note.id}
                  className={cn(
                    "rounded-lg border border-border bg-muted/40 p-3 transition-opacity",
                    optimistic && "opacity-60",
                  )}
                >
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                    {note.content}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {note.author} · {optimistic ? "Saving…" : formatDateTime(note.createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
