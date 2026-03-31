# Roadmap

Planned improvements and known limitations for AIDeck.

## Compatibility

- **Stream Deck models**: Currently hardcoded to 5x3 (Standard, 15 keys). Support for Stream Deck XL (8x4), Stream Deck + (4x2 + dials), Mini (2x3), and Neo would require dynamic layout calculation based on device type.
- **Cross-platform**: The `open` command and Claude Desktop deep-links (`claude://`) are macOS-only. Windows support would need `start` / `explorer`, and Linux would need `xdg-open`. The manifest currently restricts to macOS.

## Features

- **Session filtering**: Filter by status (active/inactive), project, or hostname.
- **Session grouping**: Group sessions by project or remote host.
- **Long-press actions**: Long-press a session to see details or close it, instead of immediately opening.
- **Stream Deck + dial support**: Use dials for scrolling through pages instead of PREV/NEXT buttons.
- **Configurable refresh interval**: Currently fixed at 10 seconds.
- **Configurable state directory**: Currently hardcoded to `~/.claude/aideck/`.

## Code Quality

- **Test suite**: Add unit tests for session loading/merging, text wrapping/truncation, SVG rendering (snapshot tests on the raw SVG), ntfy message parsing, and coordinate-to-slot mapping.
- **CI pipeline**: GitHub Actions for build verification, linting, and tests.
- **ESLint + Prettier config**: Add linting configuration and format-on-commit.

## Distribution

- **Elgato Marketplace submission**: Package as `.streamDeckPlugin` for one-click install.
- **Automated hook setup**: A setup script or installer that configures Claude Code hooks automatically instead of requiring manual file copies.
