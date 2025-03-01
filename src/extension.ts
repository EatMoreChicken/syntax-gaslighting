import * as vscode from 'vscode';
import * as crypto from 'crypto';

/* ------------------------------------------------------------------------- */
/*                                 Constants                                 */
/* ------------------------------------------------------------------------- */

const DEFAULT_GASLIGHTING_CHANCE = 5; // 5% chance of gaslighting per line

const MIN_LINE_LENGTH = 10; // Minimum line length to apply gaslighting (trimmed)

const GASLIGHTING_MESSAGES = [
    'Are you sure this will pass the code quality checks? 🤔',
    'Is this line really covered by unit tests? 🧐',
    "I wouldn't commit that line without double checking... 💭",
    'Your tech lead might have questions about this one 🤔',
    "That's an... interesting way to solve this 🤯",
    'Did you really mean to write it this way? 🤔',
    "Maybe add a comment explaining why this isn't as bad as it looks? 📝",
    'Bold choice! Very... creative 💡',
    'Please. Tell me Copilot wrote this one... 🤖',
    'Totally not a memory leak... 🚽',
    "I'd be embarrassed to push this to git if I were you. 😳",
];

/* ------------------------------------------------------------------------- */
/*                               Configuration                               */
/* ------------------------------------------------------------------------- */

let isSynthaxGaslightingEnabled = true;
let gaslightingChancePercentage = DEFAULT_GASLIGHTING_CHANCE;

/* ------------------------------------------------------------------------- */
/*                             Global variables                              */
/* ------------------------------------------------------------------------- */

let decorationType: vscode.TextEditorDecorationType;

/* ------------------------------------------------------------------------- */
/*                            Extension functions                            */
/* ------------------------------------------------------------------------- */

export function activate(context: vscode.ExtensionContext) {
    // Create decoration type
    decorationType = vscode.window.createTextEditorDecorationType({
        textDecoration: 'none; border-bottom: 2px dotted rgb(213, 221, 107)',
        isWholeLine: false, // Only underline the actual code
    });

    let timeout: NodeJS.Timer | undefined = undefined;
    function triggerUpdateGaslightingDecorations() {
        if (timeout) {
            clearTimeout(timeout);
            timeout = undefined;
        }
        timeout = setTimeout(updateGaslightingDecorations, 500);
    }

    vscode.window.onDidChangeActiveTextEditor(
        () => {
            if (isSynthaxGaslightingEnabled) {
                triggerUpdateGaslightingDecorations();
            }
        },
        null,
        context.subscriptions,
    );

    vscode.workspace.onDidChangeTextDocument(
        () => {
            if (isSynthaxGaslightingEnabled) {
                triggerUpdateGaslightingDecorations();
            }
        },
        null,
        context.subscriptions,
    );

    // Register command to toggle the extension
    const disposable = vscode.commands.registerCommand('synthax-gaslighting.toggle', () => {
        isSynthaxGaslightingEnabled = !isSynthaxGaslightingEnabled;
        if (isSynthaxGaslightingEnabled) {
            vscode.window.showInformationMessage('Synthax Gaslighting enabled! Prepare to question everything...');
            triggerUpdateGaslightingDecorations();
        } else {
            vscode.window.showInformationMessage('Synthax Gaslighting disabled. You can code in peace now.');
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
                activeEditor.setDecorations(decorationType, []);
            }
        }
    });

    // Register command to change gaslighting chance
    const changeChanceCommand = vscode.commands.registerCommand('synthax-gaslighting.editChance', async () => {
        const result = await vscode.window.showInputBox({
            prompt: 'Enter the percentage chance of gaslighting (1-100)',
            value: gaslightingChancePercentage.toString(),
            validateInput: (value: string) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 1 || num > 100) {
                    return 'Please enter a number between 1 and 100';
                }
                return null;
            },
        });

        if (result !== undefined) {
            gaslightingChancePercentage = parseInt(result);
            vscode.window.showInformationMessage(`Gaslighting chance set to ${gaslightingChancePercentage}%`);
            triggerUpdateGaslightingDecorations();
        }
    });

    context.subscriptions.push(disposable, changeChanceCommand);

    // Initial decorations
    if (vscode.window.activeTextEditor) {
        triggerUpdateGaslightingDecorations();
    }
}

export function deactivate() {
    // Clean up decorations when deactivating
    if (vscode.window.activeTextEditor) {
        vscode.window.activeTextEditor.setDecorations(decorationType, []);
    }
}

/* ------------------------------------------------------------------------- */
/*                                 Functions                                 */
/* ------------------------------------------------------------------------- */

// Create a deterministic hash from a string
function createHash(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex');
}

// Get deterministic message based on line content
function getGaslightingMessageForLineContent(line: string): string | null {
    const hash = createHash(line);

    // Use first 8 chars for selection decision
    const selectionNum = parseInt(hash.substring(0, 8), 16);

    // Use last 8 chars for message selection
    const messageNum = parseInt(hash.substring(hash.length - 8), 16);

    // Use the first number to determine if we should show a message based on configured percentage
    if (selectionNum % 100 < gaslightingChancePercentage) {
        // Use the second number to select the message
        const messageIndex = messageNum % GASLIGHTING_MESSAGES.length;
        return GASLIGHTING_MESSAGES[messageIndex];
    }
    return null;
}

async function updateGaslightingDecorations() {
    if (!isSynthaxGaslightingEnabled) {
        return;
    }

    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor) {
        return;
    }

    const document = activeEditor.document;
    const decorationsArray: vscode.DecorationOptions[] = [];

    // Parse the document line by line
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
        const line = document.lineAt(lineIndex);
        const trimmedLineText = line.text.trim();

        // Remove empty lines
        if (line.isEmptyOrWhitespace) {
            continue;
        }

        // Remove short lines
        if (trimmedLineText.length < MIN_LINE_LENGTH) {
            continue;
        }

        // Remove comments (Dummy comment detection)
        const isComment =
            trimmedLineText.startsWith('//') ||
            trimmedLineText.startsWith('#') ||
            trimmedLineText.startsWith('/*') ||
            trimmedLineText.startsWith('*') ||
            trimmedLineText.startsWith('<!--');
        if (isComment) {
            continue;
        }

        // Add gaslighting message
        const message = getGaslightingMessageForLineContent(trimmedLineText);
        if (message === null) {
            continue;
        }

        // Find the start of actual code (skip leading whitespace)
        const firstNonWhitespace = line.text.search(/\S/);
        if (firstNonWhitespace === -1) {
            continue;
        }

        const startPos = new vscode.Position(lineIndex, firstNonWhitespace);
        const endPos = new vscode.Position(lineIndex, line.text.length);

        const decoration = {
            range: new vscode.Range(startPos, endPos),
            hoverMessage: new vscode.MarkdownString(message),
        };

        decorationsArray.push(decoration);
    }

    activeEditor.setDecorations(decorationType, decorationsArray);
}
