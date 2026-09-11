import * as assert from 'assert';
import * as vscode from 'vscode';

import { PatchController } from '../patchController';

suite('OpenPatch extension', () => {
	test('enables automatic patching by default and can toggle it', () => {
		const controller = new PatchController({} as vscode.SecretStorage);
		assert.strictEqual(controller.toggleAutomaticPatching(), false);
		assert.strictEqual(controller.toggleAutomaticPatching(), true);
		controller.dispose();
	});

	test('contributes its commands', async () => {
		const extension = vscode.extensions.all.find((candidate) => candidate.packageJSON.name === 'openpatch');
		assert.ok(extension, 'Expected the OpenPatch development extension to be installed.');
		await extension.activate();

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('openpatch.patchSelection'));
		assert.ok(commands.includes('openpatch.toggleEnabled'));
		assert.ok(commands.includes('openpatch.setApiKey'));
		assert.ok(commands.includes('openpatch.clearApiKey'));
	});
});
