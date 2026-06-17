## About this project

This repo is a published, shareable agent skill that makes Chrome DevTools MCP
usage faster and safer. `SKILL.md` is the skill itself (for agents). `README.md`
is for humans. Keep development and usage detail in this file, not the README.

## Keep it portable

This skill is used by many people with different setups. Anything written into
`SKILL.md` must be generally relevant, not specific to one person's machine or
config.

- Don't hardcode MCP server or config-key names. Tool-name prefixes (e.g.
  `chrome-devtools_*`) come from each user's MCP config key and vary per setup.
  Refer to tools by their bare names and explain that the prefix depends on the
  config key. Treat `chrome-devtools_*` as the default single-instance prefix.
- Don't pin package versions, account IDs, env-var names, absolute file paths,
  or personal CLI tools. Use generic placeholders (`<ACCOUNT_ID>`) where a value
  is required.
- When adding guidance learned from real usage, state the behavior and the fix,
  not the personal context it came from.
- Before committing an edit, re-read the diff for anything that only makes sense
  on the author's machine, and generalize or omit it.

## Data-derived claims

Numbers in `SKILL.md` (tool-speed medians, error frequencies) come from real
session data. If you refresh them, keep the caption generic ("measured from real
session data") and don't include personal session counts or identifiers.

## Keeping this file current

Update this AGENTS.md whenever the project's structure or conventions change in a
way that future edits should know about.
