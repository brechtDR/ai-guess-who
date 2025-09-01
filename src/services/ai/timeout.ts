/**
 * @file Provides a timeout utility for promises.
 */

/**
 * Custom error for timeout operations.
 */
export class TimeoutError extends Error {
    constructor(message = "Operation timed out") {
        super(message);
        this.name = "TimeoutError";
    }
}

/**
 * Wraps a promise with a timeout.
 * @param promise The promise to wrap.
 * @param ms The timeout in milliseconds.
 * @returns A new promise that rejects with a TimeoutError if the original promise doesn't resolve or reject in time.
 */
export function promiseWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new TimeoutError(`Operation timed out after ${ms} ms`));
        }, ms);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((reason) => {
                clearTimeout(timer);
                reject(reason);
            });
    });
}
