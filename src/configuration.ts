import * as vscode from 'vscode';

export const API_KEY_SECRET = 'openpatch.apiKey';

export interface PatchConfiguration {
	readonly openAiBaseUrl: string;
	readonly model: string;
	readonly systemPrompt: string;
	readonly requestTimeoutMs: number;
	readonly maxConcurrentPatches: number;
	readonly chatTemplateKwargs: Readonly<Record<string, unknown>>;
	readonly apiKey?: string;
}

export class ConfigurationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigurationError';
	}
}

export interface ConfigurationValues {
	readonly openAiBaseUrl: unknown;
	readonly model: unknown;
	readonly systemPrompt: unknown;
	readonly requestTimeoutMs: unknown;
	readonly maxConcurrentPatches: unknown;
	readonly chatTemplateKwargs: unknown;
	readonly apiKey?: string;
}

export function validateConfiguration(values: ConfigurationValues): PatchConfiguration {
	const openAiBaseUrlValue = requireNonEmptyString(values.openAiBaseUrl, 'OpenPatch OpenAI base URL');
	const model = requireNonEmptyString(values.model, 'OpenPatch model');
	const systemPrompt = requireNonEmptyString(values.systemPrompt, 'OpenPatch system prompt');
	const requestTimeoutMs = values.requestTimeoutMs;
	const maxConcurrentPatches = values.maxConcurrentPatches;
	const chatTemplateKwargs = values.chatTemplateKwargs;

	if (!Number.isInteger(requestTimeoutMs) || (requestTimeoutMs as number) < 1000 || (requestTimeoutMs as number) > 300000) {
		throw new ConfigurationError('OpenPatch request timeout must be an integer between 1,000 and 300,000 milliseconds.');
	}
	if (!Number.isInteger(maxConcurrentPatches) || (maxConcurrentPatches as number) < 1 || (maxConcurrentPatches as number) > 10) {
		throw new ConfigurationError('OpenPatch concurrent patch limit must be an integer between 1 and 10.');
	}
	if (!isConfigurationObject(chatTemplateKwargs)) {
		throw new ConfigurationError('OpenPatch chat template kwargs must be an object.');
	}

	let openAiBaseUrl: URL;
	try {
		openAiBaseUrl = new URL(openAiBaseUrlValue);
	} catch {
		throw new ConfigurationError('OpenPatch OpenAI base URL must be a valid absolute URL.');
	}

	if (openAiBaseUrl.protocol !== 'https:' && openAiBaseUrl.protocol !== 'http:') {
		throw new ConfigurationError('OpenPatch OpenAI base URL must use HTTPS, or HTTP for a loopback address.');
	}
	if (openAiBaseUrl.username || openAiBaseUrl.password) {
		throw new ConfigurationError('OpenPatch OpenAI base URL must not contain embedded credentials.');
	}
	if (openAiBaseUrl.search || openAiBaseUrl.hash) {
		throw new ConfigurationError('OpenPatch OpenAI base URL must not contain a query string or fragment.');
	}
	if (openAiBaseUrl.protocol === 'http:' && !isLoopbackHost(openAiBaseUrl.hostname)) {
		throw new ConfigurationError('OpenPatch only allows unencrypted HTTP for loopback OpenAI base URLs.');
	}

	return {
		openAiBaseUrl: openAiBaseUrl.toString(),
		model,
		systemPrompt,
		requestTimeoutMs: requestTimeoutMs as number,
		maxConcurrentPatches: maxConcurrentPatches as number,
		chatTemplateKwargs,
		apiKey: values.apiKey || undefined,
	};
}

export async function readConfiguration(secrets: vscode.SecretStorage): Promise<PatchConfiguration> {
	const configuration = vscode.workspace.getConfiguration('openpatch');
	return validateConfiguration({
		openAiBaseUrl: configuration.get('openAiBaseUrl'),
		model: configuration.get('model'),
		systemPrompt: configuration.get('systemPrompt'),
		requestTimeoutMs: configuration.get('requestTimeoutMs'),
		maxConcurrentPatches: configuration.get('maxConcurrentPatches'),
		chatTemplateKwargs: configuration.get('chatTemplateKwargs'),
		apiKey: await secrets.get(API_KEY_SECRET),
	});
}

export async function setApiKey(secrets: vscode.SecretStorage): Promise<boolean> {
	const apiKey = await vscode.window.showInputBox({
		title: 'OpenPatch: Set API Key',
		prompt: 'Stored in VS Code SecretStorage and never written to settings.',
		password: true,
		ignoreFocusOut: true,
		validateInput: (value) => value.trim().length === 0 ? 'Enter an API key.' : undefined,
	});
	if (apiKey === undefined) {
		return false;
	}

	await secrets.store(API_KEY_SECRET, apiKey.trim());
	return true;
}

export async function clearApiKey(secrets: vscode.SecretStorage): Promise<boolean> {
	if (await secrets.get(API_KEY_SECRET) === undefined) {
		return false;
	}

	await secrets.delete(API_KEY_SECRET);
	return true;
}

function requireNonEmptyString(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new ConfigurationError(`${label} is not configured.`);
	}
	return value.trim();
}

function isLoopbackHost(hostname: string): boolean {
	const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
	return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function isConfigurationObject(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
