import multer from 'multer'
import { authenticate } from '../server/requireAuth.js'
import { GEMINI_API_KEY, ai, GEMINI_MODEL, PROMPTS } from '../server/studyContent.js'
import { describeGeminiError } from '../server/geminiJson.js'

// Keep uploads in memory (no need to write the image to disk for this
// endpoint). Vercel Serverless Functions reject request bodies above ~4.5MB
// before the function even runs, so the limit here matches that ceiling —
// raising it wouldn't help, a bigger upload just fails earlier with a
// platform-level 413 instead of this one.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4.5 * 1024 * 1024 },
})

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (err) => (err ? reject(err) : resolve()))
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'Strežnik nima nastavljenega ključa GEMINI_API_KEY. Dodaj ga v .env in znova zaženi strežnik.',
    })
  }

  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Za nadaljevanje se prijavi.' })

  try {
    await runMiddleware(req, res, upload.single('image'))
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Fotografija je prevelika (največ 4.5 MB).' })
    }
    console.error('Upload error:', err)
    return res.status(400).json({ error: 'Fotografije ni bilo mogoče prebrati.' })
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Fotografija ni bila naložena.' })
  }

  // multer puts non-file form fields on req.body. Fall back to "full" for any
  // missing/unrecognized value so a bad or absent mode never breaks the request.
  const mode = PROMPTS[req.body.mode] ? req.body.mode : 'full'
  const prompt = PROMPTS[mode]

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          inlineData: {
            mimeType: req.file.mimetype,
            data: req.file.buffer.toString('base64'),
          },
        },
        { text: prompt },
      ],
    })

    const notes = response.text
    if (!notes) throw new Error('Gemini returned an empty response.')

    return res.json({ notes })
  } catch (err) {
    console.error('Gemini API error:', err)
    return res.status(500).json({ error: describeGeminiError(err) || 'Pri obdelavi fotografije je prišlo do napake. Poskusi znova.' })
  }
}
