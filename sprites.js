/**
 * 1-Bit Pixel Graphics & Procedural Sprite Generator
 * Generates monochrome bitmap matrices for zombies, weapons, reticle, and dithering patterns.
 */

// 1-Bit Dither Bayer Matrix 4x4
const DITHER_4X4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
];

// Pixel Art Bitmaps: 1 = White, 0 = Black/Transparent
const SPRITES = {
  // Zombie Walker Frame 1 (16x24)
  zombieWalker1: [
    "....XXXXXXXX....",
    "...XXXXXXXXXX...",
    "..XX..XXXX..XX..",
    "..XX..XXXX..XX..",
    "..XXXXXXXXXXXX..",
    "...XXXXXXXXXX...",
    "....XX.XX.XX....",
    "....XXXXXXXX....",
    "....XXXXXXXX....",
    "..XXXXXXXXXXXX..",
    ".XXXXXXXXXXXXXX.",
    "XXXXXXXXXXXXXXXX",
    "XX..XXXXXXXX..XX",
    "XX..XXXXXXXX..XX",
    "....XXXXXXXX....",
    "....XXXXXXXX....",
    "....XXXXXXXX....",
    "....XX....XX....",
    "...XXX....XXX...",
    "...XXX....XXX...",
    "..XXXX....XXXX..",
    "..XXXX....XXXX..",
    "..XX........XX..",
    ".XXX........XXX."
  ],

  // Zombie Walker Frame 2 (Walking alternate)
  zombieWalker2: [
    "....XXXXXXXX....",
    "...XXXXXXXXXX...",
    "..XX..XXXX..XX..",
    "..XX..XXXX..XX..",
    "..XXXXXXXXXXXX..",
    "...XXXXXXXXXX...",
    "....XX.XX.XX....",
    "....XXXXXXXX....",
    "....XXXXXXXX....",
    "..XXXXXXXXXXXX..",
    ".XXXXXXXXXXXXXX.",
    "XXXXXXXXXXXXXXXX",
    "XX..XXXXXXXX..XX",
    "XX..XXXXXXXX..XX",
    "....XXXXXXXX....",
    "....XXXXXXXX....",
    "....XXXXXXXX....",
    ".....XX..XX.....",
    "....XXX..XXX....",
    "...XXX....XXX...",
    "...XXX....XXXX..",
    "..XXXX.....XXX..",
    "..XXX.......XX..",
    "..XX........XX.."
  ],

  // Zombie Runner (Faster, hunched over)
  zombieRunner: [
    ".....XXXXXX.....",
    "...XXXXXXXXXX...",
    "..XX..XXXX..XX..",
    "..XXXXXXXXXXXX..",
    "...XXXXXXXXXX...",
    "....XXXXXXXX....",
    "..XXXXXXXXXXXX..",
    ".XXXXXXXXXXXXXX.",
    "XXXXXXXXXXXXXXXX",
    "XXXXXXXX..XXXXXX",
    "XXXXXX......XXXX",
    ".XXXX........XX.",
    "..XX.........XX.",
    "..XX.........XX.",
    "...XX.......XX..",
    "...XXX.....XXX..",
    "....XX.....XX...",
    "....XX.....XX...",
    "...XXX.....XXX..",
    "..XXXX.....XXXX.",
    ".XXXX.......XXXX",
    "XXXX.........XXX",
    "XXX...........XX",
    "XX.............X"
  ],

  // Zombie Brute (Tank - Wounded massive mutant)
  zombieBrute: [
    "..XXXXXXXXXXXXXXXX..",
    ".XXXXXXXXXXXXXXXXXX.",
    "XXXXXXXXXXXXXXXXXXXX",
    "XXXX..XXXXXXXX..XXXX",
    "XXXX..XXXXXXXX..XXXX",
    "XXXXXXXXXXXXXXXXXXXX",
    ".XXXXXXXXXXXXXXXXXX.",
    "..XXXXXXXXXXXXXXXX..",
    "XXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXX",
    "XXXXX..XXXXXX..XXXXX",
    "XXXXX..XXXXXX..XXXXX",
    "XXXXX..XXXXXX..XXXXX",
    ".XXXXXXXXXXXXXXXXXX.",
    "..XXXXXXXXXXXXXXXX..",
    "..XXXXXX....XXXXXX..",
    "..XXXXXX....XXXXXX..",
    "..XXXXXX....XXXXXX..",
    ".XXXXXXX....XXXXXXX.",
    ".XXXXXXX....XXXXXXX.",
    "XXXXXXXX....XXXXXXXX"
  ],

  // Shotgun / Rifle First Person Frame (Idle) (32x28)
  gunIdle: [
    "...............XX...............",
    "...............XX...............",
    "..............XXXX..............",
    "..............XXXX..............",
    "..............XXXX..............",
    ".............XXXXXX.............",
    ".............XXXXXX.............",
    "............XXXXXXXX............",
    "............XXXXXXXX............",
    "...........XXXXXXXXXX...........",
    "...........XXXXXXXXXX...........",
    "..........XXXXXXXXXXXX..........",
    "..........XXXXXXXXXXXX..........",
    "..........XXXXXXXXXXXX..........",
    ".........XXXXXXXXXXXXXX.........",
    ".........XXXXXXXXXXXXXX.........",
    "........XXXXXXXXXXXXXXXX........",
    "........XXXXXXXXXXXXXXXX........",
    ".......XXXXXXXXXXXXXXXXXX.......",
    ".......XXXXXXXXXXXXXXXXXX.......",
    "......XXXXXXXXXXXXXXXXXXXX......",
    "......XXXXXXXXXXXXXXXXXXXX......",
    ".....XXXXXXXXXXXXXXXXXXXXXX.....",
    ".....XXXXXXXXXXXXXXXXXXXXXX.....",
    "....XXXXXXXXXXXXXXXXXXXXXXXX....",
    "....XXXXXXXXXXXXXXXXXXXXXXXX....",
    "...XXXXXXXXXXXXXXXXXXXXXXXXXX...",
    "..XXXXXXXXXXXXXXXXXXXXXXXXXXXX.."
  ],

  // Gun Fire Frame (Muzzle flash burst)
  gunFire: [
    ".......XX......XXXX......XX.....",
    ".....XXXXXX...XXXXXX...XXXXXX...",
    "....XXXXXXXX.XXXXXXXX.XXXXXXXX..",
    ".....XXXXXX...XXXXXX...XXXXXX...",
    ".......XX......XXXX......XX.....",
    "..............XXXX..............",
    ".............XXXXXX.............",
    "............XXXXXXXX............",
    "...........XXXXXXXXXX...........",
    "..........XXXXXXXXXXXX..........",
    "..........XXXXXXXXXXXX..........",
    ".........XXXXXXXXXXXXXX.........",
    "........XXXXXXXXXXXXXXXX........",
    ".......XXXXXXXXXXXXXXXXXX.......",
    "......XXXXXXXXXXXXXXXXXXXX......",
    ".....XXXXXXXXXXXXXXXXXXXXXX.....",
    "....XXXXXXXXXXXXXXXXXXXXXXXX....",
    "...XXXXXXXXXXXXXXXXXXXXXXXXXX...",
    "..XXXXXXXXXXXXXXXXXXXXXXXXXXXX..",
    "..XXXXXXXXXXXXXXXXXXXXXXXXXXXX..",
    ".XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  ]
};

// Helper: Pre-render 1-bit sprite to offscreen canvas
function createBitmapCanvas(matrixArray, scale = 1, fillStyle = '#ffffff') {
  const h = matrixArray.length;
  const w = matrixArray[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = fillStyle;

  for (let y = 0; y < h; y++) {
    const row = matrixArray[y];
    for (let x = 0; x < w; x++) {
      if (row[x] === 'X') {
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }
  return canvas;
}

// Generate Offscreen Canvases (Gun scaled down by 2x from 4 to 2)
const CACHED_SPRITES = {
  zombieWalker1: createBitmapCanvas(SPRITES.zombieWalker1, 2),
  zombieWalker2: createBitmapCanvas(SPRITES.zombieWalker2, 2),
  zombieRunner: createBitmapCanvas(SPRITES.zombieRunner, 2),
  zombieBrute: createBitmapCanvas(SPRITES.zombieBrute, 2),
  gunIdle: createBitmapCanvas(SPRITES.gunIdle, 2),
  gunFire: createBitmapCanvas(SPRITES.gunFire, 2)
};
