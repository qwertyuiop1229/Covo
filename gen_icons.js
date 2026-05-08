// Covo icon generator - supersampled anti-aliasing, dark navy + white
const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function u32be(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; }
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  return Buffer.concat([u32be(data.length), t, data, u32be(crc32(Buffer.concat([t, data])))]);
}

// --- SDF (Signed Distance Field) helpers for smooth shapes ---

function sdfRoundedRect(px, py, x1, y1, x2, y2, r) {
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const hw = (x2 - x1) / 2 - r, hh = (y2 - y1) / 2 - r;
  const qx = Math.abs(px - cx) - hw, qy = Math.abs(py - cy) - hh;
  return Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdfCircle(px, py, cx, cy, r) {
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) - r;
}

// Smooth coverage from SDF distance (1=inside, 0=outside, partial at edge)
function coverage(d) {
  return Math.max(0, Math.min(1, 0.5 - d));
}

// Alpha-blend src over dst
function blend(dst, src, a) {
  return Math.round(dst * (1 - a) + src * a);
}

function makePNG(size, solid = false) {
  // Work in 4x supersampled space then downsample
  const S = 4;
  const BIG = size * S;
  const big = new Uint8Array(BIG * BIG * 4); // RGBA

  const BG = [0x1f, 0x29, 0x37]; // #1f2937
  const WHITE = [0xff, 0xff, 0xff];
  const DARK = [0x1f, 0x29, 0x37];

  function setB(x, y, r, g, b, a) {
    if (x < 0 || x >= BIG || y < 0 || y >= BIG) return;
    const i = (y * BIG + x) * 4;
    const oa = big[i+3] / 255;
    const na = a / 255;
    const out_a = na + oa * (1 - na);
    if (out_a < 0.0001) return;
    big[i]   = Math.round((r * na + big[i]   * oa * (1 - na)) / out_a);
    big[i+1] = Math.round((g * na + big[i+1] * oa * (1 - na)) / out_a);
    big[i+2] = Math.round((b * na + big[i+2] * oa * (1 - na)) / out_a);
    big[i+3] = Math.round(out_a * 255);
  }

  // Draw using SDF (iterate every pixel in big space)
  const p = BIG / 100; // scale factor

  for (let y = 0; y < BIG; y++) {
    for (let x = 0; x < BIG; x++) {
      const px = x + 0.5, py = y + 0.5; // center of sub-pixel

      // 1. Background rounded rect (or solid for apple-touch-icon)
      let bgAlpha;
      if (solid) {
        bgAlpha = 255; // solid, no rounding
      } else {
        const cornerR = 22 * p;
        const d = sdfRoundedRect(px, py, 0, 0, BIG, BIG, cornerR);
        bgAlpha = Math.round(coverage(d) * 255);
      }
      if (bgAlpha > 0) {
        setB(x, y, BG[0], BG[1], BG[2], bgAlpha);
      }

      // 2. White chat bubble body
      const bx1 = 17*p, by1 = 18*p, bx2 = 83*p, by2 = 65*p, bR = 9*p;
      const dBubble = sdfRoundedRect(px, py, bx1, by1, bx2, by2, bR);
      const bubbleCov = coverage(dBubble);
      if (bubbleCov > 0) setB(x, y, WHITE[0], WHITE[1], WHITE[2], Math.round(bubbleCov * 255));

      // 3. Chat bubble tail (triangle pointing down-left)
      // Triangle vertices (in big-space): top-left, top-right, bottom
      const tlx = 40*p, tly = 58*p;
      const trx = 56*p, try_ = 58*p;
      const tbx = 44*p, tby = 80*p;
      // Barycentric test
      const v0x = trx-tlx, v0y = try_-tly;
      const v1x = tbx-tlx, v1y = tby-tly;
      const v2x = px-tlx,  v2y = py-tly;
      const dot00 = v0x*v0x+v0y*v0y, dot01 = v0x*v1x+v0y*v1y;
      const dot02 = v0x*v2x+v0y*v2y, dot11 = v1x*v1x+v1y*v1y, dot12 = v1x*v2x+v1y*v2y;
      const inv = 1/(dot00*dot11-dot01*dot01);
      const u_ = (dot11*dot02-dot01*dot12)*inv, v_ = (dot00*dot12-dot01*dot02)*inv;
      if (u_ >= 0 && v_ >= 0 && u_+v_ <= 1) {
        setB(x, y, WHITE[0], WHITE[1], WHITE[2], 255);
      }

      // 4. Three dark dots
      const dotY = 43*p, dotR = 5.5*p;
      for (const dotX of [34*p, 50*p, 66*p]) {
        const dDot = sdfCircle(px, py, dotX, dotY, dotR);
        const dotCov = coverage(dDot);
        if (dotCov > 0) setB(x, y, DARK[0], DARK[1], DARK[2], Math.round(dotCov * 255));
      }
    }
  }

  // Downsample BIG -> size by averaging S×S blocks
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum=0, gSum=0, bSum=0, aSum=0;
      for (let dy = 0; dy < S; dy++) {
        for (let dx = 0; dx < S; dx++) {
          const i = ((y*S+dy)*BIG + (x*S+dx)) * 4;
          rSum += big[i]; gSum += big[i+1]; bSum += big[i+2]; aSum += big[i+3];
        }
      }
      const n = S * S;
      const o = (y * size + x) * 4;
      pixels[o]   = Math.round(rSum / n);
      pixels[o+1] = Math.round(gSum / n);
      pixels[o+2] = Math.round(bSum / n);
      pixels[o+3] = Math.round(aSum / n);
    }
  }

  // Encode PNG
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = chunk('IHDR', Buffer.concat([u32be(size), u32be(size), Buffer.from([8,6,0,0,0])]));
  const rowBytes = size * 4;
  const raw = Buffer.alloc(size * (1 + rowBytes));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + rowBytes)] = 0;
    pixels.copy ? Buffer.from(pixels).copy(raw, y*(1+rowBytes)+1, y*rowBytes, (y+1)*rowBytes)
                : raw.set(pixels.subarray(y*rowBytes, (y+1)*rowBytes), y*(1+rowBytes)+1);
  }
  const compressed = zlib.deflateSync(Buffer.from(pixels.buffer), { level: 6 });
  // Re-encode with filter bytes
  const rawWithFilter = Buffer.alloc(size * (1 + rowBytes));
  for (let y = 0; y < size; y++) {
    rawWithFilter[y*(1+rowBytes)] = 0;
    for (let x = 0; x < rowBytes; x++) {
      rawWithFilter[y*(1+rowBytes)+1+x] = pixels[y*rowBytes+x];
    }
  }
  const comp = zlib.deflateSync(rawWithFilter, { level: 9 });
  const idat = chunk('IDAT', comp);
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

fs.writeFileSync('public/icon-192x192.png', makePNG(192, false));
fs.writeFileSync('public/icon-512x512.png', makePNG(512, false));
// apple-touch-icon: solid bg, no rounded corners (iOS clips automatically)
fs.writeFileSync('public/apple-touch-icon.png', makePNG(180, true));
console.log('Icons generated: icon-192x192.png, icon-512x512.png, apple-touch-icon.png');
