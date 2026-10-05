// Walk-in buildings: their doors on the island, two new outdoor buildings (the hospital and
// the market shop), and the rooms you see once you step inside.
import { BUILDING, BUILDINGS, type Building, type BuildingId, WALL, exitDoor } from "../../shared/world";

type Ctx = CanvasRenderingContext2D;

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = "rgba(20,30,20,.22)";
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- outside ----------

/** The new buildings on the island, sorted with everything else by their base. */
export function outdoorBuildings(ctx: Ctx): { y: number; draw: () => void }[] {
  return [
    { y: BUILDING.hospital.door.y - 5, draw: () => hospital(ctx) },
    { y: BUILDING.market.door.y - 12, draw: () => shop(ctx) },
  ];
}

function hospital(ctx: Ctx) {
  ctx.save();
  ctx.translate(BUILDING.hospital.door.x, BUILDING.hospital.door.y - 7);
  shadow(ctx, 0, 4, 78, 12);
  ctx.fillStyle = "#f7f3ea";
  ctx.fillRect(-66, -78, 132, 80);
  ctx.fillStyle = "#e2dccd";
  ctx.fillRect(-66, -8, 132, 10);
  ctx.fillStyle = "#4f8f9a";
  ctx.beginPath();
  ctx.moveTo(-74, -78);
  ctx.lineTo(0, -104);
  ctx.lineTo(74, -78);
  ctx.fill();
  // red cross on the gable
  ctx.fillStyle = "#c8343f";
  ctx.fillRect(-4, -98, 8, 18);
  ctx.fillRect(-9, -93, 18, 8);
  ctx.fillStyle = "#2b5a6a";
  for (const x of [-52, -32, 20, 40]) {
    ctx.fillRect(x, -62, 12, 14);
    ctx.fillRect(x, -36, 12, 14);
  }
  ctx.fillStyle = "#6b4a2f";
  ctx.fillRect(-11, -30, 22, 30);
  ctx.font = "700 9px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#c8343f";
  ctx.fillText("HOSPITAL", 0, -68);
  ctx.restore();
}

function shop(ctx: Ctx) {
  ctx.save();
  ctx.translate(BUILDING.market.door.x, BUILDING.market.door.y - 14);
  shadow(ctx, 0, 4, 52, 10);
  ctx.fillStyle = "#e9c99a";
  ctx.fillRect(-44, -56, 88, 58);
  ctx.fillStyle = "#8a4f3a";
  ctx.beginPath();
  ctx.moveTo(-50, -56);
  ctx.lineTo(0, -76);
  ctx.lineTo(50, -56);
  ctx.fill();
  // striped awning
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#f3ece0" : "#1f8f8a";
    ctx.fillRect(-44 + i * 11, -40, 11, 9);
  }
  ctx.fillStyle = "#2b5a6a";
  ctx.fillRect(-36, -28, 18, 16);
  ctx.fillRect(18, -28, 18, 16);
  ctx.fillStyle = "#6b4a2f";
  ctx.fillRect(-9, -26, 18, 28);
  ctx.font = "700 8px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#3a2a22";
  ctx.fillText("SHOP", 0, -45);
  ctx.restore();
}

/** Glowing doorsteps, with a sign when you're close. */
export function drawDoors(ctx: Ctx, t: number, me: { x: number; y: number }, closed: BuildingId[], inside: (b: Building) => number) {
  for (const b of BUILDINGS) {
    const shut = closed.includes(b.id);
    const d = Math.hypot(me.x - b.door.x, me.y - b.door.y);
    ctx.save();
    ctx.translate(b.door.x, b.door.y);
    if (!shut) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 320 + b.door.x);
      ctx.strokeStyle = `rgba(242,209,75,${0.45 + pulse * 0.45})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -t / 50;
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (d < 260) {
      const n = inside(b);
      const text = shut ? `${b.name} · flooded` : `${b.name}${n ? ` · ${n} inside` : ""}`;
      ctx.font = "700 12px 'Courier Prime', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const w = ctx.measureText(text).width + 18;
      ctx.fillStyle = shut ? "rgba(20,34,40,.7)" : "rgba(20,34,40,.9)";
      ctx.strokeStyle = shut ? "rgba(200,220,220,.5)" : "#f2d14b";
      ctx.lineWidth = 1.5;
      rr(ctx, -w / 2, 16, w, 22, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = shut ? "#cfe3e0" : "#f2d14b";
      ctx.fillText(text, 0, 27.5);
    }
    ctx.restore();
  }
}

// ---------- inside ----------

const THEME: Record<BuildingId, { floor: string; floor2: string; wall: string; trim: string }> = {
  hospital: { floor: "#e9f2ef", floor2: "#cfe4e0", wall: "#bfe0d8", trim: "#4f8f9a" },
  palace: { floor: "#f3ead6", floor2: "#e3d4b4", wall: "#2f6f78", trim: "#d2a74e" },
  hotel: { floor: "#8a5a3a", floor2: "#774b2f", wall: "#7a2f3d", trim: "#d2a74e" },
  lighthouse: { floor: "#9aa3a3", floor2: "#868f8f", wall: "#e9e2d2", trim: "#b8434f" },
  stables: { floor: "#d9b866", floor2: "#c9a654", wall: "#9a4a32", trim: "#5e3a24" },
  shipwreck: { floor: "#5e4228", floor2: "#4e3620", wall: "#3a2a1c", trim: "#2a1d12" },
  market: { floor: "#b88a5a", floor2: "#a77a4c", wall: "#efd9b4", trim: "#1f8f8a" },
};

/** The room around you: floor, walls, furniture and the way out. */
export function drawInterior(ctx: Ctx, b: Building, t: number, lampLit: boolean) {
  const r = b.room;
  const th = THEME[b.id];
  const w = r.x2 - r.x1;
  const h = r.y2 - r.y1;
  const back = WALL * 2.2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x1, r.y1, w, h);
  ctx.clip();
  // floor
  ctx.fillStyle = th.floor;
  ctx.fillRect(r.x1, r.y1, w, h);
  ctx.fillStyle = th.floor2;
  if (b.id === "hotel" || b.id === "shipwreck" || b.id === "market" || b.id === "stables") {
    for (let y = r.y1 + back; y < r.y2; y += 18) ctx.fillRect(r.x1, y, w, 2);
    for (let y = r.y1 + back, row = 0; y < r.y2; y += 18, row++) for (let x = r.x1 + (row % 2) * 40; x < r.x2; x += 80) ctx.fillRect(x, y, 2, 18);
  } else {
    for (let y = r.y1 + back, row = 0; y < r.y2; y += 32, row++) for (let x = r.x1 + (row % 2) * 32; x < r.x2; x += 64) ctx.fillRect(x, y, 32, 32);
  }
  // back wall
  ctx.fillStyle = th.wall;
  ctx.fillRect(r.x1, r.y1, w, back);
  ctx.fillStyle = th.trim;
  ctx.fillRect(r.x1, r.y1 + back - 6, w, 6);
  // side and front walls
  ctx.fillStyle = shade(th.wall, -0.25);
  ctx.fillRect(r.x1, r.y1, WALL, h);
  ctx.fillRect(r.x2 - WALL, r.y1, WALL, h);
  const door = exitDoor(b);
  ctx.fillRect(r.x1, r.y2 - WALL / 2, door.x - 40 - r.x1, WALL / 2);
  ctx.fillRect(door.x + 40, r.y2 - WALL / 2, r.x2 - door.x - 40, WALL / 2);

  FURNISH[b.id](ctx, b, t, lampLit);
  ctx.restore();

  // the way out: daylight through the door, and a sign
  const glow = ctx.createLinearGradient(0, r.y2, 0, r.y2 - 60);
  glow.addColorStop(0, "rgba(255,240,190,.55)");
  glow.addColorStop(1, "rgba(255,240,190,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(door.x - 40, r.y2 - 60, 80, 60);
  ctx.font = "700 13px 'Courier Prime', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(20,34,40,.9)";
  rr(ctx, door.x + 46, r.y2 - 30, 60, 22, 7);
  ctx.fill();
  ctx.fillStyle = "#f2d14b";
  ctx.fillText("EXIT ↓", door.x + 76, r.y2 - 18.5);
  // the room's name on the back wall
  ctx.font = "italic 700 20px Georgia, serif";
  ctx.fillStyle = b.id === "lighthouse" || b.id === "market" || b.id === "hospital" ? "#2b3a40" : "#f3ece0";
  ctx.fillText(b.name, (r.x1 + r.x2) / 2, r.y1 + 26);
  ctx.textBaseline = "alphabetic";
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (k < 0 ? c * k : (255 - c) * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const FURNISH: Record<BuildingId, (ctx: Ctx, b: Building, t: number, lampLit: boolean) => void> = {
  hospital(ctx, b) {
    const r = b.room;
    // a red cross on the wall
    ctx.fillStyle = "#c8343f";
    const cx = (r.x1 + r.x2) / 2;
    ctx.fillRect(cx - 6, r.y1 + 38, 12, 30);
    ctx.fillRect(cx - 15, r.y1 + 47, 30, 12);
    // beds under the first four spots, a cabinet by the last
    b.spots.slice(0, 4).forEach((s) => {
      ctx.fillStyle = "#8a9a9a";
      ctx.fillRect(s.x - 30, s.y - 30, 60, 74);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(s.x - 27, s.y - 27, 54, 68);
      ctx.fillStyle = "#e6eef0";
      rr(ctx, s.x - 20, s.y - 24, 40, 14, 5);
      ctx.fill();
      ctx.fillStyle = "#9fc7d8";
      ctx.fillRect(s.x - 27, s.y + 4, 54, 37);
    });
    const c = b.spots[4];
    ctx.fillStyle = "#c9d6d4";
    ctx.fillRect(c.x - 30, c.y - 56, 60, 70);
    ctx.fillStyle = "rgba(190,230,240,.8)";
    ctx.fillRect(c.x - 25, c.y - 50, 50, 26);
    ctx.fillStyle = "#c8343f";
    for (let i = 0; i < 4; i++) ctx.fillRect(c.x - 20 + i * 12, c.y - 46, 6, 10);
  },
  palace(ctx, b, t) {
    const r = b.room;
    const cx = (r.x1 + r.x2) / 2;
    // red carpet from the door to the throne
    ctx.fillStyle = "#a83240";
    ctx.fillRect(cx - 38, b.spots[0].y + 20, 76, r.y2 - b.spots[0].y - 20);
    ctx.fillStyle = "#d2a74e";
    ctx.fillRect(cx - 38, b.spots[0].y + 20, 4, r.y2 - b.spots[0].y - 20);
    ctx.fillRect(cx + 34, b.spots[0].y + 20, 4, r.y2 - b.spots[0].y - 20);
    // pillars
    for (const fx of [0.12, 0.88]) {
      const x = r.x1 + (r.x2 - r.x1) * fx;
      for (const fy of [0.35, 0.75]) {
        const y = r.y1 + (r.y2 - r.y1) * fy;
        ctx.fillStyle = "#f8f2e4";
        ctx.fillRect(x - 12, y - 60, 24, 64);
        ctx.fillStyle = "#d2a74e";
        ctx.fillRect(x - 15, y - 64, 30, 6);
        ctx.fillRect(x - 15, y, 30, 6);
      }
    }
    // the throne
    const s = b.spots[0];
    ctx.fillStyle = "#b8862e";
    rr(ctx, s.x - 30, s.y - 52, 60, 56, 10);
    ctx.fill();
    ctx.fillStyle = "#a83240";
    rr(ctx, s.x - 20, s.y - 42, 40, 38, 6);
    ctx.fill();
    ctx.fillStyle = "#f2d14b";
    ctx.beginPath();
    ctx.moveTo(s.x - 14, s.y - 52);
    ctx.lineTo(s.x - 8, s.y - 64);
    ctx.lineTo(s.x, s.y - 54);
    ctx.lineTo(s.x + 8, s.y - 64);
    ctx.lineTo(s.x + 14, s.y - 52);
    ctx.fill();
    // pedestals for the other treasures
    for (const p of b.spots.slice(1)) {
      ctx.fillStyle = "#e8dcc2";
      ctx.fillRect(p.x - 18, p.y - 6, 36, 22);
      ctx.fillStyle = "#cdbd9c";
      ctx.fillRect(p.x - 22, p.y + 14, 44, 6);
    }
    // a chandelier's glow
    const g = ctx.createRadialGradient(cx, r.y1 + 160, 10, cx, r.y1 + 160, 200);
    g.addColorStop(0, `rgba(255,236,170,${0.22 + 0.04 * Math.sin(t / 400)})`);
    g.addColorStop(1, "rgba(255,236,170,0)");
    ctx.fillStyle = g;
    ctx.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
  },
  hotel(ctx, b) {
    const r = b.room;
    // wallpaper stripes
    ctx.fillStyle = "rgba(255,255,255,.07)";
    for (let x = r.x1; x < r.x2; x += 24) ctx.fillRect(x, r.y1, 10, WALL * 2.2 - 6);
    // the safe
    const safe = b.spots[1];
    ctx.fillStyle = "#4a5254";
    rr(ctx, safe.x - 34, safe.y - 52, 68, 66, 6);
    ctx.fill();
    ctx.fillStyle = "#6b7477";
    rr(ctx, safe.x - 28, safe.y - 46, 56, 54, 4);
    ctx.fill();
    ctx.strokeStyle = "#d2a74e";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(safe.x + 14, safe.y - 20, 8, 0, Math.PI * 2);
    ctx.stroke();
    // cellar shelves with tools
    const sh = b.spots[0];
    ctx.fillStyle = "#5e3a24";
    ctx.fillRect(sh.x - 40, sh.y - 60, 80, 70);
    ctx.fillStyle = "#3a2416";
    for (let i = 0; i < 3; i++) ctx.fillRect(sh.x - 40, sh.y - 40 + i * 20, 80, 3);
    ctx.font = "700 10px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#d2a74e";
    ctx.fillText("CELLAR", sh.x, sh.y - 64);
    // card tables with a rug
    ctx.fillStyle = "rgba(160,40,55,.5)";
    rr(ctx, r.x1 + 120, r.y1 + 200, r.x2 - r.x1 - 240, 130, 18);
    ctx.fill();
    for (const s of b.spots.slice(2)) {
      ctx.fillStyle = "#1e5a3f";
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 10, 38, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5e3a24";
      ctx.fillRect(s.x - 3, s.y + 26, 6, 12);
    }
  },
  lighthouse(ctx, b, t, lit) {
    const r = b.room;
    // a spiral stair in the corner
    ctx.fillStyle = "#b8b0a0";
    ctx.beginPath();
    ctx.arc(r.x2 - 90, r.y2 - 90, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a8272";
    ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(r.x2 - 90, r.y2 - 90);
      ctx.lineTo(r.x2 - 90 + Math.cos(a) * 48, r.y2 - 90 + Math.sin(a) * 48);
      ctx.stroke();
    }
    // red and white bands on the wall
    ctx.fillStyle = "#b8434f";
    ctx.fillRect(r.x1, r.y1 + 40, r.x2 - r.x1, 12);
    // the great lamp
    const s = b.station!;
    const g = ctx.createRadialGradient(s.x, s.y - 30, 6, s.x, s.y - 30, lit ? 260 : 90);
    g.addColorStop(0, lit ? `rgba(255,236,150,${0.7 + 0.2 * Math.sin(t / 200)})` : "rgba(255,236,150,.25)");
    g.addColorStop(1, "rgba(255,236,150,0)");
    ctx.fillStyle = g;
    ctx.fillRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
    ctx.fillStyle = "#8a6a2a";
    ctx.fillRect(s.x - 26, s.y - 8, 52, 18);
    ctx.fillStyle = "#d2a74e";
    rr(ctx, s.x - 20, s.y - 54, 40, 48, 8);
    ctx.fill();
    ctx.fillStyle = lit ? "#fff6c8" : "#f3e3a0";
    ctx.beginPath();
    ctx.arc(s.x, s.y - 30, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "700 10px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#3a2a22";
    ctx.fillText(lit ? "LAMP LIT" : "THE LAMP", s.x, s.y + 24);
    // fuel drums
    for (const d of b.spots) {
      ctx.fillStyle = "#6b3f2a";
      ctx.beginPath();
      ctx.ellipse(d.x + 30, d.y + 6, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(d.x + 18, d.y - 18, 24, 24);
    }
  },
  stables(ctx, b) {
    const r = b.room;
    // stalls along the back with horses looking over the doors
    const n = 5;
    const sw = (r.x2 - r.x1 - WALL * 2) / n;
    for (let i = 0; i < n; i++) {
      const x = r.x1 + WALL + i * sw;
      ctx.fillStyle = "#6b3f2a";
      ctx.fillRect(x + 4, r.y1 + WALL * 2.2 - 4, sw - 8, 40);
      ctx.fillStyle = "#5e3a24";
      ctx.fillRect(x + 4, r.y1 + WALL * 2.2 + 12, sw - 8, 4);
      ctx.fillStyle = ["#7a4a2a", "#3a2a22", "#c9a27a", "#5e3a24", "#efe6d6"][i];
      ctx.beginPath();
      ctx.ellipse(x + sw / 2, r.y1 + WALL * 2.2 - 14, 11, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // saddle rack
    const s = b.station!;
    ctx.fillStyle = "#5e3a24";
    ctx.fillRect(s.x - 34, s.y - 4, 68, 8);
    ctx.fillStyle = "#8a3a2a";
    rr(ctx, s.x - 22, s.y - 26, 44, 24, 10);
    ctx.fill();
    ctx.font = "700 10px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#3a2a22";
    ctx.fillText("SADDLES", s.x, s.y + 20);
    // hay bales
    for (const p of b.spots) {
      ctx.fillStyle = "#e3c46a";
      ctx.fillRect(p.x - 30, p.y - 4, 60, 26);
      ctx.strokeStyle = "#b8963e";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 30, p.y - 4, 60, 26);
    }
  },
  shipwreck(ctx, b, t) {
    const r = b.room;
    // hull ribs
    ctx.strokeStyle = "#2a1d12";
    ctx.lineWidth = 10;
    for (let x = r.x1 + 70; x < r.x2 - 40; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, r.y1 + WALL * 2.2);
      ctx.quadraticCurveTo(x - 20, (r.y1 + r.y2) / 2, x, r.y2);
      ctx.stroke();
    }
    // light through holes in the hull, and water sloshing on the floor
    for (const [fx, fy] of [[0.3, 0.12], [0.72, 0.1]]) {
      const x = r.x1 + (r.x2 - r.x1) * fx;
      const y = r.y1 + (r.y2 - r.y1) * fy;
      const g = ctx.createRadialGradient(x, y + 80, 4, x, y + 80, 120);
      g.addColorStop(0, "rgba(190,240,255,.25)");
      g.addColorStop(1, "rgba(190,240,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 120, y, 240, 240);
    }
    ctx.fillStyle = `rgba(120,200,210,${0.25 + 0.08 * Math.sin(t / 500)})`;
    ctx.beginPath();
    ctx.ellipse(r.x1 + 170, r.y2 - 70, 90, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(r.x2 - 160, r.y2 - 110, 70, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    // barrels
    for (const p of b.spots) {
      ctx.fillStyle = "#7a4a2a";
      ctx.beginPath();
      ctx.ellipse(p.x - 34, p.y + 4, 14, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3a2416";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 48, p.y);
      ctx.lineTo(p.x - 20, p.y);
      ctx.stroke();
    }
  },
  market(ctx, b) {
    const r = b.room;
    // shelves of jars on the back wall
    for (const i of [0, 1, 4, 5]) {
      const x = r.x1 + WALL + 20 + i * 92;
      ctx.fillStyle = "#8a6440";
      ctx.fillRect(x, r.y1 + 30, 76, 6);
      ctx.fillRect(x, r.y1 + 56, 76, 6);
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = ["#b8434f", "#1f8f8a", "#d2a74e", "#7fcf8f"][(i + j) % 4];
        ctx.fillRect(x + 6 + j * 18, r.y1 + 18, 10, 12);
        ctx.fillRect(x + 6 + j * 18, r.y1 + 44, 10, 12);
      }
    }
    // the counter and the merchant
    const s = b.station!;
    ctx.fillStyle = "#3a6a5a";
    ctx.beginPath();
    ctx.arc(s.x, s.y - 40, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0b48a";
    ctx.beginPath();
    ctx.arc(s.x, s.y - 52, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6b4a2f";
    ctx.fillRect(s.x - 80, s.y - 30, 160, 34);
    ctx.fillStyle = "#8a6440";
    ctx.fillRect(s.x - 84, s.y - 34, 168, 8);
    ctx.font = "700 10px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#f3ece0";
    ctx.fillText("PEARL MARKET", s.x, s.y - 8);
    // a rug and crates of goods
    ctx.fillStyle = "rgba(184,67,79,.45)";
    rr(ctx, r.x1 + 180, r.y1 + 250, r.x2 - r.x1 - 360, 110, 14);
    ctx.fill();
    for (const p of b.spots) {
      ctx.fillStyle = "#8a6440";
      ctx.fillRect(p.x - 26, p.y + 10, 52, 12);
    }
  },
};
