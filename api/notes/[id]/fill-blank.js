import { authenticate } from '../../../server/requireAuth.js'
import { getNoteById } from '../../../server/db.js'
import { GEMINI_API_KEY, buildFillBlankPrompt, validateFillBlank, getOrGenerateStudyContent } from '../../../server/studyContent.js'
import { describeGeminiError } from '../../../server/geminiJson.js'

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

  const note = await getNoteById(auth.db, req.query.id)
  if (!note) return res.status(404).json({ error: 'Zapiska ni bilo mogoče najti.' })
  if (!note.content.trim()) {
    return res.status(400).json({ error: 'Ta zapisek še nima vsebine, iz katere bi lahko naredili nalog dopolnjevanja.' })
  }

  try {
    const fillBlank = await getOrGenerateStudyContent(auth.db, note, 'fill_blank_json', {
      prompt: buildFillBlankPrompt(note.content),
      validate: validateFillBlank,
    })
    return res.json(fillBlank)
  } catch (err) {
    console.error('Fill-blank generation error:', err)
    return res.status(500).json({ error: describeGeminiError(err) || 'Nalog dopolnjevanja ni bilo mogoče ustvariti. Poskusi znova.' })
  }
}
