// Rasterize build/icon.svg into the PNG/ICNS/ICO assets electron-builder consumes.
// Run: node build/build-icons.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, cpSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const svgPath = join(__dirname, 'icon.svg')
const svg = readFileSync(svgPath)

// Sizes we need:
//   - 1024.png: master, used by electron-builder for fallback + Linux
//   - 512.png:  resources/icon.png (used by the renderer if you want)
//   - icon.ico: Windows multi-size ICO (sharp can write ICO directly via .ico)
//   - icon.icns: macOS — built by `iconutil` from an .iconset folder
const ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]

async function render(size, outPath) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath)
  console.log(`→ ${outPath} (${size}×${size})`)
}

async function main() {
  // Master 1024 PNG → build/icon.png (used by electron-builder)
  await render(1024, join(__dirname, 'icon.png'))

  // resources/icon.png → 512 (BrowserWindow icon)
  mkdirSync(join(repoRoot, 'resources'), { recursive: true })
  await render(512, join(repoRoot, 'resources', 'icon.png'))

  // ── macOS .icns via iconutil ────────────────────────────────────────────
  const iconset = join(__dirname, 'icon.iconset')
  if (existsSync(iconset)) rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset)
  // Apple's expected names: icon_<size>x<size>.png and icon_<size>x<size>@2x.png
  const APPLE_ENTRIES = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png']
  ]
  for (const [size, name] of APPLE_ENTRIES) {
    await render(size, join(iconset, name))
  }
  try {
    execSync(`iconutil -c icns -o "${join(__dirname, 'icon.icns')}" "${iconset}"`, { stdio: 'inherit' })
    rmSync(iconset, { recursive: true, force: true })
    console.log(`→ ${join(__dirname, 'icon.icns')}`)
  } catch (err) {
    console.error('iconutil failed (only available on macOS) — leaving .iconset/ in place')
    throw err
  }

  // ── Windows .ico via sharp (multi-resolution PNG-encoded ICO) ──────────
  // sharp can write ICO when the output extension is .ico
  // Bundle 16/32/48/64/128/256
  const icoSizes = [16, 32, 48, 64, 128, 256]
  const buffers = await Promise.all(icoSizes.map((s) =>
    sharp(svg, { density: 384 }).resize(s, s).png().toBuffer()
  ))
  // Build the ICO container manually: header + ICONDIRENTRY per image + data
  const icoPath = join(__dirname, 'icon.ico')
  writeFileSync(icoPath, buildIco(icoSizes, buffers))
  console.log(`→ ${icoPath}`)

  // Mirror master PNG into resources/ in case anything in main expects it there
  cpSync(join(__dirname, 'icon.png'), join(repoRoot, 'resources', 'icon.png'))
  console.log('Done.')
}

// Minimal ICO builder: header (6) + N × ICONDIRENTRY (16) + image data (PNG-encoded)
function buildIco(sizes, pngBuffers) {
  const count = sizes.length
  const headerSize = 6 + 16 * count
  let offset = headerSize

  const entries = sizes.map((size, i) => {
    const data = pngBuffers[i]
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size === 256 ? 0 : size, 0)   // width  (0 = 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1)   // height (0 = 256)
    entry.writeUInt8(0, 2)                         // colour count
    entry.writeUInt8(0, 3)                         // reserved
    entry.writeUInt16LE(1, 4)                      // colour planes
    entry.writeUInt16LE(32, 6)                     // bits per pixel
    entry.writeUInt32LE(data.length, 8)            // image size
    entry.writeUInt32LE(offset, 12)                // image data offset
    offset += data.length
    return entry
  })

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)        // reserved
  header.writeUInt16LE(1, 2)        // type: 1 = .ico
  header.writeUInt16LE(count, 4)    // image count

  return Buffer.concat([header, ...entries, ...pngBuffers])
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
