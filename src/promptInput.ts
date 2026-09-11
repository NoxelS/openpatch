import * as vscode from 'vscode';

export function showPatchPrompt(signal: AbortSignal): Promise<string | undefined> {
	return new Promise((resolve) => {
		const input = vscode.window.createInputBox();
		const sendButton: vscode.QuickInputButton = {
			iconPath: new vscode.ThemeIcon('send'),
			tooltip: 'Patch selection',
			location: vscode.QuickInputButtonLocation.Input,
		};
		const subscriptions: vscode.Disposable[] = [];
		let settled = false;

		const finish = (value: string | undefined): void => {
			if (settled) {
				return;
			}
			settled = true;
			resolve(value);
			input.hide();
			for (const subscription of subscriptions) {
				subscription.dispose();
			}
			input.dispose();
			signal.removeEventListener('abort', cancel);
		};
		const accept = (): void => {
			if (input.value.trim().length === 0) {
				input.validationMessage = 'Enter an instruction.';
				return;
			}
			finish(input.value.trim());
		};
		const cancel = () => finish(undefined);

		input.title = 'OpenPatch';
		input.prompt = 'Specify your patch prompt.';
		input.placeholder = 'I.e. fix typos and grammar';
		input.ignoreFocusOut = false;
		input.buttons = [sendButton];
		subscriptions.push(
			input.onDidAccept(accept),
			input.onDidTriggerButton((button) => {
				if (button === sendButton) {
					accept();
				}
			}),
			input.onDidChangeValue(() => {
				input.validationMessage = undefined;
			}),
			input.onDidHide(cancel),
		);
		signal.addEventListener('abort', cancel, { once: true });

		if (signal.aborted) {
			cancel();
			return;
		}
		input.show();
	});
}
