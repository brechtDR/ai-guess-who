
import styles from "./GameSetup.module.css";

import React, { type ComponentPropsWithoutRef } from "react";

import { AIStatus } from "../types";
import { CameraIcon, UsersIcon } from "./icons";

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
    aiStatus: AIStatus;
    aiStatusMessage: string;
    downloadProgress: number | null;
    hasDefaultChars: boolean;
};

function GameSetup({
    onStartDefault,
    onStartCustom,
    aiStatus,
    aiStatusMessage,
    downloadProgress,
    hasDefaultChars,
}: GameSetupProps) {
    const isReady = aiStatus === AIStatus.READY;
    const defaultGameDisabled = !isReady || !hasDefaultChars;

    const renderStatus = () => {
        switch (aiStatus) {
            case AIStatus.INITIALIZING:
            case AIStatus.DOWNLOADING:
                return (
                    <div className={styles.statusContainer}>
                        <p className={styles.subtitle}>{aiStatusMessage}</p>
                        {aiStatus === AIStatus.DOWNLOADING && downloadProgress !== null && (
                            <div className={styles.progressBarContainer}>
                                <div className={styles.progressBar} style={{ width: `${downloadProgress}%` }}></div>
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
                return !hasDefaultChars ? <p className={styles.subtitle}>Loading character data...</p> : null;
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

            <div className={styles.optionsGrid}>
                <SetupOptionCard
                    title="Play Default Game"
                    description="Jump right in with a pre-defined set of 5 characters."
                    icon={<UsersIcon />}
                    onClick={onStartDefault}
                    disabled={defaultGameDisabled}
                />
                <SetupOptionCard
                    title="Create Custom Game"
                    description="Use your camera to create your own set of 5 characters."
                    icon={<CameraIcon />}
                    onClick={onStartCustom}
                    disabled={!isReady}
                />
            </div>
        </div>
    );
}

export default GameSetup;
