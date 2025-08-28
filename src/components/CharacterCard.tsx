import React, { type ComponentPropsWithoutRef, useCallback } from "react";
import { type Character } from "../types";
import styles from "./CharacterCard.module.css";

// FIX: Changed ComponentPropsWithoutRef<"div"> to Omit<ComponentPropsWithoutRef<"div">, "onClick">
// to correctly override the onClick prop and avoid a type conflict.
export type CharacterCardProps = Omit<ComponentPropsWithoutRef<"div">, "onClick"> & {
    /** The character data to display. */
    character: Character;
    /** Whether the card is flipped over (eliminated). */
    isEliminated: boolean;
    /** Whether to show the "thinking" overlay. */
    isThinking?: boolean;
    /** Callback function when the card is clicked. */
    onClick: (id: string) => void;
};

/**
 * A card component that displays a character's image and name.
 * It can be flipped to show it has been eliminated.
 */
function CharacterCard({ character, isEliminated, isThinking, onClick, className, ...props }: CharacterCardProps) {
    const containerClasses = `${styles.flipContainer} ${isEliminated ? styles.isFlipped : ""}`;

    const handleClick = useCallback(() => {
        onClick(character.id);
    }, [character.id, onClick]);

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick(character.id);
            }
        },
        [character.id, onClick],
    );

    return (
        <div
            className={`${styles.perspectiveContainer} ${className || ""}`}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            aria-label={`Character card for ${character.name}. ${isEliminated ? "Eliminated." : "Active."}`}
            role="button"
            tabIndex={0}
            {...props}
        >
            <div className={containerClasses}>
                {/* Front */}
                <div className={styles.cardFace}>
                    <img src={character.image} alt={character.name} className={styles.cardImage} />
                    <div className={styles.cardNameWrapper}>
                        <p className={styles.cardName}>{character.name}</p>
                    </div>
                    {isThinking && <div className={styles.thinkingOverlay}></div>}
                </div>

                {/* Back */}
                <div className={`${styles.cardFace} ${styles.cardBack}`}>
                    <span>?</span>
                </div>
            </div>
        </div>
    );
}

export default React.memo(CharacterCard);
