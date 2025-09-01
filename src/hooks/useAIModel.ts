import { useEffect, useState } from "react";
import { DEFAULT_CHARACTERS } from "../constants";
import * as geminiService from "../services/geminiService";
import { AIStatus, type Character } from "../types";

/**
 * Manages the AI model's lifecycle, including initialization, status, and data loading.
 */
export const useAIModel = () => {
    const [aiStatus, setAiStatus] = useState<AIStatus>(AIStatus.INITIALIZING);
    const [aiStatusMessage, setAiStatusMessage] = useState<string>("Initializing AI...");
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [defaultCharsWithBlobs, setDefaultCharsWithBlobs] = useState<Character[] | null>(null);

    const handleStatusChange = (status: AIStatus, message?: string) => {
        setAiStatus(status);
        if (message) setAiStatusMessage(message);
    };

    // Initialize the AI model on mount
    useEffect(() => {
        geminiService.initializeAI({
            onStatusChange: handleStatusChange,
            onProgress: setDownloadProgress,
        });
    }, []);

    // Load blobs for default characters once the AI is ready
    useEffect(() => {
        const loadData = async () => {
            if (aiStatus === AIStatus.READY && !defaultCharsWithBlobs) {
                const charactersWithBlobs = await geminiService.loadBlobsForDefaultCharacters(DEFAULT_CHARACTERS);
                setDefaultCharsWithBlobs(charactersWithBlobs);
            }
        };
        loadData();
    }, [aiStatus, defaultCharsWithBlobs]);

    const reinitializeAI = () => {
        setAiStatus(AIStatus.INITIALIZING);
        geminiService.initializeAI({
            onStatusChange: handleStatusChange,
            onProgress: setDownloadProgress,
        });
    };

    return {
        aiStatus,
        aiStatusMessage,
        downloadProgress,
        defaultCharsWithBlobs,
        setAiStatus,
        setAiStatusMessage,
        setDownloadProgress,
        reinitializeAI,
    };
};
