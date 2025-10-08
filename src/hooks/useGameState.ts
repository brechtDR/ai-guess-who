import React, { useCallback, useState } from "react";
import * as buildInAIService from "../services/buildInAIService.ts";
import { GameState, type Character, type EliminationAnalysisResult, type GameWinner, type Message } from "../types";

/**
 * A utility function to shuffle an array using the Fisher-Yates algorithm.
 * @param array The array to shuffle.
 * @returns A new shuffled array.
 */
const shuffleArray = <T>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

/**
 * Manages the core state of the game, including characters, secrets, messages, and game flow.
 */
export const useGameState = () => {
    const [gameState, setGameState] = useState<GameState>(GameState.SETUP);
    const [activeCharacters, setActiveCharacters] = useState<Character[]>([]);
    const [playerSecret, setPlayerSecret] = useState<Character | null>(null);
    const [aiSecret, setAiSecret] = useState<Character | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [winner, setWinner] = useState<GameWinner>(null);
    const [winReason, setWinReason] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const addMessage = useCallback((message: Message) => {
        setMessages((prev) => [...prev, message]);
    }, []);

    const startGame = useCallback(
        async (characterSet: Character[], setAiRemainingChars: React.Dispatch<React.SetStateAction<Character[]>>) => {
            if (characterSet.some((c) => !c.imageBlob)) {
                throw new Error("Missing character image blobs.");
            }

            try {
                await buildInAIService.startNewGameSession();
            } catch (error) {
                console.error("Failed to start AI game session:", error);
                throw error; // Re-throw to be handled by the caller
            }

            setActiveCharacters(characterSet);
            setAiRemainingChars(characterSet);

            const playerIndex = Math.floor(Math.random() * characterSet.length);
            let aiIndex;
            do {
                aiIndex = Math.floor(Math.random() * characterSet.length);
            } while (aiIndex === playerIndex);

            const pSecret = characterSet[playerIndex];
            const aSecret = characterSet[aiIndex];
            setPlayerSecret(pSecret);
            setAiSecret(aSecret);

            console.log("%c[DEBUG] AI Secret Character:", "color: #f59e0b; font-weight: bold;", aSecret.name);

            setMessages([
                {
                    sender: "SYSTEM",
                    text: `New game started. You drew ${pSecret.name}. It's your turn to ask a question.`,
                },
            ]);
            setWinner(null);
            setWinReason("");
            setGameState(GameState.PLAYER_TURN_ASKING);
        },
        [],
    );

    const resetGame = useCallback(
        (
            setPlayerEliminatedChars: React.Dispatch<React.SetStateAction<Set<string>>>,
            setLastAIAnalysis: React.Dispatch<React.SetStateAction<EliminationAnalysisResult[]>>,
            setIsAIFinalGuess: React.Dispatch<React.SetStateAction<boolean>>,
            setDownloadProgress: React.Dispatch<React.SetStateAction<number | null>>,
        ) => {
            setGameState(GameState.SETUP);
            setActiveCharacters([]);
            setPlayerSecret(null);
            setAiSecret(null);
            setMessages([]);
            setWinner(null);
            setWinReason("");
            setPlayerEliminatedChars(new Set());
            setLastAIAnalysis([]);
            setIsAIFinalGuess(false);
            setDownloadProgress(null);
        },
        [],
    );

    return {
        gameState,
        setGameState,
        activeCharacters,
        playerSecret,
        aiSecret,
        messages,
        addMessage,
        winner,
        setWinner,
        winReason,
        setWinReason,
        isLoading,
        setIsLoading,
        startGame,
        resetGame,
        shuffleArray,
    };
};
