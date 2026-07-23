import { CanvasStroke, CanvasNoteNode } from "@/components/canvas/MathCanvas";
import { MathAnalysisResult } from "./math-parser";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  imageCrop?: string;
  analysisResult?: MathAnalysisResult;
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
  messages: ChatMessage[];
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
    return JSON.parse(raw);
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
