# Claude Code Enhancement Master Plan

**Created:** 2026-01-19
**Source:** /hearted archive + web research
**Status:** PRDs Created - Awaiting Approval

---

## PRD Files Created

| PRD | File | Stories |
|-----|------|---------|
| 1. CC-Guide Docs | `~/.claude/prds/cc-enhancement-1-documentation.json` | 10 |
| 2. Hooks Enhancement | `~/.claude/prds/cc-enhancement-2-hooks.json` | 6 |
| 3. Skills Frontmatter | `~/.claude/prds/cc-enhancement-3-skills-frontmatter.json` | 5 |
| 4. MCP Integrations | `~/.claude/prds/cc-enhancement-4-mcp-integrations.json` | 5 |
| 5. Config Optimization | `~/.claude/prds/cc-enhancement-5-config-optimization.json` | 6 |
| 6. Following List | `~/.claude/prds/cc-enhancement-6-following-list.json` | 3 |
| **Total** | | **35 stories** |

---

## Overview

Decomposition of 38 enhancement items into actionable PRDs across 6 workstreams.

---

## PRD 1: CC-Guide Documentation Updates

**Goal:** Update ~/.claude/docs/claude-code-cli-guide.md with missing v2.1.x features

### Stories

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| DOC-1 | Add PreCompact hook documentation | Document new hook event that fires before compaction | High |
| DOC-2 | Add SubagentStart/SubagentStop hooks | Document new subagent lifecycle hooks with `agent_transcript_path` | High |
| DOC-3 | Document `auto:N` MCP threshold syntax | Add syntax and examples for configuring MCP tool search threshold | High |
| DOC-4 | Document `additionalContext` in PreToolUse | Show how hooks can inject context into model | Medium |
| DOC-5 | Document Setup hook event | Add `--init`, `--init-only`, `--maintenance` trigger documentation | Medium |
| DOC-6 | Document hooks in frontmatter | Show skills/agents can define hooks inline with `once: true` option | High |
| DOC-7 | Document `plansDirectory` setting | Add to configuration section | Low |
| DOC-8 | Expand Claude Code on Web section | Full documentation of web-based delegation | Medium |
| DOC-9 | Add LSP Tool documentation | Document code intelligence features | Medium |
| DOC-10 | Update changelog section | Add v2.1.9-v2.1.11 entries | High |

**Files to modify:**
- `~/.claude/docs/claude-code-cli-guide.md`
- `~/Projects/blakecrosley.com/content/guides/claude-code.md` (sync)

---

## PRD 2: Hooks System Enhancement

**Goal:** Add new hooks to ~/.claude/hooks.json for better session management

### Stories

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| HOOK-1 | Add PreCompact hook | Backup transcript before compaction for session recovery | High |
| HOOK-2 | Add SubagentStart hook | Log subagent spawns, optionally inject context | Medium |
| HOOK-3 | Add SubagentStop hook | Capture subagent transcripts for debugging | Medium |
| HOOK-4 | Add Setup hook | Auto-configure repos on `--init` | Low |
| HOOK-5 | Implement `additionalContext` pattern | Create PreToolUse hook that injects dynamic context | Medium |
| HOOK-6 | Add context filtering hook | Filter sensitive info from prompts (UserPromptSubmit) | Low |

**Files to modify:**
- `~/.claude/hooks.json`
- `~/.claude/hooks/` (individual hook scripts)

---

## PRD 3: Skills Frontmatter Enhancement

**Goal:** Upgrade existing skills to use hooks in frontmatter

### Stories

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| SKILL-1 | Audit existing skills for hook opportunities | Review all skills in ~/.claude/skills/ | High |
| SKILL-2 | Add frontmatter hooks to review skill | Add PostToolUse hook for quality tracking | Medium |
| SKILL-3 | Add frontmatter hooks to design skills | Add PreToolUse for design system injection | Medium |
| SKILL-4 | Add `once: true` session hooks | One-time setup hooks in frequently used skills | Medium |
| SKILL-5 | Create skill template with hooks pattern | Standard template for new skills | Low |

**Files to modify:**
- `~/.claude/skills/*/SKILL.md` (multiple skills)
- `~/.claude/templates/skill-template.md` (new)

---

## PRD 4: MCP Server Integrations

**Goal:** Evaluate and add high-value MCP servers

### Stories

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| MCP-1 | Evaluate Sequential Thinking MCP | Structured reasoning for complex problems | High |
| MCP-2 | Evaluate Figma Dev Mode MCP | Design-to-code workflows | Medium |
| MCP-3 | Evaluate Apple MCP | Maps, Notes integration | Low |
| MCP-4 | Evaluate Memory MCP | Knowledge graph persistent memory | Medium |
| MCP-5 | Document MCP tool search auto:N configuration | Best practices for threshold tuning | High |

**Files to modify:**
- `~/.claude/settings.json` (mcp server configs)
- `~/.claude/docs/claude-code-cli-guide.md` (MCP section)

---

## PRD 5: Configuration Optimization

**Goal:** Verify and optimize Claude Code settings

### Stories

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| CFG-1 | Verify release channel setting | Ensure on preferred channel (stable/latest) | High |
| CFG-2 | Configure MCP tool search threshold | Set optimal auto:N value | High |
| CFG-3 | Evaluate `showTurnDuration` setting | Hide if noisy | Low |
| CFG-4 | Configure `plansDirectory` | Set custom location if needed | Low |
| CFG-5 | Set `CLAUDE_CODE_TMPDIR` if needed | Configure temp directory | Low |
| CFG-6 | Add wildcard permission rules | Use `Bash(*-h*)` patterns for common commands | Medium |

**Files to modify:**
- `~/.claude/settings.json`
- `~/.claude/settings.local.json`

---

## PRD 6: Community & Following List

**Goal:** Create curated list of people to follow for Claude Code content

### Anthropic Employees (Must Follow)

| Handle | Name | Role | Why Follow |
|--------|------|------|------------|
| @boris_cherny | Boris Cherny | Head of Claude Code | Creator, ships features, announces updates |
| @_catwu | ? | Anthropic | Claude Code feature announcements |
| @adocomplete | ? | Anthropic? | Advent of Claude series - comprehensive tutorials |

### Top Content Creators (Frequent Quality)

| Handle | Content Type | Notable Contributions |
|--------|--------------|----------------------|
| @dani_avila7 | Tutorials | Claude Code hooks guide, rules explanation |
| @oikon48 | Japanese/Technical | Hooks filtering, CHANGELOG reflections |
| @mattpocockuk | Tutorials/Tips | MCP tutorial (10 lessons), Docker sandbox, JSON optimization |
| @ykdojo | GitHub Repos | 40+ tips, status line script, system prompt optimization |
| @levelsio | Architecture | Cloudflare caching (314M req/mo on $50 VPS) |
| @DhravyaShah | MCP | Apple MCP development |
| @cerebras | Infrastructure | Cerebras MCP (20x faster inference) |
| @nathan_covey | MCP | Gmail MCP (9 tools) |
| @ai_for_success | MCP/Workflows | Hyperbrowser MCP, doc caching |
| @jerryjliu0 | Agents | Step-by-step agent building |
| @yoheinakajima | Agents | BabyAGI 2 framework |
| @moofeez | Tools | Claude Squad - multi-agent manager |
| @Dimillian | iOS | Cursor for iOS development |
| @karpathy | Fundamentals | LLM/Tokenizer lectures |

### Stories

| ID | Title | Description | Priority |
|----|-------|-------------|----------|
| FOLLOW-1 | Create following-list.md | Curated list with handles, why, and content links | High |
| FOLLOW-2 | Add to cc-guide appendix | "People to Follow" section | Medium |
| FOLLOW-3 | Set up RSS/notification for key accounts | Track Boris, official channels | Low |

**Files to create:**
- `~/.claude/docs/following-list.md`
- Update cc-guide with appendix

---

## Verification

After each PRD:

1. **Documentation PRDs:** Render markdown, verify links, check formatting
2. **Hooks PRDs:** Test hooks trigger correctly with `claude --verbose`
3. **Skills PRDs:** Verify skills load with `/skill list`
4. **MCP PRDs:** Test with `claude mcp list` and `claude mcp get`
5. **Config PRDs:** Verify with `/config` and `/doctor`

---

## Execution Order

**Phase 1: Foundation**
- PRD 5 (Config Optimization) - verify baseline
- PRD 6 (Following List) - quick win, reference material

**Phase 2: Core Enhancements**
- PRD 2 (Hooks Enhancement) - new capabilities
- PRD 3 (Skills Frontmatter) - leverage new hooks

**Phase 3: Documentation**
- PRD 1 (CC-Guide Updates) - document everything
- PRD 4 (MCP Integrations) - evaluate and document

---

## Summary

| PRD | Stories | Priority Items | Est. Scope |
|-----|---------|----------------|------------|
| 1. CC-Guide Docs | 10 | 4 High | Large |
| 2. Hooks Enhancement | 6 | 1 High | Medium |
| 3. Skills Frontmatter | 5 | 1 High | Medium |
| 4. MCP Integrations | 5 | 2 High | Medium |
| 5. Config Optimization | 6 | 2 High | Small |
| 6. Following List | 3 | 1 High | Small |
| **Total** | **35** | **11 High** | |
