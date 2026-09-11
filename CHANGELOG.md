# Change Log

All notable changes to the "openpatch" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Patch a single Markdown selection through a configurable OpenAI-compatible Chat Completions endpoint.
- Automatically prompt after a stable selection, with a manual Command Palette fallback.
- Store optional bearer credentials in VS Code SecretStorage.
- Animate pending selections without modifying document content.
- Patch multiple independent selections concurrently, with animated queued selections and a configurable request limit.
- Keep pending patches alive across edits outside their selections; cancel only the patch whose selected text changes.
- Forward explicitly configured chat-template keyword arguments to compatible endpoints.
- Stream Chat Completions deltas into the pending-selection animation before applying one final replacement.
- Configure an OpenAI-compatible API base URL; OpenPatch appends the streamed Chat Completions path.
