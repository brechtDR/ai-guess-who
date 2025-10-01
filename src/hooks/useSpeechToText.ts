import { useCallback, useRef, useState } from "react";
import * as geminiService from "../services/buildInAIService.ts";

type UseSpeechToTextOptions = {
    onTranscription: (text: string) => void;
    onStateChange?: (state: "idle" | "recording" | "transcribing" | "error", message?: string) => void;
};

export const useSpeechToText = ({ onTranscription, onStateChange }: UseSpeechToTextOptions) => {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    }, []);

    const toggleRecording = useCallback(async () => {
        if (isRecording) {
            stopRecording();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            onStateChange?.("recording");
            setIsRecording(true);
            audioChunksRef.current = [];

            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            recorder.onstop = async () => {
                setIsRecording(false);
                onStateChange?.("transcribing");
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

                try {
                    const transcribedText = await geminiService.transcribeAudio(audioBlob);
                    onTranscription(transcribedText);
                    onStateChange?.("idle");
                } catch (error) {
                    console.error("Transcription error:", error);
                    onStateChange?.("error", "Failed to transcribe audio.");
                } finally {
                    stream.getTracks().forEach((track) => track.stop());
                }
            };

            recorder.start();
        } catch (err) {
            console.error("Microphone access error:", err);
            setIsRecording(false);
            onStateChange?.("error", "Microphone access denied.");
        }
    }, [isRecording, stopRecording, onTranscription, onStateChange]);

    return { isRecording, toggleRecording };
};
