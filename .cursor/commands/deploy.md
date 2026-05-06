# Deploy

When the user writes `deploy`, `deploy changes`, `/deploy`, `commit and deploy`, or asks to deploy the current backend changes, treat it as an explicit request to:

1. Review `git status` to see all changed and untracked files.
2. Review `git diff` to understand the changes.
3. Review recent commit messages with `git log --oneline -5` and follow the repo's commit style.
4. Stage only relevant project changes. Do not stage secrets, `.env` files, credentials, or unrelated user changes unless explicitly requested.
5. Create a clear conventional commit message, for example:
   - `feat(users): include fulfillment partners in connections response`
   - `fix(agents): handle missing fulfillment config`
   - `docs(api): document connections response`
6. Commit the staged changes.
7. Push the current branch to its tracked remote.
8. Confirm the commit hash, branch, and push result to the user.
9. **Open a GitHub pull request** after a successful push so the user can review and merge without writing the description manually—unless they explicitly ask to skip the PR, push failed, there was nothing to commit, or PR creation is impossible.

### PR step (step 9) — how to do it

- **Target branch**: **`main`** (this repo’s workflow: feature branches → `main`; see `docs/git-setup/GIT_WORKFLOW_NABEEL.md`).
- **Skip PR creation** when the current branch is **`main`** (nothing to open into `main` from itself).
- **Tooling**: use the **GitHub CLI** (`gh`). Run `gh auth status`; if missing or not logged in, tell the user once how to fix it (install from [GitHub CLI](https://cli.github.com/), then `gh auth login`) and **do not** pretend a PR was created.
- **`git fetch origin`** first if `origin/main` might be stale (needed for accurate commit lists).
- **Avoid duplicate PRs**: if an open PR already exists from this head branch into `main`, show its URL (e.g. `gh pr list --head "$(git branch --show-current)" --base main --state open`) and **do not** run `gh pr create` again.
- **New PR — non-interactive** with a generated body:
  - **Title**: `git log -1 --pretty=%s` on the pushed tip.
  - **Body** (markdown), at minimum:
    - The latest commit’s full message (`git log -1 --pretty=%b`), trimmed of extra blank lines.
    - A short **### Commits** section: output of `git log origin/main..HEAD --oneline` (empty is fine if already aligned).
    - If any **new or changed** `drizzle/*.sql` migration is part of what you just committed/pushed, add a line that **production / reviewers should run `npm run db:migrate`** after merge (or that CI/deploy does it, if you know that’s true).
  - Example:  
    `gh pr create --base main --head "$(git branch --show-current)" --title "subject here" --body-file /tmp/pr-body.md`  
    (prefer a temp file when the body is multiline so shell escaping does not break.)
- **Report** the final **PR URL** to the user (or the existing PR link if one was already open).

Important safety rules:

- Do not run destructive git commands.
- Do not force push unless the user explicitly says to force push.
- If there are unrelated changes or possible secrets, stop and ask before committing them.
- If there are no changes, tell the user instead of creating an empty commit.
