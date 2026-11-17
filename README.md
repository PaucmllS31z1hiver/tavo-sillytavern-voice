# Tavo Voice Player for SillyTavern

A standalone SillyTavern UI extension adapted from the Tavo MiniMax voice player.

## Features

- Adds a compact player below each character reply.
- Reads the active SillyTavern message text, so the selected swipe is played.
- Uses the current chat model for optional reading-structure prompt injection.
- Shows one timeline for the full reply and supports seeking across generated segments.
- Starts playback as soon as the next in-order segment is ready while up to ten requests prefetch in parallel.
- Provides separate editable role-splitting and emotion/sound prompt sections, plus named voice selectors.
- Stores generated audio in the browser IndexedDB.
- Keeps reading markers out of future model requests without editing saved chat messages.

## Install

In SillyTavern, open Extensions, choose Install extension, and paste this Git URL:

`https://github.com/PaucmllS31z1hiver/tavo-sillytavern-voice`

The extension is installed on the device running the SillyTavern server, even when you use SillyTavern from a phone browser. The extension was developed against SillyTavern 1.15.0.

For manual installation, copy this folder into `data/<user>/extensions/tavo-sillytavern-voice`, restart SillyTavern, and enable the extension.

The API endpoint must allow browser requests from the SillyTavern origin. Configure the endpoint, API key, and model in Extensions.

## SillyTavern integration

This is a native SillyTavern UI extension. It uses the extension settings API and message events for the player. The optional prompt injection joins the editable role-splitting and emotion/sound sections before calling `setExtensionPrompt`. `generate_interceptor` removes hidden reading metadata from the model's request copy; it does not rewrite saved chat messages. The player reads the active message text, including the selected swipe, and normalizes common Tavo structure variants before falling back to plain text.

The implementation follows the official extension API and adapts patterns from open-source TTS extensions: provider-style request settings and cancellable segmented playback from [MiMoTTS](https://github.com/ymf2317-tech/SillyTavern-MiMoTTS), and per-message playback controls and optional prompt handling from [AI TTS Filter](https://github.com/Immortalization98/Di-SillyTavern-AITTSFilter). Some reference extensions target newer SillyTavern releases, so this extension was checked against the installed 1.15.0 APIs.

- [Official extension development guide](https://docs.sillytavern.app/for-contributors/writing-extensions/)
- [MiMoTTS](https://github.com/ymf2317-tech/SillyTavern-MiMoTTS)
- [AI TTS Filter](https://github.com/Immortalization98/Di-SillyTavern-AITTSFilter)

## Development

Run npm test with Node.js 18 or newer. The extension has no runtime npm dependencies.
