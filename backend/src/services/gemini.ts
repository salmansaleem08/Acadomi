import { GoogleGenerativeAI } from "@google/generative-ai";

/** Read env on each call — `.env` is applied in `index.ts` after imports, so module-level `process.env` would be stale. */
function getModel() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const modelName = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName });
}

export async function extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string> {
  const model = getModel();
  const prompt =
    "Extract all readable text from this image with maximum accuracy. If text is small, rotated, or low contrast, still try to read it. Return only plain text in English.";
  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: mimeType || "image/png",
        data: buffer.toString("base64"),
      },
    },
  ]);
  const text = result.response.text();
  return text.trim();
}

export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const model = getModel();
  const prompt =
    "Transcribe this audio with high accuracy. Handle background noise and accents. Return only the clean transcription in English.";
  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: mimeType || "audio/webm",
        data: buffer.toString("base64"),
      },
    },
  ]);
  return result.response.text().trim();
}

/**
 * Combine extracted material with the learner's instructions into structured study notes (markdown).
 */
export async function synthesizeLearningNotes(
  extractedText: string,
  userPrompt: string,
): Promise<string> {
  const model = getModel();
  const instructions = userPrompt.trim() || "No extra instructions.";
  const body = `You are Acadomi, an assistant for higher-education learners.

User instructions (prioritize these if they ask for something specific):
${instructions}

Source material (extracted from PDF, images, and/or audio):
---
${extractedText.slice(0, 120000)}
---

Produce a clear, professional response in markdown with:
1. **Summary** — short overview
2. **Key concepts** — bullet list
3. **Study tips** — 2–4 practical next steps

Keep tone academic but approachable. If the source is empty or unusable, say so briefly.`;

  const result = await model.generateContent(body);
  return result.response.text().trim();
}

export type RoleReversalVisualHints = {
  radar?: { label: string; value: number }[];
  barCompare?: { label: string; you: number; ideal: number }[];
};

export type RoleReversalEvaluation = {
  scoreClarity: number;
  scoreConcepts: number;
  scoreFluency: number;
  totalScore: number;
  feedback: string;
  topicUnderstanding: string;
  weakness: string;
  strength: string;
  visualHints: RoleReversalVisualHints;
};

function extractFirstJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) {
    throw new Error("No JSON object in model output");
  }
  let depth = 0;
  let inString = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      if (esc) {
        esc = false;
      } else if (c === "\\") {
        esc = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1)) as unknown;
      }
    }
  }
  throw new Error("Unterminated JSON object in model output");
}

function num(v: unknown): number {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

function normalizeEvaluation(raw: Record<string, unknown>): RoleReversalEvaluation {
  const scoreClarity = num(raw.scoreClarity ?? raw.score_clarity);
  const scoreConcepts = num(raw.scoreConcepts ?? raw.score_concepts);
  const scoreFluency = num(raw.scoreFluency ?? raw.score_fluency);
  let totalScore = num(raw.totalScore ?? raw.total_score);
  if (totalScore === 0 && (scoreClarity + scoreConcepts + scoreFluency) > 0) {
    totalScore = Math.round((scoreClarity + scoreConcepts + scoreFluency) / 3);
  }
  const visualRaw = raw.visualHints ?? raw.visual_hints;
  let visualHints: RoleReversalVisualHints = {};
  if (visualRaw && typeof visualRaw === "object" && !Array.isArray(visualRaw)) {
    const vr = visualRaw as Record<string, unknown>;
    const radar = Array.isArray(vr.radar)
      ? (vr.radar as unknown[])
          .map((r: unknown) => {
            if (!r || typeof r !== "object") return null;
            const o = r as Record<string, unknown>;
            return {
              label: str(o.label),
              value: num(o.value),
            };
          })
          .filter((x): x is { label: string; value: number } => x !== null && x.label.length > 0)
      : undefined;
    const barRaw = vr.barCompare ?? vr.bar_compare;
    const barCompare = Array.isArray(barRaw)
      ? (barRaw as unknown[])
          .map((r: unknown) => {
            if (!r || typeof r !== "object") return null;
            const o = r as Record<string, unknown>;
            return {
              label: str(o.label),
              you: num(o.you),
              ideal: num(o.ideal ?? o.target ?? 100),
            };
          })
          .filter((x): x is { label: string; you: number; ideal: number } => x !== null && x.label.length > 0)
      : undefined;
    visualHints = { ...(radar?.length ? { radar } : {}), ...(barCompare?.length ? { barCompare } : {}) };
  }

  return {
    scoreClarity,
    scoreConcepts,
    scoreFluency,
    totalScore,
    feedback: str(raw.feedback),
    topicUnderstanding: str(raw.topicUnderstanding ?? raw.topic_understanding),
    weakness: str(raw.weakness ?? raw.weaknesses),
    strength: str(raw.strength ?? raw.strengths),
    visualHints,
  };
}

/**
 * Compare the learner's spoken explanation (transcript) to reference material for "role reversal" teaching.
 */
export async function evaluateRoleReversalTeaching(params: {
  topic: string;
  referenceMaterial: string;
  studentTranscript: string;
}): Promise<RoleReversalEvaluation> {
  const model = getModel();
  const topic = params.topic.trim();
  const ref = params.referenceMaterial.trim().slice(0, 100_000);
  const student = params.studentTranscript.trim().slice(0, 50_000);

  const prompt = `You are an expert tutor evaluating a student's verbal explanation (transcribed) in a "role reversal" exercise: they teach YOU the topic using their own words, compared to reference notes.

Output ONLY valid JSON (no markdown fences, no commentary before or after). Use exactly these camelCase keys:

{
  "scoreClarity": <0-100 how clear and structured the explanation is>,
  "scoreConcepts": <0-100 accuracy and coverage of key concepts vs reference>,
  "scoreFluency": <0-100 coherence and appropriate terminology>,
  "totalScore": <0-100 overall, can be average of the three rounded>,
  "feedback": "<2-4 sentences: encouraging, specific, actionable. Plain text or light markdown allowed.>",
  "topicUnderstanding": "<1-3 sentences on how well they grasp the core idea>",
  "weakness": "<main gap or misconception, if any; else say what could deepen>",
  "strength": "<what they did well>",
  "visualHints": {
    "radar": [
      {"label": "Clarity", "value": <0-100>},
      {"label": "Concepts", "value": <0-100>},
      {"label": "Fluency", "value": <0-100>}
    ],
    "barCompare": [
      {"label": "Clarity", "you": <0-100>, "ideal": 85},
      {"label": "Concepts", "you": <0-100>, "ideal": 90},
      {"label": "Fluency", "you": <0-100>, "ideal": 80}
    ]
  }
}

Topic the student was teaching: ${topic}

Reference material (ground truth for concepts):
---
${ref || "(empty — score conservatively based on general knowledge of the topic)"}
---

Student's spoken explanation (transcription):
---
${student}
---

Be fair: reward correct ideas; note gaps vs reference. JSON only:`;

  const result = await model.generateContent(prompt);
  const rawText = result.response.text().trim();
  let parsed: unknown;
  try {
    parsed = extractFirstJsonObject(rawText);
  } catch {
    throw new Error("Model did not return parseable JSON for evaluation");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Evaluation JSON was not an object");
  }
  return normalizeEvaluation(parsed as Record<string, unknown>);
}
