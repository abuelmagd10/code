// Script to generate PWA icons placeholder
// In production, use sharp or imagemagick to generate actual PNG icons

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '../public/icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Create SVG icons for each size (browsers can use SVG)
sizes.forEach(size => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#4f46e5;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.1875)}" fill="url(#grad1)"/>
  <text x="${size/2}" y="${size * 0.625}" font-family="Arial, sans-serif" font-size="${Math.round(size * 0.55)}" font-weight="bold" text-anchor="middle" fill="white">V</text>
  <rect x="${size * 0.3125}" y="${size * 0.74}" width="${size * 0.375}" height="${size * 0.047}" rx="${size * 0.023}" fill="white" opacity="0.9"/>
</svg>`;
  
  fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.svg`), svg);
  console.log(`Created icon-${size}x${size}.svg`);
});

// Create a simple PNG placeholder note
const readmePath = path.join(iconsDir, 'README.md');
fs.writeFileSync(readmePath, `# PWA Icons

SVG icons have been generated for all required sizes.
For production, consider converting these to PNG using:

\`\`\`bash
# Using ImageMagick
for size in 72 96 128 144 152 192 384 512; do
  convert -background none -resize \${size}x\${size} icon.svg icon-\${size}x\${size}.png
done

# Or using sharp (Node.js)
npm install sharp
\`\`\`

## Icon Sizes
- 72x72 - Android Chrome
- 96x96 - Android Chrome  
- 128x128 - Chrome Web Store
- 144x144 - Windows Tile
- 152x152 - Apple Touch Icon
- 192x192 - Android Chrome / PWA
- 384x384 - PWA Splash
- 512x512 - PWA Splash / Maskable
`);

console.log('Icon generation complete!');

