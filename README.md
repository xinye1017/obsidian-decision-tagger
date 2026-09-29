# decision tagger

An Obsidian smart tagging plugin powered by TypeSafe and OpenRouter decision models.

[简体中文](README_zh.md) · [Releases](https://github.com/xinye1017/obsidian-decision-tagger/releases)

decision tagger classifies notes against your tag rules. Review suggestions, apply recommended tags, or process a folder or your entire vault.

## Features

- **Visible classification stages:** A single live status line reports reading, evaluation and writing, next to the actual completion percentage, current file, elapsed time, estimated remaining time, scanned notes, added tags and failures. The most recent 100 entries distinguish added tags, unchanged notes and failures.
- **Compact batch panel:** The scan scope collapses to one line that shows the current scope (the vault name by default) and its note count; open it to browse folders level by level.
- **Provider Support:** Native support for **TypeSafe** (model `jev-latest`) and **OpenRouter** (model `respan/span-01-lite:free`). Base URLs and models are built-in and fixed, so you only need to enter your API key.
- **Multi-account key rotation:** One key per account, rotated in order during batch runs. Any non-200 response marks that key on the spot and the request continues on the next account. 401/402/403 accounts drop out of rotation, while a 429 only pauses for its cooldown and returns to the pool afterwards.
- **Review suggestions:** Recommended tags and other decisions are separated, with match scores, a threshold marker and explanations. Add individually or apply all recommended tags.
- **Batch classification:** Defaults to the entire vault, or recursively includes Markdown files in a selected folder. The scan scope is picked one level at a time: the list only shows the current level, the breadcrumb walks back up, and every row shows how many notes that choice would scan. Hidden and template paths are excluded. Stop or close the panel to prevent subsequent writes; completed writes remain and progress is not forced to 100%.
- **Compact tag library:** Import existing vault tags, enable or disable rules individually or in bulk. No built-in default rules. Two columns on desktop, one on narrow screens. The edit dialog renames a tag, and saving applies it across the vault: notes carrying the tag switch to the new name (a tag that only existed inline moves into the YAML), criteria generated from the tag name follow the new name, and hand written criteria stay as they are.
- **Preserved note data:** Tags are appended through Obsidian `processFrontMatter`, retaining other fields and existing tags without duplicates.
- **Native themes and language:** Follows Obsidian light/dark themes, with English and Simplified Chinese, keyboard focus and reduced-motion support.

## Model Configuration

In **Settings → decision tagger → Model Provider**:

1. **Select Provider**: Choose either `TypeSafe` or `OpenRouter`.
2. **Fixed Base URL & Model**: The base URL and model are preconfigured and fixed (TypeSafe: `https://api.typesafe.ai/v1/systemone` with model `jev-latest`; OpenRouter: `https://openrouter.ai/api/alpha/decisions` with model `respan/span-01-lite:free`), requiring no manual configuration.
3. **Account Pool**: Add the API key of each account for the selected provider, one account per key. Every row shows the recorded health and latency of that account: 🟢 Healthy (200), 🟡 Rate limited (429, reserved), 🔴 Invalid credentials (401), ⛔ Inference banned (403), 🟣 Quota exhausted (402), ⚪ Unchecked. Keys are masked by default, can be revealed one at a time, and can be removed individually.
4. **Check All Accounts**: Sends the built-in test request to each account in turn, records availability and latency, and reports the pool as `usable N/M · percent · average latency`. The check never reads note content.

## Processing and data

1. Extract the title, up to eight headings, the first 450 body characters and the last 260 characters of long notes. Short notes also include folder context. Existing frontmatter and inline tags are removed from the analyzed body.
2. Send that context and enabled rules to the selected endpoint. Note content is treated as data, not system instructions.
3. The service returns one `choice` answer per enabled tag. A missing, unknown or malformed answer fails the evaluation without automatic writes. Answers that omit `probabilities` fall back to `choice` and `confidence`.
4. Automatic application requires a matching decision and a score at or above the threshold. Other decisions remain available for manual application.

Each batch snapshots its model, rules and threshold at the start. Requests time out after 60 seconds. Network errors, timeouts and cancellation do not rotate to another account (only non-200 responses do). Authentication errors, missing endpoints and rate limits stop the remaining batch; other per-note failures are logged and processing continues. Cancellation discards late responses; Obsidian's request API cannot withdraw requests already sent to the server. A frontmatter write already in progress finishes before further writes stop.

API keys are stored in plugin settings. Masking is not encryption. Remote services receive the note context described above. Checking all accounts also spends each account's API quota. Account health and latency live in memory only, so reload the plugin to start from a clean slate.

## Installation and development

Download `main.js`, `manifest.json` and `styles.css` from [Releases](https://github.com/xinye1017/obsidian-decision-tagger/releases), place them in `<Vault>/.obsidian/plugins/decision-tagger/`, and enable the plugin. Reload the plugin or restart Obsidian after upgrading.

```sh
npm install
npm run check
npm test
npm run build
```

The repository's existing build script also copies plugin files to `D:/Data/Documents/lixinye/.obsidian/plugins/decision-tagger` without replacing `data.json`. Adjust the target in `esbuild.config.mjs` before building on another computer.

`npm run preview` serves a simulated host at `http://127.0.0.1:4178` using the actual UI source and synthetic data. It accesses no real notes or APIs and does not replace testing inside Obsidian.

`npm run live` is an opt-in check against a real decision endpoint. It loads the actual `modelClient`/`main` sources with `requestUrl` backed by `fetch`, classifies four synthetic notes against the four built-in tag rules, and asserts the transport contract (endpoint resolution, request fields, authentication header, one decision per enabled tag, probability range). HTTP failures print the raw response body, and tag-quality expectations are reported as warnings instead of failures:

```sh
npm run live -- --mock                       # built-in mock decision service, no credentials
DECISION_TAGGER_API_KEY=sk-... npm run live -- --endpoint http://127.0.0.1:3000 --model vendor/model-id
```

The purpose is the `POST {model, state, questions} -> {answers}` contract, so it expects a Decision/System-1 service. Chat models reject that endpoint, because they only answer `/v1/chat/completions`.

## License

MIT License © 2026 [xinyeli](https://github.com/xinye1017)
