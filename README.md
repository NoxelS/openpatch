# OpenPatch

Edit selected Markdown with an AI endpoint you choose. Select text, describe the change, and OpenPatch streams a proposed replacement directly into the selection.

OpenPatch is a desktop VS Code extension. It runs locally in the VS Code UI and works with OpenAI-compatible Chat Completions endpoints.

## Install

Install **OpenPatch** from the Visual Studio Marketplace, or download a release `.vsix` and use **Extensions: Install from VSIX...** in VS Code.

## Use

1. Open a Markdown file and select the text to change.
2. Select **OpenPatch: Patch Selected Markdown** from the Command Palette.
3. Describe the desired edit and accept the streamed replacement.

Automatic patching is enabled by default. Toggle it with **OpenPatch: Toggle Automatic Patching**; the manual command remains available at all times.

## Configure

OpenPatch deliberately has no vendor lock-in. Configure these settings in VS Code:

| Setting | Purpose |
| --- | --- |
| `openpatch.openAiBaseUrl` | OpenAI-compatible API base URL. HTTPS is required except for loopback addresses. |
| `openpatch.model` | Model identifier sent to that endpoint. |
| `openpatch.systemPrompt` | Instructions controlling the replacement. |
| `openpatch.requestTimeoutMs` | Per-request timeout, from 1 second to 5 minutes. |
| `openpatch.maxConcurrentPatches` | Number of independent selections processed at once. |
| `openpatch.chatTemplateKwargs` | Endpoint-specific chat-template options, such as `{ "enable_thinking": false }`. |

Use **OpenPatch: Set API Key** to save an optional bearer key in VS Code SecretStorage, and **OpenPatch: Clear API Key** to remove it.

## Privacy and data handling

OpenPatch sends the following to the endpoint you configure for each patch request:

- Your instruction.
- The selected Markdown to replace.
- The full active Markdown document, as context.
- The configured model identifier and any chat-template keyword arguments.

Your endpoint operator determines how that data is retained and processed. Use a trusted endpoint, do not select documents whose contents you do not want to share with it, and review its privacy terms. OpenPatch stores an optional API key only in VS Code SecretStorage. It does not provide a hosted AI service.

## Development

This project requires Node.js 22 or newer.

```bash
npm ci
npm test
npm run package:vsix
```

The final command creates `openpatch-<version>.vsix`, which can be tested with:

```bash
code --install-extension openpatch-<version>.vsix
```

## Contributing and support

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report bugs and feature ideas through [GitHub Issues](https://github.com/NoxelS/openpatch/issues); see [SUPPORT.md](SUPPORT.md) for support boundaries. Security vulnerabilities must follow [SECURITY.md](SECURITY.md), not public issues.

Maintainers can find the one-time Marketplace setup and automatic-release behavior in [RELEASING.md](RELEASING.md).

## License

OpenPatch is released under the [MIT License](LICENSE).
