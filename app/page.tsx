"use client";

import React, { useState, useRef } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { MathCanvas, MathCanvasRef, CanvasNoteNode } from "@/components/canvas/MathCanvas";
import { CanvasToolbar, CanvasToolMode, GridMode } from "@/components/canvas/CanvasToolbar";
import { MathPresetLibrary, MathTemplate } from "@/components/math/MathPresetLibrary";
import { SolutionPanel } from "@/components/canvas/SolutionPanel";
import { NodeCard } from "@/components/canvas/NodeCard";
import { MathAnalysisResult, CanvasCoordinates } from "@/lib/math-parser";

export default function Home() {
  const canvasRef = useRef<MathCanvasRef | null>(null);

  // Canvas tool states
  const [toolMode, setToolMode] = useState<CanvasToolMode>("pen");
  const [strokeColor, setStrokeColor] = useState<string>("#6366f1");
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [gridMode, setGridMode] = useState<GridMode>("graph");
  const [strokeCount, setStrokeCount] = useState<number>(0);
  const [selectionCoords, setSelectionCoords] = useState<CanvasCoordinates | null>(null);

  // Note nodes on canvas
  const [noteNodes, setNoteNodes] = useState<CanvasNoteNode[]>([]);

  // AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [currentResult, setCurrentResult] = useState<MathAnalysisResult | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false);

  // Modal dialog states
  const [presetLibraryOpen, setPresetLibraryOpen] = useState<boolean>(false);

  // Trigger AI Spatial Analysis
  const handleAnalyzeCanvas = async () => {
    if (!canvasRef.current || isAnalyzing) return;

    setIsAnalyzing(true);
    const region = canvasRef.current.getCroppedRegion();

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: region?.imageBase64,
          coordinates: region?.coordinates || { x: 100, y: 100, width: 350, height: 250 },
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setCurrentResult(json.data);
        setIsPanelOpen(true);
      } else {
        console.error("Analysis failed:", json.error);
      }
    } catch (err) {
      console.error("Failed to analyze canvas region:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Insert formula template from preset library onto canvas
  const handleSelectTemplate = (template: MathTemplate) => {
    const newNode: CanvasNoteNode = {
      id: `node-${Date.now()}`,
      x: 180 + Math.random() * 80,
      y: 160 + Math.random() * 60,
      text: template.name,
      latex: template.latex,
    };
    setNoteNodes((prev) => [...prev, newNode]);
  };

  // Export full canvas as PNG download
  const handleExportCanvas = () => {
    const region = canvasRef.current?.getCroppedRegion();
    if (!region) return;

    const link = document.createElement("a");
    link.download = `math-canvas-${Date.now()}.png`;
    link.href = region.imageBase64;
    link.click();
  };

  // Clear canvas & notes
  const handleClearAll = () => {
    canvasRef.current?.clearCanvas();
    setNoteNodes([]);
    setCurrentResult(null);
    setIsPanelOpen(false);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background font-sans">
      {/* Top Navbar */}
      <Navbar
        onOpenPresets={() => setPresetLibraryOpen(true)}
        onClearCanvas={handleClearAll}
        onExportCanvas={handleExportCanvas}
        analysisCount={currentResult ? 1 : 0}
      />

      {/* Main Fullscreen Canvas Work Area */}
      <main className="flex-1 relative w-full h-full overflow-hidden">
        <MathCanvas
          refCanvasApi={canvasRef}
          toolMode={toolMode}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          gridMode={gridMode}
          onStrokesChange={setStrokeCount}
          onSelectionChange={setSelectionCoords}
          noteNodes={noteNodes}
          onAddNoteNode={(newNode) => setNoteNodes((prev) => [...prev, newNode])}
        />

        {/* Spatial Anchored Node Card Overlay */}
        {currentResult && !isPanelOpen && (
          <NodeCard
            result={currentResult}
            onExpandPanel={() => setIsPanelOpen(true)}
            onClose={() => setCurrentResult(null)}
          />
        )}

        {/* Floating Glassmorphism Toolbar */}
        <CanvasToolbar
          toolMode={toolMode}
          onToolModeChange={setToolMode}
          strokeColor={strokeColor}
          onStrokeColorChange={setStrokeColor}
          strokeWidth={strokeWidth}
          onStrokeWidthChange={setStrokeWidth}
          gridMode={gridMode}
          onGridModeChange={setGridMode}
          canUndo={canvasRef.current?.canUndo || false}
          canRedo={canvasRef.current?.canRedo || false}
          onUndo={() => canvasRef.current?.undo()}
          onRedo={() => canvasRef.current?.redo()}
          onClear={handleClearAll}
          onOpenPresets={() => setPresetLibraryOpen(true)}
          onAnalyze={handleAnalyzeCanvas}
          isAnalyzing={isAnalyzing}
        />

        {/* Sliding Solution & Problem Breakdown Panel */}
        <SolutionPanel
          result={currentResult}
          open={isPanelOpen}
          onClose={() => setIsPanelOpen(false)}
        />

        {/* Formula Preset Library Dialog */}
        <MathPresetLibrary
          open={presetLibraryOpen}
          onOpenChange={setPresetLibraryOpen}
          onSelectTemplate={handleSelectTemplate}
        />
      </main>
    </div>
  );
}
