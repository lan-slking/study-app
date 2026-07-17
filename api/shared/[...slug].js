import { getSharedNoteByToken } from '../../server/db.js'
import { GEMINI_API_KEY, ai, GEMINI_MODEL, buildQuizPrompt, validateQuiz } from '../../server/studyContent.js'
import { generateValidatedJson, describeGeminiError } from '../../server/geminiJson.js'

// Catch-all covering /api/shared/:token (GET) and /api/shared/:token/quiz
// (POST) in one file — kept together (instead of 2 separate files) to stay
// under Vercel Hobby's 12-Serverless-Function-per-deployment cap.
//
// Public, read-only view opened from a "Deli" link — see src/SharedNote.jsx.
// Exposes only the shared note's title/content/subject, never the owner's
// other notes or activity. A quiz taken here is generated the same way as
// the owner's (from the cache if warm) but never logged as the owner's
// activity or score — an anonymous visitor's attempt isn't the owner's result.
export default async function handler(req, res) {
  const slug = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug].filter(Boolean)
  const [token, action] = slug

  if (!token) return res.status(404).json({ error: 'Ta povezava ni veljavna.' })

  if (!action) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    const note = await getSharedNoteByToken(token)
    if (!note) return res.status(404).json({ error: 'Ta povezava ni veljavna.' })
    return res.json({ title: note.title, content: note.content, subject: note.subject })
  }

  if (action === 'quiz') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ error: 'Method not allowed' })
    }
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Strežnik nima nastavljenega Gemini ključa.' })
    }

    const note = await getSharedNoteByToken(token)
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

  return res.status(404).json({ error: 'Ta pot ne obstaja.' })
}
