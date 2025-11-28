// Wrap async functions to return [error, result]
export const safeAsync = async <T>(fn: () => Promise<T>): Promise<[Error | null, T | null]> => {
    try {
        const result = await fn();
        return [null, result];
    } catch (err) {
        return [err as Error, null];
    }
};
