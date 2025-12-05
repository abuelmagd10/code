# PWA Icons

SVG icons have been generated for all required sizes.
For production, consider converting these to PNG using:

```bash
# Using ImageMagick
for size in 72 96 128 144 152 192 384 512; do
  convert -background none -resize ${size}x${size} icon.svg icon-${size}x${size}.png
done

# Or using sharp (Node.js)
npm install sharp
```

## Icon Sizes
- 72x72 - Android Chrome
- 96x96 - Android Chrome  
- 128x128 - Chrome Web Store
- 144x144 - Windows Tile
- 152x152 - Apple Touch Icon
- 192x192 - Android Chrome / PWA
- 384x384 - PWA Splash
- 512x512 - PWA Splash / Maskable
