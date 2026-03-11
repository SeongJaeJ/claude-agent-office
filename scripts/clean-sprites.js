#!/usr/bin/env node
/**
 * Remove background & text from sprite images
 * - Originals preserved in public/sprites/originals/
 * - Cleaned versions saved to public/sprites/
 *
 * Approach: flood-fill from corners to detect background, make transparent.
 * Text labels sit on the background so they get removed too.
 */
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPRITES_DIR = path.join(__dirname, '..', 'public', 'sprites');
const ORIGINALS_DIR = path.join(SPRITES_DIR, 'originals');

const FILES = ['main.png', 'sub1.png', 'sub2.png', 'sub3.png', 'sub4.png', 'sub5.png', 'sub6.png', 'sub7.png', 'sub8.png'];

// Color distance (Euclidean in RGB space)
function colorDist(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

function floodFillTransparent(png, startX, startY, tolerance = 50) {
  const { width, height, data } = png;
  const visited = new Uint8Array(width * height);
  const stack = [[startX, startY]];

  const idx = (x, y) => (y * width + x) * 4;
  const si = idx(startX, startY);
  const seedR = data[si], seedG = data[si+1], seedB = data[si+2];

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const vi = y * width + x;
    if (visited[vi]) continue;
    visited[vi] = 1;

    const i = idx(x, y);
    const r = data[i], g = data[i+1], b = data[i+2];

    if (colorDist(r, g, b, seedR, seedG, seedB) <= tolerance) {
      data[i+3] = 0; // make transparent
      stack.push([x-1, y], [x+1, y], [x, y-1], [x, y+1]);
    }
  }
}

function removeIsolatedPixels(png, minNeighbors = 2) {
  // Remove small isolated opaque pixels (leftover text/noise)
  const { width, height, data } = png;
  const toRemove = [];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      if (data[i+3] === 0) continue;

      // Count opaque neighbors in 3x3
      let opaqueNeighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ni = ((y+dy) * width + (x+dx)) * 4;
          if (data[ni+3] > 0) opaqueNeighbors++;
        }
      }
      if (opaqueNeighbors < minNeighbors) {
        toRemove.push(i);
      }
    }
  }

  for (const i of toRemove) {
    data[i+3] = 0;
  }
  return toRemove.length;
}

function findCharacterBounds(png) {
  // Scan from bottom-up to find the main character body
  // The character+desk is the large connected mass in lower portion
  const { width, height, data } = png;
  const idx = (x, y) => (y * width + x) * 4;

  // Find bounding box of all opaque pixels
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[idx(x, y) + 3] > 0) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, maxX, minY, maxY };
}

function findMainCluster(png) {
  // BFS from bottom-center to find the main connected character cluster
  const { width, height, data } = png;
  const idx = (x, y) => (y * width + x) * 4;
  const visited = new Uint8Array(width * height);
  const inCluster = new Uint8Array(width * height);

  // Start from multiple points along the bottom half center
  const seeds = [];
  for (let y = Math.floor(height * 0.6); y < height; y += 5) {
    for (let x = Math.floor(width * 0.3); x < Math.floor(width * 0.7); x += 5) {
      if (data[idx(x, y) + 3] > 0) seeds.push([x, y]);
    }
  }

  const stack = [...seeds];
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const vi = y * width + x;
    if (visited[vi]) continue;
    visited[vi] = 1;

    const i = idx(x, y);
    if (data[i + 3] === 0) continue;

    inCluster[vi] = 1;
    // 8-directional connectivity
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (dx !== 0 || dy !== 0)
          stack.push([x + dx, y + dy]);
  }

  return inCluster;
}

function processImage(filename) {
  const srcPath = path.join(ORIGINALS_DIR, filename);
  const dstPath = path.join(SPRITES_DIR, filename);

  const buf = fs.readFileSync(srcPath);
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  const idx = (x, y) => (y * width + x) * 4;

  // Step 1: Flood fill background from edges with generous tolerance
  const seeds = [
    [0, 0], [width-1, 0], [0, height-1], [width-1, height-1],
    [Math.floor(width/2), 0], [0, Math.floor(height/2)],
    [width-1, Math.floor(height/2)], [Math.floor(width/2), height-1],
    // Extra seeds along all edges
    [Math.floor(width/4), 0], [Math.floor(width*3/4), 0],
    [0, Math.floor(height/4)], [0, Math.floor(height*3/4)],
    [width-1, Math.floor(height/4)], [width-1, Math.floor(height*3/4)],
  ];

  for (const [sx, sy] of seeds) {
    floodFillTransparent(png, sx, sy, 55);
  }

  // Step 2: Find the main character cluster (connected to bottom-center)
  const mainCluster = findMainCluster(png);

  // Step 3: Remove everything NOT in the main cluster
  // This removes floating text, icons, and small disconnected artifacts
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const vi = y * width + x;
      if (!mainCluster[vi]) {
        data[idx(x, y) + 3] = 0;
      }
    }
  }

  // Step 4: Clean up isolated pixels
  for (let pass = 0; pass < 5; pass++) {
    const removed = removeIsolatedPixels(png, 2);
    if (removed === 0) break;
  }

  // Step 5: Trim transparent borders
  const bounds = findCharacterBounds(png);
  const pad = 2;
  const cx = Math.max(0, bounds.minX - pad);
  const cy = Math.max(0, bounds.minY - pad);
  const cw = Math.min(width, bounds.maxX + pad + 1) - cx;
  const ch = Math.min(height, bounds.maxY + pad + 1) - cy;

  const trimmed = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = idx(cx + x, cy + y);
      const di = (y * cw + x) * 4;
      trimmed.data[di] = data[si];
      trimmed.data[di+1] = data[si+1];
      trimmed.data[di+2] = data[si+2];
      trimmed.data[di+3] = data[si+3];
    }
  }

  const outBuf = PNG.sync.write(trimmed);
  fs.writeFileSync(dstPath, outBuf);
  console.log(`  ✓ ${filename} (${width}x${height} → ${cw}x${ch})`);
}

// ── Main ──
console.log('Backing up originals...');
fs.mkdirSync(ORIGINALS_DIR, { recursive: true });

for (const f of FILES) {
  const src = path.join(SPRITES_DIR, f);
  const dst = path.join(ORIGINALS_DIR, f);
  if (!fs.existsSync(dst) && fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
  }
}

console.log('Processing sprites (removing background & text)...');
for (const f of FILES) {
  processImage(f);
}
console.log('Done!');
