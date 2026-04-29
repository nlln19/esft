<div align="center">
  <img src="media/icon.png" width="120" />

# Terminal Error Sound

A simple Visual Studio Code extension that plays a sound when a terminal command fails or prints an error message.

</div>

## Features

- Plays a sound when a terminal command exits with an error.
- Detects common terminal error patterns.
- Includes multiple built-in sounds.
- Supports imported custom `.wav` sound files.
- Provides a status bar toggle to enable or disable the extension.
- Supports different trigger modes.

## Commands

- `Terminal Error Sound: Test Sound`
- `Terminal Error Sound: Choose Built-in Sound`
- `Terminal Error Sound: Import Custom Sound`
- `Terminal Error Sound: Reset Custom Sound`
- `Terminal Error Sound: Toggle Enabled`
- `Terminal Error Sound: Choose Trigger Mode`

## Trigger Modes

- `Patterns`: Plays a sound when an error pattern is detected.
- `Exit Code`: Plays a sound when a command exits with a non-zero exit code.
- `Both`: Uses both detection methods.

## Requirements

Terminal error detection works best when VS Code Terminal Shell Integration is enabled.

## Extension Settings

This extension contributes the following settings:

- `terminalErrorSound.enabled`
- `terminalErrorSound.soundPath`
- `terminalErrorSound.builtInSound`
- `terminalErrorSound.patterns`
- `terminalErrorSound.triggerMode`

## License

MIT