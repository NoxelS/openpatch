export interface OffsetRange {
	readonly start: number;
	readonly end: number;
}

export interface TextChange {
	readonly rangeOffset: number;
	readonly rangeLength: number;
	readonly text: string;
}

export type RebasedRange = OffsetRange | undefined;

/**
 * Rebases a pending selection across document edits without ever allowing an
 * edit to become part of the selection. Insertions at the start are treated
 * as preceding the selection; insertions at the end are treated as following
 * it. A change that touches the selected content invalidates the range.
 */
export function rebaseOffsetRange(
	range: OffsetRange,
	changes: readonly TextChange[],
): RebasedRange {
	let rebased = range;

	// VS Code reports a multi-change edit against the pre-change document. Work
	// backwards so every lower-offset change can shift the tracked range safely.
	const descendingChanges = [...changes].sort((left, right) => right.rangeOffset - left.rangeOffset);
	for (const change of descendingChanges) {
		const changeStart = change.rangeOffset;
		const changeEnd = changeStart + change.rangeLength;
		const delta = change.text.length - change.rangeLength;

		if (change.rangeLength === 0) {
			if (changeStart <= rebased.start) {
				rebased = shiftRange(rebased, delta);
			} else if (changeStart < rebased.end) {
				return undefined;
			}
			continue;
		}

		if (changeEnd <= rebased.start) {
			rebased = shiftRange(rebased, delta);
		} else if (changeStart < rebased.end) {
			return undefined;
		}
	}

	return rebased;
}

export function rangesOverlap(left: OffsetRange, right: OffsetRange): boolean {
	return left.start < right.end && right.start < left.end;
}

function shiftRange(range: OffsetRange, delta: number): OffsetRange {
	return { start: range.start + delta, end: range.end + delta };
}
