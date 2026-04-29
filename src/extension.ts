import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

let statusBarItem: vscode.StatusBarItem;

type BuiltInSound = {
	id: string;
	label: string;
	description: string;
	fileName: string;
};

const BUILT_IN_SOUNDS: BuiltInSound[] = [
	{
		id: 'fahh',
		label: 'Fahh',
		description: 'Fahh sound',
		fileName: 'fahh.wav'
	},
	{
		id: 'bruh',
		label: 'Bruh',
		description: 'Bruh sound',
		fileName: 'bruh.wav'
	},
	{
		id: 'fail',
		label: 'Fail',
		description: 'Fail error sound',
		fileName: 'fail.wav'
	},
	{
		id: 'ohmygod',
		label: 'Oh My God',
		description: 'Oh my god sound',
		fileName: 'ohmygod.wav'
	},
	{
		id: 'vineboom',
		label: 'Vine Boom',
		description: 'Vine boom sound',
		fileName: 'vineboom.wav'
	}
];

type TriggerMode = 'both' | 'exitCode' | 'patterns';

type TriggerModeItem = {
	id: TriggerMode;
	label: string;
	description: string;
};

const TRIGGER_MODES: TriggerModeItem[] = [
	{
		id: 'both',
		label: 'Both',
		description: 'Trigger on error patterns and failed commands'
	},
	{
		id: 'exitCode',
		label: 'Exit Code',
		description: 'Trigger only when a command exits with a non-zero exit code'
	},
	{
		id: 'patterns',
		label: 'Patterns',
		description: 'Trigger only when error text is detected in the terminal output'
	}
];

const alertedExecutions = new WeakSet<vscode.TerminalShellExecution>();

let lastSoundAt = 0;
const SOUND_COOLDOWN_MS = 500;

let lastMissingSoundWarningAt = 0;
const MISSING_SOUND_WARNING_COOLDOWN_MS = 5000;

export function activate(context: vscode.ExtensionContext) {
	statusBarItem = vscode.window.createStatusBarItem(
		'terminalErrorSound.statusBar',
		vscode.StatusBarAlignment.Left,
		100
	);

	statusBarItem.name = 'Terminal Error Sound';
	statusBarItem.command = 'terminalErrorSound.toggleEnabled';

	context.subscriptions.push(statusBarItem);

	updateStatusBar();

	context.subscriptions.push(
		vscode.commands.registerCommand('terminalErrorSound.toggleEnabled', async () => {
			await toggleEnabled();
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('terminalErrorSound.enabled')) {
				updateStatusBar();
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('terminalErrorSound.testSound', () => {
			void playSound(context);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('terminalErrorSound.selectSound', async () => {
			await selectCustomSound(context);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('terminalErrorSound.resetSound', async () => {
			await resetCustomSound(context);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('terminalErrorSound.chooseBuiltInSound', async () => {
			await chooseBuiltInSound(context);
		})
	);

	context.subscriptions.push(
		vscode.window.onDidStartTerminalShellExecution((event) => {
			void monitorTerminalOutput(event.execution, context);
		})
	);

	context.subscriptions.push(
		vscode.window.onDidEndTerminalShellExecution((event) => {
			if (!isTerminalErrorSoundEnabled()) {
				return;
			}

			if (!shouldUseExitCodeTrigger()) {
				return;
			}

			if (event.exitCode !== undefined && event.exitCode !== 0) {
				alertOnce(event.execution, context);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('terminalErrorSound.chooseTriggerMode', async () => {
			await chooseTriggerMode();
		})
	);
}

export function deactivate() { }

async function monitorTerminalOutput(
	execution: vscode.TerminalShellExecution,
	context: vscode.ExtensionContext
): Promise<void> {
	if (!isTerminalErrorSoundEnabled()) {
		return;
	}

	if (!shouldUsePatternTrigger()) {
		return;
	}

	const config = vscode.workspace.getConfiguration('terminalErrorSound');


	const patterns = config.get<string[]>('patterns', [
		'\\berror\\b',
		'\\bfailed\\b',
		'\\bfailure\\b',
		'\\bexception\\b',
		'traceback',
		'panic:',
		'fatal:',
		'segmentation fault',
		'abort trap',
		'command not found',
		'not recognized as',
		'not found',
		'no such file or directory',
		'permission denied',
		'access denied',
		'cannot find',
		'module not found',
		'syntaxerror',
		'typeerror',
		'referenceerror',
		'npm err!',
		'die benennung .* wurde nicht als name',
		'der befehl .* ist entweder falsch geschrieben'
	]);

	const regex = createPatternRegex(patterns);

	if (!regex) {
		return;
	}
	let buffer = '';

	try {
		for await (const chunk of execution.read()) {
			buffer = stripAnsi(buffer + chunk).slice(-5000);

			if (regex.test(buffer)) {
				alertOnce(execution, context);
				break;
			}
		}
	} catch {
		// Ignore terminal stream errors.
	}
}

function alertOnce(
	execution: vscode.TerminalShellExecution,
	context: vscode.ExtensionContext
): void {
	if (alertedExecutions.has(execution)) {
		return;
	}

	alertedExecutions.add(execution);
	void playSound(context);
}

function stripAnsi(input: string): string {
	return input.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

async function playSound(
	context: vscode.ExtensionContext,
	customSoundPath?: string
): Promise<void> {
	const now = Date.now();

	if (now - lastSoundAt < SOUND_COOLDOWN_MS) {
		return;
	}

	lastSoundAt = now;

	const soundPath = customSoundPath ?? getSoundPath(context);

	if (!fs.existsSync(soundPath)) {
		await showMissingSoundWarning(context, soundPath);
		return;
	}

	try {
		if (process.platform === 'win32') {
			const escapedPath = soundPath.replace(/'/g, "''");

			await runCommand('powershell.exe', [
				'-NoProfile',
				'-ExecutionPolicy',
				'Bypass',
				'-Command',
				`$player = New-Object System.Media.SoundPlayer '${escapedPath}'; $player.PlaySync();`
			]);

			return;
		}

		if (process.platform === 'darwin') {
			await runCommand('afplay', [soundPath]);
			return;
		}

		await runFirstAvailable([
			['paplay', [soundPath]],
			['aplay', [soundPath]],
			['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', soundPath]]
		]);
	} catch {
		vscode.window.showWarningMessage(
			'Could not play sound. On Linux, install paplay, aplay, or ffplay.'
		);
	}
}

function getSoundPath(context: vscode.ExtensionContext): string {
	const config = vscode.workspace.getConfiguration('terminalErrorSound');

	const configuredPath = config.get<string>('soundPath', '').trim();

	if (configuredPath.length > 0) {
		return configuredPath;
	}

	const selectedBuiltInSound = config.get<string>('builtInSound', 'fahh');

	const sound =
		BUILT_IN_SOUNDS.find((item) => item.id === selectedBuiltInSound) ??
		BUILT_IN_SOUNDS[0];

	return path.join(context.extensionPath, 'media', sound.fileName);
}

function runCommand(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(command, args, { windowsHide: true }, (error) => {
			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});
}

async function runFirstAvailable(
	commands: Array<[string, string[]]>
): Promise<void> {
	let lastError: unknown;

	for (const [command, args] of commands) {
		try {
			await runCommand(command, args);
			return;
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError;
}

async function selectCustomSound(context: vscode.ExtensionContext): Promise<void> {
	const selectedFiles = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectFolders: false,
		canSelectMany: false,
		filters: {
			'WAV sound files': ['wav']
		},
		title: 'Import custom error sound'
	});

	if (!selectedFiles || selectedFiles.length === 0) {
		return;
	}

	const sourceUri = selectedFiles[0];

	const storageDir = vscode.Uri.joinPath(
		context.globalStorageUri,
		'sounds'
	);

	const targetUri = vscode.Uri.joinPath(
		storageDir,
		'custom-sound.wav'
	);

	try {
		await vscode.workspace.fs.createDirectory(storageDir);

		await vscode.workspace.fs.copy(sourceUri, targetUri, {
			overwrite: true
		});

		await vscode.workspace
			.getConfiguration('terminalErrorSound')
			.update(
				'soundPath',
				targetUri.fsPath,
				vscode.ConfigurationTarget.Global
			);

		vscode.window.showInformationMessage(
			'Custom sound imported successfully.'
		);

		await playSound(context, targetUri.fsPath);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : String(error);

		vscode.window.showErrorMessage(
			`Could not import custom sound: ${message}`
		);
	}
}

async function resetCustomSound(context: vscode.ExtensionContext): Promise<void> {
	const config = vscode.workspace.getConfiguration('terminalErrorSound');

	await config.update(
		'soundPath',
		'',
		vscode.ConfigurationTarget.Global
	);

	await config.update(
		'builtInSound',
		'fahh',
		vscode.ConfigurationTarget.Global
	);

	const importedSoundUri = vscode.Uri.joinPath(
		context.globalStorageUri,
		'sounds',
		'custom-sound.wav'
	);

	try {
		await vscode.workspace.fs.delete(importedSoundUri, {
			useTrash: false
		});
	} catch {
		// Ignore if no custom sound was imported.
	}

	vscode.window.showInformationMessage(
		'Terminal Error Sound has been reset to the default sound: Fahh'
	);

	await playSound(context);
}

async function chooseBuiltInSound(context: vscode.ExtensionContext): Promise<void> {
	const selected = await vscode.window.showQuickPick(
		BUILT_IN_SOUNDS.map((sound) => ({
			label: sound.label,
			description: sound.description,
			sound
		})),
		{
			title: 'Choose Built-in Terminal Error Sound',
			placeHolder: 'Select a built-in sound'
		}
	);

	if (!selected) {
		return;
	}

	const config = vscode.workspace.getConfiguration('terminalErrorSound');

	await config.update(
		'builtInSound',
		selected.sound.id,
		vscode.ConfigurationTarget.Global
	);

	await config.update(
		'soundPath',
		'',
		vscode.ConfigurationTarget.Global
	);

	vscode.window.showInformationMessage(
		`Built-in sound selected: ${selected.sound.label}`
	);

	await playSound(context);
}

function isTerminalErrorSoundEnabled(): boolean {
	return vscode.workspace
		.getConfiguration('terminalErrorSound')
		.get<boolean>('enabled', true);
}

async function setTerminalErrorSoundEnabled(enabled: boolean): Promise<void> {
	await vscode.workspace
		.getConfiguration('terminalErrorSound')
		.update(
			'enabled',
			enabled,
			vscode.ConfigurationTarget.Global
		);

	updateStatusBar();
}

async function toggleEnabled(): Promise<void> {
	const enabled = isTerminalErrorSoundEnabled();
	const newValue = !enabled;

	await setTerminalErrorSoundEnabled(newValue);

	vscode.window.showInformationMessage(
		`Terminal Error Sound ${newValue ? 'enabled' : 'disabled'}.`
	);
}

function updateStatusBar(): void {
	if (!statusBarItem) {
		return;
	}

	const enabled = isTerminalErrorSoundEnabled();
	const triggerMode = getTriggerMode();

	statusBarItem.text = enabled
		? '$(bell) Error Sound: On'
		: '$(bell) Error Sound: Off';

	statusBarItem.tooltip = enabled
		? `Terminal Error Sound is enabled.\nTrigger mode: ${triggerMode}\nClick to disable.`
		: `Terminal Error Sound is disabled.\nTrigger mode: ${triggerMode}\nClick to enable.`;

	statusBarItem.show();
}

async function showMissingSoundWarning(
	context: vscode.ExtensionContext,
	missingPath: string
): Promise<void> {
	const now = Date.now();

	if (now - lastMissingSoundWarningAt < MISSING_SOUND_WARNING_COOLDOWN_MS) {
		return;
	}

	lastMissingSoundWarningAt = now;

	const resetAction = 'Reset to Default';
	const importAction = 'Import Custom Sound';
	const chooseAction = 'Choose Built-in Sound';

	const selectedAction = await vscode.window.showWarningMessage(
		'The selected sound file could not be found.',
		{
			detail: `Missing file:\n${missingPath}`,
			modal: false
		},
		resetAction,
		importAction,
		chooseAction
	);

	if (selectedAction === resetAction) {
		await resetCustomSound(context);
		return;
	}

	if (selectedAction === importAction) {
		await selectCustomSound(context);
		return;
	}

	if (selectedAction === chooseAction) {
		await chooseBuiltInSound(context);
	}
}

function createPatternRegex(patterns: string[]): RegExp | undefined {
	const cleanedPatterns = patterns
		.map((pattern) => pattern.trim())
		.filter((pattern) => pattern.length > 0);

	if (cleanedPatterns.length === 0) {
		return undefined;
	}

	try {
		return new RegExp(cleanedPatterns.join('|'), 'i');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		vscode.window.showWarningMessage(
			`Invalid Terminal Error Sound pattern: ${message}`
		);

		return undefined;
	}
}

function getTriggerMode(): TriggerMode {
	const mode = vscode.workspace
		.getConfiguration('terminalErrorSound')
		.get<string>('triggerMode', 'both');

	if (mode === 'both' || mode === 'exitCode' || mode === 'patterns') {
		return mode;
	}

	return 'both';
}

function shouldUseExitCodeTrigger(): boolean {
	const mode = getTriggerMode();

	return mode === 'both' || mode === 'exitCode';
}

function shouldUsePatternTrigger(): boolean {
	const mode = getTriggerMode();

	return mode === 'both' || mode === 'patterns';
}

async function chooseTriggerMode(): Promise<void> {
	const selected = await vscode.window.showQuickPick(
		TRIGGER_MODES.map((mode) => ({
			label: mode.label,
			description: mode.description,
			mode
		})),
		{
			title: 'Choose Terminal Error Sound Trigger Mode',
			placeHolder: 'Select when the sound should be played'
		}
	);

	if (!selected) {
		return;
	}

	await vscode.workspace
		.getConfiguration('terminalErrorSound')
		.update(
			'triggerMode',
			selected.mode.id,
			vscode.ConfigurationTarget.Global
		);

	vscode.window.showInformationMessage(
		`Terminal Error Sound trigger mode selected: ${selected.mode.label}`
	);
}