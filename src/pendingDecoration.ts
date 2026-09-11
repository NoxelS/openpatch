import * as vscode from 'vscode';

const FRAME_INTERVAL_MS = 75;
const UPPERCASE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE_LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const OTHER_CHARACTERS = '!@#$%^&*()-_=+[]{};:,.?/\\|~';

const UPPERCASE_LETTER = /^\p{Lu}$/u;
const LOWERCASE_LETTER = /^\p{Ll}$/u;
const LETTER = /^\p{L}$/u;
const NUMBER = /^\p{N}$/u;
const WHITESPACE = /^\s$/u;

export type CharacterKind = 'uppercase-letter' | 'lowercase-letter' | 'letter' | 'number' | 'other' | 'whitespace';

interface AnimatedCharacter {
	readonly range: vscode.Range;
	readonly source: string;
	previous: string | undefined;
}

export class PendingDecoration implements vscode.Disposable {
	private readonly maskedCharacters: vscode.TextEditorDecorationType;
	private readonly shuffledCharacters: vscode.TextEditorDecorationType;
	private characters: AnimatedCharacter[];
	private readonly timer: NodeJS.Timeout | undefined;
	private disposed = false;

	constructor(private readonly editor: vscode.TextEditor, range: vscode.Range) {
		this.characters = getAnimatedCharacters(editor.document, range);
		this.maskedCharacters = vscode.window.createTextEditorDecorationType({
			color: 'transparent',
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
		});
		this.shuffledCharacters = vscode.window.createTextEditorDecorationType({
			rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
		});

		this.editor.setDecorations(this.maskedCharacters, this.characters.map((character) => character.range));
		this.render();
		if (this.characters.length > 0) {
			this.timer = setInterval(() => this.render(), FRAME_INTERVAL_MS);
		}
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		if (this.timer) {
			clearInterval(this.timer);
		}
		this.editor.setDecorations(this.maskedCharacters, []);
		this.editor.setDecorations(this.shuffledCharacters, []);
		this.maskedCharacters.dispose();
		this.shuffledCharacters.dispose();
	}

	update(range: vscode.Range): void {
		if (this.disposed) {
			return;
		}

		this.characters = getAnimatedCharacters(this.editor.document, range);
		this.editor.setDecorations(this.maskedCharacters, this.characters.map((character) => character.range));
		this.render();
	}

	private render(): void {
		if (this.disposed) {
			return;
		}

		this.editor.setDecorations(
			this.shuffledCharacters,
			this.characters.map((character) => {
				const shuffled = scrambleCharacter(character.source, Math.random, character.previous);
				character.previous = shuffled;
				return {
					range: character.range,
					renderOptions: {
						before: {
							contentText: shuffled,
							color: new vscode.ThemeColor('editor.foreground'),
							margin: '0 -1ch 0 0',
						},
					},
				};
			}),
		);
	}
}

export function classifyCharacter(character: string): CharacterKind {
	if (WHITESPACE.test(character)) {
		return 'whitespace';
	}
	if (UPPERCASE_LETTER.test(character)) {
		return 'uppercase-letter';
	}
	if (LOWERCASE_LETTER.test(character)) {
		return 'lowercase-letter';
	}
	if (LETTER.test(character)) {
		return 'letter';
	}
	if (NUMBER.test(character)) {
		return 'number';
	}
	return 'other';
}

export function scrambleCharacter(
	character: string,
	random: () => number = Math.random,
	previous?: string,
): string {
	switch (classifyCharacter(character)) {
		case 'whitespace':
			return character;
		case 'uppercase-letter':
			return chooseCharacter(UPPERCASE_LETTERS, random, previous);
		case 'lowercase-letter':
		case 'letter':
			return chooseCharacter(LOWERCASE_LETTERS, random, previous);
		case 'number':
			return chooseCharacter(DIGITS, random, previous);
		case 'other':
			return chooseCharacter(OTHER_CHARACTERS, random, previous);
	}
}

function getAnimatedCharacters(document: vscode.TextDocument, range: vscode.Range): AnimatedCharacter[] {
	const characters: AnimatedCharacter[] = [];
	const selectedText = document.getText(range);
	const startOffset = document.offsetAt(range.start);
	let relativeOffset = 0;

	for (const character of selectedText) {
		const characterLength = character.length;
		if (classifyCharacter(character) !== 'whitespace') {
			characters.push({
				range: new vscode.Range(
					document.positionAt(startOffset + relativeOffset),
					document.positionAt(startOffset + relativeOffset + characterLength),
				),
				source: character,
				previous: undefined,
			});
		}
		relativeOffset += characterLength;
	}

	return characters;
}

function chooseCharacter(characters: string, random: () => number, previous?: string): string {
	const index = Math.min(characters.length - 1, Math.max(0, Math.floor(random() * characters.length)));
	const next = characters[index];
	if (!previous || next !== previous) {
		return next;
	}
	return characters[(index + 1) % characters.length];
}
