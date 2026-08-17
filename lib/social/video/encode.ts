import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

/* 2026-08-17 첫 실가동 500 의 교훈 —
   ffmpeg-static 이 반환한 경로를 믿고 바로 spawn 했더니, 번들링으로 경로가
   깨졌을 때 ENOENT 가 빈 stderr 로만 남아 원인이 보이지 않았다.
   (next.config serverExternalPackages 로 근본 원인은 제거)
   여기서는 ① 실재하는 후보 경로를 골라 쓰고 ② 실패 시 err.message(ENOENT 등)까지
   드러낸다 — 빈 오류 메시지는 다음 사람의 밤을 잡아먹는다. */
function resolveFfmpegBin(): string {
  const candidates = [
    process.env.FFMPEG_BIN,
    typeof ffmpegPath === "string" ? ffmpegPath : null,
    join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`ffmpeg 바이너리를 찾지 못했습니다 — 확인한 경로: ${candidates.join(" · ")}`);
}

/**
 * 스틸 프레임(PNG) 여러 장 → 9:16 쇼츠용 MP4 (H.264 + 무음 AAC 트랙).
 *
 * ffmpeg-static 바이너리(~76MB)는 next.config outputFileTracingIncludes 로
 * /api/cron/social-autopost 번들에만 포함된다 — 다른 함수 크기에 영향 없음.
 *
 * 무음 오디오 트랙을 넣는 이유: 릴스/쇼츠 인코더가 오디오 트랙 없는 MP4 를
 * 거부하거나 뒤늦게 실패시키는 사례가 있어, 형식을 항상 동일하게 맞춘다.
 */
export async function encodeSlideshow(
  frames: { png: Buffer; seconds: number }[],
): Promise<Buffer> {
  const ffmpegBin = resolveFfmpegBin();
  if (frames.length === 0) throw new Error("프레임이 없습니다");

  const dir = await mkdtemp(join(tmpdir(), "social-video-"));
  try {
    const lines: string[] = ["ffconcat version 1.0"];
    for (let i = 0; i < frames.length; i++) {
      const name = `f${i}.png`;
      await writeFile(join(dir, name), frames[i].png);
      lines.push(`file ${name}`, `duration ${frames[i].seconds}`);
    }
    // concat demuxer 규칙: 마지막 파일은 한 번 더 적어야 마지막 duration 이 산다
    lines.push(`file f${frames.length - 1}.png`);
    await writeFile(join(dir, "list.ffconcat"), lines.join("\n"));

    const out = join(dir, "out.mp4");
    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegBin,
        [
          "-y",
          "-f", "concat", "-safe", "0", "-i", "list.ffconcat",
          "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
          "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
          "-r", "30",
          "-c:v", "libx264", "-preset", "medium", "-crf", "23",
          "-c:a", "aac", "-shortest",
          "-movflags", "+faststart",
          out,
        ],
        { cwd: dir, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
        (err, _stdout, stderr) => {
          if (err) {
            /* stderr 가 비면(스폰 실패 등) err.message 가 유일한 단서다 — 둘 다 싣는다 */
            const tail = String(stderr).trim().slice(-400);
            reject(new Error(`ffmpeg 실패 (${err.message.slice(0, 160)})${tail ? ` — ${tail}` : ""}`));
          } else resolve();
        },
      );
    });
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
