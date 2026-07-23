import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Reset the DOM between tests so each runs in isolation.
afterEach(() => {
  cleanup();
});
