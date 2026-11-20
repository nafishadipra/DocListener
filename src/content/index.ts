import { extractDocument } from './extractor';
import type { ExtractionResult } from '../shared/types';

declare global {
  interface Window {
    __DOCLISTENER_EXTRACT__?: () => ExtractionResult;
  }
}

/**
 * Expose a single idempotent extraction entry point on the active tab.
 * Invoked on demand by the background service worker via chrome.scripting.executeScript.
 */
window.__DOCLISTENER_EXTRACT__ = () => {
  return extractDocument(document, window.location.href);
};
