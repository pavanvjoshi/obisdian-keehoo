**1. Pull into your existing branch from `dev-xyz`**

```bash
git checkout your-branch
git pull origin dev-xyz
```

**2. Pull into a brand new branch from `dev-xyz`**

```bash
git fetch origin
git checkout -b your-new-branch origin/dev-xyz
```

