import * as assert from 'assert';
import * as vscode from 'vscode';

suite('OpenPatch extension', () => {
	test('contributes its commands', async () => {
		const extension = vscode.extensions.all.find((candidate) => candidate.packageJSON.name === 'openpatch');
		assert.ok(extension, 'Expected the OpenPatch development extension to be installed.');
		await extension.activate();

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('openpatch.patchSelection'));
		assert.ok(commands.includes('openpatch.setApiKey'));
		assert.ok(commands.includes('openpatch.clearApiKey'));
	});
});
