// Compress and downscale a photo before uploading it. Phone camera photos can
// easily be 10+ MB at 4000px+ resolution — far more than needed to read
// handwriting, and big enough to make uploads slow or fail. We cap the
// longest edge and re-encode as JPEG to keep uploads small and fast.
const MAX_DIMENSION = 2000
const JPEG_QUALITY = 0.82

// Resolves to a compressed JPEG Blob. Rejects if the file can't be read as
// an image (the caller should fall back to uploading the original file).
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      // Never scale up — only shrink images that are larger than MAX_DIMENSION.
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
      const width = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Image compression produced no output.'))
        },
        'image/jpeg',
        JPEG_QUALITY,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read the selected image.'))
    }

    img.src = objectUrl
  })
}
