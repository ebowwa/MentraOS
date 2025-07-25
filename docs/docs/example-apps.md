# Example Apps

MentraOS provides several example applications to help you get started building for different types of smart glasses. Choose an example based on your device capabilities and use case.

## Examples for HUD-enabled Glasses

These examples work with smart glasses that have a heads-up display (HUD), such as Even Realities G1, Vuzix Z100, and Mentra Mach1.

### Live Captions Example

**Repository:** [MentraOS-Cloud-Example-App](https://github.com/Mentra-Community/MentraOS-Cloud-Example-App)

A simple example app that displays spoken words as live captions on the glasses' HUD. This is the recommended starting point for developers new to MentraOS.

**Features:**

- Real-time speech-to-text conversion example
- Display captions on glasses HUD

**Best for:** Getting started with HUD-based applications

### Extended Example (Advanced)

**Repository:** [MentraOS-Extended-Example-App](https://github.com/Mentra-Community/MentraOS-Extended-Example-App)

A more comprehensive example that includes additional features beyond the basic live captions functionality.

**Features:**

- Real-time speech-to-text conversion example
- Webview example
- Mira tools example

**Best for:** Developers who have completed the quickstart and want to explore more advanced features

### Hangman Game

**Repository:** [Hangman](https://github.com/Mentra-Community/Hangman)

**Mentra Store:** [Download the app](https://apps.mentra.glass/package/com.mentra.hangman)

A classic hangman game that demonstrates how to display bitmap images on glasses with HUD displays. This example shows advanced display capabilities beyond simple text.

**Features:**

- **Bitmap image rendering** - Shows how to create and display custom graphics on the HUD
- **Game state visualization** - Updates hangman drawing as the game progresses
- **Interactive gameplay** - Combines voice input with visual feedback

**Best for:** Learning how to work with bitmap images and create graphical interfaces for HUD glasses

## Advanced Examples

### Mira AI Assistant

**Repository:** [Mira](https://github.com/Mentra-Community/Mira)

Mira is an AI Assistant app that comes pre-installed on all MentraOS accounts. It demonstrates advanced capability detection and adaptive functionality based on connected glasses hardware.

**Features:**

- **Adaptive capabilities** - Uses `session.capabilities` to detect and use available hardware
- **Text-to-speech (TTS)** - Plays AI responses through glasses speakers when available (e.g., Mentra Live)
- **Camera integration** - Takes photos when glasses have a camera (e.g., Mentra Live)
- **Display support** - Shows responses on HUD when glasses have a display (e.g., Even Realities G1)

**Best for:** Learning how to build adaptive apps that work across different glasses models with varying capabilities

## Examples for Camera-only Glasses

These examples are designed for smart glasses without a HUD but with camera capabilities, such as Mentra Live glasses.

### Camera Example

**Repository:** [photo-taker](https://github.com/Mentra-Community/photo-taker)

**Mentra Store:** [Download the app](https://apps.mentra.glass/package/com.mentra.camera-photo-example)

An example app that demonstrates camera functionality for glasses without a display. Users can capture photos using the glasses and view them on their phone.

**Features:**

- Photo capture from glasses camera with a button press
- Display captured images in the app's webview

**Best for:** Building camera-based applications for non-HUD glasses

## Getting Started

To use any of these examples:

1. Choose the example that best matches your device and use case
2. Use the "Use this template" button on the GitHub repository to create your own copy
3. Follow the setup instructions in the repository's README
4. Refer to the [Quickstart Guide](./quickstart.md) for detailed setup steps

## Which Example Should I Choose?

- **New to MentraOS?** Start with the [Live Captions Example](https://github.com/Mentra-Community/MentraOS-Cloud-Example-App)
- **Have HUD glasses and want advanced features?** Try the [Extended Example](https://github.com/Mentra-Community/MentraOS-Extended-Example-App)
- **Have camera-only glasses (like Mentra Live)?** Use the [Camera Example](https://github.com/Mentra-Community/photo-taker)
- **Want to see TTS, camera, and adaptive capabilities?** Check out [Mira AI Assistant](https://github.com/Mentra-Community/Mira)
- **Want to display bitmap images on HUD glasses?** Try the [Hangman Game](https://github.com/Mentra-Community/Hangman)
