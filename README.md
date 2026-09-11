# OpenPatch

OpenPatch rewrites selected Markdown with an OpenAI-compatible model endpoint. Select text, describe the change, and apply the returned replacement directly in the editor.

## Use OpenPatch

1. Open a Markdown file and select one range of text.
2. Enter an instruction in the OpenPatch prompt anchored beside the selection.
3. Press **Patch**.
4. The selection pulses red while the endpoint generates its replacement.
5. The returned Markdown replaces the selection as one undoable edit.

The inline prompt opens automatically after a selection settles and focuses its input. Change the selection to dismiss it. You can also run **OpenPatch: Patch Selected Markdown** from the Command Palette.

OpenPatch sends only the configured system prompt, your instruction, and the exact selected text. It does not send the file name, surrounding text, workspace contents, or editor history.

## Configure OpenPatch

Open VS Code Settings and search for `OpenPatch`:

- `openpatch.endpoint`: full Chat Completions endpoint URL.
- `openpatch.model`: model identifier understood by that endpoint.
- `openpatch.systemPrompt`: instructions controlling the Markdown rewrite.
- `openpatch.requestTimeoutMs`: request timeout from 1 to 300 seconds.
- `openpatch.qwenDisableThinking`: request faster non-thinking mode for Qwen models served by a compatible vLLM endpoint; enabled by default.

The model setting has no default, so configure it before the first request. The endpoint defaults to OpenAI's Chat Completions endpoint. Local services may use loopback HTTP URLs such as `http://localhost:11434/v1/chat/completions`; non-loopback endpoints must use HTTPS.

If the endpoint requires bearer authentication, run **OpenPatch: Set API Key**. The key is kept in VS Code SecretStorage rather than settings and is not synced. Run **OpenPatch: Clear API Key** to remove it. Endpoints without authentication do not need a stored key.

## Endpoint compatibility

The initial release targets the widely implemented OpenAI Chat Completions shape:

```json
{
  "model": "your-model",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "{...}" }
  ],
  "stream": false
}
```

The endpoint must return replacement text at `choices[0].message.content`. Streaming and the Responses API are not part of the initial release.

When `openpatch.qwenDisableThinking` is enabled and the model ID contains `qwen`, OpenPatch adds this vLLM/Qwen extension to the request:

```json
{
  "chat_template_kwargs": {
    "enable_thinking": false
  }
}
```

This parameter is not part of the core OpenAI API. Turn the setting off if a Qwen endpoint rejects it.

## Safety behavior

- OpenPatch never modifies text until a complete valid response arrives.
- Editing the document during a request cancels the operation.
- Failed, cancelled, stale, or empty responses leave the document unchanged.
- Redirects are rejected so credentials are not forwarded to an unexpected URL.
- Only one selection and one request are handled at a time.
- OpenPatch is disabled in untrusted workspaces because selected content is sent to an external service.

## Development

```sh
npm install
npm run compile
npm test
```

Press F5 in VS Code to launch an Extension Development Host. Configure a model and endpoint in that window, open a Markdown file, and select some text.

OpenPatch uses native VS Code and `fetch` APIs and adds no runtime dependencies.
