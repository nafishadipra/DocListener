import { Readability } from '@mozilla/readability';
import type {
  DocumentBlock,
  DocumentHeading,
  ExtractedDocument,
  ExtractionResult,
} from '../shared/types';

/**
 * Selectors for page chrome and navigation boilerplate removed during fallback extraction.
 * Content inside retained article blocks is never paraphrased or rewritten.
 */
const BOILERPLATE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'button',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[aria-hidden="true"]',
  '.sidebar',
  '.toc',
  '.table-of-contents',
  '.breadcrumb',
  '.breadcrumbs',
].join(', ');

const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const PARAGRAPH_TAGS = new Set(['P', 'BLOCKQUOTE', 'DT', 'DD', 'FIGCAPTION']);

/**
 * Collapse repeated whitespace and line breaks into single spaces
 * while keeping the original wording and punctuation intact.
 */
export function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Detect a programming language hint from a <pre> or nested <code> element's class list.
 */
function detectCodeLanguage(preElement: Element): string | undefined {
  const codeElement = preElement.querySelector('code');
  const classNames = [
    preElement.getAttribute('class') ?? '',
    codeElement?.getAttribute('class') ?? '',
  ].join(' ');

  const match = classNames.match(/(?:language|lang)-([a-z0-9+#-]+)/i);
  return match?.[1]?.toLowerCase();
}

/**
 * Extract the text belonging directly to a list item without duplicating nested lists or code blocks.
 */
function extractOwnListItemText(listItem: Element): string {
  const clone = listItem.cloneNode(true) as Element;
  clone.querySelectorAll('ul, ol, pre').forEach((nested) => nested.remove());
  return normalizeText(clone.textContent ?? '');
}

/**
 * Walk a container DOM tree in strict document order and convert elements
 * into ordered DocumentBlocks, a heading index, and honest unsupported-content notes.
 */
export function collectBlocksFromContainer(container: Element): {
  blocks: DocumentBlock[];
  headings: DocumentHeading[];
  unsupportedNotes: string[];
} {
  const blocks: DocumentBlock[] = [];
  const headings: DocumentHeading[] = [];
  const notesSet = new Set<string>();

  const pushBlock = (
    type: DocumentBlock['type'],
    text: string,
    extra?: { level?: number; language?: string },
  ) => {
    const id = `block-${blocks.length}`;
    const blockIndex = blocks.length;

    blocks.push({
      id,
      type,
      text,
      ...extra,
    });

    if (type === 'heading' && extra?.level !== undefined) {
      headings.push({
        id,
        level: extra.level,
        text,
        blockIndex,
      });
    }
  };

  const walk = (element: Element) => {
    const tag = element.tagName.toUpperCase();

    if (tag === 'MATH') {
      notesSet.add('Contains mathematical notation that may not be read verbatim.');
      return;
    }

    if (tag === 'SVG') {
      if (element.getAttribute('role') === 'img' || element.querySelector('title')) {
        notesSet.add('Contains diagrams or visual figures that are not narrated.');
      }
      return;
    }

    if (HEADING_TAGS.has(tag)) {
      const text = normalizeText(element.textContent ?? '');
      if (text) {
        const level = Number(tag.slice(1));
        pushBlock('heading', text, { level });
      }
      return;
    }

    if (tag === 'PRE') {
      const rawCode = (element.textContent ?? '').trim();
      if (rawCode) {
        pushBlock('code', rawCode, { language: detectCodeLanguage(element) });
      }
      return;
    }

    if (PARAGRAPH_TAGS.has(tag)) {
      // If a blockquote wraps nested paragraphs or code blocks, walk its children instead.
      if (tag === 'BLOCKQUOTE' && element.querySelector('p, pre, ul, ol')) {
        Array.from(element.children).forEach(walk);
        return;
      }

      const text = normalizeText(element.textContent ?? '');
      if (text) {
        pushBlock('paragraph', text);
      }
      return;
    }

    if (tag === 'LI') {
      const ownText = extractOwnListItemText(element);
      if (ownText) {
        pushBlock('list-item', ownText);
      }
      // Continue walking nested lists or code blocks inside the list item.
      Array.from(element.children).forEach((child) => {
        const childTag = child.tagName.toUpperCase();
        if (childTag === 'UL' || childTag === 'OL' || childTag === 'PRE') {
          walk(child);
        }
      });
      return;
    }

    if (tag === 'TR') {
      const cells = Array.from(element.querySelectorAll(':scope > th, :scope > td'))
        .map((cell) => normalizeText(cell.textContent ?? ''))
        .filter(Boolean);
      if (cells.length > 0) {
        pushBlock('paragraph', cells.join(' — '));
      }
      return;
    }

    // Default: recurse into child elements in document order.
    Array.from(element.children).forEach(walk);
  };

  walk(container);

  return {
    blocks,
    headings,
    unsupportedNotes: Array.from(notesSet),
  };
}

/**
 * Attempt extraction using Mozilla Readability on a cloned document.
 */
function tryReadabilityExtraction(
  doc: Document,
  url: string,
): ExtractedDocument | null {
  try {
    const clonedDoc = doc.cloneNode(true) as Document;
    const reader = new Readability(clonedDoc, { keepClasses: true });
    const article = reader.parse();

    if (!article?.content) {
      return null;
    }

    const wrapper = doc.createElement('div');
    wrapper.innerHTML = article.content;

    const { blocks, headings, unsupportedNotes } = collectBlocksFromContainer(wrapper);
    const hasSpokenBlocks = blocks.some((block) => block.type !== 'code');

    if (!hasSpokenBlocks) {
      return null;
    }

    const title = normalizeText(article.title || doc.title || 'Untitled page');

    return {
      title,
      url,
      blocks,
      headings,
      extractedAt: Date.now(),
      method: 'readability',
      unsupportedNotes,
    };
  } catch {
    return null;
  }
}

/**
 * Fallback extraction when Readability cannot parse the layout.
 * Prefers semantic <article> or <main> containers and strips obvious navigation chrome.
 */
function tryFallbackExtraction(
  doc: Document,
  url: string,
): ExtractedDocument | null {
  const sourceRoot =
    doc.querySelector('article') ??
    doc.querySelector('main') ??
    doc.querySelector('[role="main"]') ??
    doc.body;

  if (!sourceRoot) {
    return null;
  }

  const clone = sourceRoot.cloneNode(true) as Element;
  clone.querySelectorAll(BOILERPLATE_SELECTORS).forEach((el) => el.remove());

  const { blocks, headings, unsupportedNotes } = collectBlocksFromContainer(clone);
  const hasSpokenBlocks = blocks.some((block) => block.type !== 'code');

  if (!hasSpokenBlocks) {
    return null;
  }

  const firstHeading = headings[0]?.text;
  const title = normalizeText(doc.title || firstHeading || 'Untitled page');

  return {
    title,
    url,
    blocks,
    headings,
    extractedAt: Date.now(),
    method: 'fallback',
    unsupportedNotes,
  };
}

/**
 * Extract readable documentation content from a Document without mutating the live page.
 */
export function extractDocument(doc: Document, url: string): ExtractionResult {
  try {
    const readable =
      tryReadabilityExtraction(doc, url) ?? tryFallbackExtraction(doc, url);

    if (!readable) {
      return {
        ok: false,
        code: 'EMPTY_PAGE',
        message:
          'No readable article text was found on this page. Open a documentation article and try refreshing.',
      };
    }

    return {
      ok: true,
      document: readable,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unexpected extraction error.';
    return {
      ok: false,
      code: 'EXTRACTION_ERROR',
      message: `Could not extract text from this page: ${detail}`,
    };
  }
}
