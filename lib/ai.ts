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
}): Promise<MathAnalysisResult> {
  const apiKey =
    params.userApiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "Gemini API Key missing! Please click '🔑 Connect Gemini Key' in the top navbar to enter your Gemini API key from Google AI Studio."
    );
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  const systemInstruction = `You are an elite AI Mathematics, Science, and Logic Professor analyzing an interactive whiteboard canvas.
Examine the provided canvas cropped image and/or text query.

You MUST respond strictly with valid raw JSON (no markdown formatting or chat commentary outside JSON) matching this schema:
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

  const userPrompt = `Spatial Canvas Coordinates: [x:${params.coordinates.x}, y:${params.coordinates.y}, width:${params.coordinates.width}, height:${params.coordinates.height}]
${params.promptText ? `User Question / Context: "${params.promptText}"` : "Please analyze the drawn mathematical equation / problem in the canvas crop image."}`;

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
