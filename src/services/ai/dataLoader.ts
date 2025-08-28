/**
 * @file Handles data loading and preparation tasks for the AI service.
 */
import { type Character } from "../../types";

/**
 * Fetches and converts image URLs for the default characters into Blobs.
 * This is necessary for the on-device model to process the images.
 * @param characters The array of default characters.
 * @returns A promise that resolves to the characters array with `imageBlob` properties populated.
 */
export async function loadBlobsForDefaultCharacters(characters: Character[]): Promise<Character[]> {
    return Promise.all(
        characters.map(async (char) => {
            if (char.imageBlob) return char;
            try {
                const response = await fetch(char.image);
                if (!response.ok) throw new Error(`Failed to fetch ${char.image}`);
                const blob = await response.blob();
                return { ...char, imageBlob: blob };
            } catch (error) {
                console.error(`Could not load image for ${char.name}:`, error);
                return char; // Return character without blob on error
            }
        }),
    );
}
