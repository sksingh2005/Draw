export interface CanvasStroke {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface CanvasNoteNode {
  id: string;
  x: number;
  y: number;
  text: string;
  latex?: string;
}
import { MathAnalysisResult } from "./math-parser";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  imageCrop?: string;
  analysisResult?: MathAnalysisResult;
  /** Connects a chat response to the native canvas elements it created. */
  diagramId?: string;
  diagramTitle?: string;
  mermaidCode?: string;
  timestamp: number;
}

export interface WorkspacePage {
  id: string;
  title: string;
  category: "math" | "physics" | "general" | "coding" | "puzzles";
  createdAt: number;
  updatedAt: number;
  strokes: CanvasStroke[];
  noteNodes: CanvasNoteNode[];
  /** Current native canvas scene. `strokes` remains only for legacy freehand data. */
  excalidrawElements?: Record<string, unknown>[];
  /** Binary assets used by native image elements, including AI-generated SVG icons. */
  excalidrawFiles?: Record<string, Record<string, unknown>>;
  appState?: Record<string, unknown>;
  messages: ChatMessage[];
}

export function getPageElements(page: WorkspacePage): Record<string, unknown>[] {
  if (Array.isArray(page.excalidrawElements)) return page.excalidrawElements;

  // Older releases stored the Excalidraw scene in `strokes`; retain it on load.
  if (Array.isArray(page.strokes) && page.strokes.some((item) => "type" in item)) {
    return page.strokes as unknown as Record<string, unknown>[];
  }
  return [];
}

const STORAGE_KEY_PAGES = "mathcanvas_workspace_pages_v1";
const STORAGE_KEY_ACTIVE_ID = "mathcanvas_active_page_id_v1";

const DEFAULT_PAGES: WorkspacePage[] = [
  {
    id: "page-default-math",
    title: "Math & Calculus Whiteboard",
    category: "math",
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
    strokes: [],
    noteNodes: [
      {
        id: "n1",
        x: 140,
        y: 120,
        text: "Quadratic Formula",
        latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"
      }
    ],
    messages: [
      {
        id: "m1",
        sender: "assistant",
        text: "Welcome to your interactive AI Math & Science Workspace! Draw or select equations on the canvas, or ask any question in this chat.",
        timestamp: Date.now() - 3600000
      }
    ]
  },
  {
    id: "page-default-physics",
    title: "Physics & Kinematics Study",
    category: "physics",
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 7200000,
    strokes: [],
    noteNodes: [
      {
        id: "n2",
        x: 160,
        y: 140,
        text: "Energy Equivalence",
        latex: "E = m c^2"
      }
    ],
    messages: [
      {
        id: "m2",
        sender: "assistant",
        text: "Physics Kinematics & Mechanics workspace ready. Draw force diagrams or ask about motion equations.",
        timestamp: Date.now() - 7200000
      }
    ]
  }
];

export function getSavedPages(): WorkspacePage[] {
  if (typeof window === "undefined") return DEFAULT_PAGES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAGES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_PAGES, JSON.stringify(DEFAULT_PAGES));
      return DEFAULT_PAGES;
    }
    return JSON.parse(raw).map((page: WorkspacePage) => ({
      ...page,
      excalidrawElements: getPageElements(page),
    }));
  } catch {
    return DEFAULT_PAGES;
  }
}

export function savePage(page: WorkspacePage): void {
  if (typeof window === "undefined") return;
  try {
    const pages = getSavedPages();
    const idx = pages.findIndex((p) => p.id === page.id);
    const updatedPage = { ...page, updatedAt: Date.now() };

    if (idx >= 0) {
      pages[idx] = updatedPage;
    } else {
      pages.unshift(updatedPage);
    }
    localStorage.setItem(STORAGE_KEY_PAGES, JSON.stringify(pages));
  } catch (err) {
    console.warn("Failed to save workspace page:", err);
  }
}

export function createNewPage(
  title: string = "New Workspace Canvas",
  category: WorkspacePage["category"] = "general"
): WorkspacePage {
  const newPage: WorkspacePage = {
    id: `page-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    title,
    category,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    strokes: [],
    excalidrawElements: [],
    noteNodes: [],
    messages: [
      {
        id: `msg-${Date.now()}`,
        sender: "assistant",
        text: `New workspace page created: "${title}". Draw on the whiteboard canvas or ask any question below!`,
        timestamp: Date.now()
      }
    ]
  };

  savePage(newPage);
  setActivePageId(newPage.id);
  return newPage;
}

export function deletePage(id: string): WorkspacePage[] {
  if (typeof window === "undefined") return [];
  try {
    let pages = getSavedPages().filter((p) => p.id !== id);
    if (pages.length === 0) {
      const fallback = createNewPage("Math Workspace", "math");
      pages = [fallback];
    }
    localStorage.setItem(STORAGE_KEY_PAGES, JSON.stringify(pages));
    return pages;
  } catch {
    return [];
  }
}

export function getActivePageId(): string {
  if (typeof window === "undefined") return "page-default-math";
  try {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_ID) || "page-default-math";
  } catch {
    return "page-default-math";
  }
}

export function setActivePageId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_ID, id);
  } catch (err) {
    console.warn("Failed to save active page ID:", err);
  }
}

export function exportPageJson(page: WorkspacePage): void {
  const filename = `${page.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-board.json`;
  const jsonStr = JSON.stringify(page, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAllPagesJson(pages: WorkspacePage[]): void {
  const filename = `workspace-bundle-${new Date().toISOString().slice(0, 10)}.json`;
  const payload = {
    version: 1,
    type: "workspace-bundle",
    exportedAt: Date.now(),
    pages,
  };
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseAndValidateWorkspaceImport(jsonContent: string): WorkspacePage[] {
  const data = JSON.parse(jsonContent);
  const pagesToImport: WorkspacePage[] = [];

  const sanitizePage = (p: any): WorkspacePage => {
    if (!p || typeof p !== "object" || !p.title) {
      throw new Error("Invalid board object: missing required title field");
    }
    const timestamp = Date.now();
    const uniqueSuffix = Math.random().toString(36).substring(2, 7);
    return {
      id: `page-imported-${timestamp}-${uniqueSuffix}`,
      title: p.title.includes("(Imported)") ? p.title : `${p.title} (Imported)`,
      category: p.category || "general",
      createdAt: p.createdAt || timestamp,
      updatedAt: timestamp,
      strokes: Array.isArray(p.strokes) ? p.strokes : [],
      noteNodes: Array.isArray(p.noteNodes) ? p.noteNodes : [],
      excalidrawElements: Array.isArray(p.excalidrawElements)
        ? p.excalidrawElements
        : Array.isArray(p.strokes) && p.strokes.some((item: CanvasStroke) => "type" in item)
          ? (p.strokes as unknown as Record<string, unknown>[])
          : [],
      appState: p.appState || {},
      messages: Array.isArray(p.messages) ? p.messages : [],
    };
  };

  if (Array.isArray(data)) {
    data.forEach((p) => pagesToImport.push(sanitizePage(p)));
  } else if (data && typeof data === "object") {
    if (data.type === "workspace-bundle" && Array.isArray(data.pages)) {
      data.pages.forEach((p: any) => pagesToImport.push(sanitizePage(p)));
    } else if (data.title) {
      pagesToImport.push(sanitizePage(data));
    } else {
      throw new Error("Unrecognized JSON format: expected board page or workspace bundle.");
    }
  } else {
    throw new Error("Invalid JSON content.");
  }

  if (pagesToImport.length === 0) {
    throw new Error("No valid board pages found in JSON file.");
  }

  return pagesToImport;
}
