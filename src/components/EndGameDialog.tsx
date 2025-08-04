import { type ComponentPropsWithoutRef } from "react";
import { type GameWinner } from "../types";
import styles from "./EndGameDialog.module.css";

type EndGameDialogProps = ComponentPropsWithoutRef<"div"> & {
    winner: GameWinner;
    reason: string;
    onPlayAgain: () => void;
};

function EndGameDialog({ winner, reason, onPlayAgain, className, ...props }: EndGameDialogProps) {
    if (!winner) return null;

    const isPlayerWin = winner === "PLAYER";
    const title = isPlayerWin ? "🎉 You Win! 🎉" : "🤖 AI Wins! 🤖";
    const titleClass = isPlayerWin ? styles.winTitle : styles.loseTitle;

    return (
        <div className={`${styles.overlay} ${className || ""}`} {...props}>
            <div className={styles.dialog}>
                <h2 className={`${styles.title} ${titleClass}`}>{title}</h2>
                <p className={styles.reason}>{reason}</p>
                <button onClick={onPlayAgain} className={styles.playAgainButton}>
                    Play Again
                </button>
            </div>
        </div>
    );
}

export default EndGameDialog;
