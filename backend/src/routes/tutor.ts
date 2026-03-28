import { Router, type Response } from "express";
import mongoose from "mongoose";
import multer from "multer";

import { TutorSession, type TutorSessionLean } from "../models/TutorSession.js";
import { Upload, type UploadDoc } from "../models/Upload.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import {
  answerTutorQuestion,
  generateTutorSlideEli5Script,
  generateTutorSlidesAndScripts,
  transcribeAudio,
} from "../services/gemini.js";
import { tutorPyBase, tutorPyTts } from "../services/tutorPythonClient.js";

const router = Router();
const MAX_TUTOR_SESSIONS_PER_USER = 25;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

async function pyFocusReset(sessionKey: string): Promise<void> {
  const res = await fetch(`${tutorPyBase()}/focus/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_key: sessionKey }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { detail?: unknown };
    throw new Error(
      typeof data.detail === "string" ? data.detail : "Focus reset failed (is the tutor service running?)",
    );
  }
}

async function pyFocusAnalyze(sessionKey: string, imageBuffer: Buffer): Promise<Record<string, unknown>> {
  const res = await fetch(`${tutorPyBase()}/focus/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_key: sessionKey,
      image_base64: imageBuffer.toString("base64"),
    }),
  });
  const data = (await res.json()) as Record<string, unknown> & { detail?: unknown };
  if (!res.ok) {
    throw new Error(
      typeof data.detail === "string" ? data.detail : String(data.error ?? "Focus analysis failed"),
    );
  }
  return data;
}

function serializeSession(s: TutorSessionLean) {
  return {
    id: s._id.toString(),
    sourceUploadId: s.sourceUploadId.toString(),
    topicFocus: s.topicFocus,
    displayTitle: s.displayTitle,
    slides: s.slides.map((sl) => ({
      title: sl.title,
      points: sl.points,
      script: sl.script,
    })),
    status: s.status,
    errorMessage: s.errorMessage,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

router.get("/sessions", authMiddleware, async (req: AuthedRequest, res: Response) => {
  try {
    const list = await TutorSession.find({ userId: req.userId }).sort({ updatedAt: -1 }).lean<TutorSessionLean[]>();
    return res.json({
      sessions: list.map(serializeSession),
      maxSessions: MAX_TUTOR_SESSIONS_PER_USER,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not list tutor sessions." });
  }
});

router.get("/sessions/:id", authMiddleware, async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid session id." });
    }
    const s = await TutorSession.findOne({ _id: id, userId: req.userId }).lean<TutorSessionLean | null>();
    if (!s) {
      return res.status(404).json({ error: "Session not found." });
    }
    return res.json({ session: serializeSession(s) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not load session." });
  }
});

router.post("/sessions", authMiddleware, async (req: AuthedRequest, res: Response) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
  }

  const uploadId = typeof req.body?.uploadId === "string" ? req.body.uploadId.trim() : "";
  const topicFocus = typeof req.body?.topicFocus === "string" ? req.body.topicFocus.trim().slice(0, 400) : "";

  if (!uploadId || !mongoose.Types.ObjectId.isValid(uploadId)) {
    return res.status(400).json({ error: "Valid uploadId is required." });
  }

  try {
    const uploadDoc = await Upload.findOne({
      _id: uploadId,
      userId: req.userId,
      status: "completed",
    });
    if (!uploadDoc) {
      return res.status(404).json({ error: "Upload not found or not completed." });
    }

    const material = [uploadDoc.processedContent, uploadDoc.extractedText].filter(Boolean).join("\n\n").trim();
    if (!material) {
      return res.status(400).json({ error: "This upload has no text to teach from." });
    }

    const count = await TutorSession.countDocuments({ userId: req.userId });
    if (count >= MAX_TUTOR_SESSIONS_PER_USER) {
      return res.status(400).json({
        error: `You can keep at most ${MAX_TUTOR_SESSIONS_PER_USER} tutor sessions. Delete one to create another.`,
      });
    }

    const slidesDraft = await generateTutorSlidesAndScripts(material, topicFocus || undefined);
    const displayTitle =
      `${uploadDoc.title || "Notes"}`.trim().slice(0, 180) +
      (topicFocus ? ` — ${topicFocus.slice(0, 36)}` : " — AI tutor");

    const created = await TutorSession.create({
      userId: req.userId,
      sourceUploadId: uploadDoc._id,
      topicFocus,
      displayTitle: displayTitle.slice(0, 220),
      slides: slidesDraft,
      status: "ready",
    });

    const lean = created.toObject() as TutorSessionLean;
    return res.status(201).json({ session: serializeSession(lean) });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Could not create tutor session.";
    return res.status(500).json({ error: msg });
  }
});

router.delete("/sessions/:id", authMiddleware, async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid id." });
    }
    const r = await TutorSession.findOneAndDelete({ _id: id, userId: req.userId });
    if (!r) {
      return res.status(404).json({ error: "Session not found." });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not delete session." });
  }
});

/** Plain text → MP3 (gTTS via Python). For slide narration or short answer playback. */
router.post("/tts", authMiddleware, async (req: AuthedRequest, res: Response) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > 6000) {
    return res.status(400).json({ error: "text is required (max 6000 characters)." });
  }
  try {
    const { mimeType, audioBase64 } = await tutorPyTts(text);
    const buf = Buffer.from(audioBase64, "base64");
    res.setHeader("Content-Type", mimeType);
    res.send(buf);
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "TTS failed.";
    return res.status(503).json({
      error: `${msg} Start the tutor Python service (see README) and set TUTOR_SERVICE_URL.`,
    });
  }
});

router.post("/sessions/:id/focus/reset", authMiddleware, async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid session id." });
    }
    const s = await TutorSession.findOne({ _id: id, userId: req.userId }).lean();
    if (!s) {
      return res.status(404).json({ error: "Session not found." });
    }
    await pyFocusReset(id);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Focus reset failed.";
    return res.status(503).json({ error: msg });
  }
});

router.post(
  "/sessions/:id/focus/analyze",
  authMiddleware,
  upload.single("frame"),
  async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid session id." });
      }
      const s = await TutorSession.findOne({ _id: id, userId: req.userId }).lean();
      if (!s) {
        return res.status(404).json({ error: "Session not found." });
      }
      const file = req.file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ error: "Webcam frame (image) is required." });
      }
      const data = await pyFocusAnalyze(id, file.buffer);
      return res.json(data);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Focus analysis failed.";
      return res.status(503).json({ error: msg });
    }
  },
);

router.post(
  "/sessions/:id/slides/:slideIndex/eli5",
  authMiddleware,
  async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const idx = Number.parseInt(req.params.slideIndex, 10);
      if (!mongoose.Types.ObjectId.isValid(id) || !Number.isFinite(idx) || idx < 0) {
        return res.status(400).json({ error: "Invalid session or slide index." });
      }
      const s = await TutorSession.findOne({ _id: id, userId: req.userId });
      if (!s) {
        return res.status(404).json({ error: "Session not found." });
      }
      const slide = s.slides[idx];
      if (!slide) {
        return res.status(404).json({ error: "Slide not found." });
      }

      const cached = typeof slide.eli5Script === "string" && slide.eli5Script.trim();
      if (cached) {
        return res.json({ script: slide.eli5Script.trim() });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const uploadDoc = await Upload.findOne({ _id: s.sourceUploadId, userId: req.userId }).lean<
        UploadDoc | null
      >();
      const material =
        uploadDoc != null
          ? [uploadDoc.processedContent, uploadDoc.extractedText].filter(Boolean).join("\n\n").trim()
          : "";

      const script = await generateTutorSlideEli5Script({
        slideTitle: slide.title,
        slidePoints: slide.points,
        slideScript: slide.script,
        materialExcerpt: material,
      });

      if (!script.trim()) {
        return res.status(500).json({ error: "Model returned an empty explanation." });
      }

      const trimmed = script.trim().slice(0, 8000);
      s.slides[idx].eli5Script = trimmed;
      s.markModified("slides");
      await s.save();

      return res.json({ script: trimmed });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Could not generate simple explanation.";
      return res.status(500).json({ error: msg });
    }
  },
);

router.post(
  "/sessions/:id/slides/:slideIndex/tts",
  authMiddleware,
  async (req: AuthedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const idx = Number.parseInt(req.params.slideIndex, 10);
      if (!mongoose.Types.ObjectId.isValid(id) || !Number.isFinite(idx) || idx < 0) {
        return res.status(400).json({ error: "Invalid session or slide index." });
      }
      const s = await TutorSession.findOne({ _id: id, userId: req.userId }).lean<TutorSessionLean | null>();
      if (!s) {
        return res.status(404).json({ error: "Session not found." });
      }
      const slide = s.slides[idx];
      if (!slide?.script) {
        return res.status(404).json({ error: "Slide not found." });
      }
      const { mimeType, audioBase64 } = await tutorPyTts(slide.script);
      const buf = Buffer.from(audioBase64, "base64");
      res.setHeader("Content-Type", mimeType);
      res.send(buf);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "TTS failed.";
      return res.status(503).json({ error: msg });
    }
  },
);

router.post(
  "/sessions/:id/ask",
  authMiddleware,
  upload.single("audio"),
  async (req: AuthedRequest, res: Response) => {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    const id = req.params.id;
    const slideIndexRaw = req.body?.slideIndex;
    const slideIndex =
      typeof slideIndexRaw === "string"
        ? Number.parseInt(slideIndexRaw, 10)
        : typeof slideIndexRaw === "number"
          ? slideIndexRaw
          : NaN;

    if (!mongoose.Types.ObjectId.isValid(id) || !Number.isFinite(slideIndex) || slideIndex < 0) {
      return res.status(400).json({ error: "Valid session id and slideIndex are required." });
    }

    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ error: "Audio question is required." });
    }

    try {
      const s = await TutorSession.findOne({ _id: id, userId: req.userId }).lean<TutorSessionLean | null>();
      if (!s) {
        return res.status(404).json({ error: "Session not found." });
      }
      const slide = s.slides[slideIndex];
      if (!slide) {
        return res.status(400).json({ error: "Invalid slide index." });
      }

      const uploadDoc = await Upload.findOne({ _id: s.sourceUploadId, userId: req.userId }).lean<
        UploadDoc | null
      >();
      const material =
        uploadDoc != null
          ? [uploadDoc.processedContent, uploadDoc.extractedText].filter(Boolean).join("\n\n").trim()
          : "";

      const question = await transcribeAudio(file.buffer, file.mimetype || "audio/webm");
      if (!question.trim()) {
        return res.status(400).json({ error: "Could not hear a question. Try again closer to the mic." });
      }

      const answer = await answerTutorQuestion({
        question,
        slideTitle: slide.title,
        slidePoints: slide.points,
        slideScript: slide.script,
        materialExcerpt: material,
      });

      return res.json({ question, answer });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Could not answer question.";
      return res.status(500).json({ error: msg });
    }
  },
);

export default router;
