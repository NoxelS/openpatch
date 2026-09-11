import * as assert from 'assert';
import * as vscode from 'vscode';

suite('OpenPatch extension', () => {
	test('contributes its commands', async () => {
		const extension = vscode.extensions.all.find((candidate) => candidate.packageJSON.name === 'openpatch');
		assert.ok(extension, 'Expected the OpenPatch development extension to be installed.');
		await extension.activate();

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('openpatch.patchSelection'));
		assert.ok(commands.includes('openpatch.submitInlinePrompt'));
		assert.ok(commands.includes('openpatch.setApiKey'));
		assert.ok(commands.includes('openpatch.clearApiKey'));
	});

	test('opens and cancels an inline prompt without changing text', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'Patch me' });
		const editor = await vscode.window.showTextDocument(document);
		editor.selection = new vscode.Selection(0, 0, 0, document.getText().length);

		const patch = vscode.commands.executeCommand('openpatch.patchSelection');
		await new Promise((resolve) => setTimeout(resolve, 50));
		editor.selection = new vscode.Selection(0, 0, 0, 0);
		await patch;

		assert.strictEqual(document.getText(), 'Patch me');
	});
});
