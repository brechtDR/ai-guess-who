import { AIStatus, type Character, type Message } from "../types";
import { getAIQuestionPrompt, getEliminationsPrompt } from "./prompts";

// --- Type Definitions for older window.ai.languageModel API ---
type LanguageModelSession = {
    prompt(params: any): Promise<string>;
    destroy(): void;
};

type LanguageModel = {
    create(options?: any): Promise<LanguageModelSession>;
    availability(): Promise<"available" | "downloadable" | "downloading" | "no">;
};

declare global {
    interface Window {
        LanguageModel?: LanguageModel;
        ai?: {
            languageModel?: LanguageModel;
        };
    }
}
// --- End Type Definitions ---

// Timeout configuration
const GENERAL_PROMPT_TIMEOUT_MS = 15000;
const ELIMINATION_PROMPT_TIMEOUT_MS = 20000;

/**
 * Custom error for timeout operations.
 */
class TimeoutError extends Error {
    constructor(message = "Operation timed out") {
        super(message);
        this.name = "TimeoutError";
    }
}

/**
 * Wraps a promise with a timeout.
 * @param promise The promise to wrap.
 * @param ms The timeout in milliseconds.
 * @returns A new promise that rejects with a TimeoutError if the original promise doesn't resolve or reject in time.
 */
function promiseWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new TimeoutError(`Operation timed out after ${ms} ms`));
        }, ms);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((reason) => {
                clearTimeout(timer);
                reject(reason);
            });
    });
}

/**
 * A service class to encapsulate all interactions with the on-device Gemini Nano model
 * via the experimental `window.ai.languageModel` API.
 */
class GeminiNanoService {
    private session: LanguageModelSession | null = null;
    private model: LanguageModel | null = null;

    /**
     * Finds the entry point for the on-device AI model in the window object.
     * @returns The LanguageModel object or null if not found.
     */
    private getModelEntryPoint(): LanguageModel | null {
        if (self.LanguageModel) return self.LanguageModel;
        if (self.ai?.languageModel) return self.ai.languageModel;
        return null;
    }

    /**
     * Initializes the AI model, handling availability checks and downloads.
     * @param options Callbacks for status and progress updates.
     */
    async initialize(options: {
        onStatusChange: (status: AIStatus, message?: string) => void;
        onProgress?: (progress: number) => void;
    }): Promise<void> {
        const { onStatusChange, onProgress } = options;

        onStatusChange(AIStatus.INITIALIZING, "Initializing AI...");
        this.model = this.getModelEntryPoint();

        if (!this.model) {
            onStatusChange(
                AIStatus.UNAVAILABLE,
                "The on-device AI API is not available in this browser. Please use a supported browser (e.g., latest Chrome) and enable the necessary feature flags if required.",
            );
            return;
        }

        const createOptions = {
            expectedInputs: [{ type: "image" }, { type: "audio" }],
        };

        try {
            const availability = await this.model.availability();

            if (availability === "available") {
                this.session = await this.model.create(createOptions);
                onStatusChange(AIStatus.READY, "AI Model Ready!");
            } else if (availability === "downloadable" || availability === "downloading") {
                onStatusChange(AIStatus.DOWNLOADING, "AI model is downloading...");

                this.session = await this.model.create({
                    ...createOptions,
                    monitor: (e: any) => {
                        if (onProgress && e.addEventListener) {
                            e.addEventListener("downloadprogress", (event: any) => {
                                if (event.loaded && event.total) {
                                    const progress = (event.loaded / event.total) * 100;
                                    onProgress(progress);
                                    onStatusChange(
                                        AIStatus.DOWNLOADING,
                                        `AI model is downloading... ${Math.floor(progress)}%`,
                                    );
                                }
                            });
                        }
                    },
                });
                onStatusChange(AIStatus.READY, "AI Model Ready!");
            } else {
                onStatusChange(AIStatus.UNAVAILABLE, "The on-device AI is not supported on this device.");
            }
        } catch (e: any) {
            console.error("AI Initialization Error:", e);
            onStatusChange(AIStatus.ERROR, e.message || "An error occurred during AI setup.");
        }
    }

    /**
     * Fetches and converts image URLs for the default characters into Blobs.
     * @param characters The array of default characters.
     * @returns A promise that resolves to the characters array with `imageBlob` properties populated.
     */
    async loadBlobsForDefaultCharacters(characters: Character[]): Promise<Character[]> {
        return Promise.all(
            characters.map(async (char) => {
                if (char.imageBlob) return char;
                try {
                    const response = await fetch(char.image);
                    if (!response.ok) throw new Error(`Failed to fetch ${char.image}`);
                    const blob = await response.blob();
                    return { ...char, imageBlob: blob };
                } catch (error) {
                    console.error(`Could not load image for ${char.name}:`, error);
                    return char; // Return character without blob on error
                }
            }),
        );
    }

    /**
     * Ensures the AI session is active before making a prompt.
     * @returns The active LanguageModelSession.
     * @throws If the session is not initialized.
     */
    private async ensureSession(): Promise<LanguageModelSession> {
        if (!this.session) {
            throw new Error("AI session not initialized. Call initialize() first.");
        }
        return this.session;
    }

    /**
     * Transcribes an audio blob into a single-sentence question.
     * @param audioBlob The audio data to transcribe.
     * @returns A promise that resolves to the transcribed text.
     */
    async transcribeAudio(audioBlob: Blob): Promise<string> {
        const session = await this.ensureSession();
        const prompt = [
            {
                role: "user",
                content: [
                    { type: "text", value: "Transcribe the following audio into a short, one-sentence question." },
                    { type: "audio", value: audioBlob },
                ],
            },
        ];
        const result = await promiseWithTimeout(session.prompt(prompt), GENERAL_PROMPT_TIMEOUT_MS);
        return result.trim().replace(/"/g, "");
    }

    /**
     * Gets a "Yes" or "No" answer from the AI for a player's question about a secret character.
     * @param character The AI's secret character.
     * @param question The player's question.
     * @returns A promise that resolves to "Yes" or "No".
     */
    async getAnswerToPlayerQuestion(character: Character, question: string): Promise<string> {
        const session = await this.ensureSession();
        if (!character.imageBlob) {
            throw new Error(`Image blob for ${character.name} is missing.`);
        }

        const prompt = [
            {
                role: "user",
                content: [
                    { type: "image", value: character.imageBlob },
                    {
                        type: "text",
                        value: `You are a "Guess Who" player. Look ONLY at the image. The user asked a question. Your entire response MUST be either the single word "Yes" or the single word "No". User's question: "${question}"`,
                    },
                ],
            },
        ];

        const result = await promiseWithTimeout(session.prompt(prompt), GENERAL_PROMPT_TIMEOUT_MS);
        return result.toLowerCase().includes("yes") ? "Yes" : "No";
    }

    /**
     * Generates a strategic question for the AI to ask the player.
     * @param characters The list of remaining possible characters.
     * @param messages The conversation history.
     * @returns A promise that resolves to the AI's generated question.
     */
    async generateAIQuestion(characters: Character[], messages: Message[]): Promise<string> {
        const session = await this.ensureSession();

        const promptText = getAIQuestionPrompt(characters, messages);

        const promptContent: any[] = [{ type: "text", value: promptText }];
        for (const char of characters) {
            if (char.imageBlob) {
                promptContent.push({ type: "image", value: char.imageBlob });
            }
        }

        const prompt = [{ role: "user", content: promptContent }];
        const result = await promiseWithTimeout(session.prompt(prompt), GENERAL_PROMPT_TIMEOUT_MS);
        return result.trim().replace(/"/g, "");
    }

    /**
     * Determines which characters the AI should eliminate based on the player's answer.
     * @param characters The list of currently available characters.
     * @param question The question the AI asked.
     * @param playerAnswer The player's "Yes" or "No" response.
     * @returns A promise that resolves to a Set of character IDs to be eliminated.
     */
    async getEliminations(characters: Character[], question: string, playerAnswer: "Yes" | "No"): Promise<Set<string>> {
        const session = await this.ensureSession();

        const promptText = getEliminationsPrompt(question, playerAnswer, characters);

        const promptContent: any[] = [{ type: "text", value: promptText }];
        for (const char of characters) {
            if (char.imageBlob) {
                promptContent.push({ type: "image", value: char.imageBlob });
            }
        }
        const prompt = [{ role: "user", content: promptContent }];

        try {
            const result = await promiseWithTimeout(session.prompt(prompt), ELIMINATION_PROMPT_TIMEOUT_MS);

            // Sanitize the response to extract JSON from markdown code blocks or raw text
            const jsonMatch = result.match(/\[.*?\]/s);
            if (!jsonMatch) {
                console.warn("AI KEEP response was not valid JSON:", result);
                return new Set<string>(); // Return no eliminations
            }

            const keptIdsArray = JSON.parse(jsonMatch[0]);

            if (!Array.isArray(keptIdsArray)) {
                console.warn("AI KEEP response was not an array:", keptIdsArray);
                return new Set<string>();
            }

            const keptIds = new Set(
                keptIdsArray
                    .map((item: any) => (typeof item === "string" ? item : null))
                    .filter((id): id is string => id !== null),
            );

            const allCharacterIds = new Set(characters.map((c) => c.id));
            const eliminatedIds = new Set<string>();

            // Find the difference: all characters minus the ones to keep
            for (const id of allCharacterIds) {
                if (!keptIds.has(id)) {
                    eliminatedIds.add(id);
                }
            }

            // Safety check: Don't eliminate everyone if the AI made a mistake.
            if (eliminatedIds.size === characters.length && characters.length > 0) {
                console.warn("AI logic would have eliminated all characters. Preventing this action.");
                return new Set<string>();
            }

            return eliminatedIds;
        } catch (e) {
            console.error("Error during AI elimination processing:", e);
            // On any error (timeout or otherwise), don't eliminate anyone.
            return new Set<string>();
        }
    }
}

const service = new GeminiNanoService();

export const initializeAI = (options: {
    onStatusChange: (status: AIStatus, message?: string) => void;
    onProgress?: (progress: number) => void;
}) => service.initialize(options);

// The GeminiNanoService manages a single, long-lived session, so starting a "new"
// session is a no-op from the caller's perspective. This function exists for API consistency.
export const startNewGameSession = async () => Promise.resolve();

export const loadBlobsForDefaultCharacters = (characters: Character[]) =>
    service.loadBlobsForDefaultCharacters(characters);
export const getAnswerToPlayerQuestion = (character: Character, question: string) =>
    service.getAnswerToPlayerQuestion(character, question);
export const generateAIQuestion = (characters: Character[], messages: Message[]) =>
    service.generateAIQuestion(characters, messages);
export const getEliminations = (characters: Character[], question: string, playerAnswer: "Yes" | "No") =>
    service.getEliminations(characters, question, playerAnswer);
export const transcribeAudio = (audioBlob: Blob) => service.transcribeAudio(audioBlob);
