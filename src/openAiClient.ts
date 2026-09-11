import { PatchConfiguration } from './configuration';

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
		stream: false,
	};

	if (Object.keys(configuration.chatTemplateKwargs).length > 0) {
		body.chat_template_kwargs = configuration.chatTemplateKwargs;
	}

	return body;
}

export function parseChatCompletion(data: unknown): string {
	if (!isRecord(data) || !Array.isArray(data.choices) || data.choices.length === 0) {
		throw new PatchRequestError('The endpoint returned an invalid Chat Completions response.');
	}

	const firstChoice = data.choices[0];
	if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
		throw new PatchRequestError('The endpoint returned an invalid Chat Completions response.');
	}

	const content = firstChoice.message.content;
	let text: string | undefined;
	if (typeof content === 'string') {
		text = content;
	} else if (Array.isArray(content)) {
		const textParts = content
			.filter((part): part is Record<string, unknown> => isRecord(part) && part.type === 'text' && typeof part.text === 'string')
			.map((part) => part.text as string);
		if (textParts.length > 0) {
			text = textParts.join('');
		}
	}

	if (text === undefined || text.length === 0) {
		throw new PatchRequestError('The endpoint returned no replacement text.');
	}
	return text;
}

export async function requestPatch(
	configuration: PatchConfiguration,
	request: PatchRequest,
	signal: AbortSignal,
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

		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (configuration.apiKey) {
			headers.Authorization = `Bearer ${configuration.apiKey}`;
		}

		const response = await fetchImplementation(configuration.endpoint, {
			method: 'POST',
			headers,
			body: JSON.stringify(buildChatCompletionBody(configuration, request)),
			signal: controller.signal,
			redirect: 'error',
		});
		if (!response.ok) {
			throw new PatchRequestError(messageForStatus(response.status), response.status);
		}

		return parseChatCompletion(await response.json());
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
