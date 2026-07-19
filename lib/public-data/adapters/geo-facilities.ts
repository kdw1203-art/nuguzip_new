import path from "node:path";
import { readCsvFile } from "@/lib/public-data/adapters/csv-parse";

export type GeoFacilityRow = {
  name: string;
  district: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
};

const SAMPLE_FILE = "sample-national-geo.csv";

export function loadGeoFacilities(filter?: { district?: string; category?: string }): {
  rows: GeoFacilityRow[];
  source: string;
} {
  const filePath = path.join(process.cwd(), "data", "public-data-geo", SAMPLE_FILE);
  const { rows: raw } = readCsvFile(filePath);
  let rows = raw
    .map((r) => ({
      name: r.name ?? "",
      district: r.district ?? "",
      city: r.city ?? "",
      address: r.address ?? "",
      lat: Number(r.lat),
      lng: Number(r.lng),
      category: r.category ?? "",
    }))
    .filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lng));

  if (filter?.district) {
    const d = filter.district.trim();
    rows = rows.filter((r) => r.district.includes(d) || d.includes(r.district));
  }
  if (filter?.category) {
    rows = rows.filter((r) => r.category === filter.category);
  }

  return { rows, source: SAMPLE_FILE };
}
