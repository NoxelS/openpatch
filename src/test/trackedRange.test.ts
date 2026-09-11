import * as assert from 'assert';

import { rebaseOffsetRange, rangesOverlap } from '../trackedRange';

suite('tracked ranges', () => {
	test('rebases a selection when text is inserted or removed before it', () => {
		assert.deepStrictEqual(
			rebaseOffsetRange({ start: 10, end: 16 }, [{ rangeOffset: 2, rangeLength: 0, text: 'new ' }]),
			{ start: 14, end: 20 },
		);
		assert.deepStrictEqual(
			rebaseOffsetRange({ start: 10, end: 16 }, [{ rangeOffset: 2, rangeLength: 3, text: '' }]),
			{ start: 7, end: 13 },
		);
	});

	test('keeps a selection stable for edits after it and gives its boundaries deterministic affinity', () => {
		const range = { start: 10, end: 16 };
		assert.deepStrictEqual(rebaseOffsetRange(range, [{ rangeOffset: 16, rangeLength: 0, text: '!' }]), range);
		assert.deepStrictEqual(
			rebaseOffsetRange(range, [{ rangeOffset: 10, rangeLength: 0, text: 'before ' }]),
			{ start: 17, end: 23 },
		);
	});

	test('invalidates a selection when its contents are changed', () => {
		const range = { start: 10, end: 16 };
		assert.strictEqual(rebaseOffsetRange(range, [{ rangeOffset: 11, rangeLength: 1, text: 'X' }]), undefined);
		assert.strictEqual(rebaseOffsetRange(range, [{ rangeOffset: 11, rangeLength: 0, text: 'X' }]), undefined);
		assert.strictEqual(rebaseOffsetRange(range, [{ rangeOffset: 8, rangeLength: 4, text: '' }]), undefined);
	});

	test('rebases independent multi-change edits in descending source order', () => {
		assert.deepStrictEqual(
			rebaseOffsetRange(
				{ start: 10, end: 16 },
				[
					{ rangeOffset: 2, rangeLength: 0, text: 'new ' },
					{ rangeOffset: 20, rangeLength: 1, text: '!' },
				],
			),
			{ start: 14, end: 20 },
		);
	});

	test('identifies overlapping pending selections', () => {
		assert.strictEqual(rangesOverlap({ start: 2, end: 5 }, { start: 4, end: 7 }), true);
		assert.strictEqual(rangesOverlap({ start: 2, end: 5 }, { start: 5, end: 7 }), false);
	});
});
