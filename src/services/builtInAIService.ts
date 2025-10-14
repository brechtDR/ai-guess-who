/**
 * This service acts as a facade for all interactions with the on-device Gemini Nano model.
 * It abstracts away the complexities of session management, prompt engineering, and data handling.
 * This file re-exports functions from smaller, more focused modules within the `/ai` directory.
 */
export { initialize as initializeAI, startNewGameSession, downloadModel } from "./ai/session";
export { loadBlobsForDefaultCharacters } from "./ai/dataLoader";
export { transcribeAudio, getAnswerToPlayerQuestion, getAIQuestionAndAnalysis } from "./ai/api";