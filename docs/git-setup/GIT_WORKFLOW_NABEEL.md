# Git workflow — Nabeel

You work on **`dev/nabeel`**. The default branch is **`main`** (production source of truth). Changes reach `main` through **PRs** from your branch.

Repository URL:

```text
https://github.com/ProtoITConsultants/delight-desk-backend.git
```

---

## Rules

1. **Never commit secrets** — `.env` and credentials stay local (gitignored).
2. **Before new work**, merge **`origin/main`** into **`dev/nabeel`**.
3. **PRs target `main`** (`dev/nabeel` → `main`).
4. After a PR merges, **sync `dev/nabeel` with `main`** again before the next task.
5. Prefer **small PRs** with clear descriptions.

Optional: conventional commits (`feat(agents): …`, `fix(api): …`).

---

## Branch layout (maintainer note)

| Branch       | Purpose |
|--------------|---------|
| `main`       | Default; deploy / release |
| `dev/nabeel` | Your integration branch |
| `dev/remy`   | Remy’s branch (do not use for your daily commits) |

Do **not** create a branch named exactly **`dev`** — it conflicts with **`dev/nabeel`** / **`dev/remy`** in Git.

Contributor-facing doc for Remy: **`GIT_WORKFLOW_REMY.md`** (give him only that file if you want zero cross-role clutter).

---

## Production deployment (GitHub Actions)

When commits land on **`main`** — including **merging a PR** — the workflow **Delight Desk Deployment** builds and deploys to EC2. Pushes to **`dev/nabeel`** or **`dev/remy`** alone do **not** deploy.

To redeploy the current tip of **`main`** without a new commit: GitHub → **Actions** → **Delight Desk Deployment** → **Run workflow** → branch **`main`**.

---

## First-time setup (new clone or machine)

```bash
git clone https://github.com/ProtoITConsultants/delight-desk-backend.git
cd backend_delight_desk

git fetch origin
git checkout dev/nabeel
```

If Git does not create a local tracking branch automatically:

```bash
git fetch origin
git checkout -b dev/nabeel origin/dev/nabeel
```

---

## Ongoing work

**1. Sync from `main`**

```bash
git fetch origin
git checkout dev/nabeel
git merge origin/main
```

Resolve conflicts if any, then commit the merge.

**2. Commit and push**

```bash
git add -A
git status
git commit -m "feat(scope): description"
git push origin dev/nabeel
```

**3. PR**

GitHub: base **`main`**, compare **`dev/nabeel`**. Merge when ready.

**4. After merge**

```bash
git fetch origin
git checkout dev/nabeel
git merge origin/main
git push origin dev/nabeel
```

---

## Quick reference

| Goal              | Commands |
|-------------------|----------|
| Your branch       | `git checkout dev/nabeel` |
| Update from `main`| `git fetch origin && git merge origin/main` (on `dev/nabeel`) |
| Publish           | `git push origin dev/nabeel` |
| PR                | **`dev/nabeel` → `main`** |

---

## Troubleshooting

- **`cannot lock ref 'refs/heads/dev/…'`** — A branch named `dev` exists; remove or rename it. Personal branches must stay `dev/nabeel` / `dev/remy`.
- **Merge conflicts** — Fix listed files → `git add` → `git commit`.
- **Push rejected** — `git fetch origin && git merge origin/dev/nabeel`, resolve, push again.
