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
