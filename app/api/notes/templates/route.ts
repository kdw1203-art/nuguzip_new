import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createUserTemplate } from "@/lib/note-templates/store";
import type { TemplateSection } from "@/lib/note-templates/types";

/* [#69] 이웃 체크리스트 공유 — POST /api/notes/templates
   본문: { title, description, category, sections: [{title, items[]}] }
   검증·상한은 store(createUserTemplate)가 맡고, 여기서는 인증과 형태만 본다. */

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const rawSections = Array.isArray(body.sections) ? body.sections : [];
  const sections: TemplateSection[] = rawSections
    .filter((s: unknown): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s: Record<string, unknown>) => ({
      title: typeof s.title === "string" ? s.title : "",
      items: Array.isArray(s.items) ? s.items.filter((i): i is string => typeof i === "string") : [],
    }));
  try {
    const id = await createUserTemplate({
      authorEmail: session.user.email,
      title: String(body.title ?? ""),
      description: String(body.description ?? ""),
      category: String(body.category ?? ""),
      sections,
    });
    revalidatePath("/notes/templates");
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "저장 실패" },
      { status: 400 },
    );
  }
}
