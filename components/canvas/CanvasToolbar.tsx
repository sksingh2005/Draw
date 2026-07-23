"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Pencil,
  Eraser,
  Crop,
  Square,
  Circle as CircleIcon,
  MoveUpRight,
  Sparkles,
  Type,
  Trash2,
  Undo2,
  Redo2,
  Grid,
  Zap,
  BookOpen,
} from "lucide-react";

export type CanvasToolMode =
  | "pen"
  | "eraser"
  | "select"
  | "line"
  | "arrow"
  | "rectangle"
  | "circle"
  | "laser"
  | "text";

export type GridMode = "graph" | "dots" | "blank";

const COLOR_PALETTE = [
  "#1e293b", // Slate
  "#6366f1", // Indigo
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#ec4899", // Pink
  "#8b5cf6", // Purple
];

interface CanvasToolbarProps {
  toolMode: CanvasToolMode;
  onToolModeChange: (mode: CanvasToolMode) => void;
  strokeColor: string;
  onStrokeColorChange: (color: string) => void;
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
  gridMode: GridMode;
  onGridModeChange: (mode: GridMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onOpenPresets: () => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}

export function CanvasToolbar({
  toolMode,
  onToolModeChange,
  strokeColor,
  onStrokeColorChange,
  strokeWidth,
  onStrokeWidthChange,
  gridMode,
  onGridModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onOpenPresets,
  onAnalyze,
  isAnalyzing,
}: CanvasToolbarProps) {
  return (
    <TooltipProvider>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-2 rounded-2xl border bg-background/80 backdrop-blur-xl shadow-2xl transition-all">
        {/* Draw Tools */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant={toolMode === "pen" ? "default" : "ghost"}
                size="icon"
                onClick={() => onToolModeChange("pen")}
                className="w-9 h-9 rounded-xl"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Freehand Pen (Draw Equations)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button
                variant={toolMode === "select" ? "default" : "ghost"}
                size="icon"
                onClick={() => onToolModeChange("select")}
                className="w-9 h-9 rounded-xl"
              >
                <Crop className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Select / Crop Region (Point Coordinates)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button
                variant={toolMode === "eraser" ? "default" : "ghost"}
                size="icon"
                onClick={() => onToolModeChange("eraser")}
                className="w-9 h-9 rounded-xl"
              >
                <Eraser className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Eraser</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button
                variant={toolMode === "laser" ? "default" : "ghost"}
                size="icon"
                onClick={() => onToolModeChange("laser")}
                className="w-9 h-9 rounded-xl"
              >
                <Zap className="w-4 h-4 text-amber-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Laser Pointer Trail</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Shapes & Text */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant={toolMode === "rectangle" ? "default" : "ghost"}
                size="icon"
                onClick={() => onToolModeChange("rectangle")}
                className="w-9 h-9 rounded-xl"
              >
                <Square className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rectangle Shape</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button
                variant={toolMode === "circle" ? "default" : "ghost"}
                size="icon"
                onClick={() => onToolModeChange("circle")}
                className="w-9 h-9 rounded-xl"
              >
                <CircleIcon className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Circle / Ellipse Shape</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button
                variant={toolMode === "arrow" ? "default" : "ghost"}
                size="icon"
                onClick={() => onToolModeChange("arrow")}
                className="w-9 h-9 rounded-xl"
              >
                <MoveUpRight className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Vector Arrow</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button
                variant={toolMode === "text" ? "default" : "ghost"}
                size="icon"
                onClick={() => onToolModeChange("text")}
                className="w-9 h-9 rounded-xl"
              >
                <Type className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Text & Math Note</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Style Controls (Color & Stroke Width) */}
        <div className="flex items-center gap-1.5">
          {/* Color Picker */}
          <Popover>
            <PopoverTrigger className="inline-flex items-center justify-center rounded-xl border border-input bg-background p-0 w-9 h-9 hover:bg-accent hover:text-accent-foreground cursor-pointer">
              <span
                className="w-5 h-5 rounded-full border border-black/20 shadow-xs"
                style={{ backgroundColor: strokeColor }}
              />
            </PopoverTrigger>
            <PopoverContent className="w-44 p-2" align="center">
              <div className="text-xs font-medium mb-2 text-muted-foreground">Stroke Color</div>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => onStrokeColorChange(color)}
                    className={`w-7 h-7 rounded-full border transition-transform ${
                      strokeColor === color ? "scale-110 ring-2 ring-primary" : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Stroke Width Slider */}
          <Popover>
            <PopoverTrigger className="inline-flex items-center justify-center rounded-xl border border-input bg-background p-0 w-9 h-9 font-bold text-xs hover:bg-accent hover:text-accent-foreground cursor-pointer">
              {strokeWidth}px
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3" align="center">
              <div className="flex justify-between items-center text-xs font-medium mb-2">
                <span>Thickness</span>
                <span>{strokeWidth}px</span>
              </div>
              <Slider
                value={[strokeWidth]}
                onValueChange={(val: any) => {
                  const num = Array.isArray(val) ? val[0] : val;
                  if (typeof num === "number") onStrokeWidthChange(num);
                }}
                min={1}
                max={16}
                step={1}
              />
            </PopoverContent>
          </Popover>

          {/* Grid Mode Selector */}
          <Popover>
            <PopoverTrigger className="inline-flex items-center justify-center rounded-xl bg-transparent p-0 w-9 h-9 hover:bg-accent hover:text-accent-foreground cursor-pointer">
              <Grid className="w-4 h-4" />
            </PopoverTrigger>
            <PopoverContent className="w-36 p-1" align="center">
              <button
                onClick={() => onGridModeChange("graph")}
                className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center justify-between ${
                  gridMode === "graph" ? "bg-accent font-semibold" : "hover:bg-accent/50"
                }`}
              >
                Graph Grid
              </button>
              <button
                onClick={() => onGridModeChange("dots")}
                className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center justify-between ${
                  gridMode === "dots" ? "bg-accent font-semibold" : "hover:bg-accent/50"
                }`}
              >
                Dot Grid
              </button>
              <button
                onClick={() => onGridModeChange("blank")}
                className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center justify-between ${
                  gridMode === "blank" ? "bg-accent font-semibold" : "hover:bg-accent/50"
                }`}
              >
                Blank Slate
              </button>
            </PopoverContent>
          </Popover>
        </div>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* History & Actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon"
                disabled={!canUndo}
                onClick={onUndo}
                className="w-9 h-9 rounded-xl"
              >
                <Undo2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon"
                disabled={!canRedo}
                onClick={onRedo}
                className="w-9 h-9 rounded-xl"
              >
                <Redo2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button variant="ghost" size="icon" onClick={onClear} className="w-9 h-9 rounded-xl text-destructive hover:bg-destructive/10">
                <Trash2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear Canvas</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button variant="outline" size="sm" onClick={onOpenPresets} className="rounded-xl text-xs gap-1.5 ml-1">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> Formulas
              </Button>
            </TooltipTrigger>
            <TooltipContent>Insert Formula Template</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-6 mx-1" />

        {/* Primary AI Action CTA */}
        <Button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="rounded-xl font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/25 gap-2 px-4 py-2"
        >
          <Sparkles className={`w-4 h-4 ${isAnalyzing ? "animate-spin" : "animate-bounce"}`} />
          {isAnalyzing ? "Analyzing..." : "Analyze Canvas"}
        </Button>
      </div>
    </TooltipProvider>
  );
}
