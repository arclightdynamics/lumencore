# LumenCore Demo - Hero GIF for GitHub/Website
# Install vhs: https://github.com/charmbracelet/vhs
# Run: vhs demo.tape

Output demo.gif
Set FontSize 16
Set Width 900
Set Height 500
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 50ms

# Title pause
Sleep 1s

# Step 1: Install
Type "npm install -g lumencore"
Enter
Sleep 3s

# Step 2: Initialize in a project
Type "cd ~/my-project && lumencore init"
Enter
Sleep 4s

# Step 3: Start Claude - show activation
Type "claude"
Enter
Sleep 2s

# Simulate Claude activating LumenCore
Type "# Claude automatically calls lumencore_activate..."
Sleep 2s
Enter
Sleep 1s

# Show the connected message
Type@0ms "✓ CONNECTED | Project: my-project | Memories: 3"
Sleep 2s
Enter

# Step 4: Show recall in action
Sleep 1s
Type "How does authentication work in this project?"
Enter
Sleep 2s

# Simulate Claude using recall
Type@0ms "# Claude searches memories with recall..."
Sleep 1.5s
Enter
Type@0ms "Found: 'JWT auth with refresh tokens, stored in httpOnly cookies'"
Sleep 3s

# Final pause
Sleep 2s
