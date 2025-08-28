import React, { type ComponentPropsWithoutRef, useEffect, useRef, useState } from "react";
import { AIStatus } from "../types";
import styles from "./GameSetup.module.css";
import { CameraIcon, CheckCircleIcon, PlayAgainIcon, SpinnerIcon, UsersIcon } from "./icons";

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

type GameSetupProps = {
    onStartDefault: () => void;
    onStartCustom: () => void;
    onStartWithCustomSet: () => void;
    aiStatus: AIStatus;
    aiStatusMessage: string;
    downloadProgress: number | null;
    hasDefaultChars: boolean;
    hasCustomSet: boolean;
    isLoading: boolean;
};

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
                <div className={`${styles.statusContainer} ${styles.statusComplete}`}>
                    <CheckCircleIcon />
                    <p className={styles.subtitle}>AI Model Ready!</p>
                </div>
            );
        }

        switch (aiStatus) {
            case AIStatus.INITIALIZING:
                return (
                    <div className={styles.statusContainer}>
                        <SpinnerIcon className={styles.spinner} />
                        <p className={styles.subtitle}>{aiStatusMessage}</p>
                    </div>
                );
            case AIStatus.DOWNLOADING:
                return (
                    <div className={styles.statusContainer}>
                        <p className={styles.subtitle}>{aiStatusMessage}</p>
                        {downloadProgress !== null && (
                            <div className={styles.progressWrapper}>
                                <div className={styles.progressBarContainer}>
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
                    <div className={styles.statusContainer}>
                        <p className={styles.errorText}>{aiStatusMessage}</p>
                    </div>
                );
            case AIStatus.READY:
                return !hasDefaultChars ? (
                    <div className={styles.statusContainer}>
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
                    description="Jump right in with a pre-defined set of 5 characters."
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
        </div>
    );
}

export default GameSetup;
