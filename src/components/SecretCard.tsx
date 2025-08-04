
import styles from "./SecretCard.module.css";

import React from "react";

import { type Character } from "../types";

type SecretCardProps = {
    character: Character;
    revealed?: boolean;
};

function SecretCard({ character, revealed = true }: SecretCardProps) {
    return (
        <div className={styles.cardContainer}>
            {revealed ? (
                <>
                    <img src={character.image} alt={character.name} className={styles.cardImage} />
                    <div className={styles.cardNameWrapper}>
                        <p className={styles.cardName}>{character.name}</p>
                    </div>
                </>
            ) : (
                <div className={styles.placeholder}>
                    <span>?</span>
                </div>
            )}
        </div>
    );
}

export default SecretCard;
