export function resolveOpenAIKey() {
  const key = process.env.OPENAI_API_KEY ?? null;
  if (!key) {
    throw new Error("Set OPENAI_API_KEY to use the interviewer agent.");
  }
  return key;
}
