import * as assert from 'assert';

import { ConfigurationError, validateConfiguration } from '../configuration';

const validValues = {
	endpoint: 'https://example.com/v1/chat/completions',
	model: 'example-model',
	systemPrompt: 'Patch Markdown.',
	requestTimeoutMs: 60000,
	maxConcurrentPatches: 3,
	chatTemplateKwargs: {},
};

suite('configuration', () => {
	test('accepts HTTPS and loopback HTTP endpoints', () => {
		assert.strictEqual(validateConfiguration(validValues).endpoint, validValues.endpoint);
		assert.strictEqual(
			validateConfiguration({ ...validValues, endpoint: 'http://localhost:11434/v1/chat/completions' }).endpoint,
			'http://localhost:11434/v1/chat/completions',
		);
	});

	test('accepts arbitrary chat-template kwargs', () => {
		assert.deepStrictEqual(
			validateConfiguration({ ...validValues, chatTemplateKwargs: { enable_thinking: false, tool_format: 'compact' } }).chatTemplateKwargs,
			{ enable_thinking: false, tool_format: 'compact' },
		);
	});

	test('rejects insecure remote endpoints', () => {
		assert.throws(
			() => validateConfiguration({ ...validValues, endpoint: 'http://example.com/v1/chat/completions' }),
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
