import { GoogleGenAI } from "@google/genai";
import {
  MathAnalysisResult,
  CanvasCoordinates,
  parseMathAnalysisResponse,
} from "./math-parser";

/**
 * Perform real spatial AI analysis on a cropped canvas image and/or equation query using Gemini 2.5 Flash
 */
export async function analyzeCanvasContent(params: {
  imageBase64?: string;
  coordinates: CanvasCoordinates;
  promptText?: string;
  userApiKey?: string;
  existingElementsSummary?: string;
}): Promise<MathAnalysisResult> {
  const apiKey =
    params.userApiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "Gemini API Key missing! Please click '🔑 Connect Key' in the top navbar to enter your Gemini API key from Google AI Studio."
    );
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const systemInstruction = `You are an elite AI Professor and Interactive Visual Whiteboard Creator.
Examine the provided canvas cropped image and/or text query.

You MUST generate interactive visual canvas elements ("canvasDrawings") using shapes, arrows, ellipses, and formatted callouts to physically draw your explanation directly onto the user's canvas space!

SPATIAL LAYOUT & NON-DESTRUCTIVE CANVAS UPDATE RULES:
1. Do NOT overwrite or duplicate existing canvas elements.
2. If this is a follow-up question or clarification, anchor your new explanation drawings ADJACENT to the existing elements (e.g. x = targetX + targetWidth + 50) and draw a connecting ARROW pointing from the reference element to your new clarification box.
3. Use visual callouts (rectangles, diamonds, ellipses) and arrows to create a clean, connected graph of logic on the whiteboard.

You MUST respond strictly with valid raw JSON matching this schema:
{
  "classification": "equation" | "calculus" | "geometry" | "physics" | "concept" | "graph",
  "latexFormula": "string in raw LaTeX e.g. x^2 - 5x + 6 = 0",
  "detectedText": "Human readable transcript of the handwriting/drawing",
  "summary": "Concise summary of the problem and approach",
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
  "canvasDrawings": [
    {
      "type": "arrow",
      "x": 350,
      "y": 200,
      "width": 120,
      "height": 0,
      "strokeColor": "#6366f1"
    },
    {
      "type": "rectangle",
      "x": 480,
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
      "x": 500,
      "y": 280,
      "width": 140,
      "height": 40,
      "strokeColor": "#ef4444",
      "text": "Root x = 2"
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
      "solution": "x = \\pm 2"
    }
  ]
}`;

  const contents: any[] = [];

  if (params.imageBase64) {
    const base64Data = params.imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    contents.push({
      inlineData: {
        mimeType: "image/png",
        data: base64Data,
      },
    });
  }

  const userPrompt = `Target Spatial Canvas Coordinates: [x:${params.coordinates.x}, y:${params.coordinates.y}, width:${params.coordinates.width}, height:${params.coordinates.height}]
${params.existingElementsSummary ? `Existing Canvas Layout Map:\n${params.existingElementsSummary}\n` : ""}
${params.promptText ? `User Question / Follow-Up Context: "${params.promptText}"` : "Please analyze the drawn problem in the canvas crop image and generate visual canvas drawings (arrows, callout boxes, shapes) explaining or clarifying the solution."}`;

  contents.push({ text: userPrompt });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const textOutput = response.text || "";
  return parseMathAnalysisResponse(textOutput, params.coordinates);
}
