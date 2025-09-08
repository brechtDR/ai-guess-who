# AI Guess Who?

A modern, privacy-focused take on the classic "Guess Who?" board game, where you challenge a powerful AI that runs entirely in your browser. This project showcases the capabilities of the experimental on-device Generative AI API.

## About The Project

This isn't your average web game. "AI Guess Who?" brings the classic deductive reasoning game to life with a unique twist: your opponent is a Gemini Nano AI model that lives on your device.

**Key Features:**

- **On-Device AI**: All AI processing happens locally in your browser. No data is ever sent to a server, ensuring 100% privacy.
- **Offline Play**: Once the AI model is downloaded, the game is fully playable without an internet connection.
- **Custom Games**: Use your device's camera to create your own set of characters and challenge the AI with familiar faces. Your custom sets are saved in the browser for easy reuse.
- **Voice Input**: Ask your questions hands-free using your microphone, powered by the AI's multi-modal capabilities.
- **Strategic AI Opponent**: The AI doesn't just answer questions; it analyzes the board to ask strategically sound questions designed to eliminate the most characters at once.

## Getting Started

Because this project uses experimental web technology, a specific browser and configuration are required to run it.

### Prerequisites

1.  **Browser**: You must use a browser that supports the on-device `LanguageModel` API, such as **Google Chrome Canary**.
2.  **Enable Feature Flags**: Open your Chrome Canary browser and enable the following two flags by copying and pasting the URLs into your address bar, setting them to "Enabled", and restarting the browser.

- `chrome://flags/#prompt-api-for-gemini-nano` (enabled)
- `chrome://flags/#optimization-guide-on-device-model` (place in bypass)
- `chrome://flags/#enable-experimental-web-platform-features` (enabled)

### First-Time Setup

The first time you load the application, it will need to download the on-device AI model (a few hundred megabytes). A progress bar will be displayed. This is a one-time process.

### Installation & Running

1.  Clone the repository
2.  Install NPM packages:
    ```sh
    npm install
    ```
3.  Run the development server:
    ```sh
    npm run dev
    ```
    The application will be available at `http://localhost:5173` (or another port if 5173 is in use).

## Available Scripts

In the project directory, you can run:

- `npm run dev`
- Runs the app in development mode using Vite. Open your browser to the local server address to view it.
- `npm run format`
- Formats all project files using Prettier according to the defined style rules.
