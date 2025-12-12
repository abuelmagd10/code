/// <reference types="next" />
/// <reference types="next/image-types/global" />

export {}

declare global {
  interface Window {
    gtag?: (
      command: 'config' | 'event' | 'js' | 'get' | 'consent' | 'set',
      ...args: any[]
    ) => void;
  }
}