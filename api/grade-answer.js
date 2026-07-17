import { authenticate } from '../server/requireAuth.js'
import { GEMINI_API_KEY, ai, GEMINI_MODEL, buildGradeAnswerPrompt, validateGrade } from '../server/studyContent.js'
import { generateValidatedJson, describeGeminiError } from '../server/geminiJson.js'

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

  const { question, expectedAnswer, userAnswer } = req.body ?? {}
  if (!question || !expectedAnswer || typeof userAnswer !== 'string') {
    return res.status(400).json({ error: 'Manjkajo podatki, potrebni za ocenjevanje odgovora.' })
  }

  try {
    const grade = await generateValidatedJson(ai, {
      model: GEMINI_MODEL,
      prompt: buildGradeAnswerPrompt({ question, expectedAnswer, userAnswer }),
      validate: validateGrade,
    })
    return res.json(grade)
  } catch (err) {
    console.error('Answer grading error:', err)
    return res.status(500).json({ error: describeGeminiError(err) || 'Odgovora ni bilo mogoče oceniti. Poskusi znova.' })
  }
}
