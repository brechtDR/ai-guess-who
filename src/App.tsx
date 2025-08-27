
import styles from "./App.module.css";

import { useCallback, useEffect, useMemo, useState } from "react";

import ChatControls from "./components/ChatControls";
import CustomGameSetup from "./components/CustomGameSetup";
import EndGameDialog from "./components/EndGameDialog";
import GameBoard from "./components/GameBoard";
import GameSetup from "./components/GameSetup";
import { ChevronDownIcon, ChevronUpIcon } from "./components/icons";
import SecretCard from "./components/SecretCard";
import { DEFAULT_CHARACTERS } from "./constants";
import * as dbService from "./services/dbService";
import * as geminiService from "./services/geminiService";
import { AIStatus, GameState, type Character, type GameWinner, type Message } from "./types";

function App() {
    const [gameState, setGameState] = useState<GameState>(GameState.SETUP);
    const [activeCharacters, setActiveCharacters] = useState<Character[]>([]);
    const [playerSecret, setPlayerSecret] = useState<Character | null>(null);
    const [aiSecret, setAiSecret] = useState<Character | null>(null);
    const [aiRemainingChars, setAiRemainingChars] = useState<Character[]>([]);
    const [playerEliminatedChars, setPlayerEliminatedChars] = useState<Set<string>>(new Set());
    const [messages, setMessages] = useState<Message[]>([]);
    const [lastAIQuestion, setLastAIQuestion] = useState<string>("");
    const [winner, setWinner] = useState<GameWinner>(null);
    const [winReason, setWinReason] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSecretPanelVisible, setSecretPanelVisible] = useState(true);
    const [hasCustomSet, setHasCustomSet] = useState(false);

    // AI State
    const [aiStatus, setAiStatus] = useState<AIStatus>(AIStatus.INITIALIZING);
    const [aiStatusMessage, setAiStatusMessage] = useState<string>("Initializing AI...");
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [aiThinkingChars, setAiThinkingChars] = useState<Set<string>>(new Set());
    const [defaultCharsWithBlobs, setDefaultCharsWithBlobs] = useState<Character[] | null>(null);

    useEffect(() => {
        geminiService.initializeAI(
            (status, message) => {
                setAiStatus(status);
                if (message) setAiStatusMessage(message);
            },
            (progress) => {
                setDownloadProgress(progress);
            },
        );
    }, []);

    useEffect(() => {
        const loadData = async () => {
            if (aiStatus === AIStatus.READY && !defaultCharsWithBlobs) {
                const charactersWithBlobs = await geminiService.loadBlobsForDefaultCharacters(DEFAULT_CHARACTERS);
                setDefaultCharsWithBlobs(charactersWithBlobs);
            }
        };
        loadData();
    }, [aiStatus, defaultCharsWithBlobs]);

    useEffect(() => {
        // Check for a saved custom game when returning to the setup screen
        if (gameState === GameState.SETUP) {
            dbService.hasCustomCharacters().then(setHasCustomSet);
        }
    }, [gameState]);

    const startGame = useCallback((characterSet: Character[]) => {
        if (characterSet.some((c) => !c.imageBlob)) {
            setAiStatus(AIStatus.ERROR);
            setAiStatusMessage(
                "Cannot start game: Some character images are missing. Please try again or use the default set.",
            );
            setGameState(GameState.SETUP);
            return;
        }
        setActiveCharacters(characterSet);
        setAiRemainingChars(characterSet);
        setPlayerEliminatedChars(new Set());

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

    const handleStartWithCustomSet = async () => {
        setIsLoading(true);
        try {
            const customChars = await dbService.loadCustomCharacters();
            if (customChars && customChars.length > 0) {
                startGame(customChars);
            } else {
                // Should not happen if button is visible, but handle defensively
                setHasCustomSet(false);
                setMessages([{ sender: "SYSTEM", text: "Could not load custom character set." }]);
            }
        } catch (error) {
            console.error("Failed to load custom characters:", error);
            setMessages([{ sender: "SYSTEM", text: "Error loading custom characters." }]);
        } finally {
            setIsLoading(false);
        }
    };

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
// FIX: Corrected a typo in the GameState enum from PLAYER_TURN_ELIMINating to PLAYER_TURN_ELIMINATING.
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
                    // It's a question like "Is your character male?", not a guess.
                    await handleAsNormalQuestion();
                }
            } else {
                await handleAsNormalQuestion();
            }
            setIsLoading(false);
        },
        [aiSecret, activeCharacters],
    );

    const handleEndTurn = useCallback(() => {
        // FIX: Add the "AI is thinking" message here to prevent an infinite loop in the useEffect.
        setMessages((prev) => [...prev, { sender: "SYSTEM", text: "AI is thinking of a question..." }]);
        setGameState(GameState.AI_TURN);
    }, []);

    const handlePlayerAnswer = useCallback(
        async (answer: "Yes" | "No") => {
            if (!lastAIQuestion) return;
            setMessages((prev) => [...prev, { sender: "PLAYER", text: answer }]);

            // Handle AI's final guess
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
                        setGameState(GameState.GAME_OVER);
                    } else {
                        // AI guessed wrong, player wins.
                        setWinner("PLAYER");
                        setWinReason(`The AI guessed incorrectly! You win!`);
                        setGameState(GameState.GAME_OVER);
                    }
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

    useEffect(() => {
        const handleAITurn = async () => {
            if (gameState !== GameState.AI_TURN) return;
            setIsLoading(true);
            // FIX: Removed the `setMessages` call that was causing an infinite loop.

            try {
                // If only one character remains, the AI will make a final guess.
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

    const resetGame = () => {
        setGameState(GameState.SETUP);
        setActiveCharacters([]);
        setPlayerSecret(null);
        setAiSecret(null);
        setMessages([]);
        setDownloadProgress(null);
        // Re-trigger AI check on reset if it failed
        if (aiStatus === AIStatus.ERROR || aiStatus === AIStatus.UNAVAILABLE) {
            setAiStatus(AIStatus.INITIALIZING);
            geminiService.initializeAI(
                (status, message) => {
                    setAiStatus(status);
                    if (message) setAiStatusMessage(message);
                },
                (progress) => setDownloadProgress(progress),
            );
        }
    };

    const aiEliminatedChars = useMemo(() => {
        const remainingIds = new Set(aiRemainingChars.map((c) => c.id));
        return new Set(activeCharacters.filter((c) => !remainingIds.has(c.id)).map((c) => c.id));
    }, [aiRemainingChars, activeCharacters]);

    const renderContent = () => {
        switch (gameState) {
            case GameState.SETUP:
                return (
                    <GameSetup
                        onStartDefault={() => defaultCharsWithBlobs && startGame(defaultCharsWithBlobs)}
                        onStartCustom={() => setGameState(GameState.CUSTOM_SETUP)}
                        onStartWithCustomSet={handleStartWithCustomSet}
                        aiStatus={aiStatus}
                        aiStatusMessage={aiStatusMessage}
                        downloadProgress={downloadProgress}
                        hasDefaultChars={!!defaultCharsWithBlobs}
                        hasCustomSet={hasCustomSet}
                    />
                );
            case GameState.CUSTOM_SETUP:
                return <CustomGameSetup onStartGame={startGame} onBack={() => setGameState(GameState.SETUP)} />;
            case GameState.GAME_OVER:
            case GameState.PLAYER_TURN_ASKING:
            case GameState.PLAYER_TURN_ELIMINATING:
            case GameState.AI_TURN:
            case GameState.AI_TURN_WAITING_FOR_ANSWER:
            case GameState.AI_PROCESSING:
                if (!playerSecret || !aiSecret || activeCharacters.length === 0) {
                    return (
                        <div className={styles.errorContainer}>
                            Error: Game not initialized correctly.
                            <button onClick={resetGame} className={styles.restartButton}>
                                Restart
                            </button>
                        </div>
                    );
                }
                return (
                    <>
                        <div className={styles.gameContainer}>
                            {winner && <EndGameDialog winner={winner} reason={winReason} onPlayAgain={resetGame} />}
                            <div className={styles.mainGrid}>
                                <div
                                    className={`${styles.secretCardsPanel} ${
                                        !isSecretPanelVisible ? styles.secretCardsCollapsed : ""
                                    }`}
                                >
                                    <div className={styles.sidePanel}>
                                        <h2 className={styles.sidePanelTitlePlayer}>Your Card</h2>
                                        <SecretCard character={playerSecret} />
                                    </div>
                                    <div className={styles.sidePanel}>
                                        <h2 className={styles.sidePanelTitleAi}>AI's Card</h2>
                                        <SecretCard
                                            character={aiSecret}
                                            revealed={gameState === GameState.GAME_OVER}
                                        />
                                    </div>
                                </div>

                                <button
                                    className={styles.secretPanelToggle}
                                    onClick={() => setSecretPanelVisible((v) => !v)}
                                    aria-label={isSecretPanelVisible ? "Hide secret cards" : "Show secret cards"}
                                >
                                    {isSecretPanelVisible ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                    <span>{isSecretPanelVisible ? "Hide Cards" : "Show Cards"}</span>
                                </button>

                                <div className={styles.boardArea}>
                                    <div className={styles.boardWrapper}>
                                        <h2 className={styles.boardTitle}>AI's Board</h2>
                                        <GameBoard
                                            characters={activeCharacters}
                                            eliminatedChars={aiEliminatedChars}
                                            thinkingChars={aiThinkingChars}
                                        />
                                        <p className={styles.boardSubtext}>
                                            The AI eliminates characters from its own board.
                                        </p>
                                    </div>
                                    <div className={styles.boardWrapper}>
                                        <h2 className={styles.boardTitle}>Your Board</h2>
                                        <GameBoard
                                            characters={activeCharacters}
                                            eliminatedChars={playerEliminatedChars}
                                            onCardClick={(id) => {
                                                if (gameState === GameState.PLAYER_TURN_ELIMINATING) {
                                                    setPlayerEliminatedChars((prev) => {
                                                        const newSet = new Set(prev);
                                                        if (newSet.has(id)) {
                                                            newSet.delete(id);
                                                        } else {
                                                            newSet.add(id);
                                                        }
                                                        return newSet;
                                                    });
                                                }
                                            }}
                                        />
                                        <p className={styles.boardSubtext}>Click on cards to eliminate them.</p>
                                    </div>
                                </div>

                            </div>
                            <div className={styles.chatArea}>
                                <ChatControls
                                    messages={messages}
                                    gameState={gameState}
                                    isLoading={isLoading}
                                    onPlayerQuestion={handlePlayerQuestion}
                                    onEndTurn={handleEndTurn}
                                    onPlayerAnswer={handlePlayerAnswer}
                                />
                            </div>
                        </div>
                    </>
                );
        }
    };

    return <main className={styles.appContainer}>{renderContent()}</main>;
}

// FIX: Add default export to make the component available for import in other files.
export default App;
