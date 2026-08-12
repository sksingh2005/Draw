import OpenAI from "openai";
import {
  MathAnalysisResult,
  CanvasCoordinates,
  AiCanvasElement,
  parseMathAnalysisResponse,
} from "./math-parser";
import { extractNewCanvasDrawings } from "./excalidraw-elements";
import { resultUsesMermaidCanvas } from "./mermaid-canvas";
import {
  WHITEBOARD_SYSTEM_PROMPT,
  buildWhiteboardUserPrompt,
  type AnalysisMode,
} from "./prompts/whiteboard-professor";

const DEFAULT_MODEL = "gpt-5-mini";

export type AnalyzeStreamEvent =
  | { type: "status"; message: string }
  | { type: "draw"; element: AiCanvasElement; index: number }
  | { type: "result"; data: MathAnalysisResult }
  | { type: "error"; message: string };

export interface AnalyzeParams {
  imageBase64?: string;
  coordinates: CanvasCoordinates;
  promptText?: string;
  /** Ownership-tagged layout map ([USER] / [AI]). */
  existingElementsSummary?: string;
  freeSpaceHints?: string;
  selectionSummary?: string;
  suggestedPlacement?: CanvasCoordinates;
  conversationSnippet?: string;
  mode?: AnalysisMode;
  diagramId?: string;
  diagramTitle?: string;
}

function resolveApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error(
      "OpenAI API key missing. Add OPENAI_API_KEY to .env and restart the development server."
    );
  }
  return apiKey.trim();
}

function resolveMode(params: AnalyzeParams): AnalysisMode {
  return (
    params.mode ||
    (params.selectionSummary
      ? "selection"
      : params.promptText?.trim()
        ? "followup"
        : "full")
  );
}

function buildInput(params: AnalyzeParams) {
  const content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "high" }
  > = [
    {
      type: "input_text",
      text: buildWhiteboardUserPrompt({
        mode: resolveMode(params),
        coordinates: params.coordinates,
        promptText: params.promptText,
        existingElementsSummary: params.existingElementsSummary,
        freeSpaceHints: params.freeSpaceHints,
        selectionSummary: params.selectionSummary,
        suggestedPlacement: params.suggestedPlacement,
        conversationSnippet: params.conversationSnippet,
      }),
    },
  ];

  if (params.imageBase64) {
    content.push({
      type: "input_image",
      image_url: params.imageBase64,
      detail: "high",
    });
  }

  return [{ role: "user" as const, content }];
}

function responseOptions(params: AnalyzeParams) {
  return {
    model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
    instructions: WHITEBOARD_SYSTEM_PROMPT,
    input: buildInput(params),
    text: { format: { type: "json_object" as const } },
  };
}

function parseResult(rawText: string, params: AnalyzeParams): MathAnalysisResult {
  return parseMathAnalysisResponse(rawText, params.coordinates, {
    id: params.diagramId,
    title: params.diagramTitle,
  });
}

/** Perform visual analysis using the server-only OpenAI API key. */
export async function analyzeCanvasContent(
  params: AnalyzeParams
): Promise<MathAnalysisResult> {
  const client = new OpenAI({ apiKey: resolveApiKey() });
  const response = await client.responses.create(responseOptions(params));
  return parseResult(response.output_text, params);
}

/**
 * Streams JSON text from the Responses API, emitting drawings as complete
 * canvasDrawings objects become available and then one final parsed response.
 */
export async function* streamAnalyzeCanvasContent(
  params: AnalyzeParams
): AsyncGenerator<AnalyzeStreamEvent> {
  const mode = resolveMode(params);
  const client = new OpenAI({ apiKey: resolveApiKey() });

  yield {
    type: "status",
    message:
      mode === "selection"
        ? "Focusing on your canvas selection…"
        : mode === "followup"
          ? "Preparing a targeted canvas update…"
          : "Connecting to OpenAI…",
  };

  const stream = await client.responses.create({
    ...responseOptions(params),
    stream: true,
  });

  let accumulated = "";
  let emittedDrawCount = 0;
  let drawingPhase = false;

  for await (const event of stream) {
    if (event.type === "error") {
      throw new Error(event.message || "OpenAI streaming failed.");
    }
    if (event.type !== "response.output_text.delta") continue;

    accumulated += event.delta;
    const { items, totalFound } = extractNewCanvasDrawings(
      accumulated,
      emittedDrawCount
    );
    const structuredDiagram = /"classification"\s*:\s*"(?:architecture|schema|flowchart)"/i.test(
      accumulated
    );

    // Structured diagrams are laid out from their Mermaid source after the
    // response completes. Keep primitive drawings as a fallback, but do not
    // paint them early and then duplicate the same graph on the canvas.
    if (structuredDiagram) continue;

    if (items.length > 0 && !drawingPhase) {
      drawingPhase = true;
      yield {
        type: "status",
        message:
          mode === "selection" || mode === "followup"
            ? "Appending relevant drawings (no full rewrite)…"
            : "Drawing on canvas in real time…",
      };
    }

    for (const element of items) {
      yield { type: "draw", element, index: emittedDrawCount };
      emittedDrawCount++;
    }

    if (totalFound > emittedDrawCount) emittedDrawCount = totalFound;
  }

  yield { type: "status", message: "Finalizing explanation…" };
  const result = parseResult(accumulated, params);
  const finalDrawings = result.canvasDrawings || [];
  if (!resultUsesMermaidCanvas(result)) {
    for (let i = emittedDrawCount; i < finalDrawings.length; i++) {
      yield { type: "draw", element: finalDrawings[i], index: i };
    }
  }
  yield { type: "result", data: result };
}
