// Renders the app icon to every size iOS and Android want. Run: npm run icons
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const mark = (pad) => {
  // A bowl with two wisps of steam, on tomato. `pad` shrinks the mark for maskable safe zones.
  const s = 1 - pad * 2;
  const t = (n) => 512 * pad + n * s;
  return `
  <g fill="none" stroke="#fff8ef" stroke-linecap="round" stroke-linejoin="round" stroke-width="${30 * s}">
    <path d="M${t(112)} ${t(250)} H${t(400)} A${144 * s} ${144 * s} 0 0 1 ${t(112)} ${t(250)} Z" fill="#fff8ef"/>
    <path d="M${t(208)} ${t(186)} c0 -30 ${26 * s} -30 ${26 * s} -60 M${t(282)} ${t(186)} c0 -30 ${26 * s} -30 ${26 * s} -60"/>
  </g>`;
};

const svg = ({ radius = 0, pad = 0 } = {}) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="#e0533a"/>
  ${mark(pad)}
</svg>`);

mkdirSync("public/icons", { recursive: true });
const out = [
  ["public/icons/icon-192.png", 192, svg({ radius: 0 })],
  ["public/icons/icon-512.png", 512, svg({ radius: 0 })],
  ["public/icons/maskable-512.png", 512, svg({ pad: 0.12 })],
  ["public/apple-touch-icon.png", 180, svg()],
  ["public/favicon.ico", 48, svg({ radius: 96 })],
];
for (const [file, size, src] of out) {
  await sharp(src).resize(size, size).png().toFile(file);
}
console.log("icons written");
