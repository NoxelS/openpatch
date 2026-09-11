# Change Log

All notable changes to the "openpatch" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Patch a single Markdown selection through a configurable OpenAI-compatible Chat Completions endpoint.
- Automatically prompt after a stable selection, with a manual Command Palette fallback.
- Store optional bearer credentials in VS Code SecretStorage.
- Animate pending selections without modifying document content.
- Cancel safely when the document changes, the user cancels, or the request times out.
