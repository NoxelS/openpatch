import * as vscode from 'vscode';

export class PendingDecoration implements vscode.Disposable {
	private readonly bright: vscode.TextEditorDecorationType;
	private readonly dim: vscode.TextEditorDecorationType;
	private readonly timer: NodeJS.Timeout;
	private brightVisible = true;
	private disposed = false;

	constructor(private readonly editor: vscode.TextEditor, private readonly range: vscode.Range) {
		const common: vscode.DecorationRenderOptions = {
			color: new vscode.ThemeColor('errorForeground'),
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
		};
		this.bright = vscode.window.createTextEditorDecorationType({ ...common, opacity: '1' });
		this.dim = vscode.window.createTextEditorDecorationType({ ...common, opacity: '0.45' });
		this.render();
		this.timer = setInterval(() => {
			this.brightVisible = !this.brightVisible;
			this.render();
		}, 450);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		clearInterval(this.timer);
		this.editor.setDecorations(this.bright, []);
		this.editor.setDecorations(this.dim, []);
		this.bright.dispose();
		this.dim.dispose();
	}

	private render(): void {
		if (this.disposed) {
			return;
		}
		this.editor.setDecorations(this.bright, this.brightVisible ? [this.range] : []);
		this.editor.setDecorations(this.dim, this.brightVisible ? [] : [this.range]);
	}
}
