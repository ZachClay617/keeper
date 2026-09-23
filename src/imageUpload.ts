import { supabase } from './supabaseClient'

/** Resizes an image client-side (long edge capped) and re-encodes as JPEG, so uploads stay small. */
async function compressImage(file: File, maxDimension: number, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))), 'image/jpeg', quality)
  })
}

/** Compresses and uploads an image to the shared `photos` bucket at a fixed path (overwriting anything already there), returning its public URL. */
export async function uploadPhoto(path: string, file: File, maxDimension = 800): Promise<string> {
  const blob = await compressImage(file, maxDimension)
  const { error } = await supabase.storage.from('photos').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) throw error
  const {
    data: { publicUrl },
  } = supabase.storage.from('photos').getPublicUrl(path)
  return `${publicUrl}?t=${Date.now()}` // cache-bust so a re-upload to the same path shows immediately
}

export async function deletePhoto(path: string): Promise<void> {
  const { error } = await supabase.storage.from('photos').remove([path])
  if (error) throw error
}
