# VStudy for claude

Install Node.js 24 or later. Connect your school in VStudy Pro and turn on **Settings > Agents**.

Run the bundled CLI with an absolute path to install only the MCP entry. Review the dry-run first.

```sh
node '/absolute/path/to/vstudy-mcp.cjs' install --client claude --dry-run
node '/absolute/path/to/vstudy-mcp.cjs' install --client claude
```

Restart your client. Call `list_accounts`, compare the code printed by the server on stderr with VStudy, and approve the requested account and scopes in the app. Client names are self-reported. No school credentials belong in client configuration.

The installer preserves unrelated settings and saves a private backup of existing files. Uninstall removes only an unchanged VStudy entry. It does not revoke the grant. Revoke access in VStudy Settings > Agents.

The included `skills` and workflow files are optional agent guidance. They do not grant access or approve actions. All four study workflows are also exposed as MCP prompts. Read the [client format evidence](../../CLIENT_FORMATS.md) for what was actually verified.

This directory is a standalone plugin after `pnpm --filter @vstudy/mcp build` copies the bundled CLI into its `dist` directory. Keep that generated directory when copying or installing the plugin. Plugin launch uses `node` from the client PATH. The configuration installer instead pins an absolute Node path. Use one installation method to avoid duplicate servers.
