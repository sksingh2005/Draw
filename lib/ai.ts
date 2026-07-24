import { GoogleGenAI } from "@google/genai";
import {
  MathAnalysisResult,
  CanvasCoordinates,
  AiCanvasElement,
  parseMathAnalysisResponse,
} from "./math-parser";
import { extractNewCanvasDrawings } from "./excalidraw-elements";

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

const SYSTEM_INSTRUCTION = `You are an elite AI Professor and Interactive Visual Whiteboard Creator.
Examine the provided canvas cropped image and/or text query.

You MUST generate interactive visual canvas elements ("canvasDrawings") using shapes, arrows, ellipses, freedraw pencil strokes, and formatted callouts to physically draw your explanation directly onto the user's canvas space in REAL TIME order.

IMPORTANT OUTPUT ORDER FOR STREAMING:
1. Put "canvasDrawings" NEAR THE TOP of the JSON (right after classification/summary) so drawings can stream to the whiteboard while you finish the rest.
2. Emit drawings in the visual teaching order (first axis, then curve, then callouts, then labels).
3. Prefer 4–10 drawings. Mix types: freedraw curves, arrows, ellipses, rectangles with text, plain text labels.

SPATIAL LAYOUT & NON-DESTRUCTIVE CANVAS UPDATE RULES:
1. Do NOT overwrite or duplicate existing canvas elements.
2. If this is a follow-up question or clarification, anchor your new explanation drawings ADJACENT to the existing elements (e.g. x = targetX + targetWidth + 50) and draw a connecting ARROW pointing from the reference element to your new clarification box.
3. Use visual callouts (rectangles, diamonds, ellipses) and arrows to create a clean, connected graph of logic on the whiteboard.
4. For freehand curves use type "freedraw" with a "points" array of relative [dx, dy] coordinates (at least 8–20 points) so the UI can animate a pencil stroke.

You MUST respond strictly with valid raw JSON matching this schema:
{
  "classification": "equation" | "calculus" | "geometry" | "physics" | "concept" | "graph",
  "summary": "Concise summary of the problem and approach",
  "canvasDrawings": [
    {
      "type": "freedraw",
      "x": 400,
      "y": 180,
      "width": 180,
      "height": 120,
      "strokeColor": "#6366f1",
      "strokeWidth": 3,
      "points": [[0,110],[20,65],[40,30],[60,10],[80,0],[100,10],[120,30],[140,65],[160,110]]
    },
    {
      "type": "arrow",
      "x": 580,
      "y": 220,
      "width": 100,
      "height": 0,
      "strokeColor": "#3b82f6"
    },
    {
      "type": "rectangle",
      "x": 700,
      "y": 150,
      "width": 320,
      "height": 180,
      "strokeColor": "#6366f1",
      "backgroundColor": "#e0e7ff",
      "fillStyle": "hachure",
      "text": "✨ AI Clarification:\\nStep 1: Identify a=1, b=-5, c=6\\nStep 2: Apply Quadratic Formula\\nRoots: x = 2, x = 3"
    },
    {
      "type": "ellipse",
      "x": 420,
      "y": 280,
      "width": 40,
      "height": 40,
      "strokeColor": "#ef4444",
      "backgroundColor": "#fee2e2"
    },
    {
      "type": "text",
      "x": 470,
      "y": 290,
      "width": 100,
      "height": 30,
      "strokeColor": "#ef4444",
      "text": "Root x=2"
    }
  ],
  "latexFormula": "string in raw LaTeX e.g. x^2 - 5x + 6 = 0",
  "detectedText": "Human readable transcript of the handwriting/drawing",
  "keyVariables": [
    { "symbol": "x", "value": "2, 3", "description": "Unknown roots" }
  ],
  "givenData": ["Given information from equation"],
  "steps": [
    {
      "stepNumber": 1,
      "title": "Step title",
      "explanation": "Clear human explanation of this transformation",
      "latex": "LaTeX representation of step",
      "result": "Intermediate outcome"
    }
  ],
  "graphConfig": {
    "functionString": "x^2 - 5*x + 6",
    "title": "Function Curve",
    "domain": [-10, 10],
    "points": [{ "x": 0, "y": 6 }, { "x": 2, "y": 0 }],
    "criticalPoints": [{ "x": 2.5, "y": -0.25, "label": "Vertex" }]
  },
  "conceptExplanation": {
    "title": "Key Concept Title",
    "coreIdea": "Intuitive explanation of the underlying mathematical theorem",
    "realWorldApplication": "Real world physics or engineering application",
    "keyTakeaway": "Remember this rule"
  },
  "practiceProblems": [
    {
      "id": "p1",
      "question": "Try this practice problem",
      "latex": "x^2 - 4 = 0",
      "hint": "Difference of squares",
      "solution": "x = \\\\pm 2"
    }
  ]
}`;

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

function buildContents(params: {
  imageBase64?: string;
  coordinates: CanvasCoordinates;
  promptText?: string;
  existingElementsSummary?: string;
}): any[] {
  const contents: any[] = [];

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

  const userPrompt = `Target Spatial Canvas Coordinates: [x:${params.coordinates.x}, y:${params.coordinates.y}, width:${params.coordinates.width}, height:${params.coordinates.height}]
${params.existingElementsSummary ? `Existing Canvas Layout Map:\n${params.existingElementsSummary}\n` : ""}
${params.promptText ? `User Question / Follow-Up Context: "${params.promptText}"` : "Please analyze the drawn problem in the canvas crop image and generate visual canvas drawings (arrows, callout boxes, shapes, freedraw pencil strokes) explaining or clarifying the solution."}

Remember: place canvasDrawings early in the JSON, in teaching order, and include at least one freedraw curve when graphing or illustrating a path.`;

  contents.push({ text: userPrompt });
  return contents;
}

/**
 * Perform real spatial AI analysis on a cropped canvas image and/or equation query using Gemini API
 */
export async function analyzeCanvasContent(params: {
  imageBase64?: string;
  coordinates: CanvasCoordinates;
  promptText?: string;
  userApiKey?: string;
  existingElementsSummary?: string;
}): Promise<MathAnalysisResult> {
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
          systemInstruction: SYSTEM_INSTRUCTION,
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
export async function* streamAnalyzeCanvasContent(params: {
  imageBase64?: string;
  coordinates: CanvasCoordinates;
  promptText?: string;
  userApiKey?: string;
  existingElementsSummary?: string;
}): AsyncGenerator<AnalyzeStreamEvent> {
  const apiKey = resolveApiKey(params.userApiKey);
  const ai = new GoogleGenAI({ apiKey });
  const contents = buildContents(params);

  yield { type: "status", message: "Connecting to Gemini…" };

  let lastError: any = null;

  for (const modelName of CANDIDATE_MODELS) {
    try {
      yield { type: "status", message: `Streaming from ${modelName}…` };

      const stream = await ai.models.generateContentStream({
        model: modelName,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
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
          yield { type: "status", message: "Drawing on canvas in real time…" };
        }

        for (const element of items) {
          yield { type: "draw", element, index: emittedDrawCount };
          emittedDrawCount++;
        }

        // Keep totalFound in sync if extractor advanced without new items
        if (totalFound > emittedDrawCount) {
          emittedDrawCount = totalFound;
        }
      }

      yield { type: "status", message: "Finalizing explanation…" };
      const result = parseMathAnalysisResponse(accumulated, params.coordinates);

      // Emit any drawings that were only available after full parse
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
