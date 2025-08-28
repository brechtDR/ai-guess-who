import { type Character } from "../types";

/**
 * Provides the system prompt, which defines the AI's core persona, goal, and strategy.
 * This is used to guide the AI's behavior throughout the game.
 * @returns The system prompt string.
 */
export const getSystemPrompt = (): string => {
    return `You are an expert "Guess Who?" player AI. Your goal is to win by deducing the human player's secret character.

**Core Rules & Strategy:**
1.  **Objective:** Ask a series of yes/no questions to eliminate candidates from your board.
2.  **Winning Strategy:** The smartest question is one that splits the remaining characters as close to 50/50 as possible. A question where the feature applies to everyone or no one is a wasted turn and is forbidden.
3.  **Question Quality:** Questions must be about clear, unambiguous, and binary (yes/no) visual features.
    *   **Good Examples:** 'has glasses', 'is wearing a hat', 'hair is blonde'.
    *   **Bad (Subjective) Examples:** 'looks happy', 'seems old', 'has a long face'.
4.  **Honesty:** Crucially, you do NOT know the human's secret character. You must use pure logic based on my answers to deduce it. Do not cheat or pretend to know. Your analysis must be based only on the images provided.`;
};

/**
 * Generates the prompt for the AI to create a strategic question and provide its own
 * analysis of the remaining characters in a single, consistent step.
 * This version uses a "Chain of Thought" approach to force a more deliberate analysis.
 * @param characters The list of remaining characters for the AI to consider.
 * @param retryReason An optional string explaining why a previous attempt failed.
 * @returns The turn-specific prompt string for generating a question and analysis.
 */
export const getAIQuestionAndAnalysisPrompt = (characters: Character[], retryReason?: string): string => {
    const characterNames = characters.map((c) => c.name).join(", ");
    const characterData = characters.map((c) => ({ id: c.id, name: c.name }));

    const retryInstruction = retryReason
        ? `
**IMPORTANT - PREVIOUS ATTEMPT FAILED:**
Your last attempt was unsuccessful. Reason: "${retryReason}".
You MUST choose a DIFFERENT feature for your question this time, following your core strategy.`
        : "";

    return `It is your turn. Analyze your board and formulate your next move.

**Current Game State:**
*   **Your Remaining Candidates (${characters.length}):** ${characterNames}
*   **Your Candidate Data:** ${JSON.stringify(characterData)}

${retryInstruction}

---
**YOUR TASK: Follow these steps to determine your question.**
---
Remember your core strategy: find a feature that splits the group.

**Step 1: Feature Brainstorming.**
Look at all your candidates. List several distinct visual features you could ask about.

**Step 2: Strategic Evaluation.**
For each feature, count how many candidates have it vs. don't. Identify the feature that provides the best 50/50 split.

**Step 3: Select the Best Question.**
Choose the single best feature from your evaluation. This feature MUST be valid and split the group.

**Step 4: Construct the Final JSON Output.**
Based on your selected feature:
1.  Formulate the question (e.g., "Does your character have a beard?").
2.  Create the analysis array. For each of YOUR candidates, accurately set \`has_feature\` to \`true\` or \`false\`.

**ACCURACY IS PARAMOUNT.** An error in your analysis will cause you to lose. Double-check your work.

**Final Output:**
Your entire response must be a single valid JSON object matching the schema. Do not add any other text or reasoning.`;
};

/**
 * Generates the prompt for the AI to answer a player's question with a simple boolean.
 * @param question The player's question.
 * @returns The prompt string.
 */
export const getAnswerToPlayerQuestionPrompt = (question: string): string => {
    return `I am the human player. You are the AI player. It is my turn, and I am asking you a question about YOUR secret character.
**The image provided to you IS YOUR secret character.**
My question is: "${question}"
Your task is to look at YOUR character image and answer my question with a simple 'Yes' or 'No'. 
Your entire output MUST be a single boolean value: 'true' for Yes, 'false' for No. Do not add any other text. 
Good to know: If my question uses "it" such as "is it a girl". The word "it" references YOUR character.`;
};
