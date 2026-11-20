import { describe, expect, it } from 'vitest';
import { getRestrictedUrlReason } from './urlGuard';

describe('getRestrictedUrlReason', () => {
  it('allows standard http and https documentation URLs', () => {
    expect(getRestrictedUrlReason('https://react.dev/learn')).toBeNull();
    expect(getRestrictedUrlReason('http://localhost:3000/docs')).toBeNull();
  });

  it('rejects internal Chrome and extension pages with a clear message', () => {
    expect(getRestrictedUrlReason('chrome://settings')).toContain('internal browser pages');
    expect(getRestrictedUrlReason('chrome-extension://abcdef/sidepanel.html')).toContain(
      'internal browser pages',
    );
    expect(getRestrictedUrlReason('about:blank')).toContain('internal browser pages');
  });

  it('rejects Chrome Web Store URLs', () => {
    expect(
      getRestrictedUrlReason('https://chromewebstore.google.com/detail/example'),
    ).toContain('Chrome Web Store');
  });

  it('allows undefined URLs so activeTab extraction can proceed without broad tabs permission', () => {
    expect(getRestrictedUrlReason(undefined)).toBeNull();
  });

  it('rejects unsupported protocols', () => {
    expect(getRestrictedUrlReason('ftp://example.com/file.txt')).toContain('not supported');
  });
});
