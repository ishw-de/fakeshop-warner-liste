const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

function drawIcon(size) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.46;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let r8 = 0, g8 = 0, b8 = 0, a8 = 0;

      if (dist <= r) {
        // Roter Kreis (Warnsymbol-Hintergrund)
        r8 = 0xd9; g8 = 0x30; b8 = 0x25; a8 = 255;

        // Weisses Ausrufezeichen
        const barW = size * 0.11;
        const barTop = size * 0.22;
        const barBottom = size * 0.60;
        const dotCy = size * 0.76;
        const dotR = size * 0.075;

        const inBar = Math.abs(dx) <= barW / 2 && y >= barTop && y <= barBottom;
        const inDot = Math.sqrt(dx * dx + (y - dotCy) * (y - dotCy)) <= dotR;

        if (inBar || inDot) {
          r8 = 255; g8 = 255; b8 = 255; a8 = 255;
        }
      }

      png.data[idx] = r8;
      png.data[idx + 1] = g8;
      png.data[idx + 2] = b8;
      png.data[idx + 3] = a8;
    }
  }
  return png;
}

const outDir = path.resolve(__dirname, "../extension/icons");
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = drawIcon(size);
  const buf = PNG.sync.write(png);
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), buf);
  console.log(`icon${size}.png geschrieben`);
}
