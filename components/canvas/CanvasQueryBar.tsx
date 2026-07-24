"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageCircleQuestion, Send, X, MousePointer2, Sparkles } from "lucide-react";

interface CanvasQueryBarProps {
  selectedCount: number;
  selectionLabel?: string;
  isAnalyzing: boolean;
  onAsk: (question: string) => void;
  onDismiss?: () => void;
}

/**
 * Floating dock shown when the user selects canvas elements.
 * Lets them ask about that selection without using the side chat.
 */
export function CanvasQueryBar({
  selectedCount,
  selectionLabel,
  isAnalyzing,
  onAsk,
  onDismiss,
}: CanvasQueryBarProps) {
  const [question, setQuestion] = useState("");

  if (selectedCount <= 0) return null;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = question.trim() || "Explain this selected part of the canvas.";
    onAsk(q);
    setQuestion("");
  };

  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 w-[min(560px,92vw)] pointer-events-auto">
      <form
        onSubmit={submit}
        className="rounded-2xl border border-indigo-500/30 bg-background/95 backdrop-blur-xl shadow-2xl p-3 space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
              <MousePointer2 className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                Ask about selection
                <Badge
                  variant="outline"
                  className="text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/20"
                >
                  {selectedCount} element{selectedCount === 1 ? "" : "s"}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">
                {selectionLabel ||
                  "AI will append a targeted explanation nearby — no full canvas rewrite."}
              </p>
            </div>
          </div>
          {onDismiss && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="w-7 h-7 rounded-lg shrink-0"
              onClick={onDismiss}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <MessageCircleQuestion className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-400" />
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder='e.g. "Why this step?" or "What does this root mean?"'
              className="pl-8 h-9 text-xs rounded-xl"
              disabled={isAnalyzing}
            />
          </div>
          <Button
            type="submit"
            disabled={isAnalyzing}
            className="h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 px-3"
          >
            {isAnalyzing ? (
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Ask
          </Button>
        </div>
      </form>
    </div>
  );
}
