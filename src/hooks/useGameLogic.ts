import { useCallback, useEffect, useState } from "react";
import { DEFAULT_CHARACTERS } from "../constants";
import * as dbService from "../services/dbService";
import * as geminiService from "../services/geminiService";
import {
    AIStatus,
    GameState,
    type Character,
    type EliminationAnalysisResult,
    type GameWinner,
    type Message,
} from "../types";

const FINAL_GUESS_REGEX = /^(?:is it|is the person|is the character|is your? character)\s+(.*?)\??$/i;
const REVIEW_MODE_STORAGE_KEY = "ai-guess-who-review-mode";

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
 * A custom hook to manage the entire state and logic for the "AI Guess Who?" game.
 * This includes game flow, character management, AI interactions, and state updates.
 */
export const useGameLogic = () => {
    // Core game state
    const [gameState, setGameState] = useState<GameState>(GameState.SETUP);
    const [activeCharacters, setActiveCharacters] = useState<Character[]>([]);
    const [playerSecret, setPlayerSecret] = useState<Character | null>(null);
    const [aiSecret, setAiSecret] = useState<Character | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [winner, setWinner] = useState<GameWinner>(null);
    const [winReason, setWinReason] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Player-specific state
    const [playerEliminatedChars, setPlayerEliminatedChars] = useState<Set<string>>(new Set());

    // AI-specific state
    const [aiRemainingChars, setAiRemainingChars] = useState<Character[]>([]);
    const [lastAIQuestion, setLastAIQuestion] = useState<string>("");
    const [lastAIAnalysis, setLastAIAnalysis] = useState<EliminationAnalysisResult[]>([]);
    const [isAIFinalGuess, setIsAIFinalGuess] = useState(false);
    const [aiStatus, setAiStatus] = useState<AIStatus>(AIStatus.INITIALIZING);
    const [aiStatusMessage, setAiStatusMessage] = useState<string>("Initializing AI...");
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

    // Game Settings
    const [isReviewModeEnabled, setIsReviewModeEnabled] = useState<boolean>(() => {
        try {
            // Default to true for a better first-time experience
            const storedValue = localStorage.getItem(REVIEW_MODE_STORAGE_KEY);
            return storedValue ? JSON.parse(storedValue) : true;
        } catch {
            return true;
        }
    });

    // Pre-loaded data state
    const [defaultCharsWithBlobs, setDefaultCharsWithBlobs] = useState<Character[] | null>(null);
    const [hasCustomSet, setHasCustomSet] = useState(false);

    // Initialize the AI model on component mount
    useEffect(() => {
        geminiService.initializeAI({
            onStatusChange: (status, message) => {
                setAiStatus(status);
                if (message) setAiStatusMessage(message);
            },
            onProgress: (progress) => {
                setDownloadProgress(progress);
            },
        });
    }, []);

    // Load blobs for default characters once the AI is ready
    useEffect(() => {
        const loadData = async () => {
            if (aiStatus === AIStatus.READY && !defaultCharsWithBlobs) {
                const charactersWithBlobs = await geminiService.loadBlobsForDefaultCharacters(DEFAULT_CHARACTERS);
                setDefaultCharsWithBlobs(charactersWithBlobs);
            }
        };
        loadData();
    }, [aiStatus, defaultCharsWithBlobs]);

    // Check for a saved custom game when returning to the setup screen
    useEffect(() => {
        if (gameState === GameState.SETUP) {
            dbService.hasCustomCharacters().then(setHasCustomSet);
        }
    }, [gameState]);

    /**
     * Resets the game to its initial setup state.
     */
    const resetGame = useCallback(() => {
        setGameState(GameState.SETUP);
        setActiveCharacters([]);
        setPlayerSecret(null);
        setAiSecret(null);
        setMessages([]);
        setLastAIAnalysis([]);
        setIsAIFinalGuess(false);
        setDownloadProgress(null);
        // Re-trigger AI check on reset if it failed
        if (aiStatus === AIStatus.ERROR || aiStatus === AIStatus.UNAVAILABLE) {
            setAiStatus(AIStatus.INITIALIZING);
            geminiService.initializeAI({
                onStatusChange: (status, message) => {
                    setAiStatus(status);
                    if (message) setAiStatusMessage(message);
                },
                onProgress: (progress) => setDownloadProgress(progress),
            });
        }
    }, [aiStatus]);

    /**
     * Starts a new game with the provided set of characters.
     */
    const startGame = useCallback(async (characterSet: Character[]) => {
        if (characterSet.some((c) => !c.imageBlob)) {
            setAiStatus(AIStatus.ERROR);
            setAiStatusMessage(
                "Cannot start game: Some character images are missing. Please try again or use the default set.",
            );
            setGameState(GameState.SETUP);
            throw new Error("Missing character image blobs.");
        }

        try {
            await geminiService.startNewGameSession();
        } catch (error) {
            console.error("Failed to start AI game session:", error);
            setAiStatus(AIStatus.ERROR);
            setAiStatusMessage(
                error instanceof Error ? error.message : "Failed to start AI game session. Please try again.",
            );
            setGameState(GameState.SETUP);
            throw error;
        }

        setActiveCharacters(characterSet);
        setAiRemainingChars(characterSet);
        setPlayerEliminatedChars(new Set());

        // Select secret characters for player and AI
        const playerIndex = Math.floor(Math.random() * characterSet.length);
        let aiIndex;
        do {
            aiIndex = Math.floor(Math.random() * characterSet.length);
        } while (aiIndex === playerIndex);

        const pSecret = characterSet[playerIndex];
        const aSecret = characterSet[aiIndex];
        setPlayerSecret(pSecret);
        setAiSecret(aSecret);

        // Developer-facing log for easier debugging
        console.log("%c[DEBUG] AI Secret Character:", "color: #f59e0b; font-weight: bold;", aSecret.name);

        setMessages([
            { sender: "SYSTEM", text: `New game started. You drew ${pSecret.name}. It's your turn to ask a question.` },
        ]);
        setWinner(null);
        setWinReason("");
        setIsAIFinalGuess(false);
        setGameState(GameState.PLAYER_TURN_ASKING);
    }, []);

    /**
     * Handles starting a game with the default character set.
     */
    const handleStartDefault = async () => {
        if (!defaultCharsWithBlobs) return;
        setIsLoading(true);
        try {
            // Shuffle the full list of default characters and select the first 5 for the game
            const selectedCharacters = shuffleArray(defaultCharsWithBlobs).slice(0, 5);
            await startGame(selectedCharacters);
        } catch (e) {
            // Error is handled and displayed by startGame
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Handles starting a game with a previously saved custom character set.
     */
    const handleStartWithCustomSet = async () => {
        setIsLoading(true);
        try {
            const customChars = await dbService.loadCustomCharacters();
            if (customChars && customChars.length > 0) {
                await startGame(customChars);
            } else {
                setHasCustomSet(false);
                setMessages([{ sender: "SYSTEM", text: "Could not load custom character set." }]);
            }
        } catch (error) {
            console.error("Failed to load or start custom game:", error);
            if (!(error instanceof Error && error.message.includes("AI"))) {
                setMessages([{ sender: "SYSTEM", text: "Error loading custom characters." }]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Handles processing the player's question, checking for final guesses, and getting the AI's answer.
     */
    const handlePlayerQuestion = useCallback(
        async (question: string) => {
            if (!question || !aiSecret) return;
            setIsLoading(true);
            setMessages((prev) => [...prev, { sender: "PLAYER", text: question }]);

            const handleAsNormalQuestion = async () => {
                try {
                    const answer = await geminiService.getAnswerToPlayerQuestion(aiSecret, question);
                    setMessages((prev) => [
                        ...prev,
                        { sender: "AI", text: answer },
                        { sender: "SYSTEM", text: `You can now eliminate characters. Click 'End Turn' when ready.` },
                    ]);
                    setGameState(GameState.PLAYER_TURN_ELIMINATING);
                } catch (error) {
                    console.error(error);
                    setMessages((prev) => [
                        ...prev,
                        { sender: "SYSTEM", text: "Sorry, I had trouble answering. Please try again." },
                    ]);
                }
            };

            // Check if the player is making a final guess
            const guessMatch = question.trim().match(FINAL_GUESS_REGEX);

            if (guessMatch) {
                const guessedName = guessMatch[1].trim();
                const isActualGuess = activeCharacters.some(
                    (char) => char.name.toLowerCase() === guessedName.toLowerCase(),
                );

                if (isActualGuess) {
                    if (guessedName.toLowerCase() === aiSecret.name.toLowerCase()) {
                        setMessages((prev) => [...prev, { sender: "AI", text: `Yes, it is ${aiSecret.name}!` }]);
                        setWinner("PLAYER");
                        setWinReason(`You correctly guessed the character was ${aiSecret.name}.`);
                        setGameState(GameState.GAME_OVER);
                    } else {
                        setMessages((prev) => [
                            ...prev,
                            { sender: "AI", text: `No, it is not ${guessedName}.` },
                            {
                                sender: "SYSTEM",
                                text: `You guessed incorrectly! The secret character was ${aiSecret.name}.`,
                            },
                        ]);
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
        [aiSecret, activeCharacters],
    );

    /**
     * Ends the player's turn and transitions to the AI's turn.
     */
    const handleEndTurn = useCallback(() => {
        setMessages((prev) => [...prev, { sender: "SYSTEM", text: "AI is thinking of a question..." }]);
        setGameState(GameState.AI_TURN);
    }, []);

    /**
     * Confirms the player has reviewed the AI's analysis and moves to the answer state.
     */
    const handleConfirmAIAnalysis = useCallback(() => {
        setGameState(GameState.AI_TURN_WAITING_FOR_ANSWER);
    }, []);

    /**
     * Handles the player's "Yes" or "No" answer to the AI's question and triggers AI eliminations.
     */
    const handlePlayerAnswer = useCallback(
        async (answer: "Yes" | "No") => {
            if (!lastAIQuestion || !playerSecret) return;
            setIsLoading(true);
            setMessages((prev) => [...prev, { sender: "PLAYER", text: answer }]);

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
                        // Player was dishonest or there was a mismatch. AI wins on technicality.
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

            // Artificial delay to make it feel like the AI is processing
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Use the pre-computed analysis from the AI's turn to perform eliminations.
            const eliminatedIds = new Set<string>();
            if (answer === "Yes") {
                // Eliminate characters who DO NOT have the feature.
                lastAIAnalysis.forEach((char) => {
                    if (!char.has_feature) {
                        eliminatedIds.add(char.id);
                    }
                });
            } else {
                // "No"
                // Eliminate characters who DO have the feature.
                lastAIAnalysis.forEach((char) => {
                    if (char.has_feature) {
                        eliminatedIds.add(char.id);
                    }
                });
            }

            // Safety check: Don't eliminate everyone if the AI made a mistake.
            if (eliminatedIds.size === aiRemainingChars.length && aiRemainingChars.length > 0) {
                console.warn("AI logic would have eliminated all characters. Preventing this action.");
                setMessages((prev) => [
                    ...prev,
                    {
                        sender: "SYSTEM",
                        text: "The AI got confused and almost eliminated everyone! No one was eliminated.",
                    },
                ]);
            } else {
                const eliminatedNames = aiRemainingChars
                    .filter((c) => eliminatedIds.has(c.id))
                    .map((c) => c.name)
                    .join(", ");

                if (eliminatedNames) {
                    setMessages((prev) => [...prev, { sender: "SYSTEM", text: `AI eliminated: ${eliminatedNames}.` }]);
                } else {
                    setMessages((prev) => [
                        ...prev,
                        { sender: "SYSTEM", text: `AI did not eliminate anyone based on that answer.` },
                    ]);
                }

                const newRemainingChars = aiRemainingChars.filter((c) => !eliminatedIds.has(c.id));
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
        [lastAIQuestion, playerSecret, aiRemainingChars, isAIFinalGuess, lastAIAnalysis],
    );

    /**
     * Toggles the review mode setting and saves it to local storage.
     */
    const handleSetReviewMode = useCallback((isEnabled: boolean) => {
        setIsReviewModeEnabled(isEnabled);
        try {
            localStorage.setItem(REVIEW_MODE_STORAGE_KEY, JSON.stringify(isEnabled));
        } catch (e) {
            console.error("Failed to save review mode setting", e);
        }
    }, []);

    // Effect to handle the AI's turn logic
    useEffect(() => {
        const handleAITurn = async () => {
            if (gameState !== GameState.AI_TURN) return;
            setIsLoading(true);

            // Ensure the final guess flag is false at the start of a normal turn.
            setIsAIFinalGuess(false);

            // Handle final guess if only one character remains
            if (aiRemainingChars.length === 1) {
                const guess = `Is your character ${aiRemainingChars[0].name}?`;
                setLastAIQuestion(guess);
                setIsAIFinalGuess(true); // Explicitly flag this as a final guess
                setMessages((prev) => [...prev, { sender: "AI", text: guess }]);
                setGameState(GameState.AI_TURN_WAITING_FOR_ANSWER);
                setIsLoading(false);
                return;
            }

            // Handle edge case where AI has no characters left
            if (aiRemainingChars.length === 0) {
                setWinner("PLAYER");
                setWinReason("The AI ran out of characters to guess from!");
                setGameState(GameState.GAME_OVER);
                setIsLoading(false);
                return;
            }

            // AI generates a question with intelligent, feedback-driven retry logic
            const MAX_AI_RETRIES = 3;
            let retryReason: string | undefined = undefined;

            for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt++) {
                try {
                    const { question, analysis } = await geminiService.getAIQuestionAndAnalysis(
                        aiRemainingChars,
                        messages,
                        retryReason,
                    );

                    // The analysis here is used to validate the question's quality before it is asked.
                    const positiveFeatures = analysis.filter((res) => res.has_feature).length;
                    if (positiveFeatures === 0 || positiveFeatures === analysis.length) {
                        retryReason =
                            "The last question you asked was invalid because it did not eliminate any characters. You must ask a question that splits the remaining characters.";
                        throw new Error("AI generated a non-discriminatory question.");
                    }

                    // Success: store question and analysis, then move to the appropriate next state.
                    setLastAIQuestion(question);
                    setLastAIAnalysis(analysis);

                    if (isReviewModeEnabled) {
                        setMessages((prev) => [
                            ...prev,
                            { sender: "AI", text: question },
                            {
                                sender: "SYSTEM",
                                text: "Here is how the AI analyzed the remaining characters. Review its work, then click 'Continue' to provide your answer.",
                            },
                        ]);
                        setGameState(GameState.PLAYER_REVIEWING_AI_ANALYSIS);
                    } else {
                        // If review mode is off, go straight to waiting for an answer.
                        setMessages((prev) => [
                            ...prev,
                            { sender: "AI", text: question },
                            { sender: "SYSTEM", text: "It's your turn to answer." },
                        ]);
                        setGameState(GameState.AI_TURN_WAITING_FOR_ANSWER);
                    }

                    setIsLoading(false);
                    return; // Exit successfully
                } catch (error) {
                    console.warn(`AI question generation attempt ${attempt} failed:`, error);

                    // If it wasn't a non-discriminatory question error, set a generic retry reason
                    if (error instanceof Error && error.message !== "AI generated a non-discriminatory question.") {
                        retryReason = `The last attempt failed with an error: ${error.message}. Please try generating a completely different question.`;
                    }

                    if (attempt === MAX_AI_RETRIES) {
                        // All retries failed, give up and pass the turn to the player.
                        console.error("AI failed to generate a valid question after multiple retries.");
                        setMessages((prev) => [
                            ...prev,
                            { sender: "SYSTEM", text: "The AI is having trouble thinking. Your turn!" },
                        ]);
                        setGameState(GameState.PLAYER_TURN_ASKING);
                        setIsLoading(false);
                        return;
                    }
                }
            }
        };
        handleAITurn();
    }, [gameState, aiRemainingChars, messages, isReviewModeEnabled]);

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
