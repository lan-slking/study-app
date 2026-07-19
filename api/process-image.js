import multer from 'multer'
import { authenticate } from '../server/requireAuth.js'
import { GEMINI_API_KEY, ai, GEMINI_MODEL, PROMPTS } from '../server/studyContent.js'
import { describeGeminiError } from '../server/geminiJson.js'
import { extractOfficeDocText, DOCX_MIMETYPE, PPTX_MIMETYPE } from '../server/extractDocumentText.js'

const OFFICE_MIMETYPES = new Set([DOCX_MIMETYPE, PPTX_MIMETYPE])

// Browsers/OSes are unreliable about the mimetype they report for office
// documents (Windows in particular often sends "application/octet-stream"
// for .docx/.pptx unless the file type is registered) — so filename
// extension is used as the source of truth, falling back to mimetype only
// for images, which browsers report consistently.
const EXTENSION_MIMETYPES = {
  '.pdf': 'application/pdf',
  '.docx': DOCX_MIMETYPE,
  '.pptx': PPTX_MIMETYPE,
}

function extensionOf(filename) {
  const match = /\.[^.]+$/.exec(filename || '')
  return match ? match[0].toLowerCase() : ''
}

// Resolves the mimetype to actually treat the upload as, or null if
// unsupported. Trusts the browser-reported mimetype for images, otherwise
// prefers the extension mapping (falling back to the reported mimetype if
// the extension is unknown but the mimetype itself is already supported).
function resolveMimetype(file) {
  if (file.mimetype.startsWith('image/')) return file.mimetype
  const byExtension = EXTENSION_MIMETYPES[extensionOf(file.originalname)]
  if (byExtension) return byExtension
  if (file.mimetype === 'application/pdf' || OFFICE_MIMETYPES.has(file.mimetype)) return file.mimetype
  return null
}

// Keep uploads in memory (no need to write the file to disk for this
// endpoint). Vercel Serverless Functions reject request bodies above ~4.5MB
// before the function even runs, so the limit here matches that ceiling —
// raising it wouldn't help, a bigger upload just fails earlier with a
// platform-level 413 instead of this one.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4.5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (resolveMimetype(file)) cb(null, true)
    else cb(new Error('UNSUPPORTED_FILE_TYPE'))
  },
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
    await runMiddleware(req, res, upload.single('file'))
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Datoteka je prevelika (največ 4.5 MB).' })
    }
    if (err.message === 'UNSUPPORTED_FILE_TYPE') {
      return res.status(400).json({ error: 'Ta vrsta datoteke ni podprta. Naloži sliko, PDF, Word ali PowerPoint dokument.' })
    }
    console.error('Upload error:', err)
    return res.status(400).json({ error: 'Datoteke ni bilo mogoče prebrati.' })
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Datoteka ni bila naložena.' })
  }

  // multer puts non-file form fields on req.body. Fall back to "full" for any
  // missing/unrecognized value so a bad or absent mode never breaks the request.
  const mode = PROMPTS[req.body.mode] ? req.body.mode : 'full'
  const prompt = PROMPTS[mode]
  const mimetype = resolveMimetype(req.file)

  try {
    let contents

    if (OFFICE_MIMETYPES.has(mimetype)) {
      let extractedText
      try {
        extractedText = await extractOfficeDocText(req.file.buffer, mimetype)
      } catch (err) {
        console.error('Document extraction error:', err)
        return res.status(400).json({ error: 'Vsebine dokumenta ni bilo mogoče prebrati.' })
      }
      if (!extractedText.trim()) {
        return res.status(400).json({ error: 'Dokument je videti prazen.' })
      }
      contents = [{ text: `${prompt}\n\nVsebina dokumenta:\n"""\n${extractedText}\n"""` }]
    } else {
      // Images and PDFs are both natively understood by Gemini as inline data.
      contents = [
        { inlineData: { mimeType: mimetype, data: req.file.buffer.toString('base64') } },
        { text: prompt },
      ]
    }

    const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents })

    const notes = response.text
    if (!notes) throw new Error('Gemini returned an empty response.')

    return res.json({ notes })
  } catch (err) {
    console.error('Gemini API error:', err)
    return res.status(500).json({ error: describeGeminiError(err) || 'Pri obdelavi datoteke je prišlo do napake. Poskusi znova.' })
  }
}
