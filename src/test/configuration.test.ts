import * as assert from 'assert';

import { ConfigurationError, validateConfiguration } from '../configuration';

const validValues = {
	endpoint: 'https://example.com/v1/chat/completions',
	model: 'example-model',
	systemPrompt: 'Patch Markdown.',
	requestTimeoutMs: 60000,
	qwenDisableThinking: true,
};

suite('configuration', () => {
	test('accepts HTTPS and loopback HTTP endpoints', () => {
		assert.strictEqual(validateConfiguration(validValues).endpoint, validValues.endpoint);
		assert.strictEqual(
			validateConfiguration({ ...validValues, endpoint: 'http://localhost:11434/v1/chat/completions' }).endpoint,
			'http://localhost:11434/v1/chat/completions',
		);
	});

	test('rejects insecure remote endpoints', () => {
		assert.throws(
			() => validateConfiguration({ ...validValues, endpoint: 'http://example.com/v1/chat/completions' }),
			ConfigurationError,
		);
	});

	test('requires model, prompt, and a bounded integer timeout', () => {
		assert.throws(() => validateConfiguration({ ...validValues, model: '' }), ConfigurationError);
		assert.throws(() => validateConfiguration({ ...validValues, systemPrompt: '' }), ConfigurationError);
		assert.throws(() => validateConfiguration({ ...validValues, requestTimeoutMs: 10 }), ConfigurationError);
		assert.throws(() => validateConfiguration({ ...validValues, qwenDisableThinking: 'yes' }), ConfigurationError);
	});
});
