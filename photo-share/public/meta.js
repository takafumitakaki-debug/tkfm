// 撮影日時の読み取り（JPEG の EXIF、MP4/MOV の mvhd）。読めなければ null。

export async function readTakenAt(file) {
  const head = new DataView(await file.slice(0, 12).arrayBuffer());
  if (head.byteLength >= 2 && head.getUint16(0) === 0xffd8) return readJpegDate(file);
  if (head.byteLength >= 8 && /^(ftyp|wide|mdat|moov|free|skip)$/.test(fourcc(head, 4))) return readMp4Date(file);
  return null;
}

function fourcc(dv, off) {
  return String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
}

async function readJpegDate(file) {
  const buf = await file.slice(0, 256 * 1024).arrayBuffer();
  const dv = new DataView(buf);
  let p = 2;
  while (p + 4 <= dv.byteLength) {
    if (dv.getUint8(p) !== 0xff) return null;
    const marker = dv.getUint8(p + 1);
    const len = dv.getUint16(p + 2);
    if (marker === 0xe1 && p + 10 <= dv.byteLength && fourcc(dv, p + 4) === 'Exif') {
      return parseExif(dv, p + 10, Math.min(dv.byteLength, p + 2 + len));
    }
    if (marker === 0xda) return null;   // 画像データに入ったら終わり
    p += 2 + len;
  }
  return null;
}

function parseExif(dv, tiff, end) {
  const le = dv.getUint16(tiff) === 0x4949;
  const u16 = (o) => dv.getUint16(o, le);
  const u32 = (o) => dv.getUint32(o, le);
  const ascii = (o, n) => {
    let s = '';
    for (let i = 0; i < n && o + i < end; i++) { const c = dv.getUint8(o + i); if (!c) break; s += String.fromCharCode(c); }
    return s;
  };
  const readIfd = (off) => {
    const tags = {};
    const base = tiff + off;
    if (base + 2 > end) return tags;
    const n = u16(base);
    for (let i = 0; i < n; i++) {
      const e = base + 2 + i * 12;
      if (e + 12 > end) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      if (type === 2) tags[tag] = ascii(count <= 4 ? e + 8 : tiff + u32(e + 8), count);
      else if (type === 4 || type === 13) tags[tag] = u32(e + 8);
    }
    return tags;
  };
  const ifd0 = readIfd(u32(tiff + 4));
  const exif = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {};
  return exifDate(exif[0x9003], exif[0x9011]) || exifDate(exif[0x9004], exif[0x9012]) || exifDate(ifd0[0x0132], null);
}

function exifDate(s, offset) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || '');
  if (!m || m[1] === '0000') return null;
  if (offset && /^[+-]\d{2}:\d{2}$/.test(offset)) {
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${offset}`);
    if (Number.isFinite(t)) return t;
  }
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

async function readMp4Date(file) {
  // トップレベルの箱をたどって moov を探す（動画本体は読まない）
  let p = 0;
  for (let guard = 0; guard < 64 && p + 8 <= file.size; guard++) {
    const dv = new DataView(await file.slice(p, p + 16).arrayBuffer());
    let size = dv.getUint32(0);
    const type = fourcc(dv, 4);
    let header = 8;
    if (size === 1) { size = Number(dv.getBigUint64(8)); header = 16; }
    else if (size === 0) size = file.size - p;
    if (size < header) return null;
    if (type === 'moov') {
      const len = Math.min(size, 64 * 1024 * 1024);
      const moov = new DataView(await file.slice(p, p + len).arrayBuffer());
      return findMvhd(moov, header, moov.byteLength);
    }
    p += size;
  }
  return null;
}

function findMvhd(dv, start, end) {
  let p = start;
  while (p + 8 <= end) {
    const size = dv.getUint32(p);
    if (size < 8) return null;
    if (fourcc(dv, p + 4) === 'mvhd') {
      const version = dv.getUint8(p + 8);
      const secs = version === 1 ? Number(dv.getBigUint64(p + 12)) : dv.getUint32(p + 12);
      if (!secs) return null;
      const t = (secs - 2082844800) * 1000;   // 1904年起点 → UNIX 時刻
      return t > Date.UTC(1990, 0, 1) && t < Date.now() + 86400_000 ? t : null;
    }
    p += size;
  }
  return null;
}
