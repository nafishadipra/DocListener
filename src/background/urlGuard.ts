/**
 * Checks whether Chrome restricts extensions from reading a given URL
 * and returns a plain-language explanation if access is not allowed.
 */
const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'chrome-search://',
  'edge://',
  'about:',
  'view-source:',
  'devtools://',
];

const RESTRICTED_HOSTS = [
  'chrome.google.com/webstore',
  'chromewebstore.google.com',
];

export function getRestrictedUrlReason(url?: string): string | null {
  // Without the broad "tabs" permission, Chrome omits tab.url (undefined).
  // Allow extraction to proceed so chrome.scripting.executeScript can run on activeTab.
  if (!url) {
    return null;
  }

  const lowerUrl = url.toLowerCase();

  if (RESTRICTED_PREFIXES.some((prefix) => lowerUrl.startsWith(prefix))) {
    return 'Chrome prevents extensions from reading internal browser pages. Switch to a documentation webpage to listen.';
  }

  if (RESTRICTED_HOSTS.some((host) => lowerUrl.includes(host))) {
    return 'Chrome restricts extensions on the Chrome Web Store. Switch to a documentation webpage to listen.';
  }

  if (lowerUrl.startsWith('file://')) {
    return 'Local files require explicit "Allow access to file URLs" in Chrome extension settings, or open a hosted documentation page.';
  }

  if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://')) {
    return 'This page protocol is not supported. Open an HTTP or HTTPS documentation page.';
  }

  return null;
}
