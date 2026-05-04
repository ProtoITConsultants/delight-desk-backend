# Git workflow — Remy

Welcome. You work on one branch: **`dev/remy`**. The default branch on GitHub is **`main`** — that is where reviewed code lands; your changes get there only through a **pull request (PR)**.

Repository URL:

```text
https://github.com/ProtoITConsultants/delight-desk-backend.git
```

---

## Rules

1. **Never commit secrets** — `.env`, API keys, and passwords stay on your machine only (they are not tracked by Git).
2. **Before new work**, pull the latest **`main`** into **`dev/remy`** (commands below).
3. **Always open PRs with base branch `main`** and compare branch **`dev/remy`**.
4. After your PR is merged, **sync `dev/remy` with `main` again** before your next task.
5. Prefer **small PRs** with a short description so review stays quick.

Optional commit style: `feat(scope): what changed` or `fix(scope): what changed`.

---

## First-time setup

Run once after you have Git and access to the GitHub repo.

```bash
git clone https://github.com/ProtoITConsultants/delight-desk-backend.git
cd backend_delight_desk

git fetch origin
git checkout dev/remy
```

Check that you are on the right branch:

```bash
git status
# Expect: On branch dev/remy
# Expect: Your branch is up to date with 'origin/dev/remy'.
```

Then install and run the project using the root **`README.md`** (Node, `.env`, database, etc.).

---

## Every time you work (update from `main`, commit, push, PR)

**1. Bring latest `main` into your branch**

```bash
git fetch origin
git checkout dev/remy
git merge origin/main
```

If Git reports conflicts, fix the files it lists, then:

```bash
git add <fixed-files>
git commit -m "Merge origin/main into dev/remy"
```

**2. Make your changes**, then stage and commit:

```bash
git add -A
git status
git commit -m "feat(scope): short description"
git push origin dev/remy
```

**3. Open a PR on GitHub**

- **Pull requests** → **New pull request**
- **Base:** `main`
- **Compare:** `dev/remy`
- Request review from Nabeel; when it is approved, **merge** into `main`.

**4. After the PR is merged**

```bash
git fetch origin
git checkout dev/remy
git merge origin/main
git push origin dev/remy
```

---

## Quick reference

| Goal              | Commands |
|-------------------|----------|
| Use your branch   | `git checkout dev/remy` |
| Update from `main`| `git fetch origin && git merge origin/main` (while on `dev/remy`) |
| Publish           | `git push origin dev/remy` |
| PR                | Base **`main`**, compare **`dev/remy`** |

---

## If something goes wrong

- **Merge conflicts** — Edit the files Git marks, then `git add` them and `git commit` to finish the merge.
- **Push rejected** — Run `git fetch origin`, then `git merge origin/dev/remy` if needed, fix conflicts, push again.
- **Wrong branch** — Run `git checkout dev/remy` before committing.
