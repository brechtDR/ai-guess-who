import { type Character } from "../types";

const DB_NAME = "ai-guess-who-db";
const DB_VERSION = 1;
const STORE_NAME = "custom-characters";

type StoredCharacter = {
    id: string;
    name: string;
    imageBlob: Blob;
};

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject("Error opening database");
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
        };
    });
}

export async function saveCustomCharacters(characters: Character[]): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // Clear existing characters before saving the new set
    store.clear();

    characters.forEach((char) => {
        if (char.imageBlob) {
            const charToStore: StoredCharacter = {
                id: char.id,
                name: char.name,
                imageBlob: char.imageBlob,
            };
            store.add(charToStore);
        }
    });

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            db.close();
            resolve();
        };
        transaction.onerror = () => {
            db.close();
            reject("Transaction error while saving characters");
        };
    });
}

export async function loadCustomCharacters(): Promise<Character[] | null> {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            const storedChars = request.result as StoredCharacter[];
            if (!storedChars || storedChars.length === 0) {
                db.close();
                resolve(null);
                return;
            }

            const characters: Character[] = storedChars.map((char) => ({
                ...char,
                image: URL.createObjectURL(char.imageBlob),
            }));
            db.close();
            resolve(characters);
        };
        request.onerror = () => {
            db.close();
            reject("Error loading characters from database");
        };
    });
}

export async function hasCustomCharacters(): Promise<boolean> {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();

    return new Promise((resolve, reject) => {
        request.onsuccess = () => {
            db.close();
            resolve(request.result > 0);
        };
        request.onerror = () => {
            db.close();
            reject("Error checking for custom characters");
        };
    });
}
