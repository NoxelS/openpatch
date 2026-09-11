import * as vscode from 'vscode';

import { clearApiKey, setApiKey } from './configuration';
import { PatchController } from './patchController';

const AUTOMATIC_PATCHING_ENABLED_KEY = 'openpatch.automaticPatchingEnabled';

export function activate(context: vscode.ExtensionContext): void {
	const controller = new PatchController(
		context.secrets,
		context.globalState.get<boolean>(AUTOMATIC_PATCHING_ENABLED_KEY, true),
	);

	context.subscriptions.push(
		controller,
		vscode.window.onDidChangeTextEditorSelection((event) => controller.onSelectionChanged(event)),
		vscode.workspace.onDidChangeTextDocument((event) => controller.onDocumentChanged(event)),
		vscode.commands.registerCommand('openpatch.patchSelection', () => controller.patchActiveSelection()),
		vscode.commands.registerCommand('openpatch.toggleEnabled', async () => {
			const enabled = controller.toggleAutomaticPatching();
			await context.globalState.update(AUTOMATIC_PATCHING_ENABLED_KEY, enabled);
			void vscode.window.showInformationMessage(
				enabled ? 'OpenPatch automatic patching enabled.' : 'OpenPatch automatic patching disabled.',
			);
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
