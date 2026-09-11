import * as vscode from 'vscode';

import { ConfigurationError, readConfiguration } from './configuration';
import { PatchRequestCancelledError, PatchRequestError, requestPatch } from './openAiClient';
import { PendingDecoration } from './pendingDecoration';
import { InlinePromptInput } from './promptInput';

const SELECTION_DEBOUNCE_MS = 300;

interface SelectionSnapshot {
	readonly editor: vscode.TextEditor;
	readonly range: vscode.Range;
	readonly documentVersion: number;
	readonly selectedText: string;
	readonly identity: string;
}

export class PatchController implements vscode.Disposable {
	private debounceTimer: NodeJS.Timeout | undefined;
	private promptController: AbortController | undefined;
	private requestController: AbortController | undefined;
	private lastHandledSelection: string | undefined;
	private readonly promptInput = new InlinePromptInput();
	private disposed = false;

	constructor(private readonly secrets: vscode.SecretStorage) {}

	onSelectionChanged(event: vscode.TextEditorSelectionChangeEvent): void {
		if (this.disposed || this.requestController) {
			return;
		}

		this.clearDebounce();
		const snapshot = createSelectionSnapshot(event.textEditor, event.selections);
		if (!snapshot) {
			this.promptController?.abort();
			this.lastHandledSelection = undefined;
			return;
		}

		if (snapshot.identity === this.lastHandledSelection) {
			return;
		}
		if (this.promptController) {
			this.promptController.abort();
		}

		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = undefined;
			if (isSnapshotCurrent(snapshot)) {
				void this.promptAndPatch(snapshot);
			}
		}, SELECTION_DEBOUNCE_MS);
	}

	onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
		if (!editor || this.disposed || this.requestController) {
			return;
		}

		this.clearDebounce();
		this.promptController?.abort();
		this.lastHandledSelection = undefined;
	}

	async patchActiveSelection(): Promise<void> {
		if (this.requestController || this.promptController) {
			void vscode.window.showInformationMessage('OpenPatch is already handling a selection.');
			return;
		}

		const editor = vscode.window.activeTextEditor;
		const snapshot = editor ? createSelectionSnapshot(editor, editor.selections) : undefined;
		if (!snapshot) {
			void vscode.window.showErrorMessage('Select text in a Markdown editor before running OpenPatch.');
			return;
		}

		this.clearDebounce();
		await this.promptAndPatch(snapshot);
	}

	submitInlinePrompt(reply?: vscode.CommentReply): void {
		this.promptInput.submit(reply);
	}

	dispose(): void {
		this.disposed = true;
		this.clearDebounce();
		this.promptController?.abort();
		this.requestController?.abort();
		this.promptInput.dispose();
	}

	private async promptAndPatch(snapshot: SelectionSnapshot): Promise<void> {
		if (this.disposed || this.promptController || this.requestController) {
			return;
		}

		this.lastHandledSelection = snapshot.identity;
		const promptController = new AbortController();
		this.promptController = promptController;
		let instruction: string | undefined;
		try {
			instruction = await this.promptInput.show(
				snapshot.editor.document.uri,
				snapshot.range,
				promptController.signal,
			);
		} finally {
			if (this.promptController === promptController) {
				this.promptController = undefined;
			}
		}

		if (!instruction || this.disposed || !isSnapshotCurrent(snapshot)) {
			return;
		}

		await this.executePatch(snapshot, instruction);
	}

	private async executePatch(snapshot: SelectionSnapshot, instruction: string): Promise<void> {
		let configuration;
		try {
			configuration = await readConfiguration(this.secrets);
		} catch (error) {
			await showConfigurationError(error);
			return;
		}

		const requestController = new AbortController();
		this.requestController = requestController;
		let documentChanged = false;
		const documentChangeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document.uri.toString() === snapshot.editor.document.uri.toString()) {
				documentChanged = true;
				requestController.abort();
			}
		});
		const decoration = new PendingDecoration(snapshot.editor, snapshot.range);

		try {
			const replacement = await vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: 'OpenPatch is patching the selection',
					cancellable: true,
				},
				async (_progress, cancellationToken) => {
					const cancellationSubscription = cancellationToken.onCancellationRequested(() => requestController.abort());
					try {
						return await requestPatch(
							configuration,
							{ instruction, selectedMarkdown: snapshot.selectedText },
							requestController.signal,
						);
					} finally {
						cancellationSubscription.dispose();
					}
				},
			);

			if (!isSnapshotCurrent(snapshot)) {
				void vscode.window.showWarningMessage('OpenPatch did not apply the response because the document changed.');
				return;
			}

			const applied = await snapshot.editor.edit(
				(editBuilder) => editBuilder.replace(snapshot.range, replacement),
				{ undoStopBefore: true, undoStopAfter: true },
			);
			if (!applied) {
				void vscode.window.showErrorMessage('OpenPatch could not apply the replacement. Select the text and try again.');
			}
		} catch (error) {
			if (error instanceof PatchRequestCancelledError) {
				if (documentChanged) {
					void vscode.window.showWarningMessage('OpenPatch cancelled the request because the document changed.');
				} else if (error.timedOut) {
					void vscode.window.showErrorMessage(error.message);
				}
				return;
			}

			const message = error instanceof PatchRequestError ? error.message : 'OpenPatch could not patch the selection.';
			void vscode.window.showErrorMessage(message);
		} finally {
			documentChangeSubscription.dispose();
			decoration.dispose();
			if (this.requestController === requestController) {
				this.requestController = undefined;
			}
		}
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

async function showConfigurationError(error: unknown): Promise<void> {
	const message = error instanceof ConfigurationError ? error.message : 'OpenPatch configuration could not be read.';
	const action = await vscode.window.showErrorMessage(message, 'Open Settings');
	if (action === 'Open Settings') {
		await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:openpatch.openpatch');
	}
}
