import { type Character, type Message } from "../types";

/**
 * Generates the prompt for the AI to ask a strategic question in the "Guess Who?" game.
 * @param characters The list of remaining characters for the AI to consider.
 * @param messages The history of the conversation so far.
 * @returns The complete prompt string to be sent to the language model.
 */
export const getAIQuestionPrompt = (characters: Character[], messages: Message[]): string => {
    const historyText = messages
        .filter((msg) => msg.sender === "PLAYER" || msg.sender === "AI")
        .map((msg) => `${msg.sender === "PLAYER" ? "You" : "AI"}: ${msg.text}`)
        .join("\n");

    const characterNames = characters.map((c) => c.name).join(", ");

    return `You are an expert "Guess Who?" player. Your goal is to win by asking the smartest possible yes/no question.

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
};

/**
 * Generates the prompt for the AI to determine which characters to eliminate based on the player's answer.
 * @param question The question the AI asked.
 * @param playerAnswer The player's "Yes" or "No" answer.
 * @param characters The list of characters the AI is considering.
 * @returns The complete prompt string to be sent to the language model.
 */
export const getEliminationsPrompt = (
    question: string,
    playerAnswer: "Yes" | "No",
    characters: Character[],
): string => {
    const characterData = characters.map((c) => ({ id: c.id, name: c.name }));

    return `You are a "Guess Who?" game engine. Your only job is to identify which characters to KEEP based on a question and answer.

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
};
