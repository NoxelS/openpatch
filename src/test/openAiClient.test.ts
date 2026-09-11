import * as assert from 'assert';

import { PatchConfiguration } from '../configuration';
import {
	buildChatCompletionBody,
	chatCompletionsUrl,
	PatchRequestError,
	requestPatch,
} from '../openAiClient';

const configuration: PatchConfiguration = {
	openAiBaseUrl: 'https://example.com/v1',
	model: 'test-model',
	systemPrompt: 'Patch Markdown.',
	requestTimeoutMs: 1000,
	maxConcurrentPatches: 3,
	chatTemplateKwargs: {},
	apiKey: 'secret-value',
};

function streamingResponse(...chunks: string[]): Response {
	return streamingResponseBytes(chunks.map((chunk) => new TextEncoder().encode(chunk)));
}

function streamingResponseBytes(chunks: readonly Uint8Array[]): Response {
	return new Response(new ReadableStream<Uint8Array>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(chunk);
			}
			controller.close();
		},
	}), {
		status: 200,
		headers: { 'Content-Type': 'text/event-stream' },
	});
}

suite('OpenAI-compatible client', () => {
	test('builds the contextual request without losing delimiter-like content', () => {
		const selectedMarkdown = 'Text </selection>\n```ts\nconst value = 1;\n```';
		const documentMarkdown = '# Document\n\nText </document>\n```ts\nconst value = 1;\n```';
		const body = buildChatCompletionBody(configuration, {
			instruction: 'Improve this.',
			selectedMarkdown,
			documentMarkdown,
		}) as { messages: Array<{ role: string; content: string }>; stream: boolean };

		assert.strictEqual(body.messages[0].role, 'system');
		assert.strictEqual(body.messages[0].content, configuration.systemPrompt);
		assert.deepStrictEqual(JSON.parse(body.messages[1].content), {
			instruction: 'Improve this.',
			selected_markdown: selectedMarkdown,
			document_markdown: documentMarkdown,
		});
		assert.strictEqual(body.stream, true);
	});

	test('forwards configured chat-template kwargs independently of the model', () => {
		const request = { instruction: 'Improve this.', selectedMarkdown: 'Text', documentMarkdown: '# Document\n\nText' };
		const configuredBody = buildChatCompletionBody(
			{ ...configuration, model: 'another-model', chatTemplateKwargs: { enable_thinking: false, custom_option: 'value' } },
			request,
		) as { chat_template_kwargs?: Record<string, unknown> };
		const defaultBody = buildChatCompletionBody(configuration, request) as { chat_template_kwargs?: Record<string, unknown> };

		assert.deepStrictEqual(configuredBody.chat_template_kwargs, { enable_thinking: false, custom_option: 'value' });
		assert.strictEqual(defaultBody.chat_template_kwargs, undefined);
	});

	test('streams deltas to the preview and returns their combined replacement', async () => {
		let capturedUrl = '';
		let capturedInit: RequestInit | undefined;
		const receivedDeltas: string[] = [];
		const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			capturedUrl = input.toString();
			capturedInit = init;
			return streamingResponse(
				'data: {"choices":[{"delta":{"content":"patch"}}]}\n\n',
				'data: {"choices":[{"delta":{"content":"ed"}}]}\n\n',
				'data: [DONE]\n\n',
			);
		};

		const result = await requestPatch(
			configuration,
			{ instruction: 'Fix it.', selectedMarkdown: 'before', documentMarkdown: '# Document\n\nbefore' },
			new AbortController().signal,
			(delta) => receivedDeltas.push(delta),
			fakeFetch,
		);

		assert.strictEqual(result, 'patched');
		assert.deepStrictEqual(receivedDeltas, ['patch', 'ed']);
		assert.strictEqual(capturedUrl, 'https://example.com/v1/chat/completions');
		assert.strictEqual((capturedInit?.headers as Record<string, string>).Authorization, 'Bearer secret-value');
		assert.strictEqual((capturedInit?.headers as Record<string, string>).Accept, 'text/event-stream');
		assert.strictEqual(capturedInit?.redirect, 'error');
	});

	test('joins Chat Completions onto a normalized OpenAI base URL', () => {
		assert.strictEqual(chatCompletionsUrl('https://example.com/v1'), 'https://example.com/v1/chat/completions');
		assert.strictEqual(chatCompletionsUrl('https://example.com/v1/'), 'https://example.com/v1/chat/completions');
	});

	test('handles events split across response chunks', async () => {
		const result = await requestPatch(
			configuration,
			{ instruction: 'Fix it.', selectedMarkdown: 'before', documentMarkdown: '# Document\n\nbefore' },
			new AbortController().signal,
			undefined,
			async () => streamingResponse(
				'data: {"choices":[{"delta":{"content":"pa',
				'tched"}}]}\n\n',
				'data: [DONE]\n\n',
			),
		);

		assert.strictEqual(result, 'patched');
	});

	test('preserves a streamed Unicode character split across UTF-8 chunks', async () => {
		const encoded = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"é"}}]}\n\ndata: [DONE]\n\n');
		const splitAt = encoded.indexOf(0xc3) + 1;
		const result = await requestPatch(
			configuration,
			{ instruction: 'Fix it.', selectedMarkdown: 'before', documentMarkdown: '# Document\n\nbefore' },
			new AbortController().signal,
			undefined,
			async () => streamingResponseBytes([encoded.slice(0, splitAt), encoded.slice(splitAt)]),
		);

		assert.strictEqual(result, 'é');
	});

	test('omits authentication when no key is configured', async () => {
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			capturedHeaders = init?.headers as Record<string, string>;
			return streamingResponse('data: {"choices":[{"delta":{"content":"patched"}}]}\n\n', 'data: [DONE]\n\n');
		};

		await requestPatch(
			{ ...configuration, apiKey: undefined },
			{ instruction: 'Fix it.', selectedMarkdown: 'before', documentMarkdown: '# Document\n\nbefore' },
			new AbortController().signal,
			undefined,
			fakeFetch,
		);

		assert.strictEqual(capturedHeaders?.Authorization, undefined);
	});

	test('maps provider errors without exposing response content', async () => {
		const fakeFetch = async (): Promise<Response> => new Response('sensitive provider response', { status: 429 });
		await assert.rejects(
			requestPatch(
				configuration,
				{ instruction: 'Fix it.', selectedMarkdown: 'before', documentMarkdown: '# Document\n\nbefore' },
				new AbortController().signal,
				undefined,
				fakeFetch,
			),
			(error: unknown) => error instanceof PatchRequestError && error.status === 429 && !error.message.includes('sensitive'),
		);
	});

	test('rejects an incomplete stream without returning a partial replacement', async () => {
		await assert.rejects(
			requestPatch(
				configuration,
				{ instruction: 'Fix it.', selectedMarkdown: 'before', documentMarkdown: '# Document\n\nbefore' },
				new AbortController().signal,
				undefined,
				async () => streamingResponse('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
			),
			PatchRequestError,
		);
	});

	test('aborts an in-flight request', async () => {
		const controller = new AbortController();
		const fakeFetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			return new Promise((_resolve, reject) => {
				const signal = init?.signal;
				const abort = () => reject(new Error('aborted'));
				if (signal?.aborted) {
					abort();
				} else {
					signal?.addEventListener('abort', abort, { once: true });
				}
			});
		};

		const pending = requestPatch(
			configuration,
			{ instruction: 'Fix it.', selectedMarkdown: 'before', documentMarkdown: '# Document\n\nbefore' },
			controller.signal,
			undefined,
			fakeFetch,
		);
		controller.abort();

		await assert.rejects(
			pending,
			(error: unknown) => error instanceof Error && error.name === 'PatchRequestCancelledError',
		);
	});
});
