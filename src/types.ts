
export type Character = {
    id: string;
    name: string;
    image: string; // This will be a URL or a base64 string
    imageBlob?: Blob; // The actual image data for the AI
};

export type Message = {
    sender: "PLAYER" | "AI" | "SYSTEM";
    text: string;
};

export enum GameState {
    SETUP,
    CUSTOM_SETUP,
    PLAYER_TURN_ASKING,
    PLAYER_TURN_ELIMINATING,
    AI_TURN,
    AI_TURN_WAITING_FOR_ANSWER,
    AI_PROCESSING,
    GAME_OVER,
}

export type GameWinner = "PLAYER" | "AI" | null;

export enum AIStatus {
    INITIALIZING,
    DOWNLOADING,
    READY,
    UNAVAILABLE,
    ERROR,
}
