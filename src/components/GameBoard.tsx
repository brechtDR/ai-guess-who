import { type Character } from "../types";
import CharacterCard from "./CharacterCard";
import styles from "./GameBoard.module.css";

export type GameBoardProps = {
    /** The full list of characters to display on the board. */
    characters: Character[];
    /** A set of IDs for characters that should be shown as eliminated. */
    eliminatedChars: Set<string>;
    /** A callback function for when a character card is clicked. */
    onCardClick?: (id: string) => void;
};

/**
 * Renders a grid of CharacterCard components for the game board.
 */
function GameBoard({ characters, eliminatedChars, onCardClick = () => {} }: GameBoardProps) {
    return (
        <div className={styles.boardContainer}>
            <div className={styles.boardGrid}>
                {characters.map((char) => (
                    <CharacterCard
                        key={char.id}
                        character={char}
                        isEliminated={eliminatedChars.has(char.id)}
                        onClick={onCardClick}
                    />
                ))}
            </div>
        </div>
    );
}

export default GameBoard;
