import crypto from 'crypto'
import { authenticate } from '../../../server/requireAuth.js'
import { getNoteById, logActivity, getStreak, updateGeneratedContent } from '../../../server/db.js'
import {
  GEMINI_API_KEY,
  buildQuizPrompt,
  validateQuiz,
  buildFlashcardsPrompt,
  validateFlashcards,
  buildFillBlankPrompt,
  validateFillBlank,
  getOrGenerateStudyContent,
} from '../../../server/studyContent.js'
import { describeGeminiError } from '../../../server/geminiJson.js'

// Covers POST /api/notes/:id/{activity,share,quiz,flashcards,fill-blank} in
// one file, dispatching on the [action] segment. This dynamic folder MUST be
// named [id], matching the sibling dynamic file api/notes/[id].js exactly —
// Vercel's build rejects a dynamic file and a dynamic folder at the same tree
// position when their parameter names differ ("conflicting paths"), but
// accepts it when the names match (same convention as Next.js's
// pages/blog.js + pages/blog/[slug].js).
const ACTIVITY_TYPES = new Set(['quiz', 'flashcards', 'fill_blank'])

const STUDY_MODES = {
  quiz: {
    field: 'quiz_json',
    build: buildQuizPrompt,
    validate: validateQuiz,
    emptyError: 'Ta zapisek še nima vsebine, iz katere bi lahko naredili kviz.',
    genError: 'Kviza ni bilo mogoče ustvariti. Poskusi znova.',
  },
  flashcards: {
    field: 'flashcards_json',
    build: buildFlashcardsPrompt,
    validate: validateFlashcards,
    emptyError: 'Ta zapisek še nima vsebine, iz katere bi lahko naredili kartončke.',
    genError: 'Kartončkov ni bilo mogoče ustvariti. Poskusi znova.',
  },
  'fill-blank': {
    field: 'fill_blank_json',
    build: buildFillBlankPrompt,
    validate: validateFillBlank,
    emptyError: 'Ta zapisek še nima vsebine, iz katere bi lahko naredili nalog dopolnjevanja.',
    genError: 'Nalog dopolnjevanja ni bilo mogoče ustvariti. Poskusi znova.',
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Za nadaljevanje se prijavi.' })

  const { id, action } = req.query

  if (action === 'activity') return handleActivity(req, res, auth, id)
  if (action === 'share') return handleShare(req, res, auth, id)
  if (STUDY_MODES[action]) return handleStudyMode(req, res, auth, id, STUDY_MODES[action])

  return res.status(404).json({ error: 'Ta pot ne obstaja.' })
}

// Logs one completed study session (quiz / flashcards / fill_blank) — feeds
// the Domov streak and the "reviewed today" check in the review plan.
async function handleActivity(req, res, auth, id) {
  if (!(await getNoteById(auth.db, id))) {
    return res.status(404).json({ error: 'Zapiska ni bilo mogoče najti.' })
  }

  const { type, correct, total } = req.body ?? {}
  if (!ACTIVITY_TYPES.has(type)) {
    return res.status(400).json({ error: 'Neveljavna vrsta dejavnosti.' })
  }

  await logActivity(auth.db, id, { type, correct, total })
  return res.status(201).json({ streak: await getStreak(auth.db) })
}

// A note's share link is stable once created (clicking "Deli" again returns
// the same token, not a new one) and is read-only — see api/shared/[token]/.
async function handleShare(req, res, auth, id) {
  const note = await getNoteById(auth.db, id)
  if (!note) return res.status(404).json({ error: 'Zapiska ni bilo mogoče najti.' })

  const token = note.share_token || crypto.randomBytes(12).toString('hex')
  if (!note.share_token) await updateGeneratedContent(auth.db, id, { share_token: token })

  return res.json({ shareToken: token })
}

async function handleStudyMode(req, res, auth, id, mode) {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'Strežnik nima nastavljenega ključa GEMINI_API_KEY. Dodaj ga v .env in znova zaženi strežnik.',
    })
  }

  const note = await getNoteById(auth.db, id)
  if (!note) return res.status(404).json({ error: 'Zapiska ni bilo mogoče najti.' })
  if (!note.content.trim()) return res.status(400).json({ error: mode.emptyError })

  try {
    const content = await getOrGenerateStudyContent(auth.db, note, mode.field, {
      prompt: mode.build(note.content),
      validate: mode.validate,
    })
    return res.json(content)
  } catch (err) {
    console.error(`${mode.field} generation error:`, err)
    return res.status(500).json({ error: describeGeminiError(err) || mode.genError })
  }
}
