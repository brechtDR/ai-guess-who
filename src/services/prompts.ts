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
 * Generates the prompt for the AI to create a strategic question and provide its own
 * analysis of the remaining characters in a single, consistent step.
 * @param characters The list of remaining characters for the AI to consider.
 * @param retryReason An optional string explaining why a previous attempt failed.
 * @returns The turn-specific prompt string for generating a question and analysis.
 */
export const getAIQuestionAndAnalysisPrompt = (characters: Character[], retryReason?: string): string => {
    const characterData = characters.map((c) => ({ id: c.id, name: c.name }));

    const retryInstruction = retryReason
        ? `
**IMPORTANT - PREVIOUS ATTEMP FAILED:**
Your last attempt was unsuccessful. Reason: "${retryReason}".
This is a critical mistake. You MUST choose a DIFFERENT feature for your question this time. Analyze the characters again from scratch and find a valid feature that splits the group.`
        : "";

    return `You are an expert "Guess Who?" player. It is your turn to ask a question.

**ROLES AND KNOWLEDGE:**
*   You are the AI Player.
*   I am the Human Player.
*   I have secretly chosen one character from the full board.
*   **You DO NOT know which character I have picked.**
*   The images and character list provided to you below represent **YOUR** list of possible candidates. One of these candidates is my secret character.
*   Your task is to ask me (the human) a question about **MY** secret character. My answer will help you eliminate candidates from **YOUR** list.
*   Do not try to guess my character in this step. Just ask a strategic question about a visual feature.

${retryInstruction}

**Analyze your situation:**
*   **Your Remaining Candidate Images (${characters.length}):** You have been provided with ${characters.length} images.
*   **Your Candidate Data:** ${JSON.stringify(characterData)}

**YOUR TASK: Follow these steps precisely to generate your question and analysis.**

1.  **Examine All Candidates:** Meticulously look at every single one of your remaining character images.
2.  **Identify Potential Features:** Brainstorm a list of clear, unambiguous, binary visual features you could ask about. Good examples: 'wearing a hat', 'has a beard', 'has blonde hair', 'is wearing glasses', 'is a woman'. Bad, subjective examples: 'looks happy', 'seems old'.
3.  **Select the BEST Feature:** Choose the single feature from your list that will split your remaining candidates most evenly. This is your best strategic move. A question that eliminates close to half the characters is ideal.
    *   **CRITICAL RULE:** The feature you choose MUST be present on some characters but not others. A feature that applies to everyone or no one is a wasted turn and is forbidden.
4.  **Formulate Your Question:** Create a clear, simple yes/no question based on your selected feature. For example: "Does your character have a beard?". Do not ask a question that is already in the chat history.
5.  **Perform Final, Meticulous Verification (THE MOST IMPORTANT STEP):**
    This is where mistakes happen. Before you output anything, you must verify your analysis for EVERY SINGLE character against your chosen question. This process MUST be flawless.
    *   For each character in your list, ask yourself: "Does this specific character's image match the feature in my question (e.g., 'Is this person wearing a hat?')?"
    *   Based on your visual confirmation, set that character's \`has_feature\` property to \`true\` or \`false\`.
    *   **CRITICAL: You must also write a short \`reasoning\` string (1-2 sentences) explaining *why* you chose true or false.** For example: "This character has a full beard." or "This character is not wearing a hat." This forces you to double-check your own logic.
    *   **An incorrect \`has_feature\` value will cause you to make a mistake and lose the game. Double-check your work on every character.**
6.  **Construct the Final JSON:** Assemble your question and your verified analysis into the final JSON object. Ensure the \`analysis\` array contains an entry for every single remaining character provided in your candidate data.

**Output:**
Your entire response MUST be a single valid JSON object matching the provided schema. Do not add any other text.`;
};

/**
 * Generates the prompt for the AI to answer a player's question with a simple boolean.
 * @param character The AI's secret character.
 * @param question The player's question.
 * @returns The prompt string.
 */
export const getAnswerToPlayerQuestionPrompt = (character: Character, question: string): string => {
    return `You are the AI player in a "Guess Who?" game. It is the human player's turn to ask a question.
The human's question is about **your** secret character.

**Your Secret Character Information:**
*   **Name:** "${character.name}"
*   **Image:** The image provided to you IS your secret character, ${character.name}.

**Human's Question:** "${question}"

**Your Task:**
Look at your character's image and answer the human's question with a simple 'Yes' or 'No'.
Your entire output MUST be a single boolean value: 'true' for Yes, 'false' for No. Do not add any other text.`;
};
