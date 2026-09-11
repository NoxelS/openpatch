import * as assert from 'assert';

import { ConfigurationError, validateConfiguration } from '../configuration';

const validValues = {
	openAiBaseUrl: 'https://example.com/v1',
	model: 'example-model',
	systemPrompt: 'Patch Markdown.',
	requestTimeoutMs: 60000,
	maxConcurrentPatches: 3,
	chatTemplateKwargs: {},
};

suite('configuration', () => {
	test('accepts HTTPS and loopback HTTP OpenAI base URLs', () => {
		assert.strictEqual(validateConfiguration(validValues).openAiBaseUrl, validValues.openAiBaseUrl);
		assert.strictEqual(
			validateConfiguration({ ...validValues, openAiBaseUrl: 'http://localhost:11434/v1' }).openAiBaseUrl,
			'http://localhost:11434/v1',
		);
	});

	test('accepts arbitrary chat-template kwargs', () => {
		assert.deepStrictEqual(
			validateConfiguration({ ...validValues, chatTemplateKwargs: { enable_thinking: false, tool_format: 'compact' } }).chatTemplateKwargs,
			{ enable_thinking: false, tool_format: 'compact' },
		);
	});

	test('rejects insecure remote OpenAI base URLs and bases with request-specific components', () => {
		assert.throws(
			() => validateConfiguration({ ...validValues, openAiBaseUrl: 'http://example.com/v1' }),
			ConfigurationError,
		);
		assert.throws(
			() => validateConfiguration({ ...validValues, openAiBaseUrl: 'https://example.com/v1?stream=true' }),
			ConfigurationError,
		);
	});

	test('requires model, prompt, a bounded integer timeout, and a bounded concurrency limit', () => {
		assert.throws(() => validateConfiguration({ ...validValues, model: '' }), ConfigurationError);
		assert.throws(() => validateConfiguration({ ...validValues, systemPrompt: '' }), ConfigurationError);
		assert.throws(() => validateConfiguration({ ...validValues, requestTimeoutMs: 10 }), ConfigurationError);
		assert.throws(() => validateConfiguration({ ...validValues, maxConcurrentPatches: 0 }), ConfigurationError);
		assert.throws(() => validateConfiguration({ ...validValues, maxConcurrentPatches: 11 }), ConfigurationError);
		assert.throws(() => validateConfiguration({ ...validValues, chatTemplateKwargs: 'enable_thinking=false' }), ConfigurationError);
		assert.throws(() => validateConfiguration({ ...validValues, chatTemplateKwargs: [] }), ConfigurationError);
	});
});
