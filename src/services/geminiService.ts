import { AIStatus, type Character, type Message } from "../types";

// --- Type Definitions for window.ai ---
// These are based on the evolving standard for on-device AI in browsers.
declare global {
    interface Window {
        ai?: {
            canCreateTextSession: () => Promise<"readily" | "after-download" | "no">;
            createTextSession: (options?: { systemPrompt?: string }) => Promise<LanguageModelSession>;
            defaultTextSessionOptions: () => Promise<{ temperature?: number; topK?: number }>;
        };
    }
}

interface LanguageModelSession {
    prompt(input: string | LanguageModelMessage[], options?: LanguageModelPromptOptions): Promise<string>;
    promptStreaming(
        input: string | LanguageModelMessage[],
        options?: LanguageModelPromptOptions,
    ): Promise<AsyncIterable<string>>;
    destroy(): void;
    clone(): Promise<LanguageModelSession>;
}

interface LanguageModelPromptOptions {
    responseConstraint?: any; // JSON Schema
}

interface LanguageModelMessage {
    role: "user" | "system" | "assistant";
    content: (string | LanguageModelContentPart)[];
}

interface LanguageModelContentPart {
    type: "text" | "image" | "audio";
    mimeType?: string;
    data: Blob | ArrayBuffer | string;
}
// --- End Type Definitions ---

let gameSession: LanguageModelSession | null = null;
let isInitializing = false;

export async function initializeAI(callbacks: {
    onStatusChange: (status: AIStatus, message?: string) => void;
    onProgress: (progress: number) => void;
}) {
    if (isInitializing) return;
    isInitializing = true;
    callbacks.onStatusChange(AIStatus.INITIALIZING, "Checking for on-device AI...");

    if (!window.ai) {
        callbacks.onStatusChange(AIStatus.UNAVAILABLE, "On-device AI is not available in this browser.");
        return;
    }

    try {
        const availability = await window.ai.canCreateTextSession();
        if (availability === "no") {
            callbacks.onStatusChange(AIStatus.UNAVAILABLE, "On-device AI model is not supported on this device.");
        } else if (availability === "after-download") {
            callbacks.onStatusChange(AIStatus.DOWNLOADING, "Downloading AI model...");
            // The browser handles the download. We can't easily get progress,
            // so we just wait for it to become ready.
            await new Promise((resolve) => setTimeout(resolve, 2000));
            callbacks.onStatusChange(AIStatus.READY, "AI Model Ready!");
        } else {
            callbacks.onStatusChange(AIStatus.READY, "AI Model Ready!");
        }
    } catch (e) {
        callbacks.onStatusChange(AIStatus.ERROR, "An error occurred while initializing the AI.");
        console.error(e);
    }
}

export async function loadBlobsForDefaultCharacters(characters: Character[]): Promise<Character[]> {
    const promises = characters.map(async (char) => {
        if (char.imageBlob) return char;
        try {
            const response = await fetch(char.image);
            if (!response.ok) throw new Error(`Failed to fetch image: ${char.image}`);
            const blob = await response.blob();
            return { ...char, imageBlob: blob };
        } catch (error) {
            console.error(`Could not load image for ${char.name}:`, error);
            return char;
        }
    });
    return Promise.all(promises);
}

const SYSTEM_PROMPT = `You are an expert player in the game "Guess Who?". Your goal is to guess the human player's secret character by asking strategic yes/no questions.
- Ask questions to eliminate as many characters as possible.
- A good starting question often relates to a 50/50 split, like gender.
- **Crucially, focus your questions on prominent, easily identifiable features.** Do NOT ask about very subtle details that a human might miss or disagree on, like "Does the character have visible freckles?" or "Does the character have a tiny, barely visible tattoo?". Instead, ask about clear features like hair color, glasses, hats, or beards.
- When making a final guess, phrase it as "Is your character [Name]?".
- You will be provided with a list of remaining characters and the game history. Use this to avoid asking redundant questions.
`;

export async function startNewGameSession() {
    if (!window.ai) throw new Error("AI not initialized.");
    if (gameSession) {
        gameSession.destroy();
    }
    gameSession = await window.ai.createTextSession({ systemPrompt: SYSTEM_PROMPT });
}

export async function getAnswerToPlayerQuestion(secretCharacter: Character, question: string): Promise<string> {
    if (!window.ai) throw new Error("AI not initialized.");
    if (!secretCharacter.imageBlob) throw new Error("AI secret character image blob is missing.");

    const tempSession = await window.ai.createTextSession();
    const prompt: LanguageModelMessage[] = [
        {
            role: "system",
            content: [
                "You are the character in the image. You must answer questions about yourself with ONLY 'Yes' or 'No'.",
            ],
        },
        {
            role: "user",
            content: [
                { type: "image", mimeType: secretCharacter.imageBlob.type, data: secretCharacter.imageBlob },
                { type: "text", data: `The player's question is: "${question}"` },
            ],
        },
    ];
    const responseSchema = { type: "boolean" };

    try {
        const result = await tempSession.prompt(prompt, { responseConstraint: responseSchema });
        const answer = JSON.parse(result);
        return answer ? "Yes" : "No";
    } catch (e) {
        console.error("Error getting answer from AI, falling back to text analysis", e);
        const fallbackResult = await tempSession.prompt(prompt);
        if (fallbackResult.toLowerCase().includes("yes")) return "Yes";
        if (fallbackResult.toLowerCase().includes("no")) return "No";
        return "I'm not sure.";
    } finally {
        tempSession.destroy();
    }
}

export async function getEliminations(
    remainingCharacters: Character[],
    question: string,
    answer: "Yes" | "No",
): Promise<Set<string>> {
    if (!gameSession) throw new Error("Game session not started.");

    const charactersJson = JSON.stringify(remainingCharacters.map((c) => ({ id: c.id, name: c.name })));
    const prompt = `Based on my question "${question}" and the player's answer "${answer}", which of these characters should I KEEP? Characters: ${charactersJson}.`;
    const responseSchema = {
        type: "object",
        properties: {
            keptCharacterIds: { type: "array", items: { type: "string" } },
        },
        required: ["keptCharacterIds"],
    };

    const result = await gameSession.prompt(prompt, { responseConstraint: responseSchema });
    const jsonResponse = JSON.parse(result);
    const keptIds = new Set<string>(jsonResponse.keptCharacterIds || []);
    const eliminatedIds = new Set<string>();
    remainingCharacters.forEach((char) => {
        if (!keptIds.has(char.id)) {
            eliminatedIds.add(char.id);
        }
    });
    return eliminatedIds;
}

export async function generateAIQuestion(remainingCharacters: Character[], history: Message[]): Promise<string> {
    if (!gameSession) throw new Error("Game session not started.");

    const charactersJson = JSON.stringify(remainingCharacters.map((c) => ({ id: c.id, name: c.name })));
    const formattedHistory: LanguageModelMessage[] = history
        .filter((msg) => msg.sender === "PLAYER" || msg.sender === "AI")
        .map((msg) => ({
            role: (msg.sender === "PLAYER" ? "user" : "assistant") as "user" | "assistant",
            content: [msg.text],
        }));

    const userPrompt: LanguageModelMessage = {
        role: "user",
        content: [
            `Here are the remaining characters: ${charactersJson}.
            Based on our conversation history, generate the next best yes/no question to ask.
            **Remember the most important rule: Your question MUST be about a prominent, easily identifiable feature.** Avoid subtle details.
            Good examples: "Is your character wearing a hat?", "Does your character have red hair?".
            Bad examples: "Does your character have visible freckles?", "Does the character have a tiny earring?".`,
        ],
    };

    const fullPrompt = [...formattedHistory, userPrompt];
    const result = await gameSession.prompt(fullPrompt);
    return result.trim();
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
    if (!window.ai) throw new Error("AI not initialized.");

    const tempSession = await window.ai.createTextSession();
    const prompt: LanguageModelMessage[] = [
        {
            role: "user",
            content: [
                { type: "audio", mimeType: audioBlob.type, data: audioBlob },
                { type: "text", data: "Transcribe this audio. The user is asking a question for a 'Guess Who?' game." },
            ],
        },
    ];

    try {
        const result = await tempSession.prompt(prompt);
        return result.trim();
    } catch (e) {
        console.error("Audio transcription failed:", e);
        return "Sorry, I couldn't understand the audio.";
    } finally {
        tempSession.destroy();
    }
}
