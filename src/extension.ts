import * as vscode from 'vscode';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

const alertedExecutions = new WeakSet<vscode.TerminalShellExecution>();

let lastSoundAt = 0;
const SOUND_COOLDOWN_MS = 500;

export function activate(context: vscode.ExtensionContext) {
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
			const enabled = vscode.workspace
				.getConfiguration('terminalErrorSound')
				.get<boolean>('enabled', true);

			if (!enabled) {
				return;
			}

			if (event.exitCode !== undefined && event.exitCode !== 0) {
				alertOnce(event.execution, context);
			}
		})
	);
}

export function deactivate() { }

async function monitorTerminalOutput(
	execution: vscode.TerminalShellExecution,
	context: vscode.ExtensionContext
): Promise<void> {
	const config = vscode.workspace.getConfiguration('terminalErrorSound');

	const enabled = config.get<boolean>('enabled', true);
	if (!enabled) {
		return;
	}

	const patterns = config.get<string[]>('patterns', [
		'\\berror\\b',
		'\\bfailed\\b',
		'\\bexception\\b',
		'traceback',
		'panic:'
	]);

	const regex = new RegExp(patterns.join('|'), 'i');
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
		vscode.window.showWarningMessage(`Sound file not found: ${soundPath}`);
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
			'Sound files': ['wav']
		},
		title: 'Select a custom error sound'
	});

	if (!selectedFiles || selectedFiles.length === 0) {
		return;
	}

	const selectedPath = selectedFiles[0].fsPath;

	await vscode.workspace
		.getConfiguration('terminalErrorSound')
		.update('soundPath', selectedPath, vscode.ConfigurationTarget.Global);

	vscode.window.showInformationMessage(
		`Custom terminal error sound selected: ${selectedPath}`
	);

	await playSound(context, selectedPath);
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