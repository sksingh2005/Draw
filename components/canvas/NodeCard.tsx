"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KatexRenderer } from "../math/KatexRenderer";
import { Sparkles, ChevronRight, X, ExternalLink } from "lucide-react";
import { MathAnalysisResult } from "@/lib/math-parser";

interface NodeCardProps {
  result: MathAnalysisResult;
  onExpandPanel: () => void;
  onClose: () => void;
}

export function NodeCard({ result, onExpandPanel, onClose }: NodeCardProps) {
  const { targetCoordinates, classification, latexFormula, steps, summary } = result;

  // Position card offset to the right of target coordinates
  const left = targetCoordinates.x + targetCoordinates.width + 16;
  const top = Math.max(20, targetCoordinates.y);

  return (
    <div
      className="absolute z-20 w-80 bg-card/95 backdrop-blur-xl border border-indigo-500/40 shadow-2xl rounded-2xl p-4 transition-all duration-300 animate-in fade-in zoom-in-95"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-border/50 mb-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <Badge variant="outline" className="capitalize text-[11px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
            {classification}
          </Badge>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-accent transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Identified Formula */}
      <div className="bg-muted/80 dark:bg-zinc-900/80 p-3 rounded-xl border mb-3 text-center">
        <KatexRenderer math={latexFormula} block={true} className="text-base font-semibold" />
      </div>

      {/* Quick Summary */}
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
        {summary}
      </p>

      {/* Steps Mini Preview */}
      {steps.length > 0 && (
        <div className="space-y-1.5 mb-3 bg-accent/40 p-2.5 rounded-xl text-xs">
          <div className="font-medium text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Primary Step 1</span>
            <span className="font-mono text-[10px] text-indigo-500">1 of {steps.length}</span>
          </div>
          <div className="font-medium">{steps[0].title}</div>
          <div className="text-muted-foreground text-[11px]">
            <KatexRenderer math={steps[0].latex || steps[0].result} block={false} />
          </div>
        </div>
      )}

      {/* CTA Button */}
      <Button
        onClick={onExpandPanel}
        size="sm"
        className="w-full text-xs font-semibold rounded-xl gap-1 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
      >
        View Complete Breakdown <ChevronRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
