import { AIStatus, type Character } from "../types";

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

const DEDUCTION_TIMEOUT_MS = 5000;

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
        const result = await session.prompt(prompt);
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

        const result = await session.prompt(prompt);
        return result.toLowerCase().includes("yes") ? "Yes" : "No";
    }

    async generateAIQuestion(characters: Character[]): Promise<string> {
        const session = await this.ensureSession();
        const promptText = `You are an expert "Guess Who?" player. Your goal is to win the game by asking the smartest possible question.
Look at all the remaining character images provided. Your task is to devise a single, binary (yes/no) question that will eliminate the maximum number of characters, regardless of the answer.

Here's the winning strategy:
1. Analyze all remaining characters for common and distinct visual features (e.g., hair color, accessories like glasses or hats, gender, etc.).
2. For each potential question (e.g., "Is the person wearing a hat?"), count how many characters would be a "Yes" and how many would be a "No".
3. The best question is the one that splits the group most evenly. For example, if there are 8 characters left, a question that results in 4 "Yes" and 4 "No" answers is perfect. A question that results in 1 "Yes" and 7 "No" is a poor choice.
4. Ask a broad question first. Avoid getting too specific too early (e.g., don't ask about "blue eyes" if you can ask about "wearing glasses").
5. IMPORTANT: Your question must be about a visual attribute, not a character's name. Do not ask "Is the character Alex?". Ask about features like "Does the character have blonde hair?".

Based on this strategy and the images below, formulate the single best question to ask. Your entire response MUST be ONLY the question itself.`;

        const promptContent: any[] = [{ type: "text", value: promptText }];
        for (const char of characters) {
            if (char.imageBlob) {
                promptContent.push({ type: "image", value: char.imageBlob });
            }
        }

        const prompt = [{ role: "user", content: promptContent }];
        const result = await session.prompt(prompt);
        return result.trim().replace(/"/g, "");
    }

    async getEliminations(characters: Character[], question: string, playerAnswer: "Yes" | "No"): Promise<Set<string>> {
        const session = await this.ensureSession();
        const eliminatedIds = new Set<string>();

        const characterChecks = await Promise.all(
            characters.map(async (char) => {
                if (!char.imageBlob) {
                    return { character: char, isMatch: false };
                }
                const promptText = `You are an image analysis service. An AI opponent in a "Guess Who?" game asked a question about a character.
Your job is to determine if the answer for the CHARACTER IN THE PROVIDED IMAGE would be "Yes" or "No".

AI's Question: "${question}"

Rules:
1. Look ONLY at the character in the image to answer.
2. If the question is about an item the character doesn't have (e.g., asking about hat color when there is no hat), the answer is "No".
3. Your entire response MUST be the single word "Yes" or the single word "No".`;

                const prompt = [
                    {
                        role: "user",
                        content: [
                            { type: "text", value: promptText },
                            { type: "image", value: char.imageBlob },
                        ],
                    },
                ];
                try {
                    const timeoutPromise = new Promise<string>((_, reject) =>
                        setTimeout(() => reject(new Error("Timeout")), DEDUCTION_TIMEOUT_MS),
                    );
                    const response = await Promise.race([session.prompt(prompt), timeoutPromise]);
                    return { character: char, isMatch: response.toLowerCase().includes("yes") };
                } catch (e) {
                    console.error(`Error or timeout checking character ${char.name}:`, e);
                    // On error/timeout, we don't want to eliminate the character.
                    // To achieve this, we make its 'isMatch' status align with what the player answered,
                    // so it's never considered for elimination.
                    // If player said "Yes", we keep matching characters. So, pretend it matched.
                    // If player said "No", we keep non-matching characters. So, pretend it didn't match.
                    return { character: char, isMatch: playerAnswer === "Yes" };
                }
            }),
        );

        const charsToEliminate =
            playerAnswer === "Yes"
                ? characterChecks.filter((check) => !check.isMatch).map((c) => c.character)
                : characterChecks.filter((check) => check.isMatch).map((c) => c.character);

        if (charsToEliminate.length === characters.length && characters.length > 0) {
            console.warn("AI logic would have eliminated all characters. Preventing this action.");
            return new Set<string>();
        }

        for (const char of charsToEliminate) {
            eliminatedIds.add(char.id);
        }

        return eliminatedIds;
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
export const generateAIQuestion = (characters: Character[]) => service.generateAIQuestion(characters);
export const getEliminations = (characters: Character[], question: string, playerAnswer: "Yes" | "No") =>
    service.getEliminations(characters, question, playerAnswer);
export const transcribeAudio = (audioBlob: Blob) => service.transcribeAudio(audioBlob);
