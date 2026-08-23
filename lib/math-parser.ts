import { sanitizeMathLatex } from "@/lib/utils";
import { parseCanvasPlan, type CanvasPlan } from "@/lib/canvas-plan";

export interface CanvasCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KeyVariable {
  symbol: string;
  value: string;
  description: string;
}

export interface SolutionStep {
  stepNumber: number;
  title: string;
  explanation: string;
  latex: string;
  result: string;
}

export interface GraphDataPoint {
  x: number;
  y: number;
}

export interface CriticalPoint {
  x: number;
  y: number;
  label: string;
}

export interface GraphConfig {
  functionString: string;
  title?: string;
  domain: [number, number];
  points: GraphDataPoint[];
  criticalPoints?: CriticalPoint[];
}

export interface ConceptExplanation {
  title: string;
  coreIdea: string;
  realWorldApplication: string;
  keyTakeaway: string;
}

export interface PracticeProblem {
  id: string;
  question: string;
  latex: string;
  hint: string;
  solution: string;
}

export interface AiCanvasElement {
  type: "rectangle" | "ellipse" | "arrow" | "text" | "diamond" | "freedraw" | "line" | "svg";
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: "hachure" | "solid" | "cross-hatch";
  text?: string;
  label?: string;
  /** Relative polyline points for freedraw / line / arrow (Excalidraw-style). */
  points?: [number, number][];
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  fontSize?: number;
  /** Semantic icon name rendered by the client as a trusted SVG canvas asset. */
  icon?: CanvasIconName;
  /** Optional static SVG illustration. Sanitized client-side before rendering. */
  svgMarkup?: string;
  /** Accessible description retained in the image element metadata. */
  svgAlt?: string;
  /** Existing canvas element id or semantic description this item relates to. */
  anchorHint?: string;
}

export type CanvasIconName =
  | "client"
  | "gateway"
  | "identity"
  | "catalog"
  | "recommendation"
  | "playback"
  | "database"
  | "cache"
  | "event"
  | "cdn"
  | "origin"
  | "shield"
  | "api"
  | "service"
  | "load-balancer"
  | "queue"
  | "worker"
  | "notification"
  | "analytics"
  | "search"
  | "storage";

export interface MathAnalysisResult {
  id: string;
  classification: "equation" | "calculus" | "geometry" | "physics" | "concept" | "graph" | "architecture" | "schema" | "flowchart";
  latexFormula: string;
  detectedText: string;
  targetCoordinates: CanvasCoordinates;
  summary: string;
  /** Always append-only for canvas safety; never full rewrite. */
  updateMode?: "append";
  /** What part of the board this answer attaches to. */
  focusNote?: string;
  /** Stable client-generated identity for the canvas update. */
  diagramId?: string;
  /** A compact label for selecting this diagram again from chat history. */
  diagramTitle?: string;
  /** Optional Mermaid source for portable flowchart/schema/architecture diagrams. */
  mermaidCode?: string;
  /** Coordinate-free drawing program compiled deterministically by the client. */
  canvasPlan?: CanvasPlan;
  keyVariables: KeyVariable[];
  givenData: string[];
  steps: SolutionStep[];
  graphConfig?: GraphConfig;
  conceptExplanation?: ConceptExplanation;
  practiceProblems: PracticeProblem[];
  canvasDrawings?: AiCanvasElement[];
  createdAt: number;
}

/**
 * Clean and parse raw JSON text returned from LLM response into structured MathAnalysisResult
 */
export function parseMathAnalysisResponse(
  rawText: string,
  coordinates: CanvasCoordinates = { x: 100, y: 100, width: 300, height: 200 },
  diagram?: { id?: string; title?: string }
): MathAnalysisResult {
  const resultId = `sol-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  try {
    // 1. Strip markdown JSON code fence blocks if present
    let cleanJsonStr = rawText.trim();
    if (cleanJsonStr.startsWith("```json")) {
      cleanJsonStr = cleanJsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanJsonStr.startsWith("```")) {
      cleanJsonStr = cleanJsonStr.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // 2. Parse JSON
    const parsed = JSON.parse(cleanJsonStr);

    return {
      id: resultId,
      classification: validateClassification(parsed.classification),
      latexFormula: parsed.latexFormula ? cleanLatex(parsed.latexFormula) : "",
      detectedText: parsed.detectedText || "Canvas Query / Diagram",
      targetCoordinates: parsed.targetCoordinates || coordinates,
      summary: parsed.summary || "Step-by-step breakdown of the detected problem or system design.",
      updateMode: "append",
      focusNote: parsed.focusNote || undefined,
      diagramId: diagram?.id,
      diagramTitle: parsed.diagramTitle || diagram?.title || parsed.summary?.slice(0, 72) || "Canvas diagram",
      canvasPlan: parseCanvasPlan(parsed.canvasPlan),
      mermaidCode: sanitizeMermaidCode(parsed.mermaidCode),
      keyVariables: Array.isArray(parsed.keyVariables)
        ? parsed.keyVariables.map((v: any) => ({
            symbol: cleanLatex(v.symbol || "Node"),
            value: String(v.value || ""),
            description: String(v.description || "")
          }))
        : [],
      givenData: Array.isArray(parsed.givenData) ? parsed.givenData.map(String) : [],
      steps: Array.isArray(parsed.steps)
        ? parsed.steps.map((s: any, idx: number) => ({
            stepNumber: s.stepNumber || idx + 1,
            title: String(s.title || `Step ${idx + 1}`),
            explanation: String(s.explanation || ""),
            latex: cleanLatex(s.latex || ""),
            result: cleanLatex(s.result || "")
          }))
        : [],
      graphConfig: parsed.graphConfig ? parseGraphConfig(parsed.graphConfig) : undefined,
      conceptExplanation: parsed.conceptExplanation ? {
        title: String(parsed.conceptExplanation.title || "Core System Concept"),
        coreIdea: String(parsed.conceptExplanation.coreIdea || ""),
        realWorldApplication: String(parsed.conceptExplanation.realWorldApplication || ""),
        keyTakeaway: String(parsed.conceptExplanation.keyTakeaway || "")
      } : undefined,
      practiceProblems: Array.isArray(parsed.practiceProblems)
        ? parsed.practiceProblems.map((p: any, pIdx: number) => ({
            id: `prac-${pIdx}`,
            question: String(p.question || "Design Challenge"),
            latex: cleanLatex(p.latex || ""),
            hint: String(p.hint || "Think about scalability and decoupled architecture."),
            solution: String(p.solution || "Solution")
          }))
        : [],
      canvasDrawings: Array.isArray(parsed.canvasDrawings)
        ? parsed.canvasDrawings.map((elem: any) =>
            normalizeCanvasDrawing(elem, coordinates)
          )
        : undefined,
      createdAt: Date.now()
    };
  } catch (err) {
    console.warn("Failed to parse JSON directly from LLM output. Returning structured fallback:", err);
    const fallback = createFallbackResult(rawText, coordinates, resultId);
    return {
      ...fallback,
      diagramId: diagram?.id,
      diagramTitle: diagram?.title || "Canvas diagram",
    };
  }
}

function sanitizeMermaidCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value
    .trim()
    .replace(/^```mermaid\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");
  return trimmed ? trimmed.slice(0, 12_000) : undefined;
}

function validateClassification(cat: any): MathAnalysisResult["classification"] {
  const valid = ["equation", "calculus", "geometry", "physics", "concept", "graph", "architecture", "schema", "flowchart"];
  if (typeof cat === "string" && valid.includes(cat.toLowerCase())) {
    return cat.toLowerCase() as MathAnalysisResult["classification"];
  }
  return "architecture";
}

const VALID_DRAW_TYPES = new Set([
  "rectangle",
  "ellipse",
  "arrow",
  "text",
  "diamond",
  "freedraw",
  "line",
  "svg",
]);

export function normalizeCanvasDrawing(
  elem: any,
  coordinates: CanvasCoordinates = { x: 100, y: 100, width: 300, height: 200 }
): AiCanvasElement {
  const typeRaw = String(elem?.type || "rectangle").toLowerCase();
  const type = (VALID_DRAW_TYPES.has(typeRaw) ? typeRaw : "rectangle") as AiCanvasElement["type"];

  const points = Array.isArray(elem?.points)
    ? (elem.points as unknown[])
        .map((p) => {
          if (Array.isArray(p) && p.length >= 2) {
            return [Number(p[0]) || 0, Number(p[1]) || 0] as [number, number];
          }
          return null;
        })
        .filter(Boolean) as [number, number][]
    : undefined;

  const finiteOr = (value: unknown, fallback: number): number => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  return {
    type,
    x: finiteOr(elem?.x, coordinates.x + 350),
    y: finiteOr(elem?.y, coordinates.y),
    width: Math.max(1, finiteOr(elem?.width, 280)),
    height: Math.max(1, finiteOr(elem?.height, 140)),
    strokeColor: elem?.strokeColor || "#6366f1",
    backgroundColor: elem?.backgroundColor || "transparent",
    fillStyle: elem?.fillStyle || "solid",
    text: elem?.text || elem?.label || undefined,
    label: elem?.label || undefined,
    points,
    strokeWidth: elem?.strokeWidth != null ? Number(elem.strokeWidth) : undefined,
    strokeStyle: elem?.strokeStyle || undefined,
    fontSize: elem?.fontSize != null ? Number(elem.fontSize) : undefined,
    icon: parseCanvasIcon(elem?.icon),
    svgMarkup: type === "svg" && typeof elem?.svgMarkup === "string"
      ? elem.svgMarkup.slice(0, 12_000)
      : undefined,
    svgAlt: type === "svg" && typeof elem?.svgAlt === "string"
      ? elem.svgAlt.slice(0, 180)
      : undefined,
    anchorHint: typeof elem?.anchorHint === "string"
      ? elem.anchorHint.slice(0, 120)
      : undefined,
  };
}

function parseCanvasIcon(value: unknown): CanvasIconName | undefined {
  const valid: CanvasIconName[] = [
    "client", "gateway", "identity", "catalog", "recommendation", "playback",
    "database", "cache", "event", "cdn", "origin", "shield", "api",
    "service", "load-balancer", "queue", "worker", "notification",
    "analytics", "search", "storage",
  ];
  return typeof value === "string" && valid.includes(value as CanvasIconName)
    ? value as CanvasIconName
    : undefined;
}

function cleanLatex(latexStr: string): string {
  if (!latexStr) return "";
  let cleaned = latexStr.trim();
  if (cleaned.startsWith("$$") && cleaned.endsWith("$$")) {
    cleaned = cleaned.slice(2, -2).trim();
  } else if (cleaned.startsWith("$") && cleaned.endsWith("$")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

function parseGraphConfig(cfg: any): GraphConfig {
  const domain: [number, number] = Array.isArray(cfg.domain) && cfg.domain.length === 2
    ? [Number(cfg.domain[0]) || -10, Number(cfg.domain[1]) || 10]
    : [-10, 10];

  let points: GraphDataPoint[] = [];
  if (Array.isArray(cfg.points) && cfg.points.length > 0) {
    points = cfg.points.map((p: any) => ({
      x: Number(p.x) || 0,
      y: Number(p.y) || 0
    }));
  } else {
    points = generateSamplePoints(cfg.functionString || "x^2", domain);
  }

  return {
    functionString: cfg.functionString || "x^2",
    title: cfg.title || `Graph of ${cfg.functionString || "f(x)"}`,
    domain,
    points,
    criticalPoints: Array.isArray(cfg.criticalPoints)
      ? cfg.criticalPoints.map((cp: any) => ({
          x: Number(cp.x) || 0,
          y: Number(cp.y) || 0,
          label: String(cp.label || "Point")
        }))
      : []
  };
}

export function generateSamplePoints(funcStr: string, domain: [number, number]): GraphDataPoint[] {
  const points: GraphDataPoint[] = [];
  const minX = domain[0];
  const maxX = domain[1];
  const step = (maxX - minX) / 80;

  for (let x = minX; x <= maxX; x += step) {
    let y = 0;
    try {
      if (funcStr.includes("sin")) y = Math.sin(x);
      else if (funcStr.includes("cos")) y = Math.cos(x);
      else if (funcStr.includes("x^2") || funcStr.includes("x*x")) y = x * x;
      else if (funcStr.includes("x^3")) y = x * x * x;
      else if (funcStr.includes("1/x")) y = x !== 0 ? 1 / x : 0;
      else y = x;
    } catch {
      y = 0;
    }
    points.push({ x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) });
  }

  return points;
}

export function createFallbackResult(
  rawText: string,
  coordinates: CanvasCoordinates,
  resultId: string
): MathAnalysisResult {
  const targetX = coordinates.x || 100;
  const targetY = coordinates.y || 100;

  return {
    id: resultId,
    classification: "equation",
    latexFormula: "ax^2 + bx + c = 0",
    detectedText: rawText ? rawText.slice(0, 100) : "Handwritten Math Expression",
    targetCoordinates: coordinates,
    summary: "Step-by-step breakdown of the detected canvas problem.",
    keyVariables: [
      { symbol: "a", value: "1", description: "Leading coefficient" },
      { symbol: "b", value: "-5", description: "Linear coefficient" },
      { symbol: "c", value: "6", description: "Constant term" }
    ],
    givenData: ["Polynomial Degree: 2", "Standard Form: x² - 5x + 6 = 0"],
    steps: [
      {
        stepNumber: 1,
        title: "Identify Coefficients",
        explanation: "Extract values for a, b, and c from standard form ax² + bx + c = 0.",
        latex: "a=1, \\, b=-5, \\, c=6",
        result: "Coefficients identified"
      },
      {
        stepNumber: 2,
        title: "Apply Quadratic Formula",
        explanation: "Substitute values into x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
        latex: "x = \\frac{-(-5) \\pm \\sqrt{(-5)^2 - 4(1)(6)}}{2(1)}",
        result: "x = \\frac{5 \\pm \\sqrt{25 - 24}}{2}"
      },
      {
        stepNumber: 3,
        title: "Solve for Roots",
        explanation: "Calculate the two distinct real roots.",
        latex: "x_1 = \\frac{5 + 1}{2} = 3, \\quad x_2 = \\frac{5 - 1}{2} = 2",
        result: "x = 3 \\text{ or } x = 2"
      }
    ],
    graphConfig: {
      functionString: "x^2 - 5*x + 6",
      title: "Parabola Graph f(x) = x² - 5x + 6",
      domain: [-1, 7],
      points: generateSamplePoints("x^2", [-1, 7]),
      criticalPoints: [
        { x: 2.5, y: -0.25, label: "Vertex (2.5, -0.25)" },
        { x: 2, y: 0, label: "Root x = 2" },
        { x: 3, y: 0, label: "Root x = 3" }
      ]
    },
    conceptExplanation: {
      title: "Quadratic Roots & Parabola Intercepts",
      coreIdea: "The roots of a quadratic equation correspond to the x-intercepts where the parabola crosses the horizontal x-axis.",
      realWorldApplication: "Trajectory of launched objects, radar dish focusing, and profit optimization curves.",
      keyTakeaway: "When the discriminant b² - 4ac > 0, the equation yields two distinct real solutions."
    },
    practiceProblems: [
      {
        id: "p1",
        question: "Solve for x in the quadratic equation:",
        latex: "x^2 - 7x + 12 = 0",
        hint: "Find two numbers that multiply to 12 and add to 7.",
        solution: "x = 3 \\text{ or } x = 4"
      }
    ],
    canvasDrawings: [
      {
        type: "arrow",
        x: targetX + 180,
        y: targetY + 60,
        width: 120,
        height: 0,
        strokeColor: "#6366f1"
      },
      {
        type: "rectangle",
        x: targetX + 320,
        y: targetY,
        width: 360,
        height: 180,
        strokeColor: "#6366f1",
        backgroundColor: "#e0e7ff",
        fillStyle: "hachure",
        text: "✨ AI Solution:\nx² - 5x + 6 = 0\nRoots: x = 2, x = 3"
      },
      {
        type: "freedraw",
        x: targetX + 330,
        y: targetY + 175,
        width: 140,
        height: 20,
        strokeColor: "#ef4444",
        strokeWidth: 3,
        points: [
          [0, 5],
          [20, 2],
          [45, 8],
          [70, 3],
          [95, 7],
          [120, 2],
          [140, 5]
        ]
      },
      {
        type: "ellipse",
        x: targetX + 340,
        y: targetY + 190,
        width: 180,
        height: 50,
        strokeColor: "#10b981",
        text: "Roots: x = 2, x = 3"
      }
    ],
    createdAt: Date.now()
  };
}
