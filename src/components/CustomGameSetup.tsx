import { useCallback, useEffect, useRef, useState } from "react";
import * as dbService from "../services/dbService";
import { type Character } from "../types";
import styles from "./CustomGameSetup.module.css";

export type CustomGameSetupProps = {
    /** Callback to start the game with the newly created characters. */
    onStartGame: (characters: Character[]) => void;
    /** Callback to return to the main setup screen. */
    onBack: () => void;
};

/**
 * A component that allows players to create a custom set of characters using their device's camera.
 */
function CustomGameSetup({ onStartGame, onBack }: CustomGameSetupProps) {
    const [characters, setCharacters] = useState<Character[]>([]);
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const cleanupCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => {
        const setupCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                streamRef.current = stream;
            } catch (err) {
                setError("Could not access camera. Please grant permission and try again.");
                console.error("Camera access error:", err);
            }
        };
        setupCamera();
        return cleanupCamera;
    }, [cleanupCamera]);

    const takePhoto = () => {
        if (characters.length >= 5 || !videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Resize image for performance
        const MAX_DIMENSION = 512;
        const { videoWidth, videoHeight } = video;
        const aspectRatio = videoWidth / videoHeight;

        if (videoWidth > videoHeight) {
            canvas.width = MAX_DIMENSION;
            canvas.height = MAX_DIMENSION / aspectRatio;
        } else {
            canvas.height = MAX_DIMENSION;
            canvas.width = MAX_DIMENSION * aspectRatio;
        }

        // Flip the image horizontally for a mirror effect
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const personName = prompt(`Enter a name for this person:`, `Person ${characters.length + 1}`);
        if (!personName) return;

        canvas.toBlob(
            (blob) => {
                if (!blob) return;
                const imageUrl = URL.createObjectURL(blob);
                const newChar: Character = {
                    id: `custom_${Date.now()}`,
                    name: personName,
                    image: imageUrl,
                    imageBlob: blob,
                };
                setCharacters((prev) => [...prev, newChar]);
            },
            "image/jpeg",
            0.9,
        );
    };

    const removeCharacter = (id: string) => {
        setCharacters((prev) =>
            prev.filter((char) => {
                if (char.id === id) {
                    URL.revokeObjectURL(char.image); // Clean up blob URL
                    return false;
                }
                return true;
            }),
        );
    };

    const handleStartGame = async () => {
        cleanupCamera();
        try {
            await dbService.saveCustomCharacters(characters);
        } catch (e) {
            console.error("Failed to save custom characters", e);
            // Non-critical error, so we can still proceed with the game
        }
        onStartGame(characters);
    };

    const isComplete = characters.length === 5;

    return (
        <div className={styles.container}>
            <h2 className={styles.title}>Create 5 Custom Characters</h2>
            {error && (
                <p className={styles.error} role="alert">
                    {error}
                </p>
            )}

            <div className={styles.cameraContainer}>
                <video ref={videoRef} autoPlay playsInline muted className={styles.videoFeed}></video>
                <canvas ref={canvasRef} className={styles.canvas}></canvas>
            </div>

            <button onClick={takePhoto} disabled={characters.length >= 5} className={styles.photoButton}>
                Take Photo
            </button>

            <div className={styles.grid}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className={styles.slot}>
                        {characters[i] ? (
                            <div className={styles.photoWrapper}>
                                <img src={characters[i].image} alt={characters[i].name} className={styles.photo} />
                                <div className={styles.photoOverlay}>
                                    <button
                                        onClick={() => removeCharacter(characters[i].id)}
                                        className={styles.removeButton}
                                        aria-label={`Remove ${characters[i].name}`}
                                    >
                                        Remove
                                    </button>
                                </div>
                                <p className={styles.photoName}>{characters[i].name}</p>
                            </div>
                        ) : (
                            <span className={styles.plusSign}>+</span>
                        )}
                    </div>
                ))}
            </div>

            <div className={styles.controls}>
                <button
                    onClick={handleStartGame}
                    disabled={!isComplete}
                    className={`${styles.controlButton} ${styles.startButton}`}
                >
                    Start Game
                </button>
                <button onClick={onBack} className={`${styles.controlButton} ${styles.backButton}`}>
                    Back to Menu
                </button>
            </div>
        </div>
    );
}

export default CustomGameSetup;
