import { getSharedNoteByToken } from '../../../server/db.js'
import { GEMINI_API_KEY, ai, GEMINI_MODEL, buildQuizPrompt, validateQuiz } from '../../../server/studyContent.js'
import { generateValidatedJson, describeGeminiError } from '../../../server/geminiJson.js'

// A quiz taken through a share link is generated the same way as the owner's
// (from the cache if warm) but is never logged as the owner's activity or
// score — an anonymous visitor's attempt isn't the owner's result.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Strežnik nima nastavljenega Gemini ključa.' })
  }

  const note = await getSharedNoteByToken(req.query.token)
  if (!note) return res.status(404).json({ error: 'Ta povezava ni veljavna.' })

  try {
    const quiz = note.quiz_json || (await generateValidatedJson(ai, {
      model: GEMINI_MODEL,
      prompt: buildQuizPrompt(note.content),
      validate: validateQuiz,
    }))
    return res.json(quiz)
  } catch (err) {
    console.error('Shared quiz generation error:', err)
    return res.status(500).json({ error: describeGeminiError(err) || 'Kviza ni bilo mogoče ustvariti.' })
  }
}
