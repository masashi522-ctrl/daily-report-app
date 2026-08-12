export interface ReportPhoto {
  buffer: Buffer
  type: 'jpg' | 'png'
  width: number
  height: number
}

// PNGは先頭8バイトのシグネチャ、JPEGはSOIマーカー(FFD8)で判定する
// （Content-Typeヘッダーに頼らず、実データから判定して埋め込み時の型不一致を防ぐ）
function detectImageType(buffer: Buffer): 'jpg' | 'png' | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png'
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'jpg'
  }
  return null
}

const FALLBACK_WIDTH = 800
const FALLBACK_HEIGHT = 600

function getPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

// JPEGはSOFn（0xC0-0xCF、0xC4/0xC8/0xCCを除く）セグメントに幅・高さが入っている
function getJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 <= buffer.length) {
    if (buffer[offset] !== 0xff) { offset++; continue }
    const marker = buffer[offset + 1]
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buffer.readUInt16BE(offset + 5)
      const width = buffer.readUInt16BE(offset + 7)
      return { width, height }
    }
    const segmentLength = buffer.readUInt16BE(offset + 2)
    offset += 2 + segmentLength
  }
  return null
}

function getImageDimensions(buffer: Buffer, type: 'jpg' | 'png'): { width: number; height: number } {
  const dims = type === 'png' ? getPngDimensions(buffer) : getJpegDimensions(buffer)
  return dims && dims.width > 0 && dims.height > 0 ? dims : { width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT }
}

export async function fetchReportPhotos(urls: string[] | undefined, maxCount: number): Promise<ReportPhoto[]> {
  if (!urls || urls.length === 0) return []
  const targets = urls.slice(0, maxCount)
  const results = await Promise.all(
    targets.map(async (url): Promise<ReportPhoto | null> => {
      try {
        const res = await fetch(url)
        if (!res.ok) return null
        const buffer = Buffer.from(await res.arrayBuffer())
        const type = detectImageType(buffer)
        if (!type) return null
        return { buffer, type, ...getImageDimensions(buffer, type) }
      } catch {
        return null
      }
    }),
  )
  return results.filter((p): p is ReportPhoto => p !== null)
}
