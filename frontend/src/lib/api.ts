export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const TOKEN_KEY = "acadomi_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export type UserDTO = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type UploadDTO = {
  id: string;
  kind: "pdf" | "image" | "audio";
  title: string;
  userPrompt: string;
  extractedText: string;
  processedContent: string;
  fileMeta: { originalName: string; mimeType: string }[];
  status: "processing" | "completed" | "failed";
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    const err = (data as { error?: string }).error ?? res.statusText;
    throw new Error(err);
  }
  return data as T;
}

export async function apiRegister(body: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<{ token: string; user: UserDTO }> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function apiLogin(body: {
  email: string;
  password: string;
}): Promise<{ token: string; user: UserDTO }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function apiMe(token: string): Promise<{ user: UserDTO }> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function apiUpdateProfile(
  token: string,
  body: {
    firstName?: string;
    lastName?: string;
    currentPassword?: string;
    newPassword?: string;
  },
): Promise<{ user: UserDTO }> {
  const res = await fetch(`${API_BASE}/api/auth/profile`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function apiListUploads(
  token: string,
): Promise<{ uploads: UploadDTO[]; maxUploads: number }> {
  const res = await fetch(`${API_BASE}/api/uploads`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function apiCreateUpload(
  token: string,
  type: "pdf" | "image" | "audio",
  prompt: string,
  files: File[],
  title?: string,
): Promise<{ upload: UploadDTO }> {
  const fd = new FormData();
  fd.append("type", type);
  fd.append("prompt", prompt);
  fd.append("title", title ?? "");
  for (const f of files) {
    fd.append("files", f);
  }
  const res = await fetch(`${API_BASE}/api/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  return parseJson(res);
}

export async function apiDeleteUpload(
  token: string,
  id: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/uploads/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export type PodcastLineDTO = { speaker: string; text: string };

export type PodcastDTO = {
  id: string;
  sourceUploadId: string;
  title: string;
  script: PodcastLineDTO[];
  mimeType: string;
  durationMs: number;
  byteLength: number;
  createdAt: string;
};

export async function apiListPodcasts(
  token: string,
): Promise<{ podcasts: PodcastDTO[]; maxPodcasts: number }> {
  const res = await fetch(`${API_BASE}/api/podcasts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function apiGeneratePodcast(
  token: string,
  uploadId: string,
): Promise<{ podcast: PodcastDTO }> {
  const res = await fetch(`${API_BASE}/api/podcasts/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ uploadId }),
  });
  return parseJson(res);
}

export async function apiDeletePodcast(
  token: string,
  id: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/podcasts/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

/** Caller should `URL.revokeObjectURL` when the URL is no longer needed. */
export async function apiFetchPodcastAudioBlobUrl(
  token: string,
  podcastId: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/podcasts/${podcastId}/audio`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export type RoleReversalVisualHintsDTO = {
  radar?: { label: string; value: number }[];
  barCompare?: { label: string; you: number; ideal: number }[];
};

export type RoleReversalEvaluationDTO = {
  scoreClarity: number;
  scoreConcepts: number;
  scoreFluency: number;
  totalScore: number;
  feedback: string;
  topicUnderstanding: string;
  weakness: string;
  strength: string;
  visualHints?: RoleReversalVisualHintsDTO;
};

export type RoleReversalSessionDTO = {
  id: string;
  topic: string;
  sourceUploadId: string;
  transcript: string;
  attemptCount: number;
  evaluation: RoleReversalEvaluationDTO;
  createdAt: string;
  updatedAt: string;
};

export async function apiListRoleReversalSessions(
  token: string,
): Promise<{ sessions: RoleReversalSessionDTO[]; maxSessions: number }> {
  const res = await fetch(`${API_BASE}/api/role-reversal`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function apiEvaluateRoleReversal(
  token: string,
  params: {
    topic: string;
    uploadId: string;
    audio: Blob;
    sessionId?: string;
  },
): Promise<{ session: RoleReversalSessionDTO }> {
  const fd = new FormData();
  fd.append("topic", params.topic);
  fd.append("uploadId", params.uploadId);
  fd.append("audio", params.audio, "explanation.webm");
  if (params.sessionId) fd.append("sessionId", params.sessionId);
  const res = await fetch(`${API_BASE}/api/role-reversal/evaluate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  return parseJson(res);
}

export async function apiDeleteRoleReversalSession(
  token: string,
  id: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/api/role-reversal/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}
