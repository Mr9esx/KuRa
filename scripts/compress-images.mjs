#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"])

function parseArgs(argv) {
  const options = {
    dir: "public/images",
    maxSize: 768,
    pngColors: 256,
    pngDither: 1.0,
    jpegQuality: 82,
    webpQuality: 82,
    dryRun: false,
  }

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true
      continue
    }
    if (arg === "--dry-run") {
      options.dryRun = true
      continue
    }
    if (!arg.startsWith("--")) continue

    const [key, rawValue = ""] = arg.slice(2).split("=")
    const value = rawValue.trim()
    if (key === "dir" && value) options.dir = value
    if (key === "max-size" && value) options.maxSize = Number(value)
    if (key === "png-colors" && value) options.pngColors = Number(value)
    if (key === "png-dither" && value) options.pngDither = Number(value)
    if (key === "jpeg-quality" && value) options.jpegQuality = Number(value)
    if (key === "webp-quality" && value) options.webpQuality = Number(value)
  }

  return options
}

function printHelp() {
  console.log(`
用法:
  node scripts/compress-images.mjs [options]

常用参数:
  --dir=<path>           目标目录 (默认: public/images)
  --max-size=<number>    最大边长 (默认: 768)
  --png-colors=<number>  PNG 调色板颜色数 (默认: 256)
  --png-dither=<number>  PNG 抖动强度 0~1 (默认: 1)
  --jpeg-quality=<num>   JPEG 质量 1~100 (默认: 82)
  --webp-quality=<num>   WEBP 质量 1~100 (默认: 82)
  --dry-run              仅预览，不写入
  --help                 显示帮助

示例:
  node scripts/compress-images.mjs --dry-run
  node scripts/compress-images.mjs --dir=public/images/items --max-size=1024
`)
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "_compression-preview") continue
      files.push(...(await walk(full)))
      continue
    }
    if (!entry.isFile()) continue
    if (!IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) continue
    files.push(full)
  }
  return files
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function compressFile(filePath, options) {
  const ext = path.extname(filePath).toLowerCase()
  const input = await fs.readFile(filePath)
  const beforeSize = input.length

  let pipeline = sharp(input, { failOn: "none" }).resize({
    width: options.maxSize,
    height: options.maxSize,
    fit: "inside",
    withoutEnlargement: true,
  })

  if (ext === ".png") {
    pipeline = pipeline.png({
      compressionLevel: 9,
      effort: 10,
      palette: true,
      colours: options.pngColors,
      dither: options.pngDither,
    })
  } else if (ext === ".jpg" || ext === ".jpeg") {
    pipeline = pipeline.jpeg({
      quality: options.jpegQuality,
      mozjpeg: true,
      progressive: true,
    })
  } else if (ext === ".webp") {
    pipeline = pipeline.webp({
      quality: options.webpQuality,
      effort: 6,
    })
  }

  const output = await pipeline.toBuffer()
  const afterSize = output.length
  const improved = afterSize < beforeSize

  if (improved && !options.dryRun) {
    await fs.writeFile(filePath, output)
  }

  return {
    filePath,
    beforeSize,
    afterSize: improved ? afterSize : beforeSize,
    improved,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }
  const root = process.cwd()
  const targetDir = path.resolve(root, options.dir)

  const st = await fs.stat(targetDir).catch(() => null)
  if (!st || !st.isDirectory()) {
    console.error(`[compress-images] 目录不存在: ${targetDir}`)
    process.exit(1)
  }

  const files = await walk(targetDir)
  if (files.length === 0) {
    console.log("[compress-images] 没有找到可压缩图片")
    return
  }

  let changed = 0
  let beforeTotal = 0
  let afterTotal = 0
  const topSaved = []

  for (const file of files) {
    const result = await compressFile(file, options)
    beforeTotal += result.beforeSize
    afterTotal += result.afterSize
    if (result.improved) {
      changed += 1
      topSaved.push({
        file: path.relative(root, result.filePath),
        saved: result.beforeSize - result.afterSize,
      })
    }
  }

  topSaved.sort((a, b) => b.saved - a.saved)

  const saved = beforeTotal - afterTotal
  const savedPct = beforeTotal > 0 ? (saved * 100) / beforeTotal : 0
  console.log(`[compress-images] mode=${options.dryRun ? "dry-run" : "write"}`)
  console.log(`[compress-images] files=${files.length} changed=${changed}`)
  console.log(
    `[compress-images] total ${formatBytes(beforeTotal)} -> ${formatBytes(afterTotal)} (${saved >= 0 ? "-" : "+"}${Math.abs(savedPct).toFixed(1)}%)`,
  )

  if (topSaved.length > 0) {
    console.log("[compress-images] top saved files:")
    for (const item of topSaved.slice(0, 10)) {
      console.log(`  - ${item.file}: -${formatBytes(item.saved)}`)
    }
  }
}

await main()
