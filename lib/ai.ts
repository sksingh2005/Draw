import { GoogleGenAI } from "@google/genai";
import {
  MathAnalysisResult,
  CanvasCoordinates,
  AiCanvasElement,
  parseMathAnalysisResponse,
} from "./math-parser";
import { extractNewCanvasDrawings } from "./excalidraw-elements";
import {
  WHITEBOARD_SYSTEM_PROMPT,
  buildWhiteboardUserPrompt,
  type AnalysisMode,
} from "./prompts/whiteboard-professor";

const CANDIDATE_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

export type AnalyzeStreamEvent =
  | { type: "status"; message: string }
  | { type: "draw"; element: AiCanvasElement; index: number }
  | { type: "result"; data: MathAnalysisResult }
  | { type: "error"; message: string };

export interface AnalyzeParams {
  imageBase64?: string;
  coordinates: CanvasCoordinates;
  promptText?: string;
  userApiKey?: string;
  /** Ownership-tagged layout map ([USER] / [AI]). */
  existingElementsSummary?: string;
  freeSpaceHints?: string;
  selectionSummary?: string;
  suggestedPlacement?: CanvasCoordinates;
  conversationSnippet?: string;
  mode?: AnalysisMode;
}

function resolveApiKey(userApiKey?: string): string {
  const apiKey =
    userApiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "Gemini API Key missing! Please click '🔑 Connect Key' in the top navbar to enter your Gemini API key from Google AI Studio."
    );
  }
  return apiKey.trim();
}

function buildContents(params: AnalyzeParams): any[] {
  const contents: any[] = [];
  const mode: AnalysisMode =
    params.mode ||
    (params.selectionSummary
      ? "selection"
      : params.promptText?.trim()
        ? "followup"
        : "full");

  if (params.imageBase64) {
    const base64Data = params.imageBase64.replace(
      /^data:image\/(png|jpeg|jpg|webp);base64,/,
      ""
    );
    contents.push({
      inlineData: {
        mimeType: "image/png",
        data: base64Data,
      },
    });
  }

  contents.push({
    text: buildWhiteboardUserPrompt({
      mode,
      coordinates: params.coordinates,
      promptText: params.promptText,
      existingElementsSummary: params.existingElementsSummary,
      freeSpaceHints: params.freeSpaceHints,
      selectionSummary: params.selectionSummary,
      suggestedPlacement: params.suggestedPlacement,
      conversationSnippet: params.conversationSnippet,
    }),
  });

  return contents;
}

/**
 * Perform real spatial AI analysis on a cropped canvas image and/or equation query using Gemini API
 */
export async function analyzeCanvasContent(
  params: AnalyzeParams
): Promise<MathAnalysisResult> {
  const apiKey = resolveApiKey(params.userApiKey);
  const ai = new GoogleGenAI({ apiKey });
  const contents = buildContents(params);

  let lastError: any = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: WHITEBOARD_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const textOutput = response.text || "";
      return parseMathAnalysisResponse(textOutput, params.coordinates);
    } catch (err: any) {
      console.warn(
        `Model ${modelName} failed or not found, trying next candidate:`,
        err?.message || err
      );
      lastError = err;
    }
  }

  throw (
    lastError ||
    new Error("Failed to execute Gemini API call across all candidate models.")
  );
}

/**
 * Stream analysis: yields draw events as complete canvasDrawings objects appear
 * in the partial JSON stream, then a final result event.
 */
export async function* streamAnalyzeCanvasContent(
  params: AnalyzeParams
): AsyncGenerator<AnalyzeStreamEvent> {
  const apiKey = resolveApiKey(params.userApiKey);
  const ai = new GoogleGenAI({ apiKey });
  const contents = buildContents(params);
  const mode =
    params.mode ||
    (params.selectionSummary
      ? "selection"
      : params.promptText?.trim()
        ? "followup"
        : "full");

  yield {
    type: "status",
    message:
      mode === "selection"
        ? "Focusing on your canvas selection…"
        : mode === "followup"
          ? "Preparing a targeted canvas update…"
          : "Connecting to Gemini…",
  };

  let lastError: any = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      yield { type: "status", message: `Streaming from ${modelName}…` };

      const stream = await ai.models.generateContentStream({
        model: modelName,
        contents,
        config: {
          systemInstruction: WHITEBOARD_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      let accumulated = "";
      let emittedDrawCount = 0;
      let drawingPhase = false;

      for await (const chunk of stream) {
        const piece = chunk.text || "";
        if (!piece) continue;
        accumulated += piece;

        const { items, totalFound } = extractNewCanvasDrawings(
          accumulated,
          emittedDrawCount
        );

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

        if (totalFound > emittedDrawCount) {
          emittedDrawCount = totalFound;
        }
      }

      yield { type: "status", message: "Finalizing explanation…" };
      const result = parseMathAnalysisResponse(accumulated, params.coordinates);

      const finalDrawings = result.canvasDrawings || [];
      for (let i = emittedDrawCount; i < finalDrawings.length; i++) {
        yield { type: "draw", element: finalDrawings[i], index: i };
      }

      yield { type: "result", data: result };
      return;
    } catch (err: any) {
      console.warn(
        `Stream model ${modelName} failed, trying next:`,
        err?.message || err
      );
      lastError = err;
    }
  }

  yield {
    type: "error",
    message:
      lastError?.message ||
      "Failed to stream Gemini API call across all candidate models.",
  };
}
