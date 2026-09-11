import { PatchConfiguration } from './configuration';

export type PatchDeltaHandler = (delta: string) => void;

export interface PatchRequest {
	readonly instruction: string;
	readonly selectedMarkdown: string;
	readonly documentMarkdown: string;
}

export class PatchRequestError extends Error {
	constructor(message: string, readonly status?: number) {
		super(message);
		this.name = 'PatchRequestError';
	}
}

export class PatchRequestCancelledError extends Error {
	constructor(readonly timedOut: boolean) {
		super(timedOut ? 'The OpenPatch request timed out.' : 'The OpenPatch request was cancelled.');
		this.name = 'PatchRequestCancelledError';
	}
}

export function buildChatCompletionBody(configuration: PatchConfiguration, request: PatchRequest): object {
	const body: Record<string, unknown> = {
		model: configuration.model,
		messages: [
			{ role: 'system', content: configuration.systemPrompt },
			{
				role: 'user',
				content: JSON.stringify({
					instruction: request.instruction,
					selected_markdown: request.selectedMarkdown,
					document_markdown: request.documentMarkdown,
				}),
			},
		],
		stream: true,
	};

	if (Object.keys(configuration.chatTemplateKwargs).length > 0) {
		body.chat_template_kwargs = configuration.chatTemplateKwargs;
	}

	return body;
}

export async function requestPatch(
	configuration: PatchConfiguration,
	request: PatchRequest,
	signal: AbortSignal,
	onDelta: PatchDeltaHandler = () => {},
	fetchImplementation: typeof fetch = fetch,
): Promise<string> {
	const controller = new AbortController();
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, configuration.requestTimeoutMs);
	const cancel = () => controller.abort();
	signal.addEventListener('abort', cancel, { once: true });

	try {
		if (signal.aborted) {
			controller.abort();
		}

		const headers: Record<string, string> = {
			Accept: 'text/event-stream',
			'Content-Type': 'application/json',
		};
		if (configuration.apiKey) {
			headers.Authorization = `Bearer ${configuration.apiKey}`;
		}

		const response = await fetchImplementation(chatCompletionsUrl(configuration.openAiBaseUrl), {
			method: 'POST',
			headers,
			body: JSON.stringify(buildChatCompletionBody(configuration, request)),
			signal: controller.signal,
			redirect: 'error',
		});
		if (!response.ok) {
			throw new PatchRequestError(messageForStatus(response.status), response.status);
		}

		return await readStreamingChatCompletion(response, onDelta);
	} catch (error) {
		if (controller.signal.aborted) {
			throw new PatchRequestCancelledError(timedOut);
		}
		if (error instanceof PatchRequestError) {
			throw error;
		}
		throw new PatchRequestError('OpenPatch could not reach the configured endpoint.');
	} finally {
		clearTimeout(timeout);
		signal.removeEventListener('abort', cancel);
	}
}

export function chatCompletionsUrl(openAiBaseUrl: string): string {
	const url = new URL(openAiBaseUrl);
	url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`;
	return url.toString();
}

async function readStreamingChatCompletion(response: Response, onDelta: PatchDeltaHandler): Promise<string> {
	if (!response.body) {
		throw new PatchRequestError('The endpoint returned an invalid streaming response.');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffered = '';
	let replacement = '';
	let completed = false;

	const consumeEvent = (event: string): void => {
		const data = event
			.split(/\r?\n/)
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice(5).replace(/^ /, ''))
			.join('\n');
		if (!data) {
			return;
		}
		if (data === '[DONE]') {
			completed = true;
			return;
		}

		let chunk: unknown;
		try {
			chunk = JSON.parse(data);
		} catch {
			throw new PatchRequestError('The endpoint returned an invalid streaming response.');
		}

		const delta = parseChatCompletionDelta(chunk);
		if (delta) {
			replacement += delta;
			onDelta(delta);
		}
	};

	const consumeBufferedEvents = (): void => {
		let separator: RegExpExecArray | null;
		while ((separator = /\r?\n\r?\n/.exec(buffered)) !== null) {
			const event = buffered.slice(0, separator.index);
			buffered = buffered.slice(separator.index + separator[0].length);
			consumeEvent(event);
		}
	};

	while (!completed) {
		const { done, value } = await reader.read();
		if (value) {
			buffered += decoder.decode(value, { stream: !done });
			consumeBufferedEvents();
		}
		if (done) {
			buffered += decoder.decode();
			consumeBufferedEvents();
			break;
		}
	}

	if (!completed) {
		throw new PatchRequestError('The endpoint ended the streaming response unexpectedly.');
	}
	if (replacement.length === 0) {
		throw new PatchRequestError('The endpoint returned no replacement text.');
	}
	return replacement;
}

function parseChatCompletionDelta(data: unknown): string | undefined {
	if (!isRecord(data) || !Array.isArray(data.choices)) {
		throw new PatchRequestError('The endpoint returned an invalid streaming response.');
	}
	if (data.choices.length === 0) {
		return undefined;
	}

	const firstChoice = data.choices[0];
	if (!isRecord(firstChoice) || !isRecord(firstChoice.delta)) {
		throw new PatchRequestError('The endpoint returned an invalid streaming response.');
	}
	const content = firstChoice.delta.content;
	if (content === undefined || content === null) {
		return undefined;
	}
	if (typeof content !== 'string') {
		throw new PatchRequestError('The endpoint returned an invalid streaming response.');
	}
	return content;
}

function messageForStatus(status: number): string {
	if (status === 401 || status === 403) {
		return `The endpoint rejected authentication (HTTP ${status}).`;
	}
	if (status === 404) {
		return 'The endpoint or model was not found (HTTP 404).';
	}
	if (status === 429) {
		return 'The endpoint rate limit was reached (HTTP 429).';
	}
	if (status >= 500) {
		return `The endpoint is unavailable (HTTP ${status}).`;
	}
	return `The endpoint rejected the request (HTTP ${status}).`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
