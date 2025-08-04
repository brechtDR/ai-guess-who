
import styles from "./GameBoard.module.css";

import React from "react";

import CharacterCard from "./CharacterCard";
import { type Character } from "../types";

type GameBoardProps = {
    characters: Character[];
    eliminatedChars: Set<string>;
    onCardClick?: (id: string) => void;
    thinkingChars?: Set<string>;
};

function GameBoard({
    characters,
    eliminatedChars,
    onCardClick = () => {},
    thinkingChars = new Set(),
}: GameBoardProps) {
    return (
        <div className={styles.boardContainer}>
            <div className={styles.boardGrid}>
                {characters.map((char) => (
                    <CharacterCard
                        key={char.id}
                        character={char}
                        isEliminated={eliminatedChars.has(char.id)}
                        isThinking={thinkingChars.has(char.id)}
                        onClick={onCardClick}
                    />
                ))}
            </div>
        </div>
    );
}

export default GameBoard;
