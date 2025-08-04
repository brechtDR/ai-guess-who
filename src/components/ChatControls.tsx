
import styles from "./ChatControls.module.css";

import React, { useEffect, useRef, useState } from "react";

import { useSpeechToText } from "../hooks/useSpeechToText";
import { GameState, type Message } from "../types";
import { MicIcon, SendIcon, StopIcon } from "./icons";

type ChatControlsProps = {
    messages: Message[];
    gameState: GameState;
    isLoading: boolean;
    onPlayerQuestion: (question: string) => void;
    onEndTurn: () => void;
    onPlayerAnswer: (answer: "Yes" | "No") => void;
};

function ChatControls({
    messages,
    gameState,
    isLoading,
    onPlayerQuestion,
    onEndTurn,
    onPlayerAnswer,
}: ChatControlsProps) {
    const [inputValue, setInputValue] = useState("");
    const chatLogRef = useRef<HTMLDivElement>(null);

    const [micStatus, setMicStatus] = useState<"idle" | "recording" | "transcribing" | "error">("idle");

    const { isRecording, toggleRecording } = useSpeechToText({
        onTranscription: (text) => {
            setInputValue(text);
        },
        onStateChange: (state) => {
            setMicStatus(state);
        },
    });

    useEffect(() => {
        if (chatLogRef.current) {
            chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputValue.trim() && !isLoading) {
            onPlayerQuestion(inputValue);
            setInputValue("");
        }
    };

    const renderMessage = (msg: Message, index: number) => {
        let messageStyle;
        switch (msg.sender) {
            case "PLAYER":
                messageStyle = styles.playerMessage;
                break;
            case "AI":
                messageStyle = styles.aiMessage;
                break;
            case "SYSTEM":
            default:
                messageStyle = styles.systemMessage;
                break;
        }
        return (
            <div key={index} className={`${styles.message} ${messageStyle}`}>
                {msg.text}
            </div>
        );
    };

    const showInputForm = gameState === GameState.PLAYER_TURN_ASKING;
    const showEndTurnButton = gameState === GameState.PLAYER_TURN_ELIMINATING;
    const showAnswerButtons = gameState === GameState.AI_TURN_WAITING_FOR_ANSWER;

    const isTranscribing = micStatus === "transcribing";

    return (
        <div className={styles.controlsContainer}>
            <div ref={chatLogRef} className={styles.chatLog}>
                {messages.map(renderMessage)}
                {(isLoading || isTranscribing) && (
                    <div className={`${styles.message} ${styles.systemMessage} ${styles.loadingMessage}`}>
                        {isTranscribing ? "Transcribing..." : "Processing..."}
                    </div>
                )}
            </div>

            <div className={styles.actionsContainer}>
                {showInputForm && (
                    <form onSubmit={handleSubmit} className={styles.inputForm}>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Ask a question..."
                            className={styles.textInput}
                            disabled={isLoading || isRecording}
                        />
                        <button
                            type="button"
                            onClick={toggleRecording}
                            className={`${styles.iconButton} ${isRecording ? styles.micRecording : styles.micIdle}`}
                            title={isRecording ? "Stop recording" : "Ask with voice"}
                            disabled={isLoading}
                        >
                            {isRecording ? <StopIcon /> : <MicIcon />}
                        </button>
                        <button
                            type="submit"
                            className={`${styles.iconButton} ${styles.sendButton}`}
                            disabled={isLoading || !inputValue || isRecording}
                        >
                            <SendIcon />
                        </button>
                    </form>
                )}

                {showEndTurnButton && (
                    <button
                        onClick={onEndTurn}
                        className={`${styles.actionButton} ${styles.endTurnButton}`}
                        disabled={isLoading}
                    >
                        End Turn
                    </button>
                )}

                {showAnswerButtons && (
                    <div className={styles.answerButtons}>
                        <button
                            onClick={() => onPlayerAnswer("Yes")}
                            className={`${styles.actionButton} ${styles.yesButton}`}
                            disabled={isLoading}
                        >
                            Yes
                        </button>
                        <button
                            onClick={() => onPlayerAnswer("No")}
                            className={`${styles.actionButton} ${styles.noButton}`}
                            disabled={isLoading}
                        >
                            No
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ChatControls;
