#!/usr/bin/env node
// node-pty prebuild의 spawn-helper 실행 권한 자동 부여
// npm install 시 실행 권한이 누락되어 PTY 생성 실패하는 문제 방지
const { readdirSync, chmodSync } = require('fs');
const { join } = require('path');

const prebuildsDir = join(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds');

try {
  const platforms = readdirSync(prebuildsDir);
  for (const platform of platforms) {
    const helperPath = join(prebuildsDir, platform, 'spawn-helper');
    try {
      chmodSync(helperPath, 0o755);
    } catch {}
  }
} catch {}
