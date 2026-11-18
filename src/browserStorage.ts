const temporaryStorage = new Map<string, string>();

// Some embedded game players block access to localStorage.
export const browserStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return temporaryStorage.get(key) ?? null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      temporaryStorage.set(key, value);
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      temporaryStorage.delete(key);
    }
  },
};
