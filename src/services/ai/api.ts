/**
 * @file Contains the core functions for interacting with the AI model for game logic.
 */
import { type Character, type Message } from "../../types";
import {
    getAIQuestionPrompt,
    getAnswerToPlayerQuestionPrompt,
    getEliminationsPrompt,
    getSystemPrompt,
} from "../prompts";
import { getSession } from "./session";
import { promiseWithTimeout } from "./timeout";

const GENERAL_PROMPT_TIMEOUT_MS = 30000;
const ELIMINATION_PROMPT_TIMEOUT_MS = 30000;

type EliminationAnalysisResult = {
    id: string;
    name: string;
    has_feature: boolean;
};

/**
 * Transcribes an audio blob into a single-sentence question using the AI model.
 * @param audioBlob The audio data to transcribe.
 * @returns A promise that resolves to the transcribed text.
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
    const session = await getSession();
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
export async function getAnswerToPlayerQuestion(character: Character, question: string): Promise<string> {
    const session = await getSession();
    if (!character.imageBlob) {
        throw new Error(`Image blob for ${character.name} is missing.`);
    }

    const promptText = getAnswerToPlayerQuestionPrompt(question);
    const prompt = [
        {
            role: "user",
            content: [
                { type: "image", value: character.imageBlob },
                { type: "text", value: promptText },
            ],
        },
    ];

    const schema = { type: "boolean" };
    const result = await promiseWithTimeout(
        session.prompt(prompt, { responseConstraint: schema }),
        GENERAL_PROMPT_TIMEOUT_MS,
    );
    return JSON.parse(result) ? "Yes" : "No";
}

/**
 * Generates a strategic question for the AI to ask the player, based on the remaining characters.
 * This function now builds a structured, multi-turn conversation history for the AI.
 * @param characters The list of remaining possible characters.
 * @param messages The conversation history.
 * @returns A promise that resolves to the AI's generated question.
 */
export async function generateAIQuestion(characters: Character[], messages: Message[]): Promise<string> {
    const session = await getSession();

    const prompt: any[] = [];

    // Convert the game's message log into a structured history for the AI model.
    messages
        .filter((msg) => msg.sender === "PLAYER" || msg.sender === "AI")
        .forEach((msg) => {
            prompt.push({
                role: msg.sender === "PLAYER" ? "user" : "assistant",
                content: [{ type: "text", value: msg.text }],
            });
        });

    // Create the final user prompt for this turn, combining the system prompt (core strategy)
    // and the turn-specific instructions.
    const systemPrompt = getSystemPrompt();
    const turnPrompt = getAIQuestionPrompt(characters);
    // FIX: Explicitly type userContent as any[] to avoid a type inference issue where
    // TypeScript incorrectly flags a Blob as unassignable to a string. This pattern
    // is consistent with the getEliminations function.
    const userContent: any[] = [{ type: "text", value: `${systemPrompt}\n\n${turnPrompt}` }];

    // Add all remaining character images for analysis.
    for (const char of characters) {
        if (char.imageBlob) {
            userContent.push({ type: "image", value: char.imageBlob });
        }
    }
    prompt.push({ role: "user", content: userContent });

    const result = await promiseWithTimeout(session.prompt(prompt), GENERAL_PROMPT_TIMEOUT_MS);
    return result.trim().replace(/"/g, "");
}

/**
 * Determines which characters the AI should eliminate. This function now separates AI-powered
 * visual analysis from deterministic, client-side logical deduction.
 * @param characters The list of currently available characters.
 * @param question The question the AI asked.
 * @param playerAnswer The player's "Yes" or "No" response.
 * @returns A promise that resolves to a Set of character IDs to be eliminated.
 */
export async function getEliminations(
    characters: Character[],
    question: string,
    playerAnswer: "Yes" | "No",
): Promise<Set<string>> {
    const session = await getSession();

    // Step 1: Use the AI for visual analysis only.
    // The AI's sole job is to determine if each character has the feature from the question.
    const promptText = getEliminationsPrompt(question, characters);
    const promptContent: any[] = [{ type: "text", value: promptText }];
    for (const char of characters) {
        if (char.imageBlob) {
            promptContent.push({ type: "image", value: char.imageBlob });
        }
    }
    const prompt = [{ role: "user", content: promptContent }];

    const schema = {
        type: "array",
        items: {
            type: "object",
            properties: {
                id: { type: "string" },
                name: { type: "string" },
                has_feature: {
                    type: "boolean",
                    description: "Does this character have the feature from the question?",
                },
            },
            required: ["id", "name", "has_feature"],
        },
    };

    try {
        const result = await promiseWithTimeout(
            session.prompt(prompt, { responseConstraint: schema }),
            ELIMINATION_PROMPT_TIMEOUT_MS,
        );

        // Developer-facing log for easier debugging
        console.log("%c[DEBUG] AI Visual Analysis:", "color: #f59e0b; font-weight: bold;", JSON.parse(result));

        const analysisResults = JSON.parse(result) as EliminationAnalysisResult[];

        if (!Array.isArray(analysisResults)) {
            console.warn("AI analysis response was not an array:", analysisResults);
            return new Set<string>();
        }

        // Step 2: Apply deterministic logic client-side.
        // This removes the possibility of the AI making a logical error.
        const eliminatedIds = new Set<string>();
        analysisResults.forEach((res) => {
            const characterHasFeature = res.has_feature;
            let shouldEliminate = false;

            if (playerAnswer === "Yes") {
                // Player's character HAS the feature, so eliminate characters who DON'T.
                if (!characterHasFeature) {
                    shouldEliminate = true;
                }
            } else {
                // playerAnswer === "No"
                // Player's character DOES NOT have the feature, so eliminate characters who DO.
                if (characterHasFeature) {
                    shouldEliminate = true;
                }
            }

            if (shouldEliminate) {
                eliminatedIds.add(res.id);
            }
        });

        // Safety check: Don't eliminate everyone if the AI made a mistake.
        if (eliminatedIds.size === characters.length && characters.length > 0) {
            console.warn("AI logic would have eliminated all characters. Preventing this action.");
            return new Set<string>();
        }

        return eliminatedIds;
    } catch (e) {
        console.error("Error during AI elimination processing:", e);
        // On any error (timeout or otherwise), don't eliminate anyone to be safe.
        return new Set<string>();
    }
}
