# DocListener

An open-source, privacy-first Chrome extension (Manifest V3) for listening to technical documentation aloud verbatim in a Chrome Side Panel — with no account, no analytics, and no backend server.

## Features (MVP — Phase 1)

- **Verbatim documentation reading**: Extracts main article headings, paragraphs, and lists using Mozilla Readability (with a semantic `<article>` / `<main>` fallback) while preserving exact wording and document order.
- **Smart code-block pausing**: Does not read code blocks aloud. When narration reaches a code block, playback automatically pauses so you can inspect the code on the page, then click **Continue after code** to resume reading right after it.
- **Clean side panel controls**: Play, Pause, Resume, Stop, adjustable narration speed (`0.75×`–`2.0×`), voice selector (prioritizing local voices), and clickable section/heading navigation.
- **Safe tab & navigation handling**: Automatically stops playback and prompts to reload if you switch tabs or navigate to a new page.
- **Local-only preferences**: Saves your speed and voice settings locally in `chrome.storage.local`.

## Project Structure

```text
public/
  manifest.json                  # Manifest V3 config with minimal permissions
src/
  shared/types.ts                # Shared document, playback, and messaging types
  content/
    extractor.ts                 # Readability + DOM fallback content extractor
    index.ts                     # On-demand content script entry point
  background/
    urlGuard.ts                  # Restricted/unsupported URL checks
    index.ts                     # Service worker (side panel, extraction, tab events)
  sidepanel/
    services/
      preferences.ts             # chrome.storage.local wrapper
      playbackController.ts      # Ordered chunked chrome.tts engine
    components/                  # Clean, modular React + Tailwind UI components
    App.tsx                      # Main side panel application
```

## Build & Load in Chrome

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the extension:
   ```bash
   npm run build
   ```
   This outputs the unpacked extension into the `dist/` folder.
3. Load in Google Chrome:
   - Open `chrome://extensions`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** and select the `dist/` directory inside this repository
4. Open any technical documentation page (e.g., MDN, React docs, Docusaurus, MkDocs) and click the **DocListener** toolbar icon to open the side panel.

## Development & Tests

```bash
npm run typecheck   # Run TypeScript strict type checks
npm test            # Run Vitest unit tests
npm run build       # Build unpacked extension to dist/
```

## Privacy & Permissions

DocListener is built **local-first**:

- **No account or sign-in** is required.
- **Zero telemetry, analytics, or DocListener backend calls** are made in core reading mode.
- **Page text stays in memory** for the active reading session and is cleared on tab switch or reset.
- **Speech voices**: Chrome's `chrome.tts` API exposes both local (on-device) and network voices depending on your OS and Chrome setup. DocListener sorts local voices first and labels each voice as `Local` or `Network` in the dropdown.

### Chrome Permissions Used

| Permission | Purpose |
| --- | --- |
| `sidePanel` | Displays the DocListener reader controls alongside the active webpage. |
| `activeTab` | Grants temporary, user-initiated access to the currently active tab only when you request extraction. |
| `scripting` | Injects the local content extractor into the active tab on demand. |
| `storage` | Persists your preferred narration speed and voice in `chrome.storage.local`. |
| `tts` | Speaks extracted documentation text using Chrome's built-in text-to-speech engine. |

## License

MIT — see [LICENSE](./LICENSE).
