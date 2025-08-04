
import styles from "./CharacterCard.module.css";

import React, { type ComponentPropsWithoutRef } from "react";

import { type Character } from "../types";

type CharacterCardProps = Omit<ComponentPropsWithoutRef<"div">, "onClick"> & {
    character: Character;
    isEliminated: boolean;
    isThinking?: boolean;
    onClick: (id: string) => void;
};

function CharacterCard({ character, isEliminated, isThinking, onClick, className, ...props }: CharacterCardProps) {
    const containerClasses = `${styles.flipContainer} ${isEliminated ? styles.isFlipped : ""}`;

    return (
        <div
            className={`${styles.perspectiveContainer} ${className || ""}`}
            onClick={() => onClick(character.id)}
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
