import * as assert from 'assert';

import { classifyCharacter, scrambleCharacter, splitStreamedText } from '../pendingDecoration';

suite('pending decoration shuffle', () => {
	test('classifies letters, numbers, symbols, and whitespace separately', () => {
		assert.strictEqual(classifyCharacter('N'), 'uppercase-letter');
		assert.strictEqual(classifyCharacter('o'), 'lowercase-letter');
		assert.strictEqual(classifyCharacter('é'), 'lowercase-letter');
		assert.strictEqual(classifyCharacter('7'), 'number');
		assert.strictEqual(classifyCharacter('!'), 'other');
		assert.strictEqual(classifyCharacter(' '), 'whitespace');
		assert.strictEqual(classifyCharacter('\t'), 'whitespace');
		assert.strictEqual(classifyCharacter('\n'), 'whitespace');
	});

	test('keeps each character in its visual category', () => {
		assert.match(scrambleCharacter('N', () => 0), /^[A-Z]$/);
		assert.match(scrambleCharacter('o', () => 0), /^[a-z]$/);
		assert.match(scrambleCharacter('é', () => 0), /^[a-z]$/);
		assert.match(scrambleCharacter('7', () => 0), /^\d$/);
		assert.match(scrambleCharacter('!', () => 0), /^[!@#$%^&*()\-_=+\[\]{};:,.?\\/\\|~]$/);
		assert.strictEqual(scrambleCharacter(' ', () => 0), ' ');
		assert.strictEqual(scrambleCharacter('\t', () => 0), '\t');
		assert.strictEqual(scrambleCharacter('\n', () => 0), '\n');
	});

	test('does not repeat the previous generated character when an alternative exists', () => {
		assert.strictEqual(scrambleCharacter('N', () => 0, 'A'), 'B');
		assert.strictEqual(scrambleCharacter('7', () => 0, '0'), '1');
		assert.strictEqual(scrambleCharacter('!', () => 0, '!'), '@');
	});

	test('reveals streamed text in the selection before appending overflow', () => {
		assert.deepStrictEqual(splitStreamedText('new', 5), { revealed: ['n', 'e', 'w'], overflow: '' });
		assert.deepStrictEqual(splitStreamedText('longer', 3), { revealed: ['l', 'o', 'n'], overflow: 'ger' });
		assert.deepStrictEqual(splitStreamedText('A😀B', 2), { revealed: ['A', '😀'], overflow: 'B' });
	});
});
