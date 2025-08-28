import { useCallback, useEffect, useState } from "react";
import { DEFAULT_CHARACTERS } from "../constants";
import * as dbService from "../services/dbService";
import * as geminiService from "../services/geminiService";
import { AIStatus, GameState, type Character, type GameWinner, type Message } from "../types";

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
    const [aiThinkingChars, setAiThinkingChars] = useState<Set<string>>(new Set());
    const [aiStatus, setAiStatus] = useState<AIStatus>(AIStatus.INITIALIZING);
    const [aiStatusMessage, setAiStatusMessage] = useState<string>("Initializing AI...");
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

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
        setGameState(GameState.PLAYER_TURN_ASKING);
    }, []);

    /**
     * Handles starting a game with the default character set.
     */
    const handleStartDefault = async () => {
        if (!defaultCharsWithBlobs) return;
        setIsLoading(true);
        try {
            await startGame(defaultCharsWithBlobs);
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
            const finalGuessRegex = /^(?:is it|is the character|is your? character)\s+(.*?)\??$/i;
            const guessMatch = question.trim().match(finalGuessRegex);

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
     * Handles the player's "Yes" or "No" answer to the AI's question and triggers AI eliminations.
     */
    const handlePlayerAnswer = useCallback(
        async (answer: "Yes" | "No") => {
            if (!lastAIQuestion) return;
            setMessages((prev) => [...prev, { sender: "PLAYER", text: answer }]);

            const finalGuessRegex = /^(?:is it|is the character|is your? character)\s+(.*?)\??$/i;
            const guessMatch = lastAIQuestion.trim().match(finalGuessRegex);

            if (guessMatch) {
                const guessedName = guessMatch[1].trim();
                const isActualGuess = aiRemainingChars.some(
                    (char) => char.name.toLowerCase() === guessedName.toLowerCase(),
                );

                if (isActualGuess) {
                    if (answer === "Yes") {
                        setWinner("AI");
                        setWinReason(`It correctly guessed your character was ${playerSecret?.name}.`);
                    } else {
                        setWinner("PLAYER");
                        setWinReason(`The AI guessed incorrectly! You win!`);
                    }
                    setGameState(GameState.GAME_OVER);
                    return;
                }
            }

            // Regular turn, process eliminations
            setIsLoading(true);
            setGameState(GameState.AI_PROCESSING);
            setAiThinkingChars(new Set(aiRemainingChars.map((c) => c.id)));
            try {
                const eliminatedIds = await geminiService.getEliminations(aiRemainingChars, lastAIQuestion, answer);
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

                if (newRemainingChars.length > 0) {
                    setGameState(GameState.PLAYER_TURN_ASKING);
                } else {
                    setWinner("PLAYER");
                    setWinReason(`The AI eliminated all its characters by mistake! You win!`);
                    setGameState(GameState.GAME_OVER);
                }
            } catch (error) {
                console.error("AI deduction error:", error);
                setMessages((prev) => [
                    ...prev,
                    { sender: "SYSTEM", text: "The AI had trouble processing. Your turn!" },
                ]);
                setGameState(GameState.PLAYER_TURN_ASKING);
            } finally {
                setIsLoading(false);
                setAiThinkingChars(new Set());
            }
        },
        [lastAIQuestion, aiRemainingChars, playerSecret],
    );

    // Effect to handle the AI's turn logic
    useEffect(() => {
        const handleAITurn = async () => {
            if (gameState !== GameState.AI_TURN) return;
            setIsLoading(true);

            try {
                if (aiRemainingChars.length === 1) {
                    const guess = `Is your character ${aiRemainingChars[0].name}?`;
                    setLastAIQuestion(guess);
                    setMessages((prev) => [...prev, { sender: "AI", text: guess }]);
                } else if (aiRemainingChars.length === 0) {
                    setWinner("PLAYER");
                    setWinReason("The AI ran out of characters to guess from!");
                    setGameState(GameState.GAME_OVER);
                    setIsLoading(false);
                    return;
                } else {
                    const question = await geminiService.generateAIQuestion(aiRemainingChars, messages);
                    setLastAIQuestion(question);
                    setMessages((prev) => [...prev, { sender: "AI", text: question }]);
                }
                setGameState(GameState.AI_TURN_WAITING_FOR_ANSWER);
            } catch (error) {
                console.error("AI question generation error:", error);
                setMessages((prev) => [
                    ...prev,
                    { sender: "SYSTEM", text: "The AI is having trouble thinking. Your turn!" },
                ]);
                setGameState(GameState.PLAYER_TURN_ASKING);
            } finally {
                setIsLoading(false);
            }
        };
        handleAITurn();
    }, [gameState, aiRemainingChars, messages]);

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
        aiThinkingChars,
        aiStatus,
        aiStatusMessage,
        downloadProgress,
        defaultCharsWithBlobs,
        hasCustomSet,

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
    };
};
