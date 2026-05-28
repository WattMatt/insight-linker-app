# CI workflow templates (manual install required)

Workflow files live here as templates instead of `.github/workflows/`
because the gh CLI auth I had available when committing them lacked
the `workflow` OAuth scope. To activate one:

1. Copy the `.workflow.yml` file to `.github/workflows/<same-name>.yml`:

   ```bash
   mkdir -p .github/workflows
   cp docs/ci/regen-supabase-types.workflow.yml .github/workflows/regen-supabase-types.yml
   ```

2. Commit + push from a session whose token has the `workflow` scope
   (or via the GitHub web UI's "Add file" → "Create new file" at
   `.github/workflows/regen-supabase-types.yml`).

3. Add any required secrets at **Settings → Secrets and variables →
   Actions**. Each workflow lists its required secrets in a header
   comment.

4. Allow Actions to open PRs at **Settings → Actions → General →
   Workflow permissions** → "Read and write permissions" + "Allow
   GitHub Actions to create and approve pull requests".

## Workflows

| File | What it does | Required secrets |
|---|---|---|
| `regen-supabase-types.workflow.yml` | Regenerates `src/integrations/supabase/types.ts` on every migration push and opens a PR if the file changed. Implements [Strategy 4](../../ARCHITECTURE_AUDIT.md#strategy-4--auto-regenerate-supabase-types-in-ci). | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID` |
