import * as vscode from 'vscode';

import { ConfigurationError, PatchConfiguration, readConfiguration } from './configuration';
import { PatchRequestCancelledError, PatchRequestError, requestPatch } from './openAiClient';
import { PendingDecoration } from './pendingDecoration';
import { showPatchPrompt } from './promptInput';
import { OffsetRange, rangesOverlap, rebaseOffsetRange } from './trackedRange';

const SELECTION_DEBOUNCE_MS = 300;

interface SelectionSnapshot {
	readonly editor: vscode.TextEditor;
	readonly range: vscode.Range;
	readonly documentVersion: number;
	readonly selectedText: string;
	readonly identity: string;
}

type PatchJobState = 'queued' | 'requesting' | 'applying' | 'cancelled';

interface PatchJob {
	readonly id: number;
	readonly editor: vscode.TextEditor;
	readonly documentUri: vscode.Uri;
	readonly selectedText: string;
	readonly instruction: string;
	readonly configuration: PatchConfiguration;
	readonly requestController: AbortController;
	readonly decoration: PendingDecoration;
	range: OffsetRange;
	state: PatchJobState;
}

export class PatchController implements vscode.Disposable {
	private debounceTimer: NodeJS.Timeout | undefined;
	private promptController: AbortController | undefined;
	private lastHandledSelection: string | undefined;
	private readonly jobs = new Map<number, PatchJob>();
	private nextJobId = 1;
	private activeRequestCount = 0;
	private maxConcurrentPatches = 3;
	private disposed = false;

	constructor(private readonly secrets: vscode.SecretStorage) {}

	onSelectionChanged(event: vscode.TextEditorSelectionChangeEvent): void {
		if (this.disposed) {
			return;
		}

		this.clearDebounce();
		const snapshot = createSelectionSnapshot(event.textEditor, event.selections);
		if (!snapshot) {
			this.promptController?.abort();
			this.lastHandledSelection = undefined;
			return;
		}

		if (this.promptController) {
			this.promptController.abort();
		}
		if (snapshot.identity === this.lastHandledSelection) {
			return;
		}
		if (this.hasOverlappingJob(snapshot)) {
			this.lastHandledSelection = snapshot.identity;
			void vscode.window.showInformationMessage('OpenPatch is already patching this text.');
			return;
		}

		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = undefined;
			if (isSnapshotCurrent(snapshot)) {
				void this.promptAndPatch(snapshot);
			}
		}, SELECTION_DEBOUNCE_MS);
	}

	async patchActiveSelection(): Promise<void> {
		if (this.promptController) {
			void vscode.window.showInformationMessage('OpenPatch is already waiting for a patch instruction.');
			return;
		}

		const editor = vscode.window.activeTextEditor;
		const snapshot = editor ? createSelectionSnapshot(editor, editor.selections) : undefined;
		if (!snapshot) {
			void vscode.window.showErrorMessage('Select text in a Markdown editor before running OpenPatch.');
			return;
		}
		if (this.hasOverlappingJob(snapshot)) {
			void vscode.window.showInformationMessage('OpenPatch is already patching this text.');
			return;
		}

		this.clearDebounce();
		await this.promptAndPatch(snapshot);
	}

	dispose(): void {
		this.disposed = true;
		this.clearDebounce();
		this.promptController?.abort();
		for (const job of this.jobs.values()) {
			job.requestController.abort();
			job.decoration.dispose();
		}
		this.jobs.clear();
	}

	onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
		if (this.disposed) {
			return;
		}

		for (const job of [...this.jobs.values()]) {
			if (job.documentUri.toString() !== event.document.uri.toString() || job.state === 'applying') {
				continue;
			}

			const rebasedRange = rebaseOffsetRange(job.range, event.contentChanges);
			if (!rebasedRange) {
				this.cancelJob(job);
				continue;
			}

			job.range = rebasedRange;
			job.decoration.update(toDocumentRange(job.editor.document, rebasedRange));
		}
	}

	private async promptAndPatch(snapshot: SelectionSnapshot): Promise<void> {
		if (this.disposed || this.promptController || this.hasOverlappingJob(snapshot)) {
			return;
		}

		this.lastHandledSelection = snapshot.identity;
		const promptController = new AbortController();
		this.promptController = promptController;
		let instruction: string | undefined;
		try {
			instruction = await showPatchPrompt(promptController.signal);
		} finally {
			if (this.promptController === promptController) {
				this.promptController = undefined;
			}
		}

		if (!instruction || this.disposed) {
			return;
		}

		const currentSnapshot = createSelectionSnapshot(snapshot.editor, snapshot.editor.selections);
		if (!currentSnapshot || currentSnapshot.selectedText !== snapshot.selectedText) {
			return;
		}

		await this.enqueuePatch(currentSnapshot, instruction);
	}

	private async enqueuePatch(snapshot: SelectionSnapshot, instruction: string): Promise<void> {
		let configuration;
		try {
			configuration = await readConfiguration(this.secrets);
		} catch (error) {
			await showConfigurationError(error);
			return;
		}

		this.maxConcurrentPatches = configuration.maxConcurrentPatches;
		const range = toOffsetRange(snapshot.editor.document, snapshot.range);
		if (this.hasOverlappingRange(snapshot.editor.document.uri, range)) {
			void vscode.window.showInformationMessage('OpenPatch is already patching overlapping text.');
			return;
		}

		const job: PatchJob = {
			id: this.nextJobId++,
			editor: snapshot.editor,
			documentUri: snapshot.editor.document.uri,
			selectedText: snapshot.selectedText,
			instruction,
			configuration,
			requestController: new AbortController(),
			decoration: new PendingDecoration(snapshot.editor, snapshot.range),
			range,
			state: 'queued',
		};
		this.jobs.set(job.id, job);
		this.startQueuedPatches();
	}

	private startQueuedPatches(): void {
		while (!this.disposed && this.activeRequestCount < this.maxConcurrentPatches) {
			const job = [...this.jobs.values()].find((candidate) => candidate.state === 'queued');
			if (!job) {
				return;
			}

			job.state = 'requesting';
			this.activeRequestCount += 1;
			void this.runPatch(job);
		}
	}

	private async runPatch(job: PatchJob): Promise<void> {
		try {
			const replacement = await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'OpenPatch is patching a selection',
					cancellable: true,
				},
				async (_progress, cancellationToken) => {
					const cancellationSubscription = cancellationToken.onCancellationRequested(() => job.requestController.abort());
					try {
						return await requestPatch(
							job.configuration,
							{
								instruction: job.instruction,
								selectedMarkdown: job.selectedText,
								documentMarkdown: job.editor.document.getText(),
							},
							job.requestController.signal,
							(delta) => {
								if (this.jobs.has(job.id) && job.state === 'requesting') {
									job.decoration.appendStreamedText(delta);
								}
							},
						);
					} finally {
						cancellationSubscription.dispose();
					}
				},
			);

			if (!this.jobs.has(job.id) || job.state !== 'requesting' || !isJobTargetCurrent(job)) {
				return;
			}

			job.state = 'applying';
			const applied = await job.editor.edit(
				(editBuilder) => editBuilder.replace(toDocumentRange(job.editor.document, job.range), replacement),
				{ undoStopBefore: true, undoStopAfter: true },
			);
			if (!applied) {
				void vscode.window.showErrorMessage('OpenPatch could not apply the replacement. Select the text and try again.');
			}
		} catch (error) {
			if (error instanceof PatchRequestCancelledError) {
				if (error.timedOut && this.jobs.has(job.id)) {
					void vscode.window.showErrorMessage(error.message);
				}
				return;
			}

			const message = error instanceof PatchRequestError ? error.message : 'OpenPatch could not patch the selection.';
			if (this.jobs.has(job.id)) {
				void vscode.window.showErrorMessage(message);
			}
		} finally {
			this.activeRequestCount -= 1;
			this.removeJob(job);
			this.startQueuedPatches();
		}
	}

	private cancelJob(job: PatchJob): void {
		if (!this.jobs.has(job.id)) {
			return;
		}

		job.state = 'cancelled';
		job.requestController.abort();
		this.removeJob(job);
		this.startQueuedPatches();
	}

	private removeJob(job: PatchJob): void {
		if (this.jobs.delete(job.id)) {
			job.decoration.dispose();
		}
	}

	private hasOverlappingJob(snapshot: SelectionSnapshot): boolean {
		return this.hasOverlappingRange(snapshot.editor.document.uri, toOffsetRange(snapshot.editor.document, snapshot.range));
	}

	private hasOverlappingRange(uri: vscode.Uri, range: OffsetRange): boolean {
		return [...this.jobs.values()].some((job) => job.documentUri.toString() === uri.toString() && rangesOverlap(job.range, range));
	}

	private clearDebounce(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = undefined;
		}
	}
}

export function createSelectionIdentity(editor: vscode.TextEditor, range: vscode.Range): string {
	return [
		editor.document.uri.toString(),
		editor.document.version,
		range.start.line,
		range.start.character,
		range.end.line,
		range.end.character,
	].join(':');
}

function createSelectionSnapshot(
	editor: vscode.TextEditor,
	selections: readonly vscode.Selection[],
): SelectionSnapshot | undefined {
	if (
		vscode.window.activeTextEditor !== editor ||
		editor.document.languageId !== 'markdown' ||
		selections.length !== 1 ||
		selections[0].isEmpty
	) {
		return undefined;
	}

	const range = new vscode.Range(selections[0].start, selections[0].end);
	return {
		editor,
		range,
		documentVersion: editor.document.version,
		selectedText: editor.document.getText(range),
		identity: createSelectionIdentity(editor, range),
	};
}

function isSnapshotCurrent(snapshot: SelectionSnapshot): boolean {
	return snapshot.editor.document.version === snapshot.documentVersion &&
		snapshot.editor.document.getText(snapshot.range) === snapshot.selectedText;
}

function toOffsetRange(document: vscode.TextDocument, range: vscode.Range): OffsetRange {
	return { start: document.offsetAt(range.start), end: document.offsetAt(range.end) };
}

function toDocumentRange(document: vscode.TextDocument, range: OffsetRange): vscode.Range {
	return new vscode.Range(document.positionAt(range.start), document.positionAt(range.end));
}

function isJobTargetCurrent(job: PatchJob): boolean {
	const document = job.editor.document;
	return document.uri.toString() === job.documentUri.toString() && document.getText(toDocumentRange(document, job.range)) === job.selectedText;
}

async function showConfigurationError(error: unknown): Promise<void> {
	const message = error instanceof ConfigurationError ? error.message : 'OpenPatch configuration could not be read.';
	const action = await vscode.window.showErrorMessage(message, 'Open Settings');
	if (action === 'Open Settings') {
		await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:openpatch.openpatch');
	}
}
