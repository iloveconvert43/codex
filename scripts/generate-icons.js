/**
 * Generate PWA icons from SVG
 * Run: npm install sharp && node scripts/generate-icons.js
 */
const path = require('path')
const fs = require('fs')

const sizes = [72, 96, 128, 144, 152, 192, 384, 512]
const outputDir = path.join(__dirname, '../public/icons')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6C63FF"/>
      <stop offset="100%" style="stop-color:#FF6B6B"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="110" fill="url(#bg)"/>
  <text x="256" y="340" font-size="280" text-anchor="middle" fill="white" 
    font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">🤫</text>
</svg>`

async function generate() {
  try {
    const sharp = require('sharp')
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
    for (const size of sizes) {
      await sharp(Buffer.from(svg)).resize(size, size).png()
        .toFile(path.join(outputDir, `icon-${size}x${size}.png`))
      console.log(`✅ icon-${size}x${size}.png`)
    }
    console.log('\n🎉 All icons generated!')
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      console.log('Run: npm install sharp')
    } else throw e
  }
}
generate()
