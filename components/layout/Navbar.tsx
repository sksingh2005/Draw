"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, BookOpen, Download, Trash2, Cpu, RotateCcw } from "lucide-react";

interface NavbarProps {
  onOpenPresets: () => void;
  onClearCanvas: () => void;
  onExportCanvas: () => void;
  analysisCount: number;
}

export function Navbar({
  onOpenPresets,
  onClearCanvas,
  onExportCanvas,
  analysisCount,
}: NavbarProps) {
  return (
    <header className="h-14 border-b bg-background/80 backdrop-blur-xl px-4 flex items-center justify-between z-30 sticky top-0">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-sm tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
              MathCanvas AI
            </h1>
            <Badge variant="outline" className="text-[10px] py-0 px-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
              Spatial Problem Solver
            </Badge>
          </div>
        </div>
      </div>

      {/* Center AI Engine Status */}
      <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60 border text-xs text-muted-foreground">
        <Cpu className="w-3.5 h-3.5 text-indigo-500" />
        <span>Spatial Coordinate Engine:</span>
        <span className="font-semibold text-foreground flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Multimodal Active
        </span>
      </div>

      {/* Right Quick Actions */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onOpenPresets} className="rounded-xl text-xs gap-1.5 hidden sm:flex">
          <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> Math Formulas
        </Button>

        <Button variant="outline" size="sm" onClick={onExportCanvas} className="rounded-xl text-xs gap-1.5">
          <Download className="w-3.5 h-3.5 text-foreground" /> Export PNG
        </Button>

        <Button variant="ghost" size="sm" onClick={onClearCanvas} className="rounded-xl text-xs gap-1.5 text-destructive hover:bg-destructive/10">
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </Button>
      </div>
    </header>
  );
}
