/**
 * @file Contains the core functions for interacting with the AI model for game logic.
 */
import { type AIQuestionAndAnalysis, type Character, type Message } from "../../types";
import { getAIQuestionAndAnalysisPrompt, getAnswerToPlayerQuestionPrompt, getSystemPrompt } from "../prompts";
import { getSession } from "./session";
import { promiseWithTimeout } from "./timeout";

const GENERAL_PROMPT_TIMEOUT_MS = 30000;

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
 * Generates a strategic question and provides the underlying visual analysis in a single call.
 * This ensures consistency between the question asked and the characters to be eliminated.
 * @param characters The list of remaining possible characters.
 * @param messages The conversation history.
 * @param retryReason An optional reason explaining why a previous attempt failed.
 * @returns A promise that resolves to an object containing the AI's question and its analysis.
 */
export async function getAIQuestionAndAnalysis(
    characters: Character[],
    messages: Message[],
    retryReason?: string,
): Promise<AIQuestionAndAnalysis> {
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

    const systemPrompt = getSystemPrompt();
    const turnPrompt = getAIQuestionAndAnalysisPrompt(characters, retryReason);
    const userContent: any[] = [{ type: "text", value: `${systemPrompt}\n\n${turnPrompt}` }];

    // Add all remaining character images for analysis.
    for (const char of characters) {
        if (char.imageBlob) {
            userContent.push({ type: "image", value: char.imageBlob });
        }
    }
    prompt.push({ role: "user", content: userContent });

    const schema = {
        type: "object",
        properties: {
            question: {
                type: "string",
                description: "The best yes/no question to ask based on the analysis.",
            },
            analysis: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        has_feature: {
                            type: "boolean",
                            description: "Does this character have the feature asked about in the question?",
                        },
                    },
                    required: ["id", "name", "has_feature"],
                },
            },
        },
        required: ["question", "analysis"],
    };

    const result = await promiseWithTimeout(
        session.prompt(prompt, { responseConstraint: schema }),
        GENERAL_PROMPT_TIMEOUT_MS,
    );

    // Developer-facing log for easier debugging
    console.log("%c[DEBUG] AI Question & Draft Analysis:", "color: #f59e0b; font-weight: bold;", JSON.parse(result));

    return JSON.parse(result);
}
