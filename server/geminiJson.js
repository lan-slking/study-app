// Shared helper for any Gemini call that must return structured JSON (quiz
// generation, flashcard generation, short-answer grading). Centralizing this
// means every one of those call sites gets the same two things for free:
// forcing JSON output, and validating + retrying once if the response is
// malformed or doesn't match the expected shape.
//
// `validate(parsed)` should return null when parsed is valid, or a short
// string describing what's wrong (used only for logging).
export async function generateValidatedJson(ai, { model, prompt, validate }) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ text: prompt }],
        config: { responseMimeType: "application/json" },
      });

      const parsed = JSON.parse(response.text);
      const validationError = validate(parsed);
      if (validationError) {
        throw new Error(`Gemini response failed validation: ${validationError}`);
      }

      return parsed;
    } catch (err) {
      lastError = err;
      console.warn(`Gemini JSON call attempt ${attempt} failed:`, err.message);
    }
  }

  throw lastError;
}

// Recognizes the two Gemini failure modes worth a specific, actionable
// message instead of a generic "something went wrong, try again" — retrying
// a quota error immediately just fails again, so the student needs to know
// that up front. Returns null for anything else, so the caller can fall back
// to its own generic message.
export function describeGeminiError(err) {
  const message = err?.message ?? "";

  if (err?.status === 429 || /RESOURCE_EXHAUSTED/i.test(message)) {
    return "Dnevna omejitev brezplačnega Gemini API-ja je izčrpana. Počakaj malo (limit se obnovi čez nekaj ur) ali poskusi znova jutri.";
  }

  if (/api key not valid/i.test(message)) {
    return "Ključ GEMINI_API_KEY je bil zavrnjen. Preveri ga v server/.env.";
  }

  return null;
}
