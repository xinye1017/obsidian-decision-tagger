# decision tagger

An Obsidian smart tagging plugin powered by TypeSafe and OpenRouter decision models.

[简体中文](README_zh.md) · [Releases](https://github.com/xinye1017/obsidian-decision-tagger/releases)

decision tagger classifies notes against your tag rules. Review suggestions, apply recommended tags, or process a folder or your entire vault.

## Features

- **Visible classification stages:** Follow reading, evaluation and writing, actual completion percentage, current file, elapsed time, estimated remaining time, updated notes, added tags and failures. The most recent 100 entries distinguish added tags, unchanged notes and failures.
- **Provider Support:** Native support for **TypeSafe** (model `jev-latest`) and **OpenRouter** (model `respan/span-01-lite:free`). Base URLs and models are built-in and fixed, so you only need to enter your API key.
- **Review suggestions:** Recommended tags and other decisions are separated, with match scores, a threshold marker and explanations. Add individually or apply all recommended tags.
- **Batch classification:** Defaults to the entire vault, or recursively includes Markdown files in a selected folder. Hidden and template paths are excluded. Stop or close the panel to prevent subsequent writes; completed writes remain and progress is not forced to 100%.
- **Compact tag library:** Import existing vault tags, enable or disable rules individually or in bulk. No built-in default rules. Two columns on desktop, one on narrow screens.
- **Preserved note data:** Tags are appended through Obsidian `processFrontMatter`, retaining other fields and existing tags without duplicates.
- **Native themes and language:** Follows Obsidian light/dark themes, with English and Simplified Chinese, keyboard focus and reduced-motion support.

## Model Configuration

In **Settings → decision tagger → Model Provider**:

1. **Select Provider**: Choose either `TypeSafe` or `OpenRouter`.
2. **Fixed Base URL & Model**: The base URL and model are preconfigured and fixed (TypeSafe: `https://api.typesafe.ai/v1/systemone` with model `jev-latest`; OpenRouter: `https://openrouter.ai/api/alpha/decisions` with model `respan/span-01-lite:free`), requiring no manual configuration.
3. **API Key**: Enter the API key for your chosen provider. Keys are saved independently for each provider.
4. **Test Connection**: Click **Test Connection** to verify your key and service availability.

## Processing and data

1. Extract the title, up to eight headings, the first 450 body characters and the last 260 characters of long notes. Short notes also include folder context. Existing frontmatter and inline tags are removed from the analyzed body.
2. Send that context and enabled rules to the selected endpoint. Note content is treated as data, not system instructions.
3. The service returns one `choice` answer per enabled tag. A missing, unknown or malformed answer fails the evaluation without automatic writes. Answers that omit `probabilities` fall back to `choice` and `confidence`.
4. Automatic application requires a matching decision and a score at or above the threshold. Other decisions remain available for manual application.

Each batch snapshots its model, rules and threshold at the start. Requests time out after 60 seconds. Authentication errors, missing endpoints and rate limits stop the remaining batch; other per-note failures are logged and processing continues. Cancellation discards late responses; Obsidian's request API cannot withdraw requests already sent to the server. A frontmatter write already in progress finishes before further writes stop.

API keys are stored in plugin settings. Password masking is not encryption. Remote services receive the note context described above. Connection tests also use the selected provider's API quota.

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
