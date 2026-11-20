import { describe, expect, it } from 'vitest';
import { extractDocument } from './extractor';

function createHtmlDocument(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

describe('extractDocument', () => {
  it('extracts headings, paragraphs, lists, and code blocks in exact order while excluding nav/footer', () => {
    const doc = createHtmlDocument(`
      <!doctype html>
      <html>
        <head><title>Getting Started — Docs</title></head>
        <body>
          <header>
            <nav>
              <a href="/home">Home</a>
              <a href="/api">API Reference</a>
            </nav>
          </header>
          <main>
            <article>
              <h1>Getting Started</h1>
              <p>Welcome to the framework documentation. This guide walks through installation and core concepts in detail so you can start building immediately.</p>
              <h2>Installation</h2>
              <p>Install the package using your preferred Node package manager before configuring your project.</p>
              <pre><code class="language-bash">npm install example-framework</code></pre>
              <p>After installation finishes, verify the CLI is available in your terminal.</p>
              <ul>
                <li>Node 20 or newer is required.</li>
                <li>TypeScript support is included out of the box.</li>
              </ul>
            </article>
          </main>
          <footer>
            <p>Copyright 2026 Example Corp. All rights reserved.</p>
          </footer>
        </body>
      </html>
    `);

    const result = extractDocument(doc, 'https://docs.example.com/getting-started');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { document: extracted } = result;
    expect(extracted.title).toContain('Getting Started');
    expect(extracted.url).toBe('https://docs.example.com/getting-started');

    // Navigation and footer boilerplate must not appear in retained blocks.
    const combinedText = extracted.blocks.map((b) => b.text).join(' ');
    expect(combinedText).not.toContain('API Reference');
    expect(combinedText).not.toContain('Copyright 2026');

    // Code block must be tagged as 'code' so playback pauses instead of reading it.
    const codeBlock = extracted.blocks.find((b) => b.type === 'code');
    expect(codeBlock).toBeDefined();
    expect(codeBlock?.text).toContain('npm install example-framework');
    expect(codeBlock?.language).toBe('bash');

    // Paragraphs before and after the code block must remain in exact source order.
    const installIdx = extracted.blocks.findIndex((b) =>
      b.text.includes('Install the package'),
    );
    const codeIdx = extracted.blocks.findIndex((b) => b.type === 'code');
    const afterCodeIdx = extracted.blocks.findIndex((b) =>
      b.text.includes('After installation finishes'),
    );

    expect(installIdx).toBeGreaterThanOrEqual(0);
    expect(codeIdx).toBeGreaterThan(installIdx);
    expect(afterCodeIdx).toBeGreaterThan(codeIdx);

    // Headings must map to their exact blockIndex for section navigation.
    expect(extracted.headings.length).toBeGreaterThanOrEqual(1);
    for (const heading of extracted.headings) {
      expect(extracted.blocks[heading.blockIndex]?.text).toBe(heading.text);
      expect(extracted.blocks[heading.blockIndex]?.type).toBe('heading');
    }
  });

  it('falls back cleanly when a minimal documentation page has a short main article', () => {
    const doc = createHtmlDocument(`
      <!doctype html>
      <html>
        <head><title>Short Note</title></head>
        <body>
          <nav><a href="/">Back</a></nav>
          <main>
            <h2>Quick Tip</h2>
            <p>Use strict mode in TypeScript.</p>
          </main>
        </body>
      </html>
    `);

    const result = extractDocument(doc, 'https://docs.example.com/tip');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.blocks.map((b) => b.text)).toEqual([
      'Quick Tip',
      'Use strict mode in TypeScript.',
    ]);
  });

  it('returns EMPTY_PAGE error on blank or non-article pages', () => {
    const doc = createHtmlDocument(`
      <!doctype html>
      <html>
        <head><title>Empty</title></head>
        <body>
          <nav><a href="/">Home</a></nav>
          <footer>Footer only</footer>
        </body>
      </html>
    `);

    const result = extractDocument(doc, 'https://docs.example.com/empty');
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.code).toBe('EMPTY_PAGE');
  });
});
