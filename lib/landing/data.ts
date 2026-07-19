import "server-only";
import { unstable_cache } from "next/cache";
import { readPosts } from "@/lib/posts-store";
import { listExperts } from "@/lib/experts/store-db";
import { listReports } from "@/lib/reports/store-db";
import { listMeetings } from "@/lib/meetings/store-db";
import { getServiceSupabase } from "@/lib/supabase/service";
import { listBanners } from "@/lib/admin/banners";
import type { Banner } from "@/lib/admin/banners";
import { logger } from "@/lib/log";

export type { Banner };

export type HomePost = {
  id: string;
  title: string;
  authorLabel: string;
  authorInitial: string;
  authorTier: "free" | "pro" | "expert";
  authorTierLabel: string;
  category: string;
  region: string;
  city: string;
  district: string;
  likeCount: number;
  viewCount: number;
  commentCount: number;
  bookmarkCount: number;
  tags: string[];
  createdAt: string;
  isHot: boolean;
};

export type HomeExpert = {
  id: string;
  name: string;
  nameInitial: string;
  title: string;
  category: string;
  rating: number;
  reviewCount: number;
  consultationFee: number;
  responseRate: number;
  verified: boolean;
};

export type HomeReport = {
  id: string;
  title: string;
  authorName: string;
  category: string;
  region: string;
  price: number;
  rating: number;
  downloads: number;
  views: number;
  createdAt: string;
};

export type HomeMeeting = {
  id: string;
  title: string;
  type: "online" | "offline";
  typeLabel: string;
  region: string;
  fee: number;
  currentMembers: number;
  maxMembers: number;
  scheduledAt: string;
  scheduleLabel: string;
};

export type HomeRegion = {
  id: string;
  city: string;
  district: string;
  count: number;
  pct: number;
};

export type HomeStats = {
  users: number;
  inspections: number;
  posts: number;
  postsToday: number;
  experts: number;
};

export type HomeData = {
  posts: HomePost[];
  experts: HomeExpert[];
  reports: HomeReport[];
  meetings: HomeMeeting[];
  regions: HomeRegion[];
  stats: HomeStats;
  banners: Banner[];
};

function initialOf(name: string): string {
  const s = name?.trim() ?? "";
  return s ? s.slice(0, 1).toUpperCase() : "?";
}

async function loadHomeDataInternal(): Promise<HomeData> {
  const [posts, experts, reports, meetings, banners] = await Promise.all([
    readPosts().catch(() => []),
    listExperts().catch(() => []),
    listReports().catch(() => []),
    listMeetings().catch(() => []),
    listBanners("home").catch(() => []),
  ]);

  const sb = getServiceSupabase();
  let totalUsers = 0;
  let totalInspections = 0;
  if (sb) {
    const [u, i] = await Promise.all([
      sb.from("app_users").select("*", { count: "exact", head: true }),
      sb.from("inspection_notes").select("*", { count: "exact", head: true }),
    ]);
    if (typeof u.count === "number") totalUsers = u.count;
    if (typeof i.count === "number") totalInspections = i.count;
  }

  // 인기순: 조회·좋아요 기반 (HOT 판정 임계치 viewCount>=500 || likeCount>=30)
  const mappedPosts: HomePost[] = posts
    .slice()
    .sort(
      (a, b) =>
        (b.viewCount ?? 0) * 2 +
        (b.likeCount ?? 0) * 5 -
        ((a.viewCount ?? 0) * 2 + (a.likeCount ?? 0) * 5),
    )
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      title: p.title,
      authorLabel: p.authorLabel ?? "익명",
      authorInitial: initialOf(p.authorLabel ?? "U"),
      authorTier: "free",
      authorTierLabel: "FREE",
      category: p.category ?? "자유",
      region: [p.city, p.district].filter(Boolean).join(" "),
      city: p.city ?? "",
      district: p.district ?? "",
      likeCount: p.likeCount ?? 0,
      viewCount: p.viewCount ?? 0,
      commentCount: p.commentCount ?? 0,
      bookmarkCount: 0,
      tags: Array.isArray(p.tags) ? p.tags.slice(0, 3) : [],
      createdAt: p.createdAt ?? new Date().toISOString(),
      isHot: (p.viewCount ?? 0) >= 500 || (p.likeCount ?? 0) >= 30,
    }));

  const mappedExperts: HomeExpert[] = experts
    .slice()
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      name: e.name ?? "전문가",
      nameInitial: initialOf(e.name ?? "E"),
      title: e.title ?? e.category ?? "전문가",
      category: e.category ?? "상담",
      rating: typeof e.rating === "number" ? e.rating : 0,
      reviewCount:
        (e as { reviewCount?: number }).reviewCount ??
        (e as { reviews?: number }).reviews ??
        0,
      consultationFee:
        (e as { consultationFee?: number }).consultationFee ?? 0,
      responseRate: (e as { responseRate?: number }).responseRate ?? 0,
      verified: (e as { verified?: boolean }).verified ?? false,
    }));

  const mappedReports: HomeReport[] = reports
    .slice()
    .sort(
      (a, b) =>
        new Date(b.publishedAt ?? b.updatedAt ?? 0).getTime() -
        new Date(a.publishedAt ?? a.updatedAt ?? 0).getTime(),
    )
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      title: r.title ?? "제목 없음",
      authorName: r.authorLabel ?? "저자",
      category: r.category ?? "리포트",
      region: r.region ?? "",
      price: r.price ?? 0,
      rating: r.rating ?? 0,
      downloads: r.downloads ?? 0,
      views: r.views ?? 0,
      createdAt: r.publishedAt ?? r.updatedAt ?? new Date().toISOString(),
    }));

  const mappedMeetings: HomeMeeting[] = meetings
    .filter((m) => {
      const st = (m as { status?: string }).status;
      return !st || st === "open";
    })
    .slice()
    .sort((a, b) => {
      const aT = new Date(
        (a as { scheduledAt?: string | null }).scheduledAt ??
          (a as { createdAt?: string }).createdAt ??
          0,
      ).getTime();
      const bT = new Date(
        (b as { scheduledAt?: string | null }).scheduledAt ??
          (b as { createdAt?: string }).createdAt ??
          0,
      ).getTime();
      return aT - bT;
    })
    .slice(0, 6)
    .map((m) => {
      const sched =
        (m as { scheduledAt?: string | null }).scheduledAt ??
        (m as { createdAt?: string }).createdAt ??
        "";
      const region = (m as { region?: string }).region ?? "";
      const isOnline = /온라인|zoom|화상/i.test(
        `${region} ${(m as { title?: string }).title ?? ""}`,
      );
      return {
        id: m.id,
        title: (m as { title?: string }).title ?? "모임",
        type: isOnline ? "online" : "offline",
        typeLabel: isOnline ? "온라인" : "오프라인",
        region,
        fee: (m as { fee?: number }).fee ?? 0,
        currentMembers: (m as { currentMembers?: number }).currentMembers ?? 0,
        maxMembers: (m as { maxMembers?: number }).maxMembers ?? 0,
        scheduledAt: sched,
        scheduleLabel: sched
          ? new Date(sched).toLocaleDateString("ko-KR", {
              month: "2-digit",
              day: "2-digit",
              weekday: "short",
            })
          : "일정 미정",
      };
    });

  // 지역별 카운트 (게시글 기반)
  const regionMap = new Map<string, { city: string; district: string; count: number }>();
  for (const p of posts) {
    const city = p.city ?? "";
    const district = p.district ?? "";
    if (!city && !district) continue;
    const key = `${city}|${district}`;
    const prev = regionMap.get(key);
    if (prev) prev.count += 1;
    else regionMap.set(key, { city, district, count: 1 });
  }
  const regionTotal = posts.length || 1;
  const regions: HomeRegion[] = Array.from(regionMap.entries())
    .map(([key, v]) => ({
      id: key,
      city: v.city,
      district: v.district,
      count: v.count,
      pct: Math.round((v.count / regionTotal) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const todayStr = new Date().toDateString();
  const postsToday = posts.filter((p) => {
    const t = new Date(p.createdAt ?? 0).getTime();
    return Number.isFinite(t) && new Date(t).toDateString() === todayStr;
  }).length;

  return {
    posts: mappedPosts,
    experts: mappedExperts,
    reports: mappedReports,
    meetings: mappedMeetings,
    regions,
    banners,
    stats: {
      users: totalUsers,
      inspections: totalInspections,
      posts: posts.length,
      postsToday,
      experts: experts.length,
    },
  };
}

const loadHomeDataCached = unstable_cache(loadHomeDataInternal, ["home-data-v1"], {
  revalidate: 90,
  tags: ["home-data"],
});

/** 캐시/DB 오류 시에도 홈 RSC 가 죽지 않도록 하는 빈 스냅샷 */
export const EMPTY_HOME_DATA: HomeData = {
  posts: [],
  experts: [],
  reports: [],
  meetings: [],
  regions: [],
  banners: [],
  stats: { users: 0, inspections: 0, posts: 0, postsToday: 0, experts: 0 },
};

export async function loadHomeData(): Promise<HomeData> {
  try {
    return await loadHomeDataCached();
  } catch (err) {
    logger.error("[loadHomeData]", err);
    return EMPTY_HOME_DATA;
  }
}
