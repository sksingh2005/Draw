"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, MousePointer2, Eraser, Lock, Unlock } from "lucide-react";

interface CanvasQueryBarProps {
  selectedCount: number;
  isAnalyzing: boolean;
  onSendQuery: (query: string) => void;
  onClearSelection?: () => void;
  onClearAiOnly?: () => void;
  isUserLocked?: boolean;
  onToggleLockUserLayers?: () => void;
}

export function CanvasQueryBar({
  selectedCount,
  isAnalyzing,
  onSendQuery,
  onClearSelection,
  onClearAiOnly,
  isUserLocked = false,
  onToggleLockUserLayers,
}: CanvasQueryBarProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isAnalyzing) return;
    onSendQuery(query.trim());
    setQuery("");
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-full max-w-xl px-4">
      <div className="bg-background/95 backdrop-blur-xl border border-border/60 shadow-2xl rounded-2xl p-2.5 flex flex-col gap-2 transition-all duration-200">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
              <MousePointer2 className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                Ask about selection
                <Badge
                  variant="outline"
                  className="text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/20 px-1.5 py-0.5"
                >
                  {selectedCount} element{selectedCount === 1 ? "" : "s"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Quick Provenance & Layer Action Controls */}
          <div className="flex items-center gap-1">
            {onToggleLockUserLayers && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onToggleLockUserLayers}
                className={`h-7 px-2 text-[11px] rounded-lg gap-1 ${
                  isUserLocked
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={isUserLocked ? "Unlock User Layers" : "Lock User Layers (Prevent Editing)"}
              >
                {isUserLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {isUserLocked ? "USER Locked" : "Lock USER"}
              </Button>
            )}

            {onClearAiOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearAiOnly}
                className="h-7 px-2 text-[11px] rounded-lg gap-1 text-muted-foreground hover:text-destructive"
                title="Clear AI annotations only (Keep user drawings)"
              >
                <Eraser className="w-3 h-3 text-purple-500" />
                Clear AI
              </Button>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              selectedCount > 0
                ? "Ask AI to solve, explain, or refactor selected elements..."
                : "Select elements on canvas and type a prompt..."
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
        </form>
      </div>
    </div>
  );
}
