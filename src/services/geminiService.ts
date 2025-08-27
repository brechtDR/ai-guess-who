import { AIStatus, type Character, type Message } from "../types";

// Define interfaces for the on-device LanguageModel API.
// These are based on the current browser implementations.
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

// Timeout configuration
const GENERAL_PROMPT_TIMEOUT_MS = 15000; // Increased from 7s for more stability
const ELIMINATION_PROMPT_TIMEOUT_MS = 20000; // For the more complex elimination task

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

    async initialize(
        onStatusChange: (status: AIStatus, message?: string) => void,
        onProgress?: (progress: number) => void,
    ): Promise<void> {
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
                onStatusChange(AIStatus.READY);
            } else if (availability === "downloadable" || availability === "downloading") {
                onStatusChange(AIStatus.DOWNLOADING, "AI model is downloading...");

                this.session = await this.model.create({
                    ...createOptions,
                    monitor: (e: any) => {
                        if (onProgress && e.addEventListener) {
                            e.addEventListener("downloadprogress", (event: any) => {
                                if (event.loaded) {
                                    const progress = event.loaded * 100;
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
                onStatusChange(AIStatus.READY);
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

    async getAnswerToPlayerQuestion(character: Character, question: string): Promise<"Yes" | "No"> {
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

        const promptText = `You are an expert "Guess Who?" player. Your goal is to win by asking the smartest question about your opponent's secret character.

**Characters Still in Play (${characters.length} total):**
${characterNames}

You are given images of these characters.

**Conversation History:**
${historyText}

**Your Task:**
Formulate a single, binary (yes/no) question that will eliminate the most characters possible, no matter the answer.

**Winning Strategy:**
1.  **Analyze Features:** Look at all characters for common and distinct visual features (hair color, glasses, hats, gender expression, etc.).
2.  **Find the Best Split:** The best question is one that splits the remaining characters into two groups of roughly equal size. For example, if 8 characters are left, a question that applies to 4 of them is perfect.
3.  **Go Broad First:** Ask about general features (e.g., "wearing a hat") before specific ones (e.g., "blue eyes").

**CRITICAL RULES FOR YOUR QUESTION:**
1.  **RELEVANCE:** Your question MUST be about a feature visible in AT LEAST ONE of the characters still in play. Do not ask about features (like a mustache or a red hat) if NO remaining character has that feature.
2.  **DO NOT REPEAT QUESTIONS:** Do not ask a question that has already been asked in the conversation history. Be creative.
3.  **Focus on a Single Character:** Your question MUST be about the opponent's SINGLE secret character.
4.  **Correct Phrasing:** The question MUST start with "Is your character...?" or "Does your character have...?".
5.  **ABSOLUTELY FORBIDDEN:** Do NOT ask questions about the group. Do NOT use words like "anyone", "any of", "do they".

**Example of a GOOD question:** "Is your character wearing glasses?"
**Example of a BAD question:** "Does anyone have blonde hair?"
**Example of a BAD question:** "Is your character wearing a scarf?" (if NO remaining character has a scarf)

Based on the strategy and rules above, analyze the images below and provide the single best question to ask. Your entire response MUST be ONLY the question itself.`;

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

        const promptText = `You are a "Guess Who?" game AI. Your task is to identify which characters remain valid based on a player's answer.

The player answered "${playerAnswer}" to your question: "${question}"

Here are the characters currently in play:
${JSON.stringify(characterData)}

**Your Task:**
Identify which of the characters from the list above MATCH the player's answer.
- If the player said "Yes", you must identify all characters for whom the answer to the question would also be "Yes".
- If the player said "No", you must identify all characters for whom the answer to the question would also be "No".

**Output Format:**
Your response MUST be a valid JSON array of strings, where each string is the 'id' of a character to KEEP.
Do NOT include any other text or explanations.

**Example:**
Question: "Is your character wearing glasses?"
Player Answer: "Yes"
Characters in play: Alex (glasses), Bella (no glasses), Charlie (glasses)
Correct Output: ["alex", "charlie"]

Analyze the images below and provide the JSON array of IDs for the characters to KEEP.`;

        const promptContent: any[] = [{ type: "text", value: promptText }];
        for (const char of characters) {
            if (char.imageBlob) {
                promptContent.push({ type: "image", value: char.imageBlob });
            }
        }
        const prompt = [{ role: "user", content: promptContent }];

        try {
            const result = await promiseWithTimeout(session.prompt(prompt), ELIMINATION_PROMPT_TIMEOUT_MS);

            // Sanitize the response to extract JSON
            const jsonMatch = result.match(/\[.*?\]/s);
            if (!jsonMatch) {
                console.warn("AI KEEP response was not valid JSON:", result);
                return new Set<string>();
            }

            const keptIdsArray = JSON.parse(jsonMatch[0]);

            if (!Array.isArray(keptIdsArray)) {
                console.warn("AI KEEP response was not an array:", keptIdsArray);
                return new Set<string>();
            }

            // Handle both ["alex"] and [{id: "alex"}] formats to be robust.
            const keptIds = new Set(
                keptIdsArray
                    .map((item: any) => {
                        if (typeof item === "string") return item;
                        if (typeof item === "object" && item !== null && typeof item.id === "string") return item.id;
                        return null; // Invalid format
                    })
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

            // Safety check: Don't eliminate everyone if there are characters left to play.
            // This happens if the AI returns an empty list of characters to keep.
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
export const initializeAI = (
    onStatusChange: (status: AIStatus, message?: string) => void,
    onProgress?: (progress: number) => void,
) => service.initialize(onStatusChange, onProgress);

export const loadBlobsForDefaultCharacters = (characters: Character[]) =>
    service.loadBlobsForDefaultCharacters(characters);
export const getAnswerToPlayerQuestion = (character: Character, question: string) =>
    service.getAnswerToPlayerQuestion(character, question);
export const generateAIQuestion = (characters: Character[], messages: Message[]) =>
    service.generateAIQuestion(characters, messages);
export const getEliminations = (characters: Character[], question: string, playerAnswer: "Yes" | "No") =>
    service.getEliminations(characters, question, playerAnswer);
export const transcribeAudio = (audioBlob: Blob) => service.transcribeAudio(audioBlob);
