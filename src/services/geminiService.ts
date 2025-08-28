import { AIStatus, type Character, type Message } from "../types";

// --- Type Definitions for older window.ai.languageModel API ---
interface LanguageModelSession {
    prompt(params: any): Promise<string>;
    destroy(): void;
}

interface LanguageModel {
    create(options?: any): Promise<LanguageModelSession>;
    availability(): Promise<"available" | "downloadable" | "downloading" | "no">;
}

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

class GeminiNanoService {
    private session: LanguageModelSession | null = null;
    private model: LanguageModel | null = null;

    private getModelEntryPoint(): LanguageModel | null {
        if (self.LanguageModel) return self.LanguageModel;
        if (self.ai?.languageModel) return self.ai.languageModel;
        return null;
    }

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
                    return char;
                }
            }),
        );
    }

    private async ensureSession(): Promise<LanguageModelSession> {
        if (!this.session) {
            throw new Error("AI session not initialized. Call initialize() first.");
        }
        return this.session;
    }

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

    async generateAIQuestion(characters: Character[], messages: Message[]): Promise<string> {
        const session = await this.ensureSession();

        const historyText = messages
            .filter((msg) => msg.sender === "PLAYER" || msg.sender === "AI")
            .map((msg) => `${msg.sender === "PLAYER" ? "You" : "AI"}: ${msg.text}`)
            .join("\n");

        const characterNames = characters.map((c) => c.name).join(", ");

        const promptText = `You are an expert "Guess Who?" player. Your goal is to win by asking the smartest possible yes/no question.

**Analyze the situation:**
*   **Characters remaining (${characters.length}):** ${characterNames}
*   **Conversation History:**
${historyText || "No questions yet."}

**Your Mission:**
Formulate a single question to ask me.

**Follow these rules precisely:**
1.  **Examine the images:** Look at all remaining characters for shared or unique visual features (e.g., hair color, glasses, hats, jewelry, facial hair). Keep it to simple features that are easy to spot.
2.  **Find the best split:** The ideal question is one where the 'Yes' and 'No' answers would each eliminate a significant number of characters. A 50/50 split is perfect.
3.  **CRITICAL - Ask about existing features ONLY:** Do NOT ask a question about a feature if NO remaining character has it. For example, don't ask about a mustache if no one has one.
4.  **CRITICAL - Be original:** Do NOT repeat a question that is already in the conversation history.
5.  **Format your question correctly:**
    *   Start with "Is your character...?" or "Does your character have...?".
    *   The question must be about my *single* secret character.

**Output:**
Your entire response MUST be ONLY the question you've decided to ask. Do not add any other text.`;

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

    async getEliminations(characters: Character[], question: string, playerAnswer: "Yes" | "No"): Promise<Set<string>> {
        const session = await this.ensureSession();
        const characterData = characters.map((c) => ({ id: c.id, name: c.name }));

        const promptText = `You are a "Guess Who?" game engine. Your only job is to identify which characters to KEEP based on a question and answer.

**INPUT:**
1.  **Question Asked:** "${question}"
2.  **Player's Answer:** "${playerAnswer}"
3.  **Characters:** ${JSON.stringify(characterData)}

**YOUR TASK:**
For each character, answer the question "${question}" with a "Yes" or "No" based on their image.
Then, create a list of IDs for all characters where YOUR answer matches the Player's Answer ("${playerAnswer}").

**EXAMPLE:**
*   Question: "Is the character wearing glasses?"
*   Player's Answer: "Yes"
*   Characters: [{id: "alex", name: "Alex"}(has glasses), {id: "bella", name: "Bella"}(no glasses)]
*   Your thought process:
    *   Alex: Does Alex have glasses? Yes. "Yes" matches the player's answer. KEEP.
    *   Bella: Does Bella have glasses? No. "No" does not match the player's answer. DISCARD.
*   Result: ["alex"]

**OUTPUT FORMAT:**
*   You MUST respond with ONLY a valid JSON array of strings.
*   The array must contain the 'id' for each character you decided to KEEP.
*   Do not add any explanation.

Based on the images below, generate the JSON array now.`;

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

// This is a placeholder to match the function call in App.tsx.
// The GeminiNanoService manages a single, long-lived session.
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
