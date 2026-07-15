"use client";

/**
 * InsightChat — conversational Q&A panel for Risk Officers and RMs.
 *
 * Streams responses from /api/cases/[caseId]/chat, which injects the
 * deterministic engine output as context. The AI explains the numbers;
 * it never overrides them and never makes a decision.
 */

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export interface InsightChatProps {
  caseId: string;
  /** Data-derived suggestion bubbles computed by the server from engine output. */
  initialBubbles: string[];
}

/** Returns contextual follow-up suggestions after each response. */
function getFollowUpBubbles(question: string, initial: string[]): string[] {
  const q = question.toLowerCase();

  if (q.includes("debt") || q.includes("leverage") || q.includes("spike")) {
    return [
      "What conditions should I attach?",
      "What should I ask the applicant?",
      "Draft the decision note",
    ];
  }
  if (q.includes("condition")) {
    return ["Draft the full decision note", "What data is missing?", "Summarize this case"];
  }
  if (q.includes("draft") || q.includes("decision note")) {
    return ["What conditions should I attach?", "What data is missing?"];
  }
  if (q.includes("summarize") || q.includes("summary") || q.includes("my note")) {
    return ["What conditions should I attach?", "What data is missing?"];
  }
  if (q.includes("missing") || q.includes("data")) {
    return [
      "What should I ask the applicant?",
      "Summarize this case",
      "Draft the decision note",
    ];
  }

  // Fall back to initial bubbles, dropping what was just asked
  const prefix = q.slice(0, 14);
  const filtered = initial.filter((b) => !b.toLowerCase().startsWith(prefix));
  return (filtered.length > 0 ? filtered : initial).slice(0, 3);
}

export function InsightChat({ caseId, initialBubbles }: InsightChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [bubbles, setBubbles] = useState<string[]>(initialBubbles);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [history, setHistory] = useState<{ role: string; content: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ask = async (question: string) => {
    if (!question.trim() || isStreaming) return;

    setIsStreaming(true);
    setInput("");
    setBubbles([]);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "", streaming: true },
    ]);

    try {
      const res = await fetch(`/api/cases/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, history: history.slice(-10) }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: fullText, streaming: true },
        ]);
      }

      const finalText = fullText.trim() || "I couldn't generate a response — please try again.";
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: finalText, streaming: false },
      ]);
      setHistory((prev) => [
        ...prev,
        { role: "user", content: question },
        { role: "assistant", content: finalText },
      ]);
      setBubbles(getFollowUpBubbles(question, initialBubbles));
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: "Connection issue — please try again.", streaming: false },
      ]);
      setBubbles(initialBubbles);
    } finally {
      setIsStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(input.trim());
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-primary" aria-hidden />
          Insight Chat
          <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary">
            β
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ask anything about this case. I explain the engine&apos;s outputs — I never override them.
        </p>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* ---- Messages thread */}
        {messages.length > 0 && (
          <div className="max-h-[280px] space-y-2 overflow-y-auto rounded-md border border-border bg-muted/20 p-2.5">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
              >
                {msg.role === "user" ? (
                  <p className="max-w-[90%] rounded-md bg-primary px-3 py-2 text-[12.5px] leading-relaxed text-primary-foreground">
                    {msg.content}
                  </p>
                ) : (
                  <div
                    className="max-w-[90%] rounded-md border border-border bg-card px-3 py-2 text-[12.5px] leading-relaxed text-foreground"
                    style={{ borderLeft: "2px solid var(--primary)" }}
                  >
                    {msg.content === "" && msg.streaming ? (
                      // Thinking state — no content yet
                      <span className="flex items-center gap-1 py-0.5" aria-label="Thinking">
                        <span
                          className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                          style={{ animationDelay: "300ms" }}
                        />
                      </span>
                    ) : (
                      <span className="whitespace-pre-wrap">
                        {msg.content}
                        {msg.streaming && (
                          <span
                            className="ml-0.5 inline-block h-[13px] w-[1.5px] animate-pulse bg-primary align-text-bottom"
                            aria-hidden
                          />
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {/* ---- Suggestion bubbles */}
        {bubbles.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggested questions">
            {bubbles.map((bubble, i) => (
              <button
                key={i}
                type="button"
                onClick={() => ask(bubble)}
                disabled={isStreaming}
                className={cn(
                  "rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-[11.5px] text-muted-foreground",
                  "transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                {bubble}
              </button>
            ))}
          </div>
        )}

        {/* ---- Input */}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this case…"
            disabled={isStreaming}
            className="h-8 text-[12px]"
            aria-label="Message input"
          />
          <Button
            size="icon"
            onClick={() => ask(input.trim())}
            disabled={!input.trim() || isStreaming}
            className="size-8 shrink-0"
            aria-label="Send message"
          >
            <Send className="size-3.5" aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
