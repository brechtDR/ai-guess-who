import { useCallback, useEffect, useState } from "react";
import * as dbService from "../services/dbService";
import { GameState } from "../types";

const REVIEW_MODE_STORAGE_KEY = "ai-guess-who-review-mode";

/**
 * Manages user-configurable game settings and checks for saved custom data.
 */
export const useGameSettings = (gameState: GameState) => {
    const [isReviewModeEnabled, setIsReviewModeEnabled] = useState<boolean>(() => {
        try {
            const storedValue = localStorage.getItem(REVIEW_MODE_STORAGE_KEY);
            return storedValue ? JSON.parse(storedValue) : true;
        } catch {
            return true;
        }
    });
    const [hasCustomSet, setHasCustomSet] = useState(false);

    // Check for a saved custom game when returning to the setup screen
    useEffect(() => {
        if (gameState === GameState.SETUP) {
            dbService.hasCustomCharacters().then(setHasCustomSet);
        }
    }, [gameState]);

    const handleSetReviewMode = useCallback((isEnabled: boolean) => {
        setIsReviewModeEnabled(isEnabled);
        try {
            localStorage.setItem(REVIEW_MODE_STORAGE_KEY, JSON.stringify(isEnabled));
        } catch (e) {
            console.error("Failed to save review mode setting", e);
        }
    }, []);

    return {
        isReviewModeEnabled,
        hasCustomSet,
        setHasCustomSet,
        handleSetReviewMode,
    };
};
