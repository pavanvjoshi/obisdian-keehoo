

**Pull from `dev-xyz` without losing your current work**

bash

```bash
git stash                      # Save your uncommitted changes
git pull origin dev-xyz        # Pull latest from dev-xyz
git stash pop                  # Restore your stashed changes
```