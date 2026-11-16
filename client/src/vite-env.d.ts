/// <reference types="vite/client" />

import type { SaviaBridge } from './shared/types';

declare global {
  interface Window {
    savia: SaviaBridge;
    saviaClient?: {
      appName: string;
      platform: string;
    };
  }
}

export {};
