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

/** 홈 데이터 소스 식별자 — 어느 조회가 실패했는지 화면까지 전달하기 위한 값 */
export type HomeSource = "posts" | "experts" | "reports" | "meetings" | "banners";

export type HomeData = {
  posts: HomePost[];
  experts: HomeExpert[];
  reports: HomeReport[];
  meetings: HomeMeeting[];
  regions: HomeRegion[];
  stats: HomeStats;
  banners: Banner[];
  /**
   * 조회에 실패한 소스. 비어 있으면 전부 성공했다는 뜻이다.
   *
   * 이게 없던 시절에는 다섯 조회가 전부 `.catch(() => [])` 였다. 그래서 DB 가
   * 잠깐 죽어도 홈은 "아직 올라온 글이 없어요"라고 말했다 — 글은 있는데.
   * 조회 실패는 데이터 없음이 아니다. 화면이 둘을 구분할 수 있어야 한다.
   */
  failedSources: HomeSource[];
};

function initialOf(name: string): string {
  const s = name?.trim() ?? "";
  return s ? s.slice(0, 1).toUpperCase() : "?";
}

async function loadHomeDataInternal(): Promise<HomeData> {
  /* 실패를 삼키지 않고 "어느 소스가 실패했는지"를 같이 들고 나간다.
     allSettled 라 한 소스가 죽어도 나머지는 그대로 보여 준다. */
  const failedSources: HomeSource[] = [];
  /* 최적화 9 — 아래 세 개의 count 질의는 오랫동안 **두 번째 단계**였다.
     목록 다섯 갈래를 다 기다린 뒤에야 시작했는데, 정작 이 셋은 목록 결과를
     **하나도 안 본다**(app_users·inspection_notes·posts 의 전체 개수다).
     기다릴 이유가 없는 대기였으므로 같은 층으로 내린다.
     · head:true 라 행은 안 넘어온다 — 개수만 세는 질의다.
     · 실패는 여기서도 삼키지 않는다: count 가 null 이면 아래에서 목록 길이로
       떨어지되, 그 길이가 상한(POSTS_READ_LIMIT)일 수 있다는 사실은
       totalPosts 주석에 그대로 남는다. */
  const sb = getServiceSupabase();
  const countQuery = (table: string) =>
    sb ? sb.from(table).select("id", { count: "exact", head: true }) : Promise.resolve(null);

  const settled = await Promise.allSettled([
    readPosts(),
    listExperts(),
    listReports(),
    listMeetings(),
    listBanners("home"),
    countQuery("app_users"),
    countQuery("inspection_notes"),
    countQuery("posts"),
  ]);
  const SOURCE_ORDER: HomeSource[] = [
    "posts",
    "experts",
    "reports",
    "meetings",
    "banners",
  ];
  /* SOURCE_ORDER 는 앞 5칸만 이름이 있다. 뒤 3칸(count)은 "소스 실패"가 아니라
     "총계를 못 구함"이고, 그건 아래에서 목록 길이로 떨어지는 별개의 처리다 —
     여기서 같이 세면 실패 소스 이름이 undefined 로 들어가고, 바로 아래
     "전부 실패" 판정(=== SOURCE_ORDER.length)도 어긋난다. */
  settled.slice(0, SOURCE_ORDER.length).forEach((r, i) => {
    if (r.status === "rejected") {
      const key = SOURCE_ORDER[i]!;
      failedSources.push(key);
      logger.error(`[loadHomeData] ${key} 조회 실패`, r.reason);
    }
  });
  const posts = settled[0]!.status === "fulfilled" ? settled[0]!.value : [];
  const experts = settled[1]!.status === "fulfilled" ? settled[1]!.value : [];
  const reports = settled[2]!.status === "fulfilled" ? settled[2]!.value : [];
  const meetings = settled[3]!.status === "fulfilled" ? settled[3]!.value : [];
  const banners = settled[4]!.status === "fulfilled" ? settled[4]!.value : [];

  /* 다섯 개가 전부 실패했으면 DB 가 통째로 안 되는 상황이다. 이걸 값으로
     돌려주면 unstable_cache 가 90초 동안 그 스냅샷을 붙들어서, DB 가 살아난
     뒤에도 홈은 계속 고장난 상태로 보인다. 던지면 캐시에 남지 않고 다음
     요청이 다시 시도한다(거부는 캐시되지 않는다). */
  if (failedSources.length === SOURCE_ORDER.length) {
    throw new Error("[loadHomeData] 홈 데이터 소스 전체 조회 실패");
  }

  let totalUsers = 0;
  let totalInspections = 0;
  /* 홈에 찍히는 "총 게시글" 수.
     기본값은 위에서 받아 온 목록의 길이지만, 그 목록에는 상한이 있다
     (readPosts → POSTS_READ_LIMIT). 상한에 걸리면 length 는 총계가 아니라
     "상한"이 된다 — 글이 800개여도 500 이라고 적히는 것이다. 그래서 Supabase
     가 붙어 있으면 count 질의로 정확히 다시 구한다. */
  let totalPosts = posts.length;
  /** allSettled 한 칸에서 PostgREST count 만 꺼낸다. 못 구했으면 null. */
  const countOf = (i: number): number | null => {
    const r = settled[i];
    if (!r || r.status !== "fulfilled") return null;
    const c = (r.value as { count?: number | null } | null)?.count;
    return typeof c === "number" ? c : null;
  };
  const uCount = countOf(5);
  const iCount = countOf(6);
  const pCount = countOf(7);
  if (uCount !== null) totalUsers = uCount;
  if (iCount !== null) totalInspections = iCount;
  if (pCount !== null) totalPosts = pCount;

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

  /* 지역별 카운트 — **읽어 온 목록(최신 상한 건) 기준**이다. 전체 글이
     아니라 표본이므로, 아래 pct 도 "표본 안에서의 비율"이다. 총계
     (stats.posts)는 count 질의로 따로 구한다 — 두 수를 나눠 쓰면 안 된다. */
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

  /* 오늘 글 수 — 목록에서 센다. 목록은 최신순 상한 목록이므로, 하루에
     상한(POSTS_READ_LIMIT)을 넘는 글이 올라오지 않는 한 정확하다. 넘어서는
     날이 오면 여기도 count 질의로 바꿔야 한다. */
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
    failedSources,
    stats: {
      users: totalUsers,
      inspections: totalInspections,
      posts: totalPosts,
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
  /* 여기까지 왔다는 건 조회가 실패했다는 뜻이다. "데이터 없음"이 아니다 —
     전 소스를 실패로 표시해서 화면이 그렇게 말할 수 있게 한다. */
  failedSources: ["posts", "experts", "reports", "meetings", "banners"],
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
