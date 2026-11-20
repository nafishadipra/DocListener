import { PlaybackController } from '../shared/playbackController';
import { clampRate, loadPreferences, savePreferences } from '../shared/preferences';
import {
  DEFAULT_PREFERENCES,
  type ExtensionMessage,
  type ExtractionResult,
  type ReaderState,
} from '../shared/types';
import { getRestrictedUrlReason } from './urlGuard';

const controller = new PlaybackController();

let state: ReaderState = {
  doc: null,
  loadedTabId: null,
  playback: controller.getSnapshot(),
  preferences: { ...DEFAULT_PREFERENCES },
  isExtracting: false,
  needsPermission: false,
  extractionError: null,
  tabChangeNotice: null,
};

/**
 * Broadcast the latest ReaderState to the side panel (if open).
 */
function broadcastState(): void {
  const message: ExtensionMessage = {
    type: 'READER_STATE_UPDATE',
    state,
  };
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel is closed; playback continues uninterrupted in the background.
  });
}

function updateState(partial: Partial<ReaderState>): void {
  state = { ...state, ...partial };
  broadcastState();
}

// Keep ReaderState.playback synced whenever the background PlaybackController advances.
controller.subscribe((snapshot) => {
  state = { ...state, playback: snapshot };
  broadcastState();
});

// Load saved local preferences when the service worker starts.
const preferencesReady = loadPreferences().then((saved) => {
  controller.setRate(saved.rate);
  controller.setVoice(saved.voiceName);
  state = {
    ...state,
    preferences: saved,
    playback: controller.getSnapshot(),
  };
});

/**
 * Use chrome.action.onClicked instead of openPanelOnActionClick so Chrome grants
 * temporary activeTab permission for the clicked tab without any host-permission popup.
 */
function configureSidePanelBehavior(): void {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => {
      // Safe to ignore if unavailable.
    });
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanelBehavior();
});

async function findActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [focusedTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (focusedTab?.id) {
    return focusedTab;
  }

  const [currentTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return currentTab;
}

/**
 * Extract readable documentation content from a specific tab.
 */
async function extractFromTab(tab: chrome.tabs.Tab): Promise<ExtractionResult> {
  if (!tab.id) {
    return {
      ok: false,
      code: 'RESTRICTED_PAGE',
      message:
        'No active tab is available. Open a documentation page and click the DocListener (D) icon.',
    };
  }

  const restrictionReason = getRestrictedUrlReason(tab.url);
  if (restrictionReason) {
    return {
      ok: false,
      code: 'RESTRICTED_PAGE',
      message: restrictionReason,
    };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const extractor = (
          window as Window & { __DOCLISTENER_EXTRACT__?: () => ExtractionResult }
        ).__DOCLISTENER_EXTRACT__;
        return extractor ? extractor() : null;
      },
    });

    const extraction = results[0]?.result as ExtractionResult | null | undefined;
    if (!extraction) {
      return {
        ok: false,
        code: 'EXTRACTION_ERROR',
        message:
          'Could not read content from this page. Try reloading the tab and clicking DocListener again.',
      };
    }

    return extraction;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Access denied by browser.';
    const lower = detail.toLowerCase();

    if (lower.includes('chrome://') || lower.includes('extensions gallery')) {
      return {
        ok: false,
        code: 'RESTRICTED_PAGE',
        message:
          'Chrome prevents extensions from reading internal browser pages or the Chrome Web Store. Switch to a documentation webpage.',
      };
    }

    if (lower.includes('cannot access contents') || lower.includes('permission')) {
      return {
        ok: false,
        code: 'PERMISSION_REQUIRED',
        message: 'Click the DocListener (D) icon in Chrome’s top toolbar to read this tab.',
      };
    }

    return {
      ok: false,
      code: 'RESTRICTED_PAGE',
      message: `DocListener cannot access this page (${detail}). Make sure you are on a standard webpage.`,
    };
  }
}

/**
 * Run extraction on a tab and update shared background ReaderState.
 */
async function loadTabIntoReader(tab: chrome.tabs.Tab): Promise<ReaderState> {
  await preferencesReady;

  controller.stop();
  updateState({
    isExtracting: true,
    needsPermission: false,
    extractionError: null,
    tabChangeNotice: null,
  });

  const result = await extractFromTab(tab);

  if (result.ok) {
    controller.loadBlocks(result.document.blocks);
    updateState({
      doc: result.document,
      loadedTabId: tab.id ?? null,
      playback: controller.getSnapshot(),
      isExtracting: false,
      needsPermission: false,
      extractionError: null,
      tabChangeNotice: null,
    });
  } else {
    controller.reset();
    updateState({
      doc: null,
      loadedTabId: null,
      playback: controller.getSnapshot(),
      isExtracting: false,
      needsPermission: result.code === 'PERMISSION_REQUIRED',
      extractionError: result.code === 'PERMISSION_REQUIRED' ? null : result.message,
      tabChangeNotice: null,
    });
  }

  return state;
}

/**
 * Clicking the toolbar icon opens the side panel (preserving user gesture).
 * - If this tab is already loaded (e.g. reading in the background while the panel was closed),
 *   reopen the panel seamlessly without interrupting playback.
 * - Otherwise, extract the clicked tab immediately using Chrome's temporary activeTab grant.
 */
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {
      // Ignore if side panel is already open.
    });
  }

  if (!tab.id) {
    return;
  }

  const isSameLoadedTab = state.loadedTabId === tab.id && state.doc !== null && !state.tabChangeNotice;
  if (isSameLoadedTab) {
    broadcastState();
    return;
  }

  void loadTabIntoReader(tab);
});

/**
 * Stop stale playback and notify if the user switches tabs or navigates away (FR-10).
 */
chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (state.loadedTabId === null || state.loadedTabId === tabId) {
    return;
  }

  controller.stop();
  updateState({
    tabChangeNotice:
      'You switched tabs. Click the DocListener (D) icon in Chrome’s toolbar to read this page.',
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active || state.loadedTabId !== tabId) {
    return;
  }

  if (changeInfo.url || changeInfo.status === 'loading') {
    controller.stop();
    updateState({
      tabChangeNotice:
        'This page navigated or reloaded. Click Reload (or the D toolbar icon) to read the updated content.',
    });
  }
});

/**
 * Handle commands from the side panel.
 * Validates sender identity to prevent unauthorized cross-extension messages.
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  const handleAsync = async () => {
    await preferencesReady;

    switch (message.type) {
      case 'GET_READER_STATE': {
        // If nothing is loaded yet, attempt extracting the active tab automatically.
        if (!state.doc && !state.isExtracting && !state.needsPermission && !state.extractionError) {
          const activeTab = await findActiveTab();
          if (activeTab) {
            return loadTabIntoReader(activeTab);
          }
        }
        return state;
      }

      case 'GET_VOICES': {
        return controller.getVoices();
      }

      case 'EXTRACT_ACTIVE_TAB': {
        const activeTab = await findActiveTab();
        if (!activeTab) {
          updateState({
            extractionError:
              'No active tab is available. Click on a documentation tab and click the DocListener (D) icon.',
          });
          return state;
        }
        return loadTabIntoReader(activeTab);
      }

      case 'PLAY':
        controller.play();
        return state;

      case 'PAUSE':
        controller.pause();
        return state;

      case 'RESUME':
        controller.resume();
        return state;

      case 'CONTINUE_AFTER_CODE':
        controller.continueAfterCode();
        return state;

      case 'STOP':
        controller.stop();
        return state;

      case 'JUMP_TO_BLOCK':
        controller.jumpToBlock(message.blockIndex);
        return state;

      case 'SEEK_TO_SECONDS':
        controller.seekToSeconds(message.seconds);
        return state;

      case 'SKIP_BY_SECONDS':
        controller.skipBySeconds(message.deltaSeconds);
        return state;

      case 'SET_RATE': {
        const rate = clampRate(message.rate);
        const preferences = { ...state.preferences, rate };
        controller.setRate(rate);
        updateState({ preferences });
        await savePreferences(preferences);
        return state;
      }

      case 'SET_VOICE': {
        const preferences = { ...state.preferences, voiceName: message.voiceName };
        controller.setVoice(message.voiceName);
        updateState({ preferences });
        await savePreferences(preferences);
        return state;
      }

      default:
        return state;
    }
  };

  handleAsync()
    .then((result) => sendResponse(result))
    .catch(() => sendResponse(state));

  return true;
});
