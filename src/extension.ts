import * as vscode from 'vscode';

import { clearApiKey, setApiKey } from './configuration';
import { PatchController } from './patchController';

export function activate(context: vscode.ExtensionContext): void {
	const controller = new PatchController(context.secrets);

	context.subscriptions.push(
		controller,
		vscode.window.onDidChangeTextEditorSelection((event) => controller.onSelectionChanged(event)),
		vscode.window.onDidChangeActiveTextEditor((editor) => controller.onActiveEditorChanged(editor)),
		vscode.commands.registerCommand('openpatch.patchSelection', () => controller.patchActiveSelection()),
		vscode.commands.registerCommand('openpatch.submitInlinePrompt', (reply?: vscode.CommentReply) => {
			controller.submitInlinePrompt(reply);
		}),
		vscode.commands.registerCommand('openpatch.setApiKey', async () => {
			if (await setApiKey(context.secrets)) {
				void vscode.window.showInformationMessage('OpenPatch API key stored securely on this machine.');
			}
		}),
		vscode.commands.registerCommand('openpatch.clearApiKey', async () => {
			if (await clearApiKey(context.secrets)) {
				void vscode.window.showInformationMessage('OpenPatch API key cleared.');
			} else {
				void vscode.window.showInformationMessage('OpenPatch has no stored API key.');
			}
		}),
	);
}

export function deactivate(): void {}
