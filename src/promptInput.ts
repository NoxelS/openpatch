import * as vscode from 'vscode';

interface ActivePrompt {
	readonly thread: vscode.CommentThread;
	readonly resolve: (value: string | undefined) => void;
	readonly abort: () => void;
	readonly signal: AbortSignal;
}

export class InlinePromptInput implements vscode.Disposable {
	private readonly commentController: vscode.CommentController;
	private activePrompt: ActivePrompt | undefined;
	private disposed = false;

	constructor() {
		this.commentController = vscode.comments.createCommentController('openpatch', 'OpenPatch');
		this.commentController.options = {
			prompt: 'Describe how to patch the selected Markdown',
			placeHolder: 'For example: make this clearer and more concise',
		};
	}

	show(uri: vscode.Uri, range: vscode.Range, signal: AbortSignal): Promise<string | undefined> {
		this.finish(undefined);

		if (this.disposed || signal.aborted) {
			return Promise.resolve(undefined);
		}

		return new Promise((resolve) => {
			const thread = this.commentController.createCommentThread(uri, range, []);
			thread.label = 'OpenPatch';
			thread.contextValue = 'openpatchPrompt';
			thread.canReply = true;
			thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;

			const abort = (): void => this.finish(undefined, thread);
			this.activePrompt = { thread, resolve, abort, signal };
			signal.addEventListener('abort', abort, { once: true });
		});
	}

	submit(reply: vscode.CommentReply | undefined): void {
		if (!reply || reply.thread !== this.activePrompt?.thread) {
			return;
		}

		const instruction = reply.text.trim();
		if (instruction.length === 0) {
			return;
		}

		this.finish(instruction, reply.thread);
	}

	cancel(target: vscode.CommentReply | vscode.CommentThread | undefined): void {
		const thread = target && 'thread' in target ? target.thread : target;
		if (!thread || thread === this.activePrompt?.thread) {
			this.finish(undefined, thread);
		}
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.finish(undefined);
		this.commentController.dispose();
	}

	private finish(value: string | undefined, expectedThread?: vscode.CommentThread): void {
		const prompt = this.activePrompt;
		if (!prompt || (expectedThread && prompt.thread !== expectedThread)) {
			return;
		}

		this.activePrompt = undefined;
		prompt.signal.removeEventListener('abort', prompt.abort);
		prompt.thread.dispose();
		prompt.resolve(value);
	}
}
