"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { CanvasToolMode, GridMode } from "./CanvasToolbar";
import { CanvasCoordinates } from "@/lib/math-parser";
import { KatexRenderer } from "../math/KatexRenderer";

export interface StrokePoint {
  x: number;
  y: number;
}

export interface CanvasStroke {
  id: string;
  tool: CanvasToolMode;
  color: string;
  width: number;
  points: StrokePoint[];
}

export interface CanvasNoteNode {
  id: string;
  x: number;
  y: number;
  text: string;
  latex?: string;
}

interface MathCanvasProps {
  toolMode: CanvasToolMode;
  strokeColor: string;
  strokeWidth: number;
  gridMode: GridMode;
  zoom: number;
  panX: number;
  panY: number;
  onPanChange: (panX: number, panY: number) => void;
  onZoomChange?: (zoom: number) => void;
  onStrokesChange?: (count: number) => void;
  onSelectionChange?: (coords: CanvasCoordinates | null) => void;
  noteNodes: CanvasNoteNode[];
  onAddNoteNode: (node: CanvasNoteNode) => void;
  refCanvasApi?: React.MutableRefObject<MathCanvasRef | null>;
  strokes: CanvasStroke[];
  setStrokes: React.Dispatch<React.SetStateAction<CanvasStroke[]>>;
}

export interface MathCanvasRef {
  getCroppedRegion: () => { imageBase64: string; coordinates: CanvasCoordinates } | null;
  clearCanvas: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function MathCanvas({
  toolMode,
  strokeColor,
  strokeWidth,
  gridMode,
  zoom,
  panX,
  panY,
  onPanChange,
  onZoomChange,
  onStrokesChange,
  onSelectionChange,
  noteNodes,
  onAddNoteNode,
  refCanvasApi,
  strokes,
  setStrokes,
}: MathCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Real-time animation frame ref
  const animFrameIdRef = useRef<number | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync pan & zoom in refs for zero-lag 60 FPS rendering
  const panRef = useRef({ x: panX, y: panY });
  const zoomRef = useRef(zoom);

  useEffect(() => {
    panRef.current = { x: panX, y: panY };
  }, [panX, panY]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const [undoStack, setUndoStack] = useState<CanvasStroke[][]>([]);
  const [redoStack, setRedoStack] = useState<CanvasStroke[][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  
  // 1:1 Hand Pan Tracking Refs
  const dragStartRef = useRef<{ screenX: number; screenY: number; initialPanX: number; initialPanY: number } | null>(null);

  const [currentStroke, setCurrentStroke] = useState<CanvasStroke | null>(null);

  // Selection Bounding Box state
  const [selectionBox, setSelectionBox] = useState<CanvasCoordinates | null>(null);
  const [selectionStart, setSelectionStart] = useState<StrokePoint | null>(null);

  // Laser trail points
  const [laserPoints, setLaserPoints] = useState<{ x: number; y: number; time: number }[]>([]);

  // Text insertion state
  const [textInputPos, setTextInputPos] = useState<StrokePoint | null>(null);
  const [textInputValue, setTextInputValue] = useState("");

  // Convert raw screen pixel coordinates into world canvas coordinates
  const getCanvasWorldCoords = useCallback((clientX: number, clientY: number): StrokePoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    return {
      x: (screenX - panRef.current.x) / zoomRef.current,
      y: (screenY - panRef.current.y) / zoomRef.current,
    };
  }, []);

  // Redraw canvas using requestAnimationFrame at 60 FPS
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Apply Viewport Pan & Zoom Transform directly from refs
    ctx.translate(panRef.current.x, panRef.current.y);
    ctx.scale(zoomRef.current, zoomRef.current);

    const allStrokes = [...strokes, ...(currentStroke ? [currentStroke] : [])];

    allStrokes.forEach((stroke) => {
      if (stroke.points.length === 0) return;

      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = stroke.width * 2.5;
      } else {
        ctx.globalCompositeOperation = "source-over";
      }

      if (stroke.tool === "pen" || stroke.tool === "eraser") {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      } else if (stroke.tool === "line" && stroke.points.length >= 2) {
        const start = stroke.points[0];
        const end = stroke.points[stroke.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      } else if (stroke.tool === "arrow" && stroke.points.length >= 2) {
        const start = stroke.points[0];
        const end = stroke.points[stroke.points.length - 1];
        drawArrow(ctx, start.x, start.y, end.x, end.y, stroke.width);
      } else if (stroke.tool === "rectangle" && stroke.points.length >= 2) {
        const start = stroke.points[0];
        const end = stroke.points[stroke.points.length - 1];
        const w = end.x - start.x;
        const h = end.y - start.y;
        ctx.strokeRect(start.x, start.y, w, h);
      } else if (stroke.tool === "circle" && stroke.points.length >= 2) {
        const start = stroke.points[0];
        const end = stroke.points[stroke.points.length - 1];
        const rx = Math.abs(end.x - start.x) / 2;
        const ry = Math.abs(end.y - start.y) / 2;
        const cx = Math.min(start.x, end.x) + rx;
        const cy = Math.min(start.y, end.y) + ry;

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.restore();
    });

    // Draw Laser Trail
    if (laserPoints.length > 1) {
      const now = Date.now();
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 1; i < laserPoints.length; i++) {
        const p1 = laserPoints[i - 1];
        const p2 = laserPoints[i];
        const age = now - p2.time;
        if (age < 1200) {
          const alpha = 1 - age / 1200;
          ctx.strokeStyle = `rgba(245, 158, 11, ${alpha})`;
          ctx.shadowColor = "#f59e0b";
          ctx.shadowBlur = 10;
          ctx.lineWidth = 6 * alpha;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }, [strokes, currentStroke, laserPoints]);

  const requestRender = useCallback(() => {
    if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    animFrameIdRef.current = requestAnimationFrame(redrawCanvas);
  }, [redrawCanvas]);

  useEffect(() => {
    requestRender();
  }, [requestRender]);

  // Clean laser trail loop
  useEffect(() => {
    if (laserPoints.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setLaserPoints((prev) => prev.filter((pt) => now - pt.time < 1200));
    }, 50);
    return () => clearInterval(interval);
  }, [laserPoints]);

  // ResizeObserver for container resizing
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
          requestRender();
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [requestRender]);

  // Smooth 60 FPS Mouse Wheel Zooming Listener (Debounced React State Sync)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Smooth exponential zoom scaling
      const delta = -e.deltaY;
      const zoomFactor = Math.exp(delta * 0.0015);
      const currentZoom = zoomRef.current;
      const nextZoom = Math.min(Math.max(0.2, currentZoom * zoomFactor), 4);

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Keep point under cursor stationary
      const newPanX = mouseX - (mouseX - panRef.current.x) * (nextZoom / currentZoom);
      const newPanY = mouseY - (mouseY - panRef.current.y) * (nextZoom / currentZoom);

      panRef.current = { x: newPanX, y: newPanY };
      zoomRef.current = nextZoom;

      // Immediate 60 FPS Canvas Render
      requestRender();

      // Debounce React state updates to avoid forcing 120 React re-renders per second
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        onPanChange(panRef.current.x, panRef.current.y);
        if (onZoomChange) onZoomChange(zoomRef.current);
      }, 100);
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [onPanChange, onZoomChange, requestRender]);

  // Arrow helper
  const drawArrow = (
    ctx: CanvasRenderingContext2D,
    fromx: number,
    fromy: number,
    tox: number,
    toy: number,
    width: number
  ) => {
    const headlen = 12 + width;
    const dx = tox - fromx;
    const dy = toy - fromy;
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.moveTo(fromx, fromy);
    ctx.lineTo(tox, toy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tox, toy);
    ctx.lineTo(
      tox - headlen * Math.cos(angle - Math.PI / 6),
      toy - headlen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      tox - headlen * Math.cos(angle + Math.PI / 6),
      toy - headlen * Math.sin(angle + Math.PI / 6)
    );
    ctx.lineTo(tox, toy);
    ctx.fill();
  };

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (toolMode === "pan" || e.button === 1) {
      setIsPanning(true);
      dragStartRef.current = {
        screenX: e.clientX,
        screenY: e.clientY,
        initialPanX: panRef.current.x,
        initialPanY: panRef.current.y,
      };
      return;
    }

    const world = getCanvasWorldCoords(e.clientX, e.clientY);

    if (toolMode === "text") {
      setTextInputPos(world);
      return;
    }

    if (toolMode === "select") {
      setSelectionStart(world);
      setSelectionBox({ x: world.x, y: world.y, width: 0, height: 0 });
      setIsDrawing(true);
      return;
    }

    setIsDrawing(true);

    if (toolMode === "laser") {
      setLaserPoints((prev) => [...prev, { x: world.x, y: world.y, time: Date.now() }]);
      return;
    }

    const newStroke: CanvasStroke = {
      id: `stroke-${Date.now()}`,
      tool: toolMode,
      color: strokeColor,
      width: strokeWidth,
      points: [world],
    };

    setCurrentStroke(newStroke);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.screenX;
      const dy = e.clientY - dragStartRef.current.screenY;
      const newPanX = dragStartRef.current.initialPanX + dx;
      const newPanY = dragStartRef.current.initialPanY + dy;

      panRef.current = { x: newPanX, y: newPanY };
      requestRender();
      return;
    }

    const world = getCanvasWorldCoords(e.clientX, e.clientY);

    if (toolMode === "laser") {
      setLaserPoints((prev) => [...prev, { x: world.x, y: world.y, time: Date.now() }]);
      return;
    }

    if (!isDrawing) return;

    if (toolMode === "select" && selectionStart) {
      const minX = Math.min(selectionStart.x, world.x);
      const minY = Math.min(selectionStart.y, world.y);
      const w = Math.abs(world.x - selectionStart.x);
      const h = Math.abs(world.y - selectionStart.y);
      const coords = { x: minX, y: minY, width: w, height: h };
      setSelectionBox(coords);
      if (onSelectionChange) onSelectionChange(coords);
      return;
    }

    if (currentStroke) {
      setCurrentStroke((prev) =>
        prev
          ? {
              ...prev,
              points: [...prev.points, world],
            }
          : null
      );
      requestRender();
    }
  };

  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
      dragStartRef.current = null;
      onPanChange(panRef.current.x, panRef.current.y);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    if (toolMode === "select") {
      setSelectionStart(null);
      return;
    }

    if (currentStroke && currentStroke.points.length > 0) {
      setUndoStack((prev) => [...prev, strokes]);
      setRedoStack([]);
      const updated = [...strokes, currentStroke];
      setStrokes(updated);
      if (onStrokesChange) onStrokesChange(updated.length);
      setCurrentStroke(null);
    }
  };

  // Undo / Redo Actions
  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prevStrokes = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, strokes]);
    setUndoStack((prev) => prev.slice(0, -1));
    setStrokes(prevStrokes);
    if (onStrokesChange) onStrokesChange(prevStrokes.length);
  }, [undoStack, strokes, setStrokes, onStrokesChange]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextStrokes = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, strokes]);
    setRedoStack((prev) => prev.slice(0, -1));
    setStrokes(nextStrokes);
    if (onStrokesChange) onStrokesChange(nextStrokes.length);
  }, [redoStack, strokes, setStrokes, onStrokesChange]);

  const clearCanvas = useCallback(() => {
    setUndoStack((prev) => [...prev, strokes]);
    setRedoStack([]);
    setStrokes([]);
    setSelectionBox(null);
    if (onStrokesChange) onStrokesChange(0);
    if (onSelectionChange) onSelectionChange(null);
  }, [strokes, setStrokes, onStrokesChange, onSelectionChange]);

  // Extract Cropped Region Image Base64 data URL
  const getCroppedRegion = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    let coords: CanvasCoordinates = selectionBox || {
      x: 0,
      y: 0,
      width: canvas.width / zoomRef.current,
      height: canvas.height / zoomRef.current,
    };

    if (coords.width < 10 || coords.height < 10) {
      coords = { x: 0, y: 0, width: canvas.width / zoomRef.current, height: canvas.height / zoomRef.current };
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = coords.width;
    tempCanvas.height = coords.height;
    const tempCtx = tempCanvas.getContext("2d");

    if (!tempCtx) return null;

    tempCtx.fillStyle = "#ffffff";
    tempCtx.fillRect(0, 0, coords.width, coords.height);

    strokes.forEach((stroke) => {
      if (stroke.points.length === 0) return;
      tempCtx.save();
      tempCtx.strokeStyle = stroke.color;
      tempCtx.fillStyle = stroke.color;
      tempCtx.lineWidth = stroke.width;
      tempCtx.lineCap = "round";
      tempCtx.lineJoin = "round";

      if (stroke.tool === "pen") {
        tempCtx.beginPath();
        tempCtx.moveTo(stroke.points[0].x - coords.x, stroke.points[0].y - coords.y);
        for (let i = 1; i < stroke.points.length; i++) {
          tempCtx.lineTo(stroke.points[i].x - coords.x, stroke.points[i].y - coords.y);
        }
        tempCtx.stroke();
      }
      tempCtx.restore();
    });

    const imageBase64 = tempCanvas.toDataURL("image/png");
    return { imageBase64, coordinates: coords };
  }, [selectionBox, strokes]);

  if (refCanvasApi) {
    refCanvasApi.current = {
      getCroppedRegion,
      clearCanvas,
      undo,
      redo,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    };
  }

  const handleAddTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInputPos || !textInputValue.trim()) {
      setTextInputPos(null);
      return;
    }

    onAddNoteNode({
      id: `note-${Date.now()}`,
      x: textInputPos.x,
      y: textInputPos.y,
      text: textInputValue.trim(),
      latex: textInputValue.trim(),
    });

    setTextInputValue("");
    setTextInputPos(null);
  };

  const getCursorClass = () => {
    if (toolMode === "pan") return isPanning ? "cursor-grabbing" : "cursor-grab";
    if (toolMode === "select") return "cursor-crosshair";
    if (toolMode === "eraser") return "cursor-cell";
    return "cursor-crosshair";
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none touch-none ${getCursorClass()} ${
        gridMode === "graph"
          ? "canvas-grid-graph"
          : gridMode === "dots"
          ? "canvas-grid-dots"
          : "bg-background"
      }`}
    >
      {/* Primary HTML5 Canvas Layer */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="absolute inset-0 z-10 w-full h-full"
      />

      {/* Selection Bounding Box Overlay */}
      {selectionBox && selectionBox.width > 5 && selectionBox.height > 5 && (
        <div
          className="absolute z-20 border-2 border-dashed border-indigo-500 bg-indigo-500/10 pointer-events-none rounded-md shadow-lg"
          style={{
            left: `${selectionBox.x * zoomRef.current + panRef.current.x}px`,
            top: `${selectionBox.y * zoomRef.current + panRef.current.y}px`,
            width: `${selectionBox.width * zoomRef.current}px`,
            height: `${selectionBox.height * zoomRef.current}px`,
          }}
        >
          <div className="absolute -top-6 left-0 bg-indigo-600 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow-sm">
            Target [{Math.round(selectionBox.x)}, {Math.round(selectionBox.y)}]
          </div>
        </div>
      )}

      {/* Canvas Text / Math Note Overlay Nodes */}
      {noteNodes.map((node) => (
        <div
          key={node.id}
          className="absolute z-20 bg-card/90 backdrop-blur border shadow-md px-3 py-2 rounded-xl text-sm font-medium border-indigo-500/30"
          style={{
            left: `${node.x * zoomRef.current + panRef.current.x}px`,
            top: `${node.y * zoomRef.current + panRef.current.y}px`,
          }}
        >
          <KatexRenderer math={node.latex || node.text} block={false} />
        </div>
      ))}

      {/* Text Node Inline Input Popover */}
      {textInputPos && (
        <form
          onSubmit={handleAddTextSubmit}
          className="absolute z-30 bg-background border shadow-2xl rounded-xl p-2 flex gap-2 w-72"
          style={{
            left: `${textInputPos.x * zoomRef.current + panRef.current.x}px`,
            top: `${textInputPos.y * zoomRef.current + panRef.current.y}px`,
          }}
        >
          <input
            type="text"
            autoFocus
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            placeholder="Type equation e.g. x^2 - 4 = 0"
            className="flex-1 bg-muted px-3 py-1.5 rounded-lg text-xs outline-none border focus:border-primary font-mono"
          />
          <button
            type="submit"
            className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-lg"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}
