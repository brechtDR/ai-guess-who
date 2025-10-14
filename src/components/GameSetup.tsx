import React, { type ComponentPropsWithoutRef, useEffect, useRef, useState } from "react";
import { AIStatus } from "../types";
import styles from "./GameSetup.module.css";
import { CameraIcon, CheckCircleIcon, DownloadIcon, PlayAgainIcon, SpinnerIcon, UsersIcon } from "./icons";

type SetupOptionCardProps = ComponentPropsWithoutRef<"button"> & {
    title: string;
    description: string;
    icon: React.ReactNode;
};

function SetupOptionCard({ title, description, icon, ...props }: SetupOptionCardProps) {
    return (
        <button className={styles.optionCard} {...props}>
            <div className={styles.iconWrapper}>{icon}</div>
            <h3 className={styles.cardTitle}>{title}</h3>
            <p className={styles.cardDescription}>{description}</p>
        </button>
    );
}

export type GameSetupProps = {
    /** Callback to start the game with default characters. */
    onStartDefault: () => void;
    /** Callback to navigate to the custom game creation screen. */
    onStartCustom: () => void;
    /** Callback to start with a previously saved custom character set. */
    onStartWithCustomSet: () => void;
    /** The current status of the AI model. */
    aiStatus: AIStatus;
    /** A message describing the current AI status. */
    aiStatusMessage: string;
    /** The download progress of the AI model (0-100). */
    downloadProgress: number | null;
    /** Whether the default character data (with blobs) has been loaded. */
    hasDefaultChars: boolean;
    /** Whether a custom character set has been saved by the user. */
    hasCustomSet: boolean;
    /** Whether the app is in a general loading state. */
    isLoading: boolean;
    /** Whether the AI analysis review mode is enabled. */
    isReviewModeEnabled: boolean;
    /** Callback to set the AI analysis review mode. */
    onSetReviewMode: (isEnabled: boolean) => void;
    /** Callback to initiate the AI model download. */
    onDownload: () => void;
};

/**
 * The initial setup screen where the player can choose the game mode.
 * It also displays the loading status of the on-device AI model.
 */
function GameSetup({
    onStartDefault,
    onStartCustom,
    onStartWithCustomSet,
    aiStatus,
    aiStatusMessage,
    downloadProgress,
    hasDefaultChars,
    hasCustomSet,
    isLoading,
    isReviewModeEnabled,
    onSetReviewMode,
    onDownload,
}: GameSetupProps) {
    const isReady = aiStatus === AIStatus.READY;
    const defaultGameDisabled = !isReady || !hasDefaultChars || isLoading;
    const customGameDisabled = !isReady || isLoading;

    const [showComplete, setShowComplete] = useState(false);
    const prevAiStatus = useRef(aiStatus);

    useEffect(() => {
        if (prevAiStatus.current === AIStatus.DOWNLOADING && aiStatus === AIStatus.READY) {
            setShowComplete(true);
            const timer = setTimeout(() => setShowComplete(false), 2000);
            return () => clearTimeout(timer);
        }
        prevAiStatus.current = aiStatus;
    }, [aiStatus]);

    const renderStatus = () => {
        if (showComplete) {
            return (
                <div className={`${styles.statusContainer} ${styles.statusComplete}`} role="status">
                    <CheckCircleIcon />
                    <p className={styles.subtitle}>AI Model Ready!</p>
                </div>
            );
        }

        switch (aiStatus) {
            case AIStatus.DOWNLOADABLE:
                return (
                    <div className={styles.statusContainer} role="status">
                        <p className={`${styles.subtitle} ${styles.downloadPrompt}`}>{aiStatusMessage}</p>
                        <button onClick={onDownload} className={styles.downloadButton}>
                            <DownloadIcon />
                            Download AI Model
                        </button>
                    </div>
                );
            case AIStatus.INITIALIZING:
            case AIStatus.DOWNLOADING:
                return (
                    <div className={styles.statusContainer} role="status">
                        {aiStatus === AIStatus.INITIALIZING && <SpinnerIcon className={styles.spinner} />}
                        <p className={styles.subtitle}>{aiStatusMessage}</p>
                        {aiStatus === AIStatus.DOWNLOADING && downloadProgress !== null && (
                            <div className={styles.progressWrapper}>
                                <div
                                    className={styles.progressBarContainer}
                                    aria-label={`Downloading AI Model: ${Math.floor(downloadProgress)}%`}
                                    aria-valuenow={downloadProgress}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                >
                                    <div className={styles.progressBar} style={{ width: `${downloadProgress}%` }}></div>
                                </div>
                                <span className={styles.progressPercentage}>{Math.floor(downloadProgress)}%</span>
                            </div>
                        )}
                    </div>
                );
            case AIStatus.UNAVAILABLE:
            case AIStatus.ERROR:
                return (
                    <div className={styles.statusContainer} role="alert">
                        <p className={styles.errorText}>{aiStatusMessage}</p>
                    </div>
                );
            case AIStatus.READY:
                return !hasDefaultChars ? (
                    <div className={styles.statusContainer} role="status">
                        <SpinnerIcon className={styles.spinner} />
                        <p className={styles.subtitle}>Loading character data...</p>
                    </div>
                ) : null;
            default:
                return null;
        }
    };

    return (
        <div className={styles.setupContainer}>
            <div className={styles.titleContainer}>
                <h1 className={styles.mainTitle}>AI Guess Who?</h1>
                <p className={styles.subtitle}>Challenge the AI in the classic guessing game.</p>
            </div>

            {renderStatus()}

            <div className={`${styles.optionsGrid} ${hasCustomSet ? styles.hasThree : ""}`}>
                <SetupOptionCard
                    title="Play Default Game"
                    description="Jump right in with a random set of 5 characters."
                    icon={<UsersIcon />}
                    onClick={onStartDefault}
                    disabled={defaultGameDisabled}
                />
                {hasCustomSet && (
                    <SetupOptionCard
                        title="Play With Custom Set"
                        description="Use the last set of characters you created."
                        icon={<PlayAgainIcon />}
                        onClick={onStartWithCustomSet}
                        disabled={customGameDisabled}
                    />
                )}
                <SetupOptionCard
                    title="Create Custom Game"
                    description="Use your camera to create your own set of 5 characters."
                    icon={<CameraIcon />}
                    onClick={onStartCustom}
                    disabled={customGameDisabled}
                />
            </div>

            <div className={styles.settingsContainer}>
                <h3 className={styles.settingsTitle}>Game Options</h3>
                <label className={styles.settingLabel}>
                    <input
                        type="checkbox"
                        className={styles.settingCheckbox}
                        checked={isReviewModeEnabled}
                        onChange={(e) => onSetReviewMode(e.target.checked)}
                        disabled={!isReady}
                    />
                    Enable AI Analysis Review
                </label>
                <p className={styles.settingDescription}>
                    See how the AI analyzes its board before you answer. This makes the game more transparent but adds
                    an extra step to the AI's turn.
                </p>
            </div>
        </div>
    );
}

export default GameSetup;