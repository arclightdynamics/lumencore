# Demo GIFs

These are [vhs](https://github.com/charmbracelet/vhs) scripts for generating demo GIFs.

## Install vhs

```bash
# macOS
brew install vhs

# Linux (via Go)
go install github.com/charmbracelet/vhs@latest

# Or download from releases
# https://github.com/charmbracelet/vhs/releases
```

## Generate GIFs

```bash
cd demo

# Full demo (~20 seconds) - for README hero
vhs demo.tape

# Short demo (~10 seconds) - for social/quick preview
vhs demo-short.tape
```

## Output

- `demo.gif` - Full workflow: install → init → Claude activation → recall
- `demo-short.gif` - Quick init showing the logo and success messages

## Customization

Edit the `.tape` files to adjust:
- `Set Theme` - Try "Dracula", "Tokyo Night", "Nord"
- `Set FontSize` - Larger for visibility
- `Set Width/Height` - Dimensions
- `Set TypingSpeed` - Faster/slower typing
- `Sleep` - Pause durations
