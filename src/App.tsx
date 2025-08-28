import { useMemo, useState } from "react";
import styles from "./App.module.css";
import ChatControls from "./components/ChatControls";
import CustomGameSetup from "./components/CustomGameSetup";
import EndGameDialog from "./components/EndGameDialog";
import GameBoard from "./components/GameBoard";
import GameSetup from "./components/GameSetup";
import SecretCard from "./components/SecretCard";
import { ChevronDownIcon, ChevronUpIcon } from "./components/icons";
import { useGameLogic } from "./hooks/useGameLogic";
import { GameState } from "./types";

function App() {
    const [isSecretPanelVisible, setSecretPanelVisible] = useState(true);

    const {
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
    } = useGameLogic();

    const aiEliminatedChars = useMemo(() => {
        const remainingIds = new Set(aiRemainingChars.map((c) => c.id));
        return new Set(activeCharacters.filter((c) => !remainingIds.has(c.id)).map((c) => c.id));
    }, [aiRemainingChars, activeCharacters]);

    const renderContent = () => {
        switch (gameState) {
            case GameState.SETUP:
                return (
                    <GameSetup
                        onStartDefault={handleStartDefault}
                        onStartCustom={() => setGameState(GameState.CUSTOM_SETUP)}
                        onStartWithCustomSet={handleStartWithCustomSet}
                        aiStatus={aiStatus}
                        aiStatusMessage={aiStatusMessage}
                        downloadProgress={downloadProgress}
                        hasDefaultChars={!!defaultCharsWithBlobs}
                        hasCustomSet={hasCustomSet}
                        isLoading={isLoading}
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
                                        <SecretCard character={aiSecret} revealed={gameState === GameState.GAME_OVER} />
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

export default App;
