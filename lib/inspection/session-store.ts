/**
 * 임장 세션 저장소 — 세션 · 미디어 · AI 작업 · 공유 링크.
 *
 * 이 파일의 조회·갱신은 **실패하면 던진다.** 예전에는 error 를 받지 않아서,
 * DB 가 몇 초 밀리는 동안 사용자가 현장에서 녹음·촬영해 만든 임장 세션이
 * 통째로 "없는 것"이 됐다 — 목록은 빈 배열(= 기록 없음), 단건은 null 이라
 * 라우트가 404 "not found" 를 내보냈다. 자기가 방금 만든 임장노트를 열었더니
 * 없다고 하는 화면은, 지워졌다는 말과 구분되지 않는다.
 *
 * 갱신도 마찬가지다. update 결과를 확인하지 않으면 현장에서 적은 capture 가
 * 저장되지 않았는데 저장된 것처럼 보이고, AI 작업은 ready 로 못 바뀐 채
 * 영원히 "처리 중"으로 남는다. 공유 링크는 insert 가 실패해도 토큰이 발급된
 * 것처럼 돌아가서, 사용자가 아무 데도 닿지 않는 링크를 남에게 보낸다.
 *
 * 부르는 쪽(app/api/inspection/**)은 이 예외를 lib/api/db-unavailable 의
 * 503 + Retry-After 로 옮긴다. 404 로 옮기면 안 된다 — 없는 것과 못 읽은 것은
 * 다른 사실이다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import type { StructuredReport } from "@/lib/inspection/ontology";

export type SessionStatus =
  | "active"
  | "syncing"
  | "processing"
  | "ready"
  | "completed"
  | "cancelled";

export type InspectionSession = {
  id: string;
  authorEmail: string;
  authorLabel?: string | null;
  complexId?: string | null;
  region: string;
  aptName?: string | null;
  mode: "field_note" | "investment_note" | "rent_note";
  status: SessionStatus;
  privacyClass: "private" | "team" | "shared_link" | "public";
  geoLat?: number | null;
  geoLng?: number | null;
  geoPrecision?: string | null;
  startedAt: string;
  endedAt?: string | null;
  capture: Record<string, unknown>;
  structuredReport?: StructuredReport | null;
  reportVersion: number;
  noteId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SessionMedia = {
  id: string;
  sessionId: string;
  mediaType: "audio" | "photo";
  storagePath?: string | null;
  publicUrl?: string | null;
  mime?: string | null;
  sizeBytes?: number | null;
  exif: Record<string, unknown>;
  transcript?: Record<string, unknown> | null;
  imageTags?: Record<string, unknown> | null;
  uploadStatus: string;
  createdAt: string;
};

export type AiJob = {
  id: string;
  sessionId?: string | null;
  authorEmail: string;
  jobType: "stt" | "vision" | "report" | "scenario";
  status: "queued" | "processing" | "ready" | "failed";
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  error?: string | null;
  modelVersion?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

const memSessions: InspectionSession[] = [];
const memMedia: SessionMedia[] = [];
const memJobs: AiJob[] = [];

function mapSession(r: Record<string, unknown>): InspectionSession {
  return {
    id: r.id as string,
    authorEmail: r.author_email as string,
    authorLabel: (r.author_label as string | null) ?? null,
    complexId: (r.complex_id as string | null) ?? null,
    region: r.region as string,
    aptName: (r.apt_name as string | null) ?? null,
    mode: (r.mode as InspectionSession["mode"]) ?? "field_note",
    status: (r.status as SessionStatus) ?? "active",
    privacyClass: (r.privacy_class as InspectionSession["privacyClass"]) ?? "private",
    geoLat: r.geo_lat != null ? Number(r.geo_lat) : null,
    geoLng: r.geo_lng != null ? Number(r.geo_lng) : null,
    geoPrecision: (r.geo_precision as string | null) ?? null,
    startedAt: r.started_at as string,
    endedAt: (r.ended_at as string | null) ?? null,
    capture: (r.capture as Record<string, unknown>) ?? {},
    structuredReport: (r.structured_report as StructuredReport | null) ?? null,
    reportVersion: Number(r.report_version ?? 0),
    noteId: (r.note_id as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapMedia(r: Record<string, unknown>): SessionMedia {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    mediaType: r.media_type as "audio" | "photo",
    storagePath: (r.storage_path as string | null) ?? null,
    publicUrl: (r.public_url as string | null) ?? null,
    mime: (r.mime as string | null) ?? null,
    sizeBytes: r.size_bytes != null ? Number(r.size_bytes) : null,
    exif: (r.exif as Record<string, unknown>) ?? {},
    transcript: (r.transcript as Record<string, unknown> | null) ?? null,
    imageTags: (r.image_tags as Record<string, unknown> | null) ?? null,
    uploadStatus: (r.upload_status as string) ?? "pending",
    createdAt: r.created_at as string,
  };
}

function mapJob(r: Record<string, unknown>): AiJob {
  return {
    id: r.id as string,
    sessionId: (r.session_id as string | null) ?? null,
    authorEmail: r.author_email as string,
    jobType: r.job_type as AiJob["jobType"],
    status: r.status as AiJob["status"],
    input: (r.input as Record<string, unknown>) ?? {},
    output: (r.output as Record<string, unknown> | null) ?? null,
    error: (r.error as string | null) ?? null,
    modelVersion: (r.model_version as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    completedAt: (r.completed_at as string | null) ?? null,
  };
}

export async function createSession(input: {
  authorEmail: string;
  authorLabel?: string;
  region: string;
  aptName?: string;
  complexId?: string;
  mode?: InspectionSession["mode"];
  privacyClass?: InspectionSession["privacyClass"];
  geoLat?: number;
  geoLng?: number;
  geoPrecision?: string;
  capture?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<InspectionSession> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  const rec: InspectionSession = {
    id: `mem-sess-${Date.now().toString(36)}`,
    authorEmail: input.authorEmail,
    authorLabel: input.authorLabel ?? null,
    complexId: input.complexId ?? null,
    region: input.region,
    aptName: input.aptName ?? null,
    mode: input.mode ?? "field_note",
    status: "active",
    privacyClass: input.privacyClass ?? "private",
    geoLat: input.geoLat ?? null,
    geoLng: input.geoLng ?? null,
    geoPrecision: input.geoPrecision ?? "district_only",
    startedAt: now,
    endedAt: null,
    capture: input.capture ?? {},
    structuredReport: null,
    reportVersion: 0,
    noteId: null,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
  if (!sb) {
    memSessions.unshift(rec);
    return rec;
  }
  const { data, error } = await sb
    .from("inspection_sessions")
    .insert({
      author_email: input.authorEmail,
      author_label: input.authorLabel ?? null,
      complex_id: input.complexId ?? null,
      region: input.region,
      apt_name: input.aptName ?? null,
      mode: input.mode ?? "field_note",
      privacy_class: input.privacyClass ?? "private",
      geo_lat: input.geoLat ?? null,
      geo_lng: input.geoLng ?? null,
      geo_precision: input.geoPrecision ?? "district_only",
      capture: input.capture ?? {},
      metadata: input.metadata ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapSession(data);
}

export async function getSession(id: string): Promise<InspectionSession | null> {
  const sb = getServiceSupabase();
  if (!sb) return memSessions.find((s) => s.id === id) ?? null;
  const { data, error } = await sb
    .from("inspection_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  /* 행이 없으면 error 없이 data=null 이다 — 그 null 만 "없는 세션"이다. */
  if (error) throw new Error(`inspection_sessions 조회 실패: ${error.message}`);
  return data ? mapSession(data) : null;
}

export async function listSessions(authorEmail: string, limit = 50): Promise<InspectionSession[]> {
  const sb = getServiceSupabase();
  if (!sb) return memSessions.filter((s) => s.authorEmail === authorEmail).slice(0, limit);
  const { data, error } = await sb
    .from("inspection_sessions")
    .select("*")
    .eq("author_email", authorEmail)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`inspection_sessions 목록 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) {
    throw new Error("inspection_sessions 목록 조회 실패: 응답이 배열이 아닙니다");
  }
  return data.map(mapSession);
}

export async function updateSession(
  id: string,
  patch: Partial<{
    status: SessionStatus;
    mode: InspectionSession["mode"];
    capture: Record<string, unknown>;
    structuredReport: StructuredReport | null;
    reportVersion: number;
    noteId: string | null;
    endedAt: string | null;
    metadata: Record<string, unknown>;
    privacyClass: InspectionSession["privacyClass"];
  }>,
): Promise<InspectionSession | null> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  if (!sb) {
    const s = memSessions.find((x) => x.id === id);
    if (!s) return null;
    Object.assign(s, patch, { updatedAt: now });
    return s;
  }
  const body: Record<string, unknown> = { updated_at: now };
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.mode !== undefined) body.mode = patch.mode;
  if (patch.capture !== undefined) body.capture = patch.capture;
  if (patch.structuredReport !== undefined) body.structured_report = patch.structuredReport;
  if (patch.reportVersion !== undefined) body.report_version = patch.reportVersion;
  if (patch.noteId !== undefined) body.note_id = patch.noteId;
  if (patch.endedAt !== undefined) body.ended_at = patch.endedAt;
  if (patch.metadata !== undefined) body.metadata = patch.metadata;
  if (patch.privacyClass !== undefined) body.privacy_class = patch.privacyClass;
  /* 저장이 안 됐는데 "저장됨"으로 보이는 것이 여기서 가장 나쁜 결과다.
     현장에서 적은 내용은 다시 만들 수 없다. 실패는 그대로 올린다. */
  const { data, error } = await sb
    .from("inspection_sessions")
    .update(body)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`inspection_sessions 갱신 실패: ${error.message}`);
  return data ? mapSession(data) : null;
}

export async function addSessionMedia(input: {
  sessionId: string;
  mediaType: "audio" | "photo";
  storagePath?: string;
  publicUrl?: string;
  mime?: string;
  sizeBytes?: number;
  exif?: Record<string, unknown>;
}): Promise<SessionMedia> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  const rec: SessionMedia = {
    id: `mem-media-${Date.now().toString(36)}`,
    sessionId: input.sessionId,
    mediaType: input.mediaType,
    storagePath: input.storagePath ?? null,
    publicUrl: input.publicUrl ?? null,
    mime: input.mime ?? null,
    sizeBytes: input.sizeBytes ?? null,
    exif: input.exif ?? {},
    uploadStatus: input.publicUrl ? "uploaded" : "pending",
    createdAt: now,
  };
  if (!sb) {
    memMedia.unshift(rec);
    return rec;
  }
  const { data, error } = await sb
    .from("inspection_session_media")
    .insert({
      session_id: input.sessionId,
      media_type: input.mediaType,
      storage_path: input.storagePath ?? null,
      public_url: input.publicUrl ?? null,
      mime: input.mime ?? null,
      size_bytes: input.sizeBytes ?? null,
      exif: input.exif ?? {},
      upload_status: input.publicUrl ? "uploaded" : "pending",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapMedia(data);
}

export async function listSessionMedia(sessionId: string): Promise<SessionMedia[]> {
  const sb = getServiceSupabase();
  if (!sb) return memMedia.filter((m) => m.sessionId === sessionId);
  const { data, error } = await sb
    .from("inspection_session_media")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  /* 빈 배열은 "이 세션에 사진·녹음이 없다"는 말이다. 조회가 실패한 세션을
     그렇게 그리면, 올려둔 자료가 사라진 것처럼 보인다. */
  if (error) throw new Error(`inspection_session_media 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) {
    throw new Error("inspection_session_media 조회 실패: 응답이 배열이 아닙니다");
  }
  return data.map(mapMedia);
}

export async function updateSessionMedia(
  id: string,
  patch: Partial<{
    transcript: Record<string, unknown>;
    imageTags: Record<string, unknown>;
    uploadStatus: string;
  }>,
): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) {
    const m = memMedia.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
    return;
  }
  const body: Record<string, unknown> = {};
  if (patch.transcript !== undefined) body.transcript = patch.transcript;
  if (patch.imageTags !== undefined) body.image_tags = patch.imageTags;
  if (patch.uploadStatus !== undefined) body.upload_status = patch.uploadStatus;
  /* 예전에는 결과를 아예 보지 않았다 — STT 전사·이미지 태그가 저장되지 않아도
     호출부는 성공으로 알고 다음 단계로 넘어갔고, 리포트에는 그 내용이 빠진
     채로 완성본이 만들어졌다. */
  const { error } = await sb.from("inspection_session_media").update(body).eq("id", id);
  if (error) throw new Error(`inspection_session_media 갱신 실패: ${error.message}`);
}

export async function createJob(input: {
  sessionId?: string;
  authorEmail: string;
  jobType: AiJob["jobType"];
  input?: Record<string, unknown>;
}): Promise<AiJob> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  const rec: AiJob = {
    id: `mem-job-${Date.now().toString(36)}`,
    sessionId: input.sessionId ?? null,
    authorEmail: input.authorEmail,
    jobType: input.jobType,
    status: "queued",
    input: input.input ?? {},
    output: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  if (!sb) {
    memJobs.unshift(rec);
    return rec;
  }
  const { data, error } = await sb
    .from("inspection_ai_jobs")
    .insert({
      session_id: input.sessionId ?? null,
      author_email: input.authorEmail,
      job_type: input.jobType,
      input: input.input ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapJob(data);
}

export async function getJob(id: string): Promise<AiJob | null> {
  const sb = getServiceSupabase();
  if (!sb) return memJobs.find((j) => j.id === id) ?? null;
  const { data, error } = await sb
    .from("inspection_ai_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  /* 폴링 중인 화면이 이 null 을 받으면 "작업 없음"으로 접는다 — 실제로는
     돌아가고 있는 AI 작업을 사용자에게 없다고 말하게 된다. */
  if (error) throw new Error(`inspection_ai_jobs 조회 실패: ${error.message}`);
  return data ? mapJob(data) : null;
}

export async function updateJob(
  id: string,
  patch: Partial<{
    status: AiJob["status"];
    output: Record<string, unknown> | null;
    error: string | null;
    modelVersion: string | null;
    completedAt: string | null;
  }>,
): Promise<AiJob | null> {
  const sb = getServiceSupabase();
  const now = new Date().toISOString();
  if (!sb) {
    const j = memJobs.find((x) => x.id === id);
    if (!j) return null;
    Object.assign(j, patch, { updatedAt: now });
    return j;
  }
  const body: Record<string, unknown> = { updated_at: now };
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.output !== undefined) body.output = patch.output;
  if (patch.error !== undefined) body.error = patch.error;
  if (patch.modelVersion !== undefined) body.model_version = patch.modelVersion;
  if (patch.completedAt !== undefined) body.completed_at = patch.completedAt;
  /* status 를 ready/failed 로 못 바꾸면 작업은 영원히 "처리 중"으로 남는다.
     실패를 삼키면 그 사실을 아무도 모른 채 사용자만 계속 기다린다. */
  const { data, error } = await sb
    .from("inspection_ai_jobs")
    .update(body)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`inspection_ai_jobs 갱신 실패: ${error.message}`);
  return data ? mapJob(data) : null;
}

export type ShareLinkMode = "standard" | "team";

export async function createShareLink(input: {
  sessionId?: string;
  noteId?: string;
  authorEmail: string;
  expiresInDays?: number;
  maxDownloads?: number;
  mode?: ShareLinkMode;
}): Promise<{ token: string; expiresAt: string | null; mode: ShareLinkMode }> {
  const sb = getServiceSupabase();
  const mode = input.mode ?? "standard";
  const prefix = mode === "team" ? "team_" : "shr_";
  const token = `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const expiresInDays = input.expiresInDays ?? (mode === "team" ? 90 : 30);
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
    : null;
  const maxDownloads = input.maxDownloads ?? (mode === "team" ? 20 : null);
  if (!sb) return { token, expiresAt, mode };
  /* insert 결과를 보지 않으면 저장되지 않은 토큰을 돌려주게 된다. 사용자는
     그 링크를 남에게 보내고, 받은 사람은 "없는 링크"를 본다. 발급에 실패했으면
     실패했다고 말해야 다시 만들 수 있다. */
  const { error } = await sb.from("inspection_share_links").insert({
    session_id: input.sessionId ?? null,
    note_id: input.noteId ?? null,
    token,
    author_email: input.authorEmail,
    expires_at: expiresAt,
    max_downloads: maxDownloads,
  });
  if (error) throw new Error(`inspection_share_links 발급 실패: ${error.message}`);
  return { token, expiresAt, mode };
}

export async function getShareByToken(token: string): Promise<{
  sessionId?: string | null;
  noteId?: string | null;
  authorEmail: string;
} | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("inspection_share_links")
    .select("session_id, note_id, author_email, expires_at")
    .eq("token", token)
    .maybeSingle();
  /* null 은 곧 "만료됐거나 없는 링크"로 그려진다 — 멀쩡한 공유 링크를 받은
     사람에게 그렇게 말하면, 보낸 사람이 잘못 보낸 것처럼 된다. */
  if (error) throw new Error(`inspection_share_links 조회 실패: ${error.message}`);
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) return null;
  return {
    sessionId: data.session_id as string | null,
    noteId: data.note_id as string | null,
    authorEmail: data.author_email as string,
  };
}
