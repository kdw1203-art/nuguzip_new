import { encodingKeyForUrl } from "@/lib/public-data/data-go-kr-keys";

/** 서울 강남구 근처 격자 (임장 기본) */
const DEFAULT_GRID = { nx: 61, ny: 126 };

function latestBaseTime(): { baseDate: string; baseTime: string } {
  const now = new Date();
  const hours = [2, 5, 8, 11, 14, 17, 20, 23];
  let h = hours[0];
  for (const hour of hours) {
    if (now.getHours() >= hour) h = hour;
  }
  const d = new Date(now);
  if (now.getHours() < 2) d.setDate(d.getDate() - 1);
  return {
    baseDate: `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`,
    baseTime: `${String(h).padStart(2, "0")}00`,
  };
}

const SKY: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };

export type WeatherDay = {
  date: string;
  sky: string;
  tempMin?: number;
  tempMax?: number;
  pop?: number;
};

export async function fetchKmaShortForecast(): Promise<{
  items: WeatherDay[];
  mode: "live" | "mock";
}> {
  const key = encodingKeyForUrl();
  if (!key) return { items: [], mode: "mock" };

  const { baseDate, baseTime } = latestBaseTime();
  const url = new URL(
    "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
  );
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "300");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(DEFAULT_GRID.nx));
  url.searchParams.set("ny", String(DEFAULT_GRID.ny));

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
    const json = (await res.json()) as {
      response?: { body?: { items?: { item?: Array<Record<string, string>> } } };
    };
    const raw = json.response?.body?.items?.item ?? [];
    if (!Array.isArray(raw) || raw.length === 0) return { items: [], mode: "mock" };

    const byDate = new Map<string, WeatherDay>();
    for (const row of raw) {
      const fcstDate = row.fcstDate ?? "";
      const cat = row.category ?? "";
      const val = row.fcstValue ?? "";
      if (!fcstDate) continue;
      const cur = byDate.get(fcstDate) ?? { date: fcstDate, sky: "—" };
      if (cat === "SKY") cur.sky = SKY[val] ?? val;
      if (cat === "TMN") cur.tempMin = Number(val);
      if (cat === "TMX") cur.tempMax = Number(val);
      if (cat === "POP") cur.pop = Number(val);
      byDate.set(fcstDate, cur);
    }

    const items = [...byDate.values()]
      .slice(0, 3)
      .map((d) => ({
        ...d,
        date:
          d.date === baseDate
            ? "오늘"
            : d.date.slice(4, 6) + "/" + d.date.slice(6, 8),
      }));

    if (items.length > 0) return { items, mode: "live" };
  } catch {
    // fall through
  }
  return { items: [], mode: "mock" };
}
