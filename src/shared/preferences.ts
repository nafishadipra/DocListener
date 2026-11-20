import { DEFAULT_PREFERENCES, type UserPreferences } from './types';

const STORAGE_KEY = 'doclistener_preferences';

/**
 * Clamp narration speed to safe chrome.tts bounds (0.5x to 2.0x).
 */
export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) {
    return DEFAULT_PREFERENCES.rate;
  }
  return Math.min(2.0, Math.max(0.5, Math.round(rate * 100) / 100));
}

/**
 * Load user preferences from chrome.storage.local without any remote sync.
 */
export async function loadPreferences(): Promise<UserPreferences> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const saved = stored[STORAGE_KEY] as Partial<UserPreferences> | undefined;

    if (!saved) {
      return { ...DEFAULT_PREFERENCES };
    }

    return {
      rate: clampRate(saved.rate ?? DEFAULT_PREFERENCES.rate),
      voiceName: typeof saved.voiceName === 'string' ? saved.voiceName : '',
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Persist user preferences locally in chrome.storage.local.
 */
export async function savePreferences(preferences: UserPreferences): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }

  const sanitized: UserPreferences = {
    rate: clampRate(preferences.rate),
    voiceName: preferences.voiceName,
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: sanitized });
}
