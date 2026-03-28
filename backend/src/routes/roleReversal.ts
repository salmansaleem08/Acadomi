import { Router, type Response } from "express";
import mongoose from "mongoose";
import multer from "multer";

import { RoleReversalSession } from "../models/RoleReversalSession.js";
import { Upload } from "../models/Upload.js";
import { authMiddleware, type AuthedRequest } from "../middleware/auth.js";
import { evaluateRoleReversalTeaching, transcribeAudio } from "../services/gemini.js";

const router = Router();
const MAX_SESSIONS_PER_USER = 30;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.get("/", authMiddleware, async (req: AuthedRequest, res: Response) => {
  try {
    const list = await RoleReversalSession.find({ userId: req.userId })
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({
      sessions: list.map((s) => ({
        id: String(s._id),
        topic: s.topic,
        sourceUploadId: String(s.sourceUploadId),
        transcript: s.transcript,
        attemptCount: s.attemptCount,
        evaluation: s.evaluation,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      maxSessions: MAX_SESSIONS_PER_USER,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not list sessions." });
  }
});

router.post(
  "/evaluate",
  authMiddleware,
  upload.single("audio"),
  async (req: AuthedRequest, res: Response) => {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
    }

    const topic = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
    const uploadId = typeof req.body?.uploadId === "string" ? req.body.uploadId.trim() : "";
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";

    if (!topic || topic.length > 500) {
      return res.status(400).json({ error: "Topic is required (max 500 characters)." });
    }
    if (!uploadId || !mongoose.Types.ObjectId.isValid(uploadId)) {
      return res.status(400).json({ error: "Valid uploadId is required." });
    }

    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ error: "Audio recording is required." });
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

      const material = [uploadDoc.processedContent, uploadDoc.extractedText]
        .filter(Boolean)
        .join("\n\n")
        .trim();
      if (!material) {
        return res.status(400).json({ error: "This upload has no text to compare against." });
      }

      const transcript = await transcribeAudio(file.buffer, file.mimetype || "audio/webm");
      if (!transcript.trim()) {
        return res.status(400).json({
          error: "Could not transcribe audio. Speak clearly and try again.",
        });
      }

      const evaluation = await evaluateRoleReversalTeaching({
        topic,
        referenceMaterial: material,
        studentTranscript: transcript,
      });

      const sessionPayload = {
        topic,
        sourceUploadId: uploadDoc._id,
        transcript,
        evaluation,
        lastAudioMimeType: file.mimetype || "",
      };

      if (sessionId) {
        if (!mongoose.Types.ObjectId.isValid(sessionId)) {
          return res.status(400).json({ error: "Invalid sessionId." });
        }
        const existing = await RoleReversalSession.findOne({
          _id: sessionId,
          userId: req.userId,
        });
        if (!existing) {
          return res.status(404).json({ error: "Session not found." });
        }
        existing.set({
          ...sessionPayload,
          attemptCount: existing.attemptCount + 1,
        });
        await existing.save();
        return res.status(200).json({
          session: {
            id: existing._id.toString(),
            topic: existing.topic,
            sourceUploadId: existing.sourceUploadId.toString(),
            transcript: existing.transcript,
            attemptCount: existing.attemptCount,
            evaluation: existing.evaluation,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
          },
        });
      }

      const count = await RoleReversalSession.countDocuments({ userId: req.userId });
      if (count >= MAX_SESSIONS_PER_USER) {
        return res.status(400).json({
          error: `You can keep at most ${MAX_SESSIONS_PER_USER} role-reversal sessions. Delete one to continue.`,
        });
      }

      const created = await RoleReversalSession.create({
        userId: req.userId,
        ...sessionPayload,
        attemptCount: 1,
      });

      return res.status(201).json({
        session: {
          id: created._id.toString(),
          topic: created.topic,
          sourceUploadId: created.sourceUploadId.toString(),
          transcript: created.transcript,
          attemptCount: created.attemptCount,
          evaluation: created.evaluation,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      });
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Evaluation failed.";
      return res.status(500).json({ error: msg });
    }
  },
);

router.delete("/:id", authMiddleware, async (req: AuthedRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid id." });
    }
    const r = await RoleReversalSession.findOneAndDelete({ _id: id, userId: req.userId });
    if (!r) {
      return res.status(404).json({ error: "Session not found." });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not delete session." });
  }
});

export default router;
