# Contributing to Kurdistan Watch

Thank you for your interest in contributing! All contributions — bug fixes, features, documentation, translations — are welcome.

---

## Before You Start

### 1. Sign the CLA

Before your Pull Request can be merged, you must sign the [Contributor License Agreement](CLA.md).

**How to sign:** Add a row with your GitHub username and today's date to [CLA-SIGNATORIES.md](CLA-SIGNATORIES.md) as part of your first PR.

```markdown
| @your-github-username | YYYY-MM-DD |
```

By adding this line, you confirm you have read and agreed to the CLA. This only needs to be done once.

### 2. Why a CLA?

The CLA ensures that Kurdistan.watch can continue to maintain, license, and evolve the project — including potentially releasing commercial versions — while keeping this open-source version available to the community. You retain copyright over your contributions; the CLA simply grants the project owner broad usage rights.

---

## How to Contribute

1. **Fork** the repository and create a branch from `main`.
2. **Make your changes.** Keep PRs focused — one feature or fix per PR.
3. **Run the linter** before submitting: `npm run lint`
4. **Open a Pull Request** against `main`. In your PR description, briefly explain what you changed and why.
5. **Sign the CLA** by adding your entry to `CLA-SIGNATORIES.md` if you haven't already.

---

## Code Style

- Follow existing patterns in the codebase — look at neighboring files before writing new ones.
- Format with Prettier: `npm run format`
- No console.log in production code paths.

---

## Development Setup

```bash
npm install
vercel dev        # starts local dev server on port 3000
```

See the README for full setup instructions including required environment variables.

---

## Questions?

Open a GitHub Issue or start a Discussion. We're happy to help.
