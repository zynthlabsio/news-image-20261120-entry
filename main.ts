// news-image-20261120 — "The World in One Picture"
// A deterministic Node 22 program (stdlib only) that draws a newspaper
// front page summing up Friday 20 November 2026 and writes it to
// /output/entry.png (1024x1024 PNG). No network, no assets: every pixel
// is computed here, so two runs produce byte-identical output.
//
// Stories (all first reported on 20 Nov 2026, verified from wire reports):
//  LEAD  Europe ready for talks with Russia on ending the Ukraine war (BBC)
//  COP31 Africa seeks more climate cash; Europe: use pledged money (BBC)
//  YEMEN Voices from besieged Taiz: "it's just fireworks" (BBC)
//  HEALTH Daraxonrasib pill shrinks pancreatic tumours (BBC / The Times)
//  AMERICAS Bukele seeks a third term in El Salvador (Al Jazeera)
//  TECH Canada embraces AI data centres as the US pushes back (BBC)
//  LIFE Airbnb's new house rules come into force (BBC)

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- PNG out
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(rgb: Uint8Array, w: number, h: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- canvas
const px = new Uint8Array(W * H * 3);
type RGB = [number, number, number];
const PAPER: RGB = [248, 244, 233];
const INK: RGB = [17, 17, 17];
const NAVY: RGB = [27, 42, 74];
const RED: RGB = [179, 35, 27];
const TEAL: RGB = [14, 107, 107];
const GREEN: RGB = [46, 125, 50];
const GOLD: RGB = [176, 141, 42];
const GREY: RGB = [90, 86, 76];
const LIGHT: RGB = [232, 226, 210];

function fill(c: RGB): void {
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = c[0];
    px[i * 3 + 1] = c[1];
    px[i * 3 + 2] = c[2];
  }
}
function set(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++) set(i, j, c);
}
function hline(x: number, y: number, w: number, c: RGB, t = 1): void {
  rect(x, y, w, t, c);
}
function vline(x: number, y: number, h: number, c: RGB, t = 1): void {
  rect(x, y, t, h, c);
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) set(x, y, c);
}
function ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
  for (let y = cy - r - t; y <= cy + r + t; y++)
    for (let x = cx - r - t; x <= cx + r + t; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d >= r - t && d <= r) set(x, y, c);
    }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = cy - ry; y <= cy + ry; y++)
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) set(x, y, c);
    }
}
// filled triangle (x0,y0) apex, base (x1,y1)-(x2,y2)
function tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: [number, number, number, number][] = [
      [x0, y0, x1, y1],
      [x1, y1, x2, y2],
      [x2, y2, x0, y0],
    ];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
    }
    if (xs.length >= 2) {
      const a = Math.min(...xs);
      const b = Math.max(...xs);
      for (let x = Math.ceil(a); x <= Math.floor(b); x++) set(x, y, c);
    }
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows of 5 chars, '#' = ink. Uppercase + digits + punctuation.
const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "-": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "(": ["...##", "..#..", ".#...", ".#...", ".#...", "..#..", "...##"],
  ")": ["##...", "..#..", "...#.", "...#.", "...#.", "..#..", "##..."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "&": [".##..", "#..#.", "#..#.", ".#...", "#.#.#", "#..#.", ".##.#"],
  "%": ["#...#", "#..#.", "...#.", "..#..", ".#...", "#..#.", "#...#"],
  "+": [".....", "..#..", "..#..", ".###.", "..#..", "..#..", "....."],
  "=": [".....", ".....", ".###.", ".....", ".###.", ".....", "....."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  "•": [".....", ".....", ".###.", ".###.", ".###.", ".....", "....."],
  "—": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "$": ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "*": [".....", ".#.#.", "..#..", "#####", "..#..", ".#.#.", "....."],
};

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] ?? FONT["?"];
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if (g[r][col] === "#") rect(cx + col * scale, y + r * scale, scale, scale, c);
    cx += 6 * scale;
  }
}
function drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}
// Greedy word wrap; returns lines that fit maxWidth px at given scale.
function wrap(s: string, maxWidth: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textWidth(trial, scale) <= maxWidth) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawPara(s: string, x: number, y: number, maxWidth: number, scale: number, c: RGB, lh: number): number {
  const lines = wrap(s, maxWidth, scale);
  lines.forEach((ln, i) => drawText(ln, x, y + i * lh, scale, c));
  return y + lines.length * lh;
}

// ------------------------------------------------------------------ icons
function iconSunLeaf(x: number, y: number): void {
  // climate: sun over a leaf
  disc(x + 26, y + 22, 15, GOLD);
  disc(x + 26, y + 22, 9, [240, 200, 60]);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const x0 = x + 26 + Math.round(Math.cos(a) * 19);
    const y0 = y + 22 + Math.round(Math.sin(a) * 19);
    const x1 = x + 26 + Math.round(Math.cos(a) * 25);
    const y1 = y + 22 + Math.round(Math.sin(a) * 25);
    // short ray: thick line via small rects
    for (let t = 0; t <= 6; t++) set(x0 + Math.round(((x1 - x0) * t) / 6), y0 + Math.round(((y1 - y0) * t) / 6), GOLD);
  }
  ellipse(x + 26, y + 52, 22, 9, GREEN);
  vline(x + 26, y + 40, 16, GREEN, 3);
}
function iconCity(x: number, y: number): void {
  // besieged city skyline with a crescent moon
  rect(x + 4, y + 30, 12, 34, NAVY);
  rect(x + 18, y + 18, 12, 46, NAVY);
  rect(x + 32, y + 38, 12, 26, NAVY);
  rect(x + 46, y + 24, 10, 40, NAVY);
  rect(x, y + 64, 60, 3, NAVY);
  for (const [wx, wy] of [[8, 36], [22, 24], [36, 44], [49, 30]] as const)
    rect(x + wx, y + wy, 4, 5, GOLD);
  disc(x + 52, y + 10, 8, GOLD);
  disc(x + 55, y + 8, 7, PAPER);
}
function iconPill(x: number, y: number): void {
  // capsule, half red half light-grey, tilted, with a dark outline
  for (let t = -2; t < 46; t++) {
    const cx = x + 8 + t;
    const cy = y + 34 - Math.round(t * 0.35);
    for (let d = -10; d <= 10; d++) set(cx, cy + d, INK);
  }
  for (let t = 0; t < 44; t++) {
    const cx = x + 8 + t;
    const cy = y + 34 - Math.round(t * 0.35);
    for (let d = -8; d <= 8; d++) set(cx, cy + d, t < 22 ? RED : [225, 225, 225]);
  }
  disc(x + 8, y + 34, 8, RED);
  disc(x + 52, y + 19, 8, [225, 225, 225]);
  // small plus marks
  drawText("+", x + 56, y + 44, 2, GREEN);
  drawText("+", x + 2, y + 8, 2, GREEN);
}
function iconBallot(x: number, y: number): void {
  rect(x + 8, y + 30, 44, 34, NAVY);
  rect(x + 8, y + 30, 44, 8, RED);
  rect(x + 26, y + 22, 8, 8, INK);
  // ballot slip going in
  rect(x + 21, y + 3, 18, 22, INK);
  rect(x + 22, y + 4, 16, 20, [235, 235, 235]);
  rect(x + 22, y + 4, 16, 3, INK);
  drawText("3", x + 26, y + 10, 2, RED);
  // check mark on the box
  for (let t = 0; t < 8; t++) set(x + 14 + t, y + 46 + t, [255, 255, 255]);
  for (let t = 0; t < 14; t++) set(x + 22 + t, y + 54 - t, [255, 255, 255]);
}
function iconServer(x: number, y: number): void {
  rect(x + 10, y + 6, 40, 56, NAVY);
  for (let r = 0; r < 3; r++) {
    rect(x + 14, y + 12 + r * 17, 32, 12, [255, 255, 255]);
    disc(x + 19, y + 18 + r * 17, 2, GREEN);
    disc(x + 26, y + 18 + r * 17, 2, GOLD);
    rect(x + 32, y + 16 + r * 17, 10, 3, GREY);
  }
  // signal arcs
  ring(x + 56, y + 14, 8, 2, TEAL);
  ring(x + 56, y + 14, 13, 2, TEAL);
}
function iconHouse(x: number, y: number): void {
  tri(x + 30, y + 6, x + 6, y + 30, x + 54, y + 30, RED);
  rect(x + 12, y + 30, 36, 32, NAVY);
  rect(x + 26, y + 44, 10, 18, GOLD);
  rect(x + 16, y + 36, 7, 7, [255, 255, 255]);
  rect(x + 38, y + 36, 7, 7, [255, 255, 255]);
}

// ------------------------------------------------------------------ layout
const MX = 28; // page margin
const CW = W - MX * 2;

function kicker(x: number, y: number, s: string, c: RGB): void {
  drawText(s, x, y, 2, c);
  hline(x, y + 20, textWidth(s, 2), c, 3);
}

function storyCard(x: number, y: number, w: number, h: number, kick: string, kc: RGB, title: string, body: string, icon: (x: number, y: number) => void): void {
  rect(x, y, w, h, [255, 255, 255]);
  rect(x, y, w, 3, kc);
  icon(x + 12, y + 30);
  const tx = x + 84;
  kicker(tx, y + 10, kick, kc);
  const ty = drawPara(title, tx, y + 36, w - 96, 3, INK, 26);
  drawPara(body, tx, ty + 4, w - 96, 2, [40, 38, 34], 17);
}

function main(): void {
  fill(PAPER);

  // ---- masthead
  hline(MX, 26, CW, INK, 4);
  drawTextCentered("THE WORLD IN ONE PICTURE", 512, 40, 4, NAVY);
  drawTextCentered("FRIDAY 20 NOVEMBER 2026", 512, 78, 6, RED);
  drawTextCentered("THE DAY'S WORLD NEWS, SUMMED UP IN A SINGLE PICTURE", 512, 128, 2, GREY);
  hline(MX, 152, CW, INK, 4);

  // ---- lead story
  kicker(MX, 168, "LEAD  •  EUROPE", RED);
  drawPara("EUROPE READY FOR TALKS WITH RUSSIA TO END THE UKRAINE WAR", MX, 196, CW, 4, INK, 34);
  // drawn scene: EU stars ring, olive branch, Russian tricolour, table
  const SY = 268;
  disc(150, SY + 62, 58, [0, 51, 153]); // EU blue disc
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6 - Math.PI / 2;
    disc(150 + Math.round(Math.cos(a) * 42), SY + 62 + Math.round(Math.sin(a) * 42), 5, [255, 204, 0]);
  }
  // olive branch between the two sides: thick stem, leaves on the stem
  for (let t = 0; t < 62; t++)
    for (let d = -1; d <= 1; d++) set(230 + t, SY + 92 - Math.round(t * 0.35) + d, GREEN);
  ellipse(248, SY + 79, 11, 5, GREEN);
  ellipse(268, SY + 72, 11, 5, GREEN);
  ellipse(288, SY + 65, 11, 5, GREEN);
  // Russian tricolour flag on a pole
  vline(330, SY + 6, 118, INK, 4);
  rect(334, SY + 6, 92, 20, [255, 255, 255]);
  rect(334, SY + 26, 92, 20, [0, 57, 166]);
  rect(334, SY + 46, 92, 20, [213, 0, 50]);
  // table line + speech
  hline(80, SY + 126, 360, INK, 3);
  drawText("TALKS", 200, SY + 136, 3, NAVY);
  // lead text, right of the scene
  const LX = 470;
  drawPara(
    "European leaders say they are ready to open talks with Moscow on ending the war in Ukraine, as the conflict grinds into its fifth year.",
    LX, SY + 8, CW - (LX - MX), 2, INK, 18,
  );
  drawPara(
    "Allies stress any deal must protect Ukraine's security — and that Kyiv decides its own future.",
    LX, SY + 100, CW - (LX - MX), 2, [40, 38, 34], 18,
  );
  hline(MX, 452, CW, INK, 2);

  // ---- story grid: 2 columns x 3 rows
  const gy = 468;
  const gh = 148;
  const gw = Math.floor((CW - 16) / 2);
  storyCard(MX, gy, gw, gh, "CLIMATE  •  COP31, TURKEY", TEAL,
    "AFRICA SEEKS MORE CLIMATE CASH",
    "Europe tells the summit: use the money already pledged.",
    iconSunLeaf);
  storyCard(MX + gw + 16, gy, gw, gh, "YEMEN  •  TAIZ", RED,
    "VOICES FROM BESIEGED TAIZ",
    "'I tell my son it's just fireworks,' a mother says.",
    iconCity);
  storyCard(MX, gy + gh + 14, gw, gh, "HEALTH  •  CANCER", GREEN,
    "A PILL THAT SHRINKS TUMOURS",
    "Daraxonrasib + chemo: tumours shrank or vanished in 6 of 10 patients.",
    iconPill);
  storyCard(MX + gw + 16, gy + gh + 14, gw, gh, "AMERICAS  •  EL SALVADOR", NAVY,
    "BUKELE SEEKS A THIRD TERM",
    "The president moves to stand again in the February 2027 vote.",
    iconBallot);
  storyCard(MX, gy + 2 * (gh + 14), gw, gh, "TECH  •  CANADA", [94, 53, 144],
    "CANADA BETS ON AI DATA CENTRES",
    "Investors pile in as the US pushes back. O'Leary among them.",
    iconServer);
  storyCard(MX + gw + 16, gy + 2 * (gh + 14), gw, gh, "LIFE  •  TRAVEL", [176, 96, 20],
    "AIRBNB'S NEW HOUSE RULES BEGIN",
    "The platform's divisive new rules for guests and hosts take effect.",
    iconHouse);

  // ---- footer ticker
  const fy = 962;
  hline(MX, fy, CW, INK, 2);
  drawTextCentered("SOURCES: BBC • REUTERS • AL JAZEERA • THE TIMES — ALL FIRST REPORTED 20 NOV 2026", 512, fy + 12, 2, GREY);
  hline(MX, 996, CW, INK, 4);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/entry.png`, encodePNG(px, W, H));
}

main();
