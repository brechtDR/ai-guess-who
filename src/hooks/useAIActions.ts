import React, { useCallback, useEffect, useState } from "react";
import * as builtInAIService from "../services/buildInAIService.ts";
import { GameState, type Character, type EliminationAnalysisResult, type Message } from "../types";

const FINAL_GUESS_REGEX = /^(?:is it|is the person|is the character|is your? character)\s+(.*?)\??$/i;

type UseAIActionsProps = {
    gameState: GameState;
    messages: Message[];
    playerSecret: Character | null;
    isReviewModeEnabled: boolean;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    addMessage: (message: Message) => void;
    setGameState: React.Dispatch<React.SetStateAction<GameState>>;
    setWinner: React.Dispatch<React.SetStateAction<"PLAYER" | "AI" | null>>;
    setWinReason: React.Dispatch<React.SetStateAction<string>>;
};

/**
 * Manages all state and logic related to the AI's turn and its interactions.
 */
export const useAIActions = ({
    gameState,
    messages,
    playerSecret,
    isReviewModeEnabled,
    setIsLoading,
    addMessage,
    setGameState,
    setWinner,
    setWinReason,
}: UseAIActionsProps) => {
    const [aiRemainingChars, setAiRemainingChars] = useState<Character[]>([]);
    const [lastAIQuestion, setLastAIQuestion] = useState<string>("");
    const [lastAIAnalysis, setLastAIAnalysis] = useState<EliminationAnalysisResult[]>([]);
    const [isAIFinalGuess, setIsAIFinalGuess] = useState(false);

    // Effect to handle the AI's turn logic
    useEffect(() => {
        const handleAITurn = async () => {
            if (gameState !== GameState.AI_TURN) return;
            setIsLoading(true);
            setIsAIFinalGuess(false);

            if (aiRemainingChars.length === 1) {
                const guess = `Is your character ${aiRemainingChars[0].name}?`;
                setLastAIQuestion(guess);
                setIsAIFinalGuess(true);
                addMessage({ sender: "AI", text: guess });
                setGameState(GameState.AI_TURN_WAITING_FOR_ANSWER);
                setIsLoading(false);
                return;
            }

            if (aiRemainingChars.length === 0) {
                setWinner("PLAYER");
                setWinReason("The AI ran out of characters to guess from!");
                setGameState(GameState.GAME_OVER);
                setIsLoading(false);
                return;
            }

            const MAX_AI_RETRIES = 3;
            let retryReason: string | undefined = undefined;
            let lastFailedQuestion: string | undefined = undefined;

            for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
                try {
                    const { question, analysis } = await builtInAIService.getAIQuestionAndAnalysis(
                        aiRemainingChars,
                        messages,
                        retryReason,
                        lastFailedQuestion,
                    );

                    const positiveFeatures = analysis.filter((res) => res.has_feature).length;
                    if (positiveFeatures === 0 || positiveFeatures === analysis.length) {
                        retryReason =
                            "The last question you asked was invalid because it did not eliminate any characters. You must ask a question that splits the remaining characters.";
                        lastFailedQuestion = question;
                        throw new Error("AI generated a non-discriminatory question.");
                    }

                    setLastAIQuestion(question);
                    setLastAIAnalysis(analysis);

                    addMessage({ sender: "AI", text: question });
                    if (isReviewModeEnabled) {
                        addMessage({
                            sender: "SYSTEM",
                            text: "Here is how the AI analyzed the remaining characters. Review its work, then click 'Continue' to provide your answer.",
                        });
                        setGameState(GameState.PLAYER_REVIEWING_AI_ANALYSIS);
                    } else {
                        addMessage({ sender: "SYSTEM", text: "It's your turn to answer." });
                        setGameState(GameState.AI_TURN_WAITING_FOR_ANSWER);
                    }

                    setIsLoading(false);
                    return;
                } catch (error) {
                    console.warn(`AI question generation attempt ${attempt} failed:`, error);
                    if (error instanceof Error && error.message !== "AI generated a non-discriminatory question.") {
                        retryReason = `The last attempt failed with an error: ${error.message}. Please try generating a completely different question.`;
                    }
                    if (attempt === MAX_AI_RETRIES) {
                        console.error("AI failed to generate a valid question after multiple retries.");
                        addMessage({ sender: "SYSTEM", text: "The AI is having trouble thinking. Your turn!" });
                        setGameState(GameState.PLAYER_TURN_ASKING);
                        setIsLoading(false);
                        return;
                    }
                }
            }
        };
        handleAITurn();
    }, [
        gameState,
        aiRemainingChars,
        messages,
        isReviewModeEnabled,
        setIsLoading,
        addMessage,
        setGameState,
        setWinner,
        setWinReason,
    ]);

    const handleConfirmAIAnalysis = useCallback(() => {
        setGameState(GameState.AI_TURN_WAITING_FOR_ANSWER);
    }, [setGameState]);

    const handlePlayerAnswer = useCallback(
        async (answer: "Yes" | "No") => {
            if (!lastAIQuestion || !playerSecret) return;
            setIsLoading(true);
            addMessage({ sender: "PLAYER", text: answer });

            if (isAIFinalGuess) {
                const guessMatch = lastAIQuestion.trim().match(FINAL_GUESS_REGEX);
                const guessedName = guessMatch ? guessMatch[1].trim() : "";
                if (guessedName) {
                    const isCorrectGuess = guessedName.toLowerCase() === playerSecret.name.toLowerCase();
                    if (isCorrectGuess && answer === "Yes") {
                        setWinner("AI");
                        setWinReason(`It correctly guessed your character was ${playerSecret?.name}.`);
                    } else if (!isCorrectGuess && answer === "No") {
                        setWinner("PLAYER");
                        setWinReason(`The AI guessed ${guessedName} incorrectly! You win!`);
                    } else {
                        setWinner("AI");
                        setWinReason(
                            `There was a mismatch in the final guess. Your card was ${playerSecret?.name}. The AI wins.`,
                        );
                    }
                    setGameState(GameState.GAME_OVER);
                    setIsLoading(false);
                    return;
                }
            }

            await new Promise((resolve) => setTimeout(resolve, 500));
            const eliminatedIds = new Set<string>();
            if (answer === "Yes") {
                lastAIAnalysis.forEach((char) => {
                    if (!char.has_feature) eliminatedIds.add(char.id);
                });
            } else {
                lastAIAnalysis.forEach((char) => {
                    if (char.has_feature) eliminatedIds.add(char.id);
                });
            }

            if (eliminatedIds.size === aiRemainingChars.length && aiRemainingChars.length > 0) {
                console.warn("AI logic would have eliminated all characters. Preventing this action.");
                addMessage({
                    sender: "SYSTEM",
                    text: "The AI got confused and almost eliminated everyone! No one was eliminated.",
                });
            } else {
                const eliminatedNames = aiRemainingChars
                    .filter((c) => eliminatedIds.has(c.character_id))
                    .map((c) => c.name)
                    .join(", ");
                if (eliminatedNames) {
                    addMessage({ sender: "SYSTEM", text: `AI eliminated: ${eliminatedNames}.` });
                } else {
                    addMessage({ sender: "SYSTEM", text: `AI did not eliminate anyone based on that answer.` });
                }

                const newRemainingChars = aiRemainingChars.filter((c) => !eliminatedIds.has(c.character_id));
                setAiRemainingChars(newRemainingChars);

                if (newRemainingChars.length === 0) {
                    setWinner("PLAYER");
                    setWinReason(`The AI eliminated all its characters by mistake! You win!`);
                    setGameState(GameState.GAME_OVER);
                    setIsLoading(false);
                    return;
                }
            }

            setGameState(GameState.PLAYER_TURN_ASKING);
            setIsLoading(false);
        },
        [
            lastAIQuestion,
            playerSecret,
            aiRemainingChars,
            isAIFinalGuess,
            lastAIAnalysis,
            setIsLoading,
            addMessage,
            setGameState,
            setWinner,
            setWinReason,
        ],
    );

    return {
        aiRemainingChars,
        setAiRemainingChars,
        lastAIAnalysis,
        setLastAIAnalysis,
        setIsAIFinalGuess,
        handlePlayerAnswer,
        handleConfirmAIAnalysis,
    };
};
