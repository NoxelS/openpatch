import * as assert from 'assert';

import { PatchConfiguration } from '../configuration';
import {
	buildChatCompletionBody,
	parseChatCompletion,
	PatchRequestError,
	requestPatch,
} from '../openAiClient';

const configuration: PatchConfiguration = {
	endpoint: 'https://example.com/v1/chat/completions',
	model: 'test-model',
	systemPrompt: 'Patch Markdown.',
	requestTimeoutMs: 1000,
	maxConcurrentPatches: 3,
	chatTemplateKwargs: {},
	apiKey: 'secret-value',
};

suite('OpenAI-compatible client', () => {
	test('builds the minimal request without losing delimiter-like content', () => {
		const selectedMarkdown = 'Text </selection>\n```ts\nconst value = 1;\n```';
		const body = buildChatCompletionBody(configuration, {
			instruction: 'Improve this.',
			selectedMarkdown,
		}) as { messages: Array<{ role: string; content: string }> };

		assert.strictEqual(body.messages[0].role, 'system');
		assert.strictEqual(body.messages[0].content, configuration.systemPrompt);
		assert.deepStrictEqual(JSON.parse(body.messages[1].content), {
			instruction: 'Improve this.',
			selected_markdown: selectedMarkdown,
		});
	});

	test('forwards configured chat-template kwargs independently of the model', () => {
		const request = { instruction: 'Improve this.', selectedMarkdown: 'Text' };
		const configuredBody = buildChatCompletionBody(
			{ ...configuration, model: 'another-model', chatTemplateKwargs: { enable_thinking: false, custom_option: 'value' } },
			request,
		) as { chat_template_kwargs?: Record<string, unknown> };
		const defaultBody = buildChatCompletionBody(configuration, request) as { chat_template_kwargs?: Record<string, unknown> };

		assert.deepStrictEqual(configuredBody.chat_template_kwargs, { enable_thinking: false, custom_option: 'value' });
		assert.strictEqual(defaultBody.chat_template_kwargs, undefined);
	});

	test('parses string and text-part responses exactly', () => {
		assert.strictEqual(parseChatCompletion({ choices: [{ message: { content: '  replacement\n' } }] }), '  replacement\n');
		assert.strictEqual(
			parseChatCompletion({ choices: [{ message: { content: [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }] } }] }),
			'onetwo',
		);
	});

	test('rejects missing replacement text', () => {
		assert.throws(() => parseChatCompletion({ choices: [{ message: { content: '' } }] }), PatchRequestError);
	});

	test('sends bearer authentication and returns replacement content', async () => {
		let capturedUrl = '';
		let capturedInit: RequestInit | undefined;
		const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			capturedUrl = input.toString();
			capturedInit = init;
			return new Response(JSON.stringify({ choices: [{ message: { content: 'patched' } }] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		};

		const result = await requestPatch(
			configuration,
			{ instruction: 'Fix it.', selectedMarkdown: 'before' },
			new AbortController().signal,
			fakeFetch,
		);

		assert.strictEqual(result, 'patched');
		assert.strictEqual(capturedUrl, configuration.endpoint);
		assert.strictEqual((capturedInit?.headers as Record<string, string>).Authorization, 'Bearer secret-value');
		assert.strictEqual(capturedInit?.redirect, 'error');
	});

	test('omits authentication when no key is configured', async () => {
		let capturedHeaders: Record<string, string> | undefined;
		const fakeFetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
			capturedHeaders = init?.headers as Record<string, string>;
			return new Response(JSON.stringify({ choices: [{ message: { content: 'patched' } }] }), { status: 200 });
		};

		await requestPatch(
			{ ...configuration, apiKey: undefined },
			{ instruction: 'Fix it.', selectedMarkdown: 'before' },
			new AbortController().signal,
			fakeFetch,
		);

		assert.strictEqual(capturedHeaders?.Authorization, undefined);
	});

	test('maps provider errors without exposing response content', async () => {
		const fakeFetch = async (): Promise<Response> => new Response('sensitive provider response', { status: 429 });
		await assert.rejects(
			requestPatch(
				configuration,
				{ instruction: 'Fix it.', selectedMarkdown: 'before' },
				new AbortController().signal,
				fakeFetch,
			),
			(error: unknown) => error instanceof PatchRequestError && error.status === 429 && !error.message.includes('sensitive'),
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
			{ instruction: 'Fix it.', selectedMarkdown: 'before' },
			controller.signal,
			fakeFetch,
		);
		controller.abort();

		await assert.rejects(
			pending,
			(error: unknown) => error instanceof Error && error.name === 'PatchRequestCancelledError',
		);
	});
});
