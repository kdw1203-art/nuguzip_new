/* [#134] JPEG EXIF DateTimeOriginal(0x9003) 최소 파서 — 촬영 시각만 읽는다.
 * 왜 직접 파나: 업로드 파이프라인(resizeImageFile)이 canvas 재인코딩으로 EXIF 를
 * 지우므로, 리사이즈 **전** 원본에서 읽어야 한다. 외부 의존성 없이 필요한 태그
 * 하나만 스캔한다. 실패는 전부 null — 이 값은 장식(방문 시간 배지)이지 사실
 * 판정이 아니다. HEIC 등 비 JPEG 는 null. */

function readAscii(view: DataView, off: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i += 1) {
    const c = view.getUint8(off + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** "YYYY:MM:DD HH:MM:SS" → ISO(로컬 가정) | null */
function exifStrToIso(v: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export async function readExifTakenAt(file: File): Promise<string | null> {
  try {
    if (!/^image\/jpe?g$/i.test(file.type)) return null;
    const buf = await file.slice(0, 256 * 1024).arrayBuffer(); // EXIF 는 파일 앞부분
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return null; // JPEG SOI

    // APP1(Exif) 세그먼트 탐색
    let off = 2;
    while (off + 4 < v.byteLength) {
      if (v.getUint8(off) !== 0xff) return null;
      const marker = v.getUint8(off + 1);
      const size = v.getUint16(off + 2);
      if (marker === 0xe1 && readAscii(v, off + 4, 4) === "Exif") {
        const tiff = off + 10; // "Exif\0\0" 뒤 TIFF 헤더
        const little = v.getUint16(tiff) === 0x4949;
        const u16 = (p: number) => v.getUint16(p, little);
        const u32 = (p: number) => v.getUint32(p, little);
        if (u16(tiff + 2) !== 0x002a) return null;
        const ifd0 = tiff + u32(tiff + 4);

        const findTag = (ifd: number, tag: number): number | null => {
          const n = u16(ifd);
          for (let i = 0; i < n; i += 1) {
            const e = ifd + 2 + i * 12;
            if (u16(e) === tag) return e;
          }
          return null;
        };

        // ① ExifIFD 포인터(0x8769) → DateTimeOriginal(0x9003)
        // ② 폴백: IFD0 의 DateTime(0x0132)
        const exifPtr = findTag(ifd0, 0x8769);
        const candidates: number[] = [];
        if (exifPtr !== null) {
          const exifIfd = tiff + u32(exifPtr + 8);
          const t = findTag(exifIfd, 0x9003);
          if (t !== null) candidates.push(t);
        }
        const t0 = findTag(ifd0, 0x0132);
        if (t0 !== null) candidates.push(t0);

        for (const e of candidates) {
          const count = u32(e + 4);
          if (count < 10 || count > 40) continue;
          const valOff = count <= 4 ? e + 8 : tiff + u32(e + 8);
          if (valOff + count > v.byteLength) continue;
          const iso = exifStrToIso(readAscii(v, valOff, count));
          if (iso) return iso;
        }
        return null;
      }
      if (marker === 0xda) return null; // SOS — 이후엔 EXIF 없음
      off += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}
