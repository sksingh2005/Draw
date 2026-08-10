"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, MousePointer2, X } from "lucide-react";

interface CanvasQueryBarProps {
  selectedCount: number;
  isAnalyzing: boolean;
  onSendQuery: (query: string) => void;
  onClearSelection?: () => void;
}

export function CanvasQueryBar({
  selectedCount,
  isAnalyzing,
  onSendQuery,
  onClearSelection,
}: CanvasQueryBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isAnalyzing) return;
    onSendQuery(query.trim());
    setQuery("");
  };

  if (selectedCount === 0) return null;

  return (
    <div className="absolute bottom-5 left-1/2 z-30 w-full max-w-2xl -translate-x-1/2 px-4">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/95 p-2 shadow-xl backdrop-blur-xl"
      >
        <div className="hidden items-center gap-2 pl-1 sm:flex">
          <div className="flex size-7 items-center justify-center rounded-xl bg-indigo-500/10">
            <MousePointer2 className="size-3.5 text-indigo-500" />
          </div>
          <Badge
            variant="outline"
            className="whitespace-nowrap border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-600"
          >
            {selectedCount} selected
          </Badge>
        </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              "Ask about the selected diagram…"
            }
            className="h-9 text-xs bg-muted/40 border-muted rounded-xl focus-visible:ring-indigo-500"
          />
          <Button
            type="submit"
            disabled={isAnalyzing || !query.trim()}
            size="sm"
            className="h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 px-3 shrink-0"
          >
            {isAnalyzing ? (
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Ask
          </Button>
          {onClearSelection && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClearSelection}
              className="size-8 shrink-0 rounded-xl text-muted-foreground"
              title="Clear selection"
            >
              <X className="size-4" />
            </Button>
          )}
      </form>
    </div>
  );
}
