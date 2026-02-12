/**
 * Generate a Windows taskbar overlay icon (badge) for unread message count.
 * Uses sharp to create a small PNG with red circle + white number.
 */
import sharp from 'sharp'
import { nativeImage } from 'electron'

const SIZE = 16

export async function createBadgeImage(count: number): Promise<Electron.NativeImage | null> {
  if (count <= 0) return null
  const text = count > 99 ? '99+' : String(count)
  const fontSize = text.length <= 2 ? 11 : 9

  const svg = `
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2 - 1}" fill="#e74c3c"/>
  <text x="50%" y="50%" font-size="${fontSize}" font-family="Arial,sans-serif" font-weight="bold"
        fill="white" text-anchor="middle" dominant-baseline="central">${text}</text>
</svg>`

  try {
    const buffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer()
    return nativeImage.createFromBuffer(buffer)
  } catch {
    return null
  }
}
