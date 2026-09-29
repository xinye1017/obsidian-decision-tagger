# Decision Tagger

An intelligent Obsidian tagging plugin powered by System-1 decision models (e.g. Jev) with multi-key parallel classification acceleration.

[English](README.md) · [简体中文](README_zh.md) · [日本語](README_ja.md) · [Releases](https://github.com/xinye1017/obsidian-decision-tagger/releases)

---

**Decision Tagger** evaluates your notes against customizable decision rules with high precision. It supports instant tag suggestions for active notes, folder-scoped or full-vault batch processing, and multi-key concurrent acceleration to tag thousands of notes in minutes.

---

## Key Features

- **Folder-Scoped & Vault-Wide Batch Classification**
  - **Target specific folders or the entire vault**: Easily classify your entire vault or narrow down to specific directories (e.g. `Inbox/`, `Projects/`, or `Readings/`).
  - **Interactive folder picker with note counts**: Inspect real-time note counts for each directory level to accurately plan and scope your batch runs.
  - Recursively processes subdirectories while safely respecting note boundaries and non-markdown files.

- **Multi-Key Parallel Classification Acceleration**
  - Configure multiple API keys for your provider; the batch runner automatically spins up concurrent workers (up to 8 parallel streams) to dramatically cut down scan time.
  - **In-flight request load balancing**: New tasks are dynamically dispatched to the key with the fewest active in-flight requests, avoiding single-key saturation and rate limits.
  - **Automatic error failover & cooldown**: Keys encountering rate limits (`429`) enter a temporary cooldown and resume automatically; dead keys (`401`/`402`/`403`) are safely dropped from active rotation.

- **Real-time Batch Progress & Observability**
  - Displays real-time progress bar, percentage, elapsed time, and ETA.
  - When running in parallel, inspects currently active notes in flight and displays concurrency level in the header.
  - Keeps a scrolling log of the 100 most recent actions (added tags, unchanged notes, and failures).
  - Clean cancel/stop: Aborts instantly without corrupting notes or leaving partial tags.

- **Interactive Single Note Suggestions**
  - Trigger tag suggestions on the active note or via right-click file context menu.
  - Categorizes tags into recommended (exceeding confidence threshold) and other decisions.
  - Add tags individually or apply all recommended tags with one click.

- **Customizable Tag Rule Library & Vault Sync**
  - Import existing vault tags into your rule library with one click.
  - Customize questions, match criteria, and exclusions per tag.
  - **Vault-wide renaming & deletion**: Renaming or deleting a tag in settings can automatically update or clean up frontmatter across all notes in your vault.

- **Non-Destructive Frontmatter Updates**
  - Uses Obsidian's native `processFrontMatter` API to append tags.
  - Preserves existing YAML fields, body content, and formatting without duplicate tags.

- **Polished UX & In-Place Refresh**
  - Retains scroll position in settings when switching providers, toggling rules, or updating keys.
  - Flexible API key input: comma-separated, newline-separated, or via a dedicated batch manager with one-click clipboard paste.
  - Full dark/light mode integration and native bilingual support (English & Simplified Chinese).

---

## Getting Started

### 1. Installation

#### Option A: Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/xinye1017/obsidian-decision-tagger/releases).
2. Create a folder named `decision-tagger` under your vault's plugin directory: `<Vault>/.obsidian/plugins/decision-tagger/`.
3. Copy the downloaded files into that folder.
4. In Obsidian, go to **Settings → Community plugins** and enable **Decision Tagger**.

#### Option B: Build from Source
```sh
git clone https://github.com/xinye1017/obsidian-decision-tagger.git
cd obsidian-decision-tagger
npm install
npm run build
```

---

## Configuration

Open **Settings → Decision Tagger**:

1. **Model Provider**:
   - **TypeSafe**: Preconfigured endpoint `https://api.typesafe.ai/v1/systemone` with model `jev-latest`.
   - **OpenRouter**: Preconfigured endpoint `https://openrouter.ai/api/alpha/decisions` with free decision model `respan/span-01-lite:free` (or your custom decision model ID).
2. **API Key & Account Pool**:
   - Enter your API Key directly.
   - To configure multiple accounts for parallel acceleration, separate keys by commas (`key1, key2`) or click **Batch Import** to paste keys line-by-line from your clipboard.
3. **Confidence Threshold**:
   - Adjust the slider (e.g. 70%) to set the minimum probability required for tags to be automatically applied.
4. **Tag Rules Library**:
   - Click **Scan Vault Tags** to import existing tags.
   - Click **Create Tag** or the edit icon to refine decision criteria for any tag.

---

## How It Works

1. **Context Extraction**: For each note, extracts the title, top 8 headings, the first 450 characters of the body, and the last 260 characters for long notes (short notes include folder context). Frontmatter and existing inline tags are stripped to avoid biasing the model.
2. **System-1 Decision Architecture**: Sends the structured note context and enabled rules to the decision endpoint as clean data (not prompt injections).
3. **Evaluation & Writing**:
   - The decision model scores each enabled tag with a choice and confidence probability.
   - Matching tags meeting or exceeding your threshold are safely written to the note's frontmatter.

---

## Development & Testing

```sh
npm install          # Install dependencies
npm run check        # Run TypeScript type check
npm test             # Run comprehensive unit test suite
npm run build        # Build production bundle
npm run preview      # Launch mock UI preview server at http://127.0.0.1:4178
npm run live         # Integration test against a live endpoint (optional)
```

---

## License

MIT License © 2026 [xinyeli](https://github.com/xinye1017)
