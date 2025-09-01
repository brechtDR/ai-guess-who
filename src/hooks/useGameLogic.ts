import { useCallback } from "react";
import * as dbService from "../services/dbService";
import { AIStatus, GameState, type Character } from "../types";
import { useAIActions } from "./useAIActions";
import { useAIModel } from "./useAIModel";
import { useGameSettings } from "./useGameSettings";
import { useGameState } from "./useGameState";
import { usePlayerActions } from "./usePlayerActions";

/**
 * A custom hook to manage the entire state and logic for the "AI Guess Who?" game.
 * This hook acts as an orchestrator, composing smaller, specialized hooks to manage
 * different aspects of the game logic.
 */
export const useGameLogic = () => {
    //
    // --- Sub-hooks for managing different aspects of game logic ---
    //

    const {
        aiStatus,
        aiStatusMessage,
        downloadProgress,
        defaultCharsWithBlobs,
        setAiStatus,
        setAiStatusMessage,
        setDownloadProgress,
        reinitializeAI,
    } = useAIModel();

    const {
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
        startGame: coreStartGame,
        resetGame: coreResetGame,
        shuffleArray,
    } = useGameState();

    const { isReviewModeEnabled, hasCustomSet, setHasCustomSet, handleSetReviewMode } = useGameSettings(gameState);

    const {
        aiRemainingChars,
        setAiRemainingChars,
        lastAIAnalysis,
        setLastAIAnalysis,
        setIsAIFinalGuess,
        handlePlayerAnswer,
        handleConfirmAIAnalysis,
    } = useAIActions({
        gameState,
        messages,
        playerSecret,
        isReviewModeEnabled,
        setIsLoading,
        addMessage,
        setGameState,
        setWinner,
        setWinReason,
    });

    const { playerEliminatedChars, setPlayerEliminatedChars, handlePlayerQuestion, handleEndTurn } = usePlayerActions({
        isLoading,
        setIsLoading,
        addMessage,
        setGameState,
        setWinner,
        setWinReason,
        aiSecret,
        activeCharacters,
    });

    //
    // --- Top-level handlers that compose logic from sub-hooks ---
    //

    const startGame = useCallback(
        async (characterSet: Character[]) => {
            try {
                await coreStartGame(characterSet, setAiRemainingChars);
            } catch (error) {
                console.error("Game start failed:", error);
                setAiStatus(AIStatus.ERROR);
                setAiStatusMessage(error instanceof Error ? error.message : "Failed to start game session.");
                setGameState(GameState.SETUP);
                throw error;
            }
        },
        [coreStartGame, setAiRemainingChars, setAiStatus, setAiStatusMessage, setGameState],
    );

    const handleStartDefault = useCallback(async () => {
        if (!defaultCharsWithBlobs) return;
        setIsLoading(true);
        try {
            const selectedCharacters = shuffleArray(defaultCharsWithBlobs).slice(0, 5);
            await startGame(selectedCharacters);
        } catch (e) {
            // Error is handled by startGame
        } finally {
            setIsLoading(false);
        }
    }, [defaultCharsWithBlobs, startGame, setIsLoading, shuffleArray]);

    const handleStartWithCustomSet = useCallback(async () => {
        setIsLoading(true);
        try {
            const customChars = await dbService.loadCustomCharacters();
            if (customChars && customChars.length > 0) {
                await startGame(customChars);
            } else {
                setHasCustomSet(false);
                addMessage({ sender: "SYSTEM", text: "Could not load custom character set." });
            }
        } catch (error) {
            console.error("Failed to load or start custom game:", error);
            // Error handling is inside startGame, this catch is for dbService errors
            if (!(error instanceof Error && error.message.includes("AI"))) {
                addMessage({ sender: "SYSTEM", text: "Error loading custom characters." });
            }
        } finally {
            setIsLoading(false);
        }
    }, [startGame, setIsLoading, setHasCustomSet, addMessage]);

    const resetGame = useCallback(() => {
        coreResetGame(setPlayerEliminatedChars, setLastAIAnalysis, setIsAIFinalGuess, setDownloadProgress);
        if (aiStatus === AIStatus.ERROR || aiStatus === AIStatus.UNAVAILABLE) {
            reinitializeAI();
        }
    }, [
        coreResetGame,
        setPlayerEliminatedChars,
        setLastAIAnalysis,
        setIsAIFinalGuess,
        setDownloadProgress,
        aiStatus,
        reinitializeAI,
    ]);

    //
    // --- Return combined state and handlers for the App component ---
    //

    return {
        // State
        gameState,
        activeCharacters,
        playerSecret,
        aiSecret,
        messages,
        winner,
        winReason,
        isLoading,
        playerEliminatedChars,
        aiRemainingChars,
        aiStatus,
        aiStatusMessage,
        downloadProgress,
        defaultCharsWithBlobs,
        hasCustomSet,
        lastAIAnalysis,
        isReviewModeEnabled,

        // State Setters
        setGameState,
        setPlayerEliminatedChars,

        // Handlers
        startGame,
        resetGame,
        handleStartDefault,
        handleStartWithCustomSet,
        handlePlayerQuestion,
        handleEndTurn,
        handlePlayerAnswer,
        handleConfirmAIAnalysis,
        handleSetReviewMode,
    };
};
