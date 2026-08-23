/**
 * Strict Responses API schema. Keep this as the machine-enforced contract and
 * keep the system prompt focused on semantics and quality rather than JSON syntax.
 */
export const ANALYSIS_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "classification", "summary", "updateMode", "focusNote", "diagramTitle",
    "canvasPlan", "mermaidCode", "canvasDrawings", "latexFormula", "detectedText",
    "keyVariables", "givenData", "steps", "graphConfig", "conceptExplanation",
    "practiceProblems",
  ],
  properties: {
    classification: {
      type: "string",
      enum: ["equation", "calculus", "geometry", "physics", "concept", "graph", "architecture", "schema", "flowchart"],
    },
    summary: { type: "string", maxLength: 800 },
    updateMode: { type: "string", enum: ["append"] },
    focusNote: { type: ["string", "null"], maxLength: 300 },
    diagramTitle: { type: "string", maxLength: 100 },
    canvasPlan: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["version", "classification", "layout", "nodes", "edges", "blocks", "annotations", "constraints"],
          properties: {
            version: { type: "string", enum: ["1"] },
            classification: {
              type: "string",
              enum: ["equation", "calculus", "geometry", "physics", "concept", "graph", "architecture", "schema", "flowchart"],
            },
            layout: {
              type: "object",
              additionalProperties: false,
              required: ["type", "direction"],
              properties: {
                type: { type: "string", enum: ["layered", "lesson"] },
                direction: { type: "string", enum: ["LR", "TB"] },
              },
            },
            nodes: {
              type: "array",
              maxItems: 16,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "kind", "label", "details", "icon"],
                properties: {
                  id: { type: "string", maxLength: 48 },
                  kind: {
                    type: "string",
                    enum: ["client", "service", "gateway", "database", "cache", "queue", "storage", "decision", "process", "entity", "start", "end", "result", "generic"],
                  },
                  label: { type: "string", maxLength: 80 },
                  details: { type: "array", maxItems: 3, items: { type: "string", maxLength: 72 } },
                  icon: {
                    type: ["string", "null"],
                    enum: [null, "client", "gateway", "identity", "catalog", "recommendation", "playback", "database", "cache", "event", "cdn", "origin", "shield", "api", "service", "load-balancer", "queue", "worker", "notification", "analytics", "search", "storage"],
                  },
                },
              },
            },
            edges: {
              type: "array",
              maxItems: 24,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "from", "to", "label", "kind"],
                properties: {
                  id: { type: "string", maxLength: 48 },
                  from: { type: "string", maxLength: 48 },
                  to: { type: "string", maxLength: 48 },
                  label: { type: ["string", "null"], maxLength: 48 },
                  kind: { type: "string", enum: ["flow", "data", "async", "relation", "yes", "no"] },
                },
              },
            },
            blocks: {
              type: "array",
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "kind", "text", "latex"],
                properties: {
                  id: { type: "string", maxLength: 48 },
                  kind: { type: "string", enum: ["given", "equation", "explanation", "result", "warning"] },
                  text: { type: ["string", "null"], maxLength: 240 },
                  latex: { type: ["string", "null"], maxLength: 240 },
                },
              },
            },
            annotations: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "text", "targetId", "tone"],
                properties: {
                  id: { type: "string", maxLength: 48 },
                  text: { type: "string", maxLength: 180 },
                  targetId: { type: ["string", "null"], maxLength: 48 },
                  tone: { type: "string", enum: ["info", "success", "warning"] },
                },
              },
            },
            constraints: {
              type: "array",
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["type", "item", "anchor"],
                properties: {
                  type: { type: "string", enum: ["near", "after", "below", "same-row", "inside"] },
                  item: { type: "string", maxLength: 48 },
                  anchor: { type: "string", maxLength: 80 },
                },
              },
            },
          },
        },
        { type: "null" },
      ],
    },
    mermaidCode: { type: ["string", "null"], maxLength: 12000 },
    canvasDrawings: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type", "x", "y", "width", "height", "strokeColor", "backgroundColor",
          "fillStyle", "text", "label", "points", "strokeWidth", "strokeStyle",
          "fontSize", "icon", "svgMarkup", "svgAlt", "anchorHint",
        ],
        properties: {
          type: { type: "string", enum: ["rectangle", "ellipse", "arrow", "text", "diamond", "freedraw", "line", "svg"] },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          strokeColor: { type: ["string", "null"] },
          backgroundColor: { type: ["string", "null"] },
          fillStyle: { type: ["string", "null"], enum: [null, "hachure", "solid", "cross-hatch"] },
          text: { type: ["string", "null"], maxLength: 500 },
          label: { type: ["string", "null"], maxLength: 200 },
          points: {
            type: "array",
            maxItems: 80,
            items: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
          },
          strokeWidth: { type: ["number", "null"] },
          strokeStyle: { type: ["string", "null"], enum: [null, "solid", "dashed", "dotted"] },
          fontSize: { type: ["number", "null"] },
          icon: { type: ["string", "null"] },
          svgMarkup: { type: ["string", "null"], maxLength: 12000 },
          svgAlt: { type: ["string", "null"], maxLength: 180 },
          anchorHint: { type: ["string", "null"], maxLength: 120 },
        },
      },
    },
    latexFormula: { type: "string", maxLength: 500 },
    detectedText: { type: "string", maxLength: 1200 },
    keyVariables: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["symbol", "value", "description"],
        properties: {
          symbol: { type: "string", maxLength: 80 },
          value: { type: "string", maxLength: 160 },
          description: { type: "string", maxLength: 240 },
        },
      },
    },
    givenData: { type: "array", maxItems: 20, items: { type: "string", maxLength: 300 } },
    steps: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stepNumber", "title", "explanation", "latex", "result"],
        properties: {
          stepNumber: { type: "integer" },
          title: { type: "string", maxLength: 120 },
          explanation: { type: "string", maxLength: 800 },
          latex: { type: "string", maxLength: 500 },
          result: { type: "string", maxLength: 500 },
        },
      },
    },
    graphConfig: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["functionString", "title", "domain", "points", "criticalPoints"],
          properties: {
            functionString: { type: "string", maxLength: 240 },
            title: { type: "string", maxLength: 160 },
            domain: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
            points: {
              type: "array",
              maxItems: 120,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["x", "y"],
                properties: { x: { type: "number" }, y: { type: "number" } },
              },
            },
            criticalPoints: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["x", "y", "label"],
                properties: { x: { type: "number" }, y: { type: "number" }, label: { type: "string", maxLength: 100 } },
              },
            },
          },
        },
        { type: "null" },
      ],
    },
    conceptExplanation: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["title", "coreIdea", "realWorldApplication", "keyTakeaway"],
          properties: {
            title: { type: "string", maxLength: 160 },
            coreIdea: { type: "string", maxLength: 800 },
            realWorldApplication: { type: "string", maxLength: 800 },
            keyTakeaway: { type: "string", maxLength: 500 },
          },
        },
        { type: "null" },
      ],
    },
    practiceProblems: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "latex", "hint", "solution"],
        properties: {
          id: { type: "string", maxLength: 80 },
          question: { type: "string", maxLength: 500 },
          latex: { type: "string", maxLength: 300 },
          hint: { type: "string", maxLength: 500 },
          solution: { type: "string", maxLength: 800 },
        },
      },
    },
  },
};
