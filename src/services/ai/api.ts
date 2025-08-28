/**
 * @file Contains the core functions for interacting with the AI model for game logic.
 */
import { type Character, type Message } from "../../types";
import { getAIQuestionPrompt, getEliminationsPrompt } from "../prompts";
import { getSession } from "./session";
import { promiseWithTimeout } from "./timeout";

const GENERAL_PROMPT_TIMEOUT_MS = 30000;
const ELIMINATION_PROMPT_TIMEOUT_MS = 30000;

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
 * Generates a strategic question for the AI to ask the player, based on the remaining characters.
 * @param characters The list of remaining possible characters.
 * @param messages The conversation history.
 * @returns A promise that resolves to the AI's generated question.
 */
export async function generateAIQuestion(characters: Character[], messages: Message[]): Promise<string> {
    const session = await getSession();

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
 * Determines which characters the AI should eliminate based on the player's answer to its question.
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
            return new Set<string>(); // Return no eliminations on parsing failure
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
        // On any error (timeout or otherwise), don't eliminate anyone to be safe.
        return new Set<string>();
    }
}
