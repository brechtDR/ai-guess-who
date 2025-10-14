import React, { useCallback, useState } from "react";
import * as builtInAIService from "../services/builtInAIService.ts";
import { GameState, type Character, type Message } from "../types";

const FINAL_GUESS_REGEX = /^(?:is it|is the person|is the character|is your? character)\s+(.*?)\??$/i;

type UsePlayerActionsProps = {
    isLoading: boolean;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    addMessage: (message: Message) => void;
    setGameState: React.Dispatch<React.SetStateAction<GameState>>;
    setWinner: React.Dispatch<React.SetStateAction<"PLAYER" | "AI" | null>>;
    setWinReason: React.Dispatch<React.SetStateAction<string>>;
    aiSecret: Character | null;
    activeCharacters: Character[];
};

/**
 * Manages all state and logic related to the player's turn.
 */
export const usePlayerActions = ({
    setIsLoading,
    addMessage,
    setGameState,
    setWinner,
    setWinReason,
    aiSecret,
    activeCharacters,
}: UsePlayerActionsProps) => {
    const [playerEliminatedChars, setPlayerEliminatedChars] = useState<Set<string>>(new Set());

    const handlePlayerQuestion = useCallback(
        async (question: string) => {
            if (!question || !aiSecret) return;
            setIsLoading(true);
            addMessage({ sender: "PLAYER", text: question });

            const handleAsNormalQuestion = async () => {
                try {
                    const answer = await builtInAIService.getAnswerToPlayerQuestion(aiSecret, question);
                    addMessage({ sender: "AI", text: answer });
                    addMessage({
                        sender: "SYSTEM",
                        text: `You can now eliminate characters. Click 'End Turn' when ready.`,
                    });
                    setGameState(GameState.PLAYER_TURN_ELIMINATING);
                } catch (error) {
                    console.error(error);
                    addMessage({ sender: "SYSTEM", text: "Sorry, I had trouble answering. Please try again." });
                }
            };

            const guessMatch = question.trim().match(FINAL_GUESS_REGEX);

            if (guessMatch) {
                const guessedName = guessMatch[1].trim();
                const isActualGuess = activeCharacters.some(
                    (char) => char.name.toLowerCase() === guessedName.toLowerCase(),
                );

                if (isActualGuess) {
                    if (guessedName.toLowerCase() === aiSecret.name.toLowerCase()) {
                        addMessage({ sender: "AI", text: `Yes, it is ${aiSecret.name}!` });
                        setWinner("PLAYER");
                        setWinReason(`You correctly guessed the character was ${aiSecret.name}.`);
                        setGameState(GameState.GAME_OVER);
                    } else {
                        addMessage({ sender: "AI", text: `No, it is not ${guessedName}.` });
                        addMessage({
                            sender: "SYSTEM",
                            text: `You guessed incorrectly! The secret character was ${aiSecret.name}.`,
                        });
                        setWinner("AI");
                        setWinReason(`You guessed incorrectly. The secret character was ${aiSecret.name}.`);
                        setGameState(GameState.GAME_OVER);
                    }
                } else {
                    await handleAsNormalQuestion();
                }
            } else {
                await handleAsNormalQuestion();
            }
            setIsLoading(false);
        },
        [aiSecret, activeCharacters, setIsLoading, addMessage, setGameState, setWinner, setWinReason],
    );

    const handleEndTurn = useCallback(() => {
        addMessage({ sender: "SYSTEM", text: "AI is thinking of a question..." });
        setGameState(GameState.AI_TURN);
    }, [addMessage, setGameState]);

    return {
        playerEliminatedChars,
        setPlayerEliminatedChars,
        handlePlayerQuestion,
        handleEndTurn,
    };
};
