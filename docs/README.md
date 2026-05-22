# Documentation

- **[Git workflow — Remy](git-setup/GIT_WORKFLOW_REMY.md)** — Remy only (`dev/remy` → `main`).
- **[Git workflow — Nabeel](git-setup/GIT_WORKFLOW_NABEEL.md)** — Nabeel only (`dev/nabeel` → `main`).
- **[Cancel Workflow API (frontend handoff)](frontend/cancel-workflow-api.md)** — Approval queue cancel endpoint, statuses, SSE, and UI integration notes.

This folder holds diagrams, video scripts, and supporting docs for the Delight Desk backend. Use the structure below so everything stays easy to find as you add more agents and artifacts.

---

## Folder structure

```
docs/
├── README.md                 # This file — index and conventions
├── architecture/             # System-wide / cross-cutting docs
│   └── *.drawio              # e.g. database, infra, high-level flows
└── agents/                   # One subfolder per agent
    ├── wismo/
    │   ├── workflow.mmd      # Mermaid flowchart (phases)
    │   ├── workflow-sequence.mmd  # Mermaid sequence diagram (components)
    │   ├── workflow.drawio   # Draw.io diagram (editable in app.diagrams.net)
    │   ├── video-script.md   # Script for explainer/demo videos
    │   └── marketing-portfolio.md
    ├── product/
    ├── promo-code/
    ├── subscription/
    └── <agent-name>/         # Same pattern for each new agent
```

---

## Conventions

| Type | Location | Naming |
|------|----------|--------|
| **Architecture / system diagrams** | `architecture/` | Descriptive name, e.g. `database-architecture-choices.drawio` |
| **Agent workflow diagram (Draw.io)** | `agents/<agent>/` | `workflow.drawio` |
| **Agent workflow diagram (Mermaid)** | `agents/<agent>/` | `workflow.mmd` |
| **Agent video script** | `agents/<agent>/` | `video-script.md` |
| **Agent marketing / portfolio copy** | `agents/<agent>/` | `marketing-portfolio.md` |

- **One folder per agent** under `agents/` keeps all WISMO (or returns, refunds, etc.) artifacts together.
- Use **lowercase, hyphenated** folder names (e.g. `wismo`, `returns`, `refunds`).
- Keeping both `.drawio` and `.mmd` in the same agent folder is fine: Draw.io for editing, Mermaid for version control and rendering in docs/PRs.

---

## Adding a new agent

1. Create `docs/agents/<agent-name>/`.
2. Add whatever you need: `workflow.drawio`, `workflow.mmd`, `video-script.md`, `marketing-portfolio.md`.
3. Optionally add a short note in this README under “Documented agents” below.

---

## Documented agents

| Agent | Folder | Contents |
|-------|--------|----------|
| **WISMO** (Where Is My Order) | `agents/wismo/` | workflow.mmd, workflow-sequence.mmd, workflow.drawio, video-script.md, marketing-portfolio.md, [video](https://www.awesomescreenshot.com/video/50519916?key=38dad097fafdc3f48a96f86022de1911) |
| **Product** | `agents/product/` | workflow.mmd, video-script.md, marketing-portfolio.md, [video](https://www.awesomescreenshot.com/video/50521569?key=1a654e05b932b2569540b6138ae4f6b4) |
| **Promo Code** | `agents/promo-code/` | workflow.mmd, video-script.md, marketing-portfolio.md, [video](https://www.awesomescreenshot.com/video/50521139?key=9f5fecd30ec3728da64d66abb6b1803a) |
| **Subscription** | `agents/subscription/` | workflow.mmd, video-script.md, marketing-portfolio.md, [video](https://www.awesomescreenshot.com/video/50520696?key=0a8ba181d58e29679374fff9a5cefdfc) |
