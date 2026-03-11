#!/usr/bin/env node
/**
 * CQ-style (Crusaders Quest × Octopath) pixel art sprite generator
 * Generates 48x48 chibi character PNGs for Agent Office
 */
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'sprites');

// ── Drawing Engine ──────────────────────────────────────────────
class SpriteCanvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.pixels = new Uint8Array(w * h * 4);
  }

  set(x, y, r, g, b, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.pixels[i] = r; this.pixels[i+1] = g; this.pixels[i+2] = b; this.pixels[i+3] = a;
  }

  get(x, y) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return [0,0,0,0];
    const i = (y * this.w + x) * 4;
    return [this.pixels[i], this.pixels[i+1], this.pixels[i+2], this.pixels[i+3]];
  }

  px(x, y, col) { this.set(x, y, ...col); }

  rect(x, y, w, h, col) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        this.set(x + dx, y + dy, ...col);
  }

  circle(cx, cy, r, col) {
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (dx*dx + dy*dy <= r2)
          this.set(cx + dx, cy + dy, ...col);
  }

  ellipse(cx, cy, rx, ry, col) {
    for (let dy = -ry; dy <= ry; dy++)
      for (let dx = -rx; dx <= rx; dx++)
        if ((dx*dx)/(rx*rx) + (dy*dy)/(ry*ry) <= 1.0)
          this.set(cx + dx, cy + dy, ...col);
  }

  // Draw a line (Bresenham)
  line(x0, y0, x1, y1, col) {
    let dx = Math.abs(x1-x0), dy = Math.abs(y1-y0);
    let sx = x0<x1?1:-1, sy = y0<y1?1:-1;
    let err = dx-dy;
    while(true) {
      this.set(x0, y0, ...col);
      if (x0===x1 && y0===y1) break;
      let e2 = 2*err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  // Triangle fill
  tri(x0, y0, x1, y1, x2, y2, col) {
    const minY = Math.min(y0,y1,y2), maxY = Math.max(y0,y1,y2);
    const minX = Math.min(x0,x1,x2), maxX = Math.max(x0,x1,x2);
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++)
        if (ptInTri(x,y,x0,y0,x1,y1,x2,y2))
          this.set(x, y, ...col);
  }

  // Add warm brown outline around all non-transparent pixels
  outline(col) {
    const copy = new Uint8Array(this.pixels);
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        if (copy[i+3] === 0) {
          for (const [dx, dy] of dirs) {
            const nx = x+dx, ny = y+dy;
            if (nx >= 0 && nx < this.w && ny >= 0 && ny < this.h) {
              const ni = (ny * this.w + nx) * 4;
              if (copy[ni+3] > 0) {
                this.pixels[i] = col[0]; this.pixels[i+1] = col[1];
                this.pixels[i+2] = col[2]; this.pixels[i+3] = 255;
                break;
              }
            }
          }
        }
      }
    }
  }

  // Inner shadow on bottom/right of non-transparent pixels
  innerShadow(darken = 30) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const [r,g,b,a] = this.get(x, y);
        if (a === 0) continue;
        // Check if bottom or right neighbor is transparent
        const [,,, ab] = this.get(x, y+1);
        const [,,, ar] = this.get(x+1, y);
        if (ab === 0 || ar === 0) {
          this.set(x, y, Math.max(0,r-darken), Math.max(0,g-darken), Math.max(0,b-darken), a);
        }
      }
    }
  }

  save(filepath) {
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.pixels);
    fs.writeFileSync(filepath, PNG.sync.write(png));
    console.log(`  → ${path.basename(filepath)}`);
  }
}

function ptInTri(px,py,x0,y0,x1,y1,x2,y2) {
  const d = (x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);
  if (d === 0) return false;
  const a = ((px-x0)*(y2-y0)-(x2-x0)*(py-y0))/d;
  const b = ((x1-x0)*(py-y0)-(px-x0)*(y1-y0))/d;
  return a >= 0 && b >= 0 && (a+b) <= 1;
}

function hex(h) {
  h = h.replace('#','');
  return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16), 255];
}

function darker(col, amt = 40) {
  return [Math.max(0,col[0]-amt), Math.max(0,col[1]-amt), Math.max(0,col[2]-amt), 255];
}

function lighter(col, amt = 40) {
  return [Math.min(255,col[0]+amt), Math.min(255,col[1]+amt), Math.min(255,col[2]+amt), 255];
}


// ── CQ-style Outline Color ─────────────────────────────────────
const OL = hex('#3d2517'); // warm dark brown

// ── Palettes per Character ──────────────────────────────────────
const palettes = {
  main: {
    skin:      hex('#f0c4a0'), skinDark: hex('#d4a07a'), skinLight: hex('#ffe0c4'),
    hair:      hex('#2a1a3e'), hairDark: hex('#1a0e2a'), hairLight: hex('#4a3060'),
    shirt:     hex('#cc2244'), shirtDark: hex('#991133'), shirtLight: hex('#ee4466'),
    pants:     hex('#2a2a3e'), pantsDark: hex('#1a1a2e'),
    shoes:     hex('#5c3a1e'), shoesDark: hex('#3d2517'),
    crown:     hex('#ffd700'), crownDark: hex('#cc9900'), crownLight: hex('#ffed55'),
    eye:       hex('#3344aa'), eyeLight: hex('#5577dd'),
    belt:      hex('#8B6914'),
    cape:      hex('#881133'), capeDark: hex('#660022'),
  },
  explore: {
    skin:      hex('#e8c4a0'), skinDark: hex('#cca078'), skinLight: hex('#fce0c8'),
    hair:      hex('#cc7733'), hairDark: hex('#994d1a'), hairLight: hex('#ee9955'),
    shirt:     hex('#336633'), shirtDark: hex('#224422'), shirtLight: hex('#448844'),
    pants:     hex('#5c4a32'), pantsDark: hex('#3d3220'),
    shoes:     hex('#6b4226'), shoesDark: hex('#4a2d18'),
    hood:      hex('#2d5a2d'), hoodDark: hex('#1a3d1a'), hoodLight: hex('#4a7a4a'),
    eye:       hex('#33aa44'), eyeLight: hex('#55cc66'),
    scarf:     hex('#cc8833'), scarfDark: hex('#996622'),
    cloak:     hex('#3d6b3d'), cloakDark: hex('#2a4a2a'),
  },
  plan: {
    skin:      hex('#f0d0b0'), skinDark: hex('#d4b090'), skinLight: hex('#ffe8d0'),
    hair:      hex('#e8e8f0'), hairDark: hex('#b8b8cc'), hairLight: hex('#ffffff'),
    shirt:     hex('#3355aa'), shirtDark: hex('#224488'), shirtLight: hex('#4477cc'),
    pants:     hex('#2a2a44'), pantsDark: hex('#1a1a33'),
    shoes:     hex('#443322'), shoesDark: hex('#332211'),
    hat:       hex('#3366bb'), hatDark: hex('#224488'), hatLight: hex('#5588dd'),
    eye:       hex('#aa3366'), eyeLight: hex('#cc5588'),
    gem:       hex('#ff8800'), gemLight: hex('#ffaa33'), gemDark: hex('#cc6600'),
    book:      hex('#8B4513'), bookLight: hex('#aa6633'),
  },
  code: {
    skin:      hex('#d4a574'), skinDark: hex('#b88a5c'), skinLight: hex('#f0c4a0'),
    hair:      hex('#1a1a2e'), hairDark: hex('#0a0a1e'), hairLight: hex('#333355'),
    shirt:     hex('#555577'), shirtDark: hex('#3d3d55'), shirtLight: hex('#7777aa'),
    pants:     hex('#333344'), pantsDark: hex('#222233'),
    shoes:     hex('#444444'), shoesDark: hex('#333333'),
    hoodie:    hex('#6a5acd'), hoodieDark: hex('#4a3aad'), hoodieLight: hex('#8a7aed'),
    eye:       hex('#44ccaa'), eyeLight: hex('#66eedd'),
    headphone: hex('#333333'), hpLight: hex('#555555'), hpAccent: hex('#44ccaa'),
    screen:    hex('#44ffaa'),
  },
  test: {
    skin:      hex('#e0b090'), skinDark: hex('#c49468'), skinLight: hex('#f8d4b8'),
    hair:      hex('#cc4422'), hairDark: hex('#993311'), hairLight: hex('#ee6644'),
    shirt:     hex('#dd8822'), shirtDark: hex('#bb6611'), shirtLight: hex('#ffaa44'),
    pants:     hex('#554433'), pantsDark: hex('#3d3022'),
    shoes:     hex('#6b4226'), shoesDark: hex('#4a2d18'),
    armor:     hex('#ccaa55'), armorDark: hex('#aa8833'), armorLight: hex('#eedd88'),
    eye:       hex('#dd4422'), eyeLight: hex('#ff6644'),
    shield:    hex('#4466aa'), shieldDark: hex('#334488'), shieldLight: hex('#6688cc'),
    helmet:    hex('#bbaa66'), helmetDark: hex('#998844'),
  },
  default: {
    skin:      hex('#f0c8a8'), skinDark: hex('#d4aa88'), skinLight: hex('#ffe4cc'),
    hair:      hex('#886644'), hairDark: hex('#664422'), hairLight: hex('#aa8866'),
    shirt:     hex('#44aaaa'), shirtDark: hex('#338888'), shirtLight: hex('#66cccc'),
    pants:     hex('#444455'), pantsDark: hex('#333344'),
    shoes:     hex('#554433'), shoesDark: hex('#3d3022'),
    eye:       hex('#4488cc'), eyeLight: hex('#66aaee'),
    bag:       hex('#aa7744'), bagDark: hex('#885522'),
  },
};


// ── Character Builders ──────────────────────────────────────────

function drawCQBase(c, p, opts = {}) {
  const W = 48;
  // ─── HEAD (huge, CQ-style) ───
  // Main head shape - large oval
  c.ellipse(24, 18, 13, 12, p.skin);
  // Skin highlight on forehead
  c.ellipse(24, 15, 9, 6, p.skinLight);
  // Skin shadow on lower face
  c.ellipse(24, 22, 10, 5, p.skinDark);
  // Mid-tone blend
  c.ellipse(24, 18, 11, 9, p.skin);

  // ─── EYES (large, anime-style) ───
  // Eye whites
  c.ellipse(19, 19, 3, 3, hex('#ffffff'));
  c.ellipse(29, 19, 3, 3, hex('#ffffff'));
  // Pupils
  c.ellipse(19, 19, 2, 3, p.eye);
  c.ellipse(29, 19, 2, 3, p.eye);
  // Pupil dark center
  c.ellipse(19, 20, 1, 2, darker(p.eye, 60));
  c.ellipse(29, 20, 1, 2, darker(p.eye, 60));
  // Eye highlight (important for life!)
  c.px(18, 18, hex('#ffffff'));
  c.px(17, 17, hex('#ffffff'));
  c.px(28, 18, hex('#ffffff'));
  c.px(27, 17, hex('#ffffff'));
  // Lower eye highlight
  c.px(20, 21, p.eyeLight);
  c.px(30, 21, p.eyeLight);
  // Eyelashes (top)
  for (let x = 16; x <= 22; x++) c.px(x, 16, OL);
  for (let x = 26; x <= 32; x++) c.px(x, 16, OL);

  // ─── NOSE & MOUTH ───
  c.px(24, 22, p.skinDark);
  c.px(23, 25, hex('#e07060'));
  c.px(24, 25, hex('#e07060'));
  c.px(25, 25, hex('#e07060'));
  // Blush
  c.ellipse(16, 22, 2, 1, [255, 180, 160, 120]);
  c.ellipse(32, 22, 2, 1, [255, 180, 160, 120]);

  // ─── BODY (tiny, CQ-style) ───
  // Torso
  c.rect(18, 31, 12, 7, p.shirt);
  // Shirt shading
  c.rect(18, 31, 3, 7, p.shirtDark);
  c.rect(27, 31, 3, 7, p.shirtDark);
  c.rect(21, 31, 6, 5, p.shirtLight || lighter(p.shirt, 20));

  // Arms
  c.rect(14, 32, 4, 5, p.shirt);
  c.rect(30, 32, 4, 5, p.shirt);
  // Hands
  c.rect(14, 37, 3, 2, p.skin);
  c.rect(31, 37, 3, 2, p.skin);

  // ─── LEGS ───
  c.rect(19, 38, 4, 5, p.pants);
  c.rect(25, 38, 4, 5, p.pants);
  // Shadow
  c.rect(19, 38, 4, 2, p.pantsDark);
  c.rect(25, 38, 4, 2, p.pantsDark);

  // ─── SHOES ───
  c.rect(17, 43, 6, 3, p.shoes);
  c.rect(25, 43, 6, 3, p.shoes);
  c.rect(17, 44, 6, 2, p.shoesDark);
  c.rect(25, 44, 6, 2, p.shoesDark);

  // Neck
  c.rect(22, 29, 4, 3, p.skin);
}

function drawHairBase(c, p, style) {
  switch(style) {
    case 'spiky': {
      // Wild spiky hair (main agent style)
      c.ellipse(24, 13, 14, 11, p.hair);
      // Spiky tufts
      c.tri(10, 14, 6, 4, 14, 8, p.hair);
      c.tri(38, 14, 42, 4, 34, 8, p.hair);
      c.tri(18, 6, 14, -2, 22, 2, p.hair);
      c.tri(30, 6, 26, 2, 34, -2, p.hair);
      c.tri(24, 4, 20, -3, 28, -3, p.hair);
      // Hair highlights
      c.ellipse(20, 10, 4, 3, p.hairLight);
      c.tri(11, 12, 8, 5, 14, 9, p.hairLight);
      c.tri(20, 5, 16, -1, 24, 1, p.hairLight);
      // Hair shadow at base
      c.ellipse(24, 18, 13, 4, p.hairDark);
      break;
    }
    case 'flowing': {
      // Long flowing hair (explorer)
      c.ellipse(24, 12, 14, 10, p.hair);
      // Side locks flowing down
      c.rect(8, 12, 5, 18, p.hair);
      c.rect(35, 12, 5, 18, p.hair);
      c.rect(9, 28, 3, 4, p.hair);
      c.rect(36, 28, 3, 4, p.hair);
      // Bangs
      c.ellipse(24, 10, 12, 5, p.hair);
      // Highlights
      c.ellipse(20, 9, 4, 3, p.hairLight);
      c.rect(9, 15, 3, 8, p.hairLight);
      c.rect(36, 15, 3, 8, p.hairLight);
      // Shadow
      c.ellipse(24, 16, 12, 3, p.hairDark);
      break;
    }
    case 'wizard': {
      // Elegant long hair for mage
      c.ellipse(24, 13, 13, 10, p.hair);
      // Flowing sides
      c.rect(10, 10, 4, 22, p.hair);
      c.rect(34, 10, 4, 22, p.hair);
      // Hair tips
      c.tri(10, 30, 8, 35, 14, 32, p.hair);
      c.tri(38, 30, 40, 35, 34, 32, p.hair);
      // Highlights
      c.ellipse(20, 10, 5, 4, p.hairLight);
      c.rect(11, 14, 2, 10, p.hairLight);
      // Shadow
      c.ellipse(24, 17, 11, 3, p.hairDark);
      break;
    }
    case 'messy': {
      // Messy tech hair (coder)
      c.ellipse(24, 12, 13, 10, p.hair);
      // Messy tufts
      c.tri(14, 5, 10, 0, 18, 3, p.hair);
      c.tri(34, 5, 30, 3, 38, 0, p.hair);
      c.tri(24, 3, 20, -1, 28, -1, p.hair);
      // Side hair
      c.rect(10, 12, 3, 10, p.hair);
      c.rect(35, 12, 3, 10, p.hair);
      // Highlights
      c.ellipse(21, 9, 4, 3, p.hairLight);
      // Shadow
      c.ellipse(24, 16, 12, 3, p.hairDark);
      break;
    }
    case 'fierce': {
      // Short fierce hair (tester/warrior)
      c.ellipse(24, 12, 14, 10, p.hair);
      // Aggressive spikes upward
      c.tri(16, 5, 12, -3, 20, 1, p.hair);
      c.tri(24, 3, 20, -4, 28, -4, p.hair);
      c.tri(32, 5, 28, 1, 36, -3, p.hair);
      c.tri(12, 8, 7, 2, 16, 5, p.hair);
      c.tri(36, 8, 32, 5, 41, 2, p.hair);
      // Highlights
      c.ellipse(22, 9, 5, 3, p.hairLight);
      c.tri(17, 4, 14, -2, 21, 2, p.hairLight);
      // Shadow
      c.ellipse(24, 16, 13, 3, p.hairDark);
      break;
    }
    case 'neat': {
      // Neat short hair (default/apprentice)
      c.ellipse(24, 12, 13, 10, p.hair);
      // Slight bangs
      c.ellipse(24, 8, 10, 4, p.hair);
      // Side hair
      c.rect(11, 14, 3, 8, p.hair);
      c.rect(34, 14, 3, 8, p.hair);
      // Highlights
      c.ellipse(21, 9, 4, 3, p.hairLight);
      // Shadow
      c.ellipse(24, 16, 11, 3, p.hairDark);
      break;
    }
  }
}

// ── Individual Character Drawings ───────────────────────────────

function drawMain(c) {
  const p = palettes.main;

  // Cape behind body
  c.tri(14, 32, 8, 44, 24, 44, p.cape);
  c.tri(34, 32, 24, 44, 40, 44, p.cape);
  c.tri(16, 34, 10, 44, 24, 44, p.capeDark);

  // Hair
  drawHairBase(c, p, 'spiky');

  // Base body & face
  drawCQBase(c, p);

  // ── Crown ──
  c.rect(16, 2, 16, 5, p.crown);
  c.rect(17, 1, 14, 2, p.crown);
  // Crown points
  c.rect(17, 0, 3, 2, p.crownLight);
  c.rect(23, -1, 2, 3, p.crownLight);
  c.rect(28, 0, 3, 2, p.crownLight);
  // Crown gems
  c.px(20, 3, hex('#ff2244'));
  c.px(24, 2, hex('#ff2244'));
  c.px(28, 3, hex('#ff2244'));
  // Crown shadow
  c.rect(16, 6, 16, 1, p.crownDark);

  // Belt
  c.rect(18, 37, 12, 1, p.belt);
  c.px(24, 37, p.crown);

  // Shoulder pads
  c.ellipse(15, 32, 3, 2, p.crown);
  c.ellipse(33, 32, 3, 2, p.crown);
  c.ellipse(15, 31, 2, 1, p.crownLight);
  c.ellipse(33, 31, 2, 1, p.crownLight);
}

function drawExplore(c) {
  const p = palettes.explore;

  // Cloak behind
  c.tri(12, 30, 4, 46, 24, 46, p.cloak);
  c.tri(36, 30, 24, 46, 44, 46, p.cloak);
  c.tri(14, 32, 6, 46, 24, 46, p.cloakDark);

  // Hair
  drawHairBase(c, p, 'flowing');

  // Base
  drawCQBase(c, p);

  // ── Hood ──
  c.ellipse(24, 9, 15, 10, p.hood);
  c.ellipse(24, 7, 13, 7, p.hood);
  // Hood opening - show face
  c.ellipse(24, 14, 10, 8, p.skin);
  c.ellipse(24, 12, 11, 6, p.hoodDark);
  c.ellipse(24, 14, 10, 7, p.skin);
  // Hood highlights
  c.ellipse(20, 5, 5, 3, p.hoodLight);
  // Hood peak
  c.tri(24, -2, 18, 4, 30, 4, p.hood);
  c.tri(24, -1, 20, 4, 28, 4, p.hoodLight);
  // Hood shadow
  c.ellipse(24, 11, 11, 2, p.hoodDark);

  // Re-draw face parts over hood
  c.ellipse(24, 18, 11, 9, p.skin);
  c.ellipse(24, 15, 9, 6, p.skinLight);
  // Re-draw eyes
  c.ellipse(19, 19, 3, 3, hex('#ffffff'));
  c.ellipse(29, 19, 3, 3, hex('#ffffff'));
  c.ellipse(19, 19, 2, 3, p.eye);
  c.ellipse(29, 19, 2, 3, p.eye);
  c.ellipse(19, 20, 1, 2, darker(p.eye, 60));
  c.ellipse(29, 20, 1, 2, darker(p.eye, 60));
  c.px(18, 18, hex('#ffffff'));
  c.px(17, 17, hex('#ffffff'));
  c.px(28, 18, hex('#ffffff'));
  c.px(27, 17, hex('#ffffff'));
  c.px(20, 21, p.eyeLight);
  c.px(30, 21, p.eyeLight);
  for (let x = 16; x <= 22; x++) c.px(x, 16, OL);
  for (let x = 26; x <= 32; x++) c.px(x, 16, OL);
  c.px(24, 22, p.skinDark);
  c.px(23, 25, hex('#e07060'));
  c.px(24, 25, hex('#e07060'));
  c.px(25, 25, hex('#e07060'));

  // Scarf
  c.rect(20, 28, 8, 3, p.scarf);
  c.rect(20, 28, 8, 1, p.scarfDark);
  // Scarf tail
  c.rect(28, 29, 3, 6, p.scarf);
  c.rect(29, 33, 2, 4, p.scarfDark);

  // Leaf/feather accessory on hood
  c.tri(32, 4, 36, -4, 34, 2, hex('#55aa44'));
  c.tri(33, 3, 37, -3, 35, 1, hex('#77cc66'));
}

function drawPlan(c) {
  const p = palettes.plan;

  // Hair
  drawHairBase(c, p, 'wizard');

  // Base
  drawCQBase(c, p);

  // ── Wizard Hat ──
  // Hat brim
  c.ellipse(24, 10, 16, 3, p.hat);
  c.ellipse(24, 9, 14, 2, p.hatLight);
  // Hat cone
  c.tri(24, -6, 12, 10, 36, 10, p.hat);
  c.tri(24, -5, 16, 8, 32, 8, p.hatDark);
  // Hat highlight
  c.tri(24, -4, 18, 6, 26, 6, p.hatLight);
  // Hat tip curves to side
  c.tri(24, -6, 28, -8, 26, -4, p.hat);
  c.tri(28, -8, 32, -6, 26, -4, p.hat);
  c.px(30, -7, p.hatLight);
  // Orange gem on hat
  c.circle(24, 9, 3, p.gem);
  c.circle(24, 8, 2, p.gemLight);
  c.px(23, 7, hex('#ffffff'));
  // Hat band
  c.rect(14, 8, 20, 2, p.hatDark);

  // Re-draw face (hat covers top of head)
  c.ellipse(24, 18, 11, 9, p.skin);
  c.ellipse(24, 15, 9, 6, p.skinLight);
  // Eyes
  c.ellipse(19, 19, 3, 3, hex('#ffffff'));
  c.ellipse(29, 19, 3, 3, hex('#ffffff'));
  c.ellipse(19, 19, 2, 3, p.eye);
  c.ellipse(29, 19, 2, 3, p.eye);
  c.ellipse(19, 20, 1, 2, darker(p.eye, 60));
  c.ellipse(29, 20, 1, 2, darker(p.eye, 60));
  c.px(18, 18, hex('#ffffff'));
  c.px(17, 17, hex('#ffffff'));
  c.px(28, 18, hex('#ffffff'));
  c.px(27, 17, hex('#ffffff'));
  c.px(20, 21, p.eyeLight);
  c.px(30, 21, p.eyeLight);
  for (let x = 16; x <= 22; x++) c.px(x, 16, OL);
  for (let x = 26; x <= 32; x++) c.px(x, 16, OL);
  c.px(24, 22, p.skinDark);
  c.px(23, 25, hex('#e07060'));
  c.px(24, 25, hex('#e07060'));
  c.px(25, 25, hex('#e07060'));
  // Blush
  c.ellipse(16, 22, 2, 1, [255,180,160,120]);
  c.ellipse(32, 22, 2, 1, [255,180,160,120]);

  // Side hair wisps over face
  c.rect(10, 14, 3, 12, p.hair);
  c.rect(35, 14, 3, 12, p.hair);
  c.rect(11, 14, 2, 6, p.hairLight);
  c.rect(36, 14, 2, 6, p.hairLight);

  // Robe/coat details
  c.rect(18, 35, 12, 3, p.hatDark);
  c.rect(23, 36, 2, 1, p.gem);

  // Book in hand
  c.rect(9, 35, 6, 5, p.book);
  c.rect(10, 35, 5, 5, p.bookLight);
  c.rect(9, 35, 1, 5, p.book);
  // Pages
  c.rect(11, 36, 3, 3, hex('#f5e6d0'));
}

function drawCode(c) {
  const p = palettes.code;

  // Hair
  drawHairBase(c, p, 'messy');

  // Base
  drawCQBase(c, p);

  // ── Hoodie ──
  c.rect(16, 30, 16, 8, p.hoodie);
  c.rect(16, 30, 4, 8, p.hoodieDark);
  c.rect(28, 30, 4, 8, p.hoodieDark);
  c.rect(20, 30, 8, 6, p.hoodieLight);
  // Hoodie hood behind head
  c.ellipse(24, 26, 8, 4, p.hoodie);
  // Kangaroo pocket
  c.rect(20, 34, 8, 3, p.hoodieDark);
  c.rect(21, 35, 6, 1, p.hoodie);
  // Hoodie string
  c.line(22, 30, 21, 33, hex('#aaaaaa'));
  c.line(26, 30, 27, 33, hex('#aaaaaa'));

  // Arms in hoodie
  c.rect(12, 32, 4, 5, p.hoodie);
  c.rect(32, 32, 4, 5, p.hoodie);
  c.rect(12, 32, 2, 5, p.hoodieDark);
  c.rect(34, 32, 2, 5, p.hoodieDark);

  // ── Headphones ──
  // Band
  c.ellipse(24, 6, 14, 5, p.headphone);
  c.ellipse(24, 6, 12, 3, [0,0,0,0]); // cut out center
  // Re-draw hair on top
  c.ellipse(24, 8, 11, 5, p.hair);
  c.ellipse(21, 7, 4, 3, p.hairLight);
  // Ear cups
  c.ellipse(9, 14, 4, 5, p.headphone);
  c.ellipse(39, 14, 4, 5, p.headphone);
  c.ellipse(9, 13, 3, 3, p.hpLight);
  c.ellipse(39, 13, 3, 3, p.hpLight);
  // Accent color on cups
  c.ellipse(9, 14, 2, 2, p.hpAccent);
  c.ellipse(39, 14, 2, 2, p.hpAccent);

  // Laptop/screen glow in hand
  c.rect(33, 35, 6, 4, hex('#333344'));
  c.rect(34, 35, 4, 3, p.screen);
  // Screen glow effect
  c.px(35, 36, lighter(p.screen, 40));
  c.px(36, 36, lighter(p.screen, 20));
}

function drawTest(c) {
  const p = palettes.test;

  // Hair
  drawHairBase(c, p, 'fierce');

  // Base
  drawCQBase(c, p);

  // ── Armor ──
  // Chest plate
  c.rect(17, 31, 14, 6, p.armor);
  c.rect(17, 31, 3, 6, p.armorDark);
  c.rect(28, 31, 3, 6, p.armorDark);
  c.rect(20, 31, 8, 4, p.armorLight);
  // Shoulder guards
  c.ellipse(14, 31, 4, 3, p.armor);
  c.ellipse(34, 31, 4, 3, p.armor);
  c.ellipse(14, 30, 3, 2, p.armorLight);
  c.ellipse(34, 30, 3, 2, p.armorLight);

  // ── Helmet ──
  c.ellipse(24, 8, 14, 8, p.helmet);
  c.ellipse(24, 6, 12, 5, p.helmet);
  // Helmet visor opening
  c.ellipse(24, 13, 10, 5, p.helmetDark);
  // Face visible through visor
  c.ellipse(24, 16, 9, 6, p.skin);
  // Re-draw eyes
  c.ellipse(19, 19, 3, 3, hex('#ffffff'));
  c.ellipse(29, 19, 3, 3, hex('#ffffff'));
  c.ellipse(19, 19, 2, 3, p.eye);
  c.ellipse(29, 19, 2, 3, p.eye);
  c.ellipse(19, 20, 1, 2, darker(p.eye, 60));
  c.ellipse(29, 20, 1, 2, darker(p.eye, 60));
  c.px(18, 18, hex('#ffffff'));
  c.px(17, 17, hex('#ffffff'));
  c.px(28, 18, hex('#ffffff'));
  c.px(27, 17, hex('#ffffff'));
  // Eyelashes
  for (let x = 16; x <= 22; x++) c.px(x, 16, OL);
  for (let x = 26; x <= 32; x++) c.px(x, 16, OL);
  // Mouth
  c.px(23, 24, hex('#e07060'));
  c.px(24, 24, hex('#e07060'));
  c.px(25, 24, hex('#e07060'));

  // Helmet crest (mohawk-like)
  c.rect(22, 0, 4, 8, p.hairLight);
  c.rect(23, -2, 2, 4, p.hair);
  c.rect(22, 2, 4, 3, p.hair);
  // Helmet wings
  c.tri(6, 8, 2, 2, 12, 8, p.armorLight);
  c.tri(42, 8, 36, 8, 46, 2, p.armorLight);

  // ── Shield (left hand) ──
  c.ellipse(8, 37, 5, 6, p.shield);
  c.ellipse(8, 37, 4, 5, p.shieldLight);
  c.ellipse(8, 37, 2, 3, p.shield);
  // Shield boss
  c.circle(8, 37, 1, p.armorLight);
  // Shield edge
  c.ellipse(8, 37, 3, 4, p.shieldDark);
  c.ellipse(8, 37, 2, 3, p.shieldLight);
  c.circle(8, 37, 1, p.armorLight);

  // Sword (right hand)
  c.rect(36, 28, 2, 10, hex('#ccccdd'));
  c.rect(36, 27, 2, 2, hex('#aaaacc'));
  c.rect(34, 37, 6, 2, hex('#8B6914'));
  c.rect(36, 39, 2, 2, hex('#8B4513'));
  // Blade highlight
  c.rect(37, 28, 1, 8, hex('#eeeeff'));
}

function drawDefault(c) {
  const p = palettes.default;

  // Hair
  drawHairBase(c, p, 'neat');

  // Base
  drawCQBase(c, p);

  // Simple tunic details
  c.rect(22, 31, 4, 1, lighter(p.shirt, 30));
  // Belt
  c.rect(18, 37, 12, 1, hex('#8B6914'));
  c.px(24, 37, hex('#ffd700'));

  // ── Bag/satchel ──
  c.rect(32, 34, 5, 6, p.bag);
  c.rect(33, 34, 4, 5, p.bagDark);
  c.rect(33, 35, 3, 3, p.bag);
  // Bag strap
  c.line(30, 31, 33, 34, p.bagDark);
  // Bag buckle
  c.px(34, 34, hex('#ffd700'));

  // Simple headband
  c.rect(12, 10, 24, 2, hex('#ff6655'));
  c.rect(12, 10, 24, 1, hex('#ff8877'));
  // Knot
  c.rect(36, 9, 3, 3, hex('#ff6655'));
  c.px(37, 8, hex('#ff8877'));
}


// ── Generate All ────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true });

const characters = [
  { name: 'main', draw: drawMain },
  { name: 'explore', draw: drawExplore },
  { name: 'plan', draw: drawPlan },
  { name: 'code', draw: drawCode },
  { name: 'test', draw: drawTest },
  { name: 'default', draw: drawDefault },
];

console.log('Generating CQ-style sprites (48x48)...');
for (const { name, draw } of characters) {
  const canvas = new SpriteCanvas(48, 48);
  draw(canvas);
  canvas.outline(OL);
  canvas.save(path.join(OUT_DIR, `${name}.png`));
}
console.log('Done!');
