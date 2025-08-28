import { type Character } from "../types";

/**
 * Provides the system prompt, which defines the AI's core persona, goal, and strategy.
 * This is used to guide the AI's behavior throughout the game.
 * @returns The system prompt string.
 */
export const getSystemPrompt = (): string => {
    return `You are an expert "Guess Who?" player. Your goal is to win by asking the smartest possible yes/no question to eliminate the maximum number of characters. A good starting question often relates to gender, as it can split the characters in half.`;
};

/**
 * Generates the prompt for the AI to ask a strategic question for the current turn.
 * This is combined with the system prompt and conversation history.
 * @param characters The list of remaining characters for the AI to consider.
 * @returns The turn-specific prompt string.
 */
export const getAIQuestionPrompt = (characters: Character[]): string => {
    const characterNames = characters.map((c) => c.name).join(", ");

    return `Based on the conversation history and the remaining characters, formulate your next best yes/no question.

**Analyze the situation:**
*   **Characters remaining (${characters.length}):** ${characterNames}

**Follow these rules precisely:**
1.  **Perform a meticulous visual analysis of EACH character image:** Your primary task is to be an expert observer. Scrutinize every detail: hair (color, style, length, baldness), eyes (color, glasses, sunglasses), facial features (facial hair like mustaches or beards, smiles, expressions), accessories (hats, earrings, necklaces), and clothing (color, type like shirt or jacket). Do not guess or hallucinate features; base your analysis only on visible evidence.
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
 * Generates the prompt for the AI to answer a player's question with a simple boolean.
 * @param question The player's question.
 * @returns The prompt string.
 */
export const getAnswerToPlayerQuestionPrompt = (question: string): string => {
    return `You are a "Guess Who" player. Your task is to answer a question about the provided character image.
1. **Perform a meticulous visual analysis of the single character image provided.** Your primary task is to be an expert observer. Scrutinize every detail: hair (color, style, length, baldness), eyes (color, glasses, sunglasses), facial features (facial hair like mustaches or beards, smiles, expressions), accessories (hats, earrings, necklaces), and clothing (color, type like shirt or jacket).
2. **Analyze the user's question:** "${question}"
3. **Answer truthfully** based ONLY on what you see in the image.
Your output must be a single boolean value.`;
};

/**
 * Generates the prompt for the AI to perform visual analysis on a set of characters.
 * The AI's only job is to determine if a character has the feature from the question.
 * The logical deduction is handled by the client-side application code.
 * @param question The question the AI asked.
 * @param characters The list of characters the AI is considering.
 * @returns The complete prompt string to be sent to the language model.
 */
export const getEliminationsPrompt = (question: string, characters: Character[]): string => {
    const characterData = characters.map((c) => ({ id: c.id, name: c.name }));

    return `You are a visual analysis engine for the game "Guess Who?". Your only task is to determine if a specific visual feature is present for a list of characters.

**CONTEXT:**
*   **Question Asked:** "${question}"
*   **Characters to Evaluate:** ${JSON.stringify(characterData)}

**YOUR TASK:**
For EACH character, you must perform a visual analysis and output a JSON object.

**Analysis ('has_feature'):**
*   **Meticulously scrutinize each character's image** to identify the specific visual feature mentioned in the question: "${question}". Your analysis must be flawless.
*   **Be comprehensive:** Consider variations of the feature. For example, 'hat' can include beanies, caps, fedoras, etc. 'Glasses' can include sunglasses or prescription glasses.
*   **Stick to the facts:** Based ONLY on what you can see in the image, set the \`has_feature\` property to \`true\` if the character has the feature, and \`false\` if they do not. Do not infer or guess.

Your output MUST be a valid JSON array of objects, one for each character, following the provided schema. Do not add any other text, explanations, or analysis. Just the JSON.`;
};
