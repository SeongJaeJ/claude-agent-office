const SPRITE_MAIN = '/sprites/main.png';
const SPRITE_SUBS = [
  '/sprites/sub1.png',
  '/sprites/sub2.png',
  '/sprites/sub3.png',
  '/sprites/sub4.png',
  '/sprites/sub5.png',
  '/sprites/sub6.png',
  '/sprites/sub7.png',
  '/sprites/sub8.png',
];

// 사전 로드
[SPRITE_MAIN, ...SPRITE_SUBS].forEach((src) => {
  const img = new Image();
  img.src = src;
});

const agentSpriteAssignments: Record<string, string> = {};

export function getAgentSprite(agentId: string, isMain: boolean): string {
  if (isMain) return SPRITE_MAIN;
  if (agentSpriteAssignments[agentId]) return agentSpriteAssignments[agentId];
  const usedSprites = new Set(Object.values(agentSpriteAssignments));
  let sprite = SPRITE_SUBS.find((s) => !usedSprites.has(s));
  if (!sprite)
    sprite =
      SPRITE_SUBS[
        Object.keys(agentSpriteAssignments).length % SPRITE_SUBS.length
      ];
  agentSpriteAssignments[agentId] = sprite;
  return sprite;
}

export function releaseAgentSprite(agentId: string) {
  delete agentSpriteAssignments[agentId];
}
