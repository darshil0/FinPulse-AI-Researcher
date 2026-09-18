import '@testing-library/jest-dom';

// Mock crypto.randomUUID if not available in jsdom environment
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {},
  });
}

if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () =>
    '10000000-1000-4000-8000-100000000000' as `${string}-${string}-${string}-${string}-${string}`;
}
