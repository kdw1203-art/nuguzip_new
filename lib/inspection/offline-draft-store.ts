const DRAFT_KEY = "woodong:inspection-draft";

export type PublicContextQueueItem = {
  district: string;
  aptName?: string;
  intent: string;
  queuedAt: string;
};

export type InspectionDraft = {
  title: string;
  body: string;
  region: string;
  updatedAt: string;
  publicContextQueue?: PublicContextQueueItem[];
};

export function saveInspectionDraft(partial: Partial<InspectionDraft>): void {
  if (typeof window === "undefined") return;
  const prev = readInspectionDraft();
  const next: InspectionDraft = {
    title: partial.title ?? prev?.title ?? "",
    body: partial.body ?? prev?.body ?? "",
    region: partial.region ?? prev?.region ?? "",
    publicContextQueue: partial.publicContextQueue ?? prev?.publicContextQueue,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
}

export function readInspectionDraft(): InspectionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as InspectionDraft;
  } catch {
    return null;
  }
}

export function clearInspectionDraft(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DRAFT_KEY);
}
