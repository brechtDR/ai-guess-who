/**
 * @file Contains type definitions for the experimental `window.ai.languageModel` API.
 */

/**
 * Type definition for a language model session.
 */
export type LanguageModelSession = {
    prompt(params: any): Promise<string>;
    destroy(): void;
};

/**
 * Type definition for the language model provider.
 */
export type LanguageModel = {
    create(options?: any): Promise<LanguageModelSession>;
    availability(): Promise<"available" | "downloadable" | "downloading" | "no">;
};

/**
 * Augments the global Window interface to include experimental AI APIs.
 */
declare global {
    interface Window {
        LanguageModel?: LanguageModel;
        ai?: {
            languageModel?: LanguageModel;
        };
    }
}
