import React, { type ComponentPropsWithoutRef, useCallback } from "react";
import { type Character } from "../types";
import styles from "./CharacterCard.module.css";
import { CheckIcon, XIcon } from "./icons";

export type CharacterCardProps = Omit<ComponentPropsWithoutRef<"div">, "onClick"> & {
    /** The character data to display. */
    character: Character;
    /** Whether the card is flipped over (eliminated). */
    isEliminated: boolean;
    /** Callback function when the card is clicked. */
    onClick: (id: string) => void;
    /** The result of the AI's analysis for this card (true/false). */
    analysisResult?: boolean | null;
};

/**
 * A card component that displays a character's image and name.
 * It can be flipped to show it has been eliminated.
 */
function CharacterCard({ character, isEliminated, onClick, analysisResult, className, ...props }: CharacterCardProps) {
    const containerClasses = `${styles.flipContainer} ${isEliminated ? styles.isFlipped : ""}`;

    const handleClick = useCallback(() => {
        onClick(character.character_id);
    }, [character.character_id, onClick]);

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick(character.character_id);
            }
        },
        [character.character_id, onClick],
    );

    const renderAnalysisOverlay = () => {
        if (analysisResult === null || analysisResult === undefined) return null;

        const icon = analysisResult ? <CheckIcon /> : <XIcon />;
        const overlayClass = analysisResult ? styles.analysisOverlayPositive : styles.analysisOverlayNegative;
        const label = analysisResult
            ? "AI thinks this character HAS the feature."
            : "AI thinks this character DOES NOT have the feature.";

        return (
            <div className={`${styles.analysisOverlay} ${overlayClass}`} aria-label={label}>
                {icon}
            </div>
        );
    };

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
                    {renderAnalysisOverlay()}
                    <div className={styles.cardNameWrapper}>
                        <p className={styles.cardName}>{character.name}</p>
                    </div>
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
