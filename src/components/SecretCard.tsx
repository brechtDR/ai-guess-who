import { type Character } from "../types";
import styles from "./SecretCard.module.css";

export type SecretCardProps = {
    /** The character for the secret card. */
    character: Character;
    /** Whether to reveal the character's image and name. Defaults to true. */
    revealed?: boolean;
};

/**
 * A component to display the player's or AI's secret character card.
 * It can be shown as a revealed card or a hidden placeholder.
 */
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
                <div className={styles.placeholder} aria-label="Hidden AI character card">
                    <span>?</span>
                </div>
            )}
        </div>
    );
}

export default SecretCard;
