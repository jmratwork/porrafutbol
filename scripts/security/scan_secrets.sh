#!/usr/bin/env bash
# scan_secrets.sh — Detects hardcoded secrets, API keys, and credentials
# Usage: bash scan_secrets.sh [project_root]
# Output: JSON findings to stdout

set -euo pipefail

PROJECT_ROOT="${1:-.}"
FINDINGS=()
FINDING_COUNT=0

# grep -n prints "path:line:match" and we split on ":", so a Windows drive
# letter ("C:\...") would be parsed as the filename. Normalise to a POSIX path.
if [[ "$PROJECT_ROOT" =~ ^[A-Za-z]:[\\/] ]] && command -v cygpath >/dev/null 2>&1; then
    PROJECT_ROOT="$(cygpath -u "$PROJECT_ROOT")"
fi

# Colors for terminal
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m'

# Escape a value for embedding in a JSON string (backslashes first, then quotes
# and control characters). Windows paths and matched lines both need this.
escape_json() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    s="${s//$'\t'/\\t}"
    s="${s//$'\r'/}"
    printf '%s' "$s"
}

log_finding() {
    local severity="$1" file="$2" line="$3" pattern="$4" match="$5"
    FINDING_COUNT=$((FINDING_COUNT + 1))
    # Mask the secret. The greps use -o, so $match is the matched token itself
    # rather than the whole source line (which previously meant the "mask" could
    # expose the first and last characters of the secret).
    local masked
    if [ ${#match} -gt 12 ]; then
        masked="${match:0:4}...${match: -4}"
    else
        masked="[REDACTED]"
    fi
    if [ "$FINDING_COUNT" -gt 1 ]; then echo ","; fi
    printf '{"id":%d,"severity":"%s","file":"%s","line":%s,"pattern":"%s","match":"%s"}' \
        "$FINDING_COUNT" "$severity" "$(escape_json "$file")" "${line:-0}" \
        "$(escape_json "$pattern")" "$(escape_json "$masked")"
}

echo "=== Security Review: Secrets & Credentials Scanner ==="
echo "Project: $PROJECT_ROOT"
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "---"
echo "["

# File extensions to scan
SCAN_EXTENSIONS="js,ts,jsx,tsx,py,rb,go,java,rs,php,cs,swift,kt,sh,bash,json,yaml,yml,toml,ini,cfg,conf,properties,xml,env,md,txt,ipynb,tf,tfvars,dockerfile,Makefile"

# grep's --include takes ONE glob per flag and does NOT understand brace
# expansion, so "*.{js,ts}" (quoted, hence not expanded by bash either) matched
# nothing and every scan silently reported zero findings. Build one flag per
# extension instead.
INCLUDES=()
IFS=',' read -ra _exts <<< "$SCAN_EXTENSIONS"
for _e in "${_exts[@]}"; do INCLUDES+=(--include="*.$_e"); done

# Directories to skip. These must be grep's own --exclude-dir flags: the
# previous value was a string of find(1) predicates (-not -path ...), which grep
# rejects as an invalid option — and the error was hidden by 2>/dev/null.
EXCLUDES=()
for _d in .git node_modules vendor __pycache__ .venv venv .tox dist build .next target; do
    EXCLUDES+=(--exclude-dir="$_d")
done
# find(1) equivalents, for the .env search below.
FIND_PRUNE=(-name .git -o -name node_modules -o -name vendor -o -name __pycache__ \
    -o -name .venv -o -name venv -o -name .tox -o -name dist -o -name build \
    -o -name .next -o -name target)

# ── AWS Keys ──
while IFS=: read -r file line match; do
    [ -n "$file" ] && log_finding "CRITICAL" "$file" "$line" "AWS Access Key" "$match"
done < <(grep -rnoP -e '(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}' \
    "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROJECT_ROOT" 2>/dev/null | head -50 || true)

# ── Private Keys ──
while IFS=: read -r file line match; do
    [ -n "$file" ] && log_finding "CRITICAL" "$file" "$line" "Private Key" "$match"
done < <(grep -rnoP -e '-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----' "$PROJECT_ROOT" \
    "${INCLUDES[@]}" --include="*.pem" --include="*.key" "${EXCLUDES[@]}" 2>/dev/null | head -50 || true)

# ── Anthropic API Keys ──
while IFS=: read -r file line match; do
    [ -n "$file" ] && log_finding "CRITICAL" "$file" "$line" "Anthropic API Key" "$match"
done < <(grep -rnoP -e 'sk-ant-[a-zA-Z0-9_-]{20,}' \
    "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROJECT_ROOT" 2>/dev/null | head -50 || true)

# ── OpenAI API Keys ──
while IFS=: read -r file line match; do
    [ -n "$file" ] && log_finding "CRITICAL" "$file" "$line" "OpenAI API Key" "$match"
done < <(grep -rnoP -e 'sk-[a-zA-Z0-9]{48,}' \
    "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROJECT_ROOT" 2>/dev/null | head -50 || true)

# ── GitHub Tokens ──
while IFS=: read -r file line match; do
    [ -n "$file" ] && log_finding "CRITICAL" "$file" "$line" "GitHub Token" "$match"
done < <(grep -rnoP -e 'gh[pousr]_[A-Za-z0-9_]{36,}' \
    "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROJECT_ROOT" 2>/dev/null | head -50 || true)

# ── Database Connection Strings ──
while IFS=: read -r file line match; do
    # Documentation placeholders only (exact user:pass pairs used in examples).
    # Deliberately narrow: anything else is reported.
    if echo "$match" | grep -qiP '(?:usuario:password|user:pass(?:word)?|postgres:postgres|USERNAME:PASSWORD)@'; then
        continue
    fi
    [ -n "$file" ] && log_finding "CRITICAL" "$file" "$line" "Database Connection String" "$match"
done < <(grep -rnoP -e '(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp)://[^\s'"'"'"]+:[^\s'"'"'"]+@' \
    "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROJECT_ROOT" 2>/dev/null | head -50 || true)

# ── Stripe Keys ──
while IFS=: read -r file line match; do
    [ -n "$file" ] && log_finding "HIGH" "$file" "$line" "Stripe Key" "$match"
done < <(grep -rnoP -e '[sr]k_(?:live|test)_[A-Za-z0-9]{20,}' \
    "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROJECT_ROOT" 2>/dev/null | head -50 || true)

# ── Slack Tokens ──
while IFS=: read -r file line match; do
    [ -n "$file" ] && log_finding "HIGH" "$file" "$line" "Slack Token" "$match"
done < <(grep -rnoP -e 'xox[boaprs]-[0-9a-zA-Z-]{10,}' \
    "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROJECT_ROOT" 2>/dev/null | head -50 || true)

# ── Google API Keys ──
while IFS=: read -r file line match; do
    [ -n "$file" ] && log_finding "HIGH" "$file" "$line" "Google API Key" "$match"
done < <(grep -rnoP -e 'AIza[0-9A-Za-z_-]{35}' \
    "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROJECT_ROOT" 2>/dev/null | head -50 || true)

# ── SendGrid Keys ──
while IFS=: read -r file line match; do
    [ -n "$file" ] && log_finding "HIGH" "$file" "$line" "SendGrid API Key" "$match"
done < <(grep -rnoP -e 'SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}' \
    "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROJECT_ROOT" 2>/dev/null | head -50 || true)

# ── Generic Password/Secret Assignments ──
while IFS=: read -r file line match; do
    # Filter false positives
    if echo "$match" | grep -qiP '(example|placeholder|changeme|xxx|test|dummy|TODO|your.?key|INSERT|REPLACE)'; then
        continue
    fi
    [ -n "$file" ] && log_finding "HIGH" "$file" "$line" "Hardcoded Secret" "$match"
done < <(grep -rnoP -e '(?i)(?:api[_-]?key|api[_-]?secret|access[_-]?key|secret[_-]?key|auth[_-]?token|password|passwd)\s*[=:]\s*['"'"'"][A-Za-z0-9+/=_-]{16,}['"'"'"]' \
    "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROJECT_ROOT" 2>/dev/null | head -100 || true)

# ── .env files present (and, worse, tracked by git) ──
# We deliberately do NOT read their contents: the project policy in CLAUDE.md
# forbids accessing .env files. Presence plus git-tracking is what matters —
# an untracked .env is normal and expected.
while IFS= read -r envfile; do
    [ -f "$envfile" ] || continue
    if git -C "$PROJECT_ROOT" ls-files --error-unmatch "$envfile" >/dev/null 2>&1; then
        log_finding "CRITICAL" "$envfile" "0" ".env tracked by git" "[NOT READ]"
    else
        log_finding "INFO" "$envfile" "0" ".env present (untracked, not read)" "[NOT READ]"
    fi
done < <(find "$PROJECT_ROOT" \( "${FIND_PRUNE[@]}" \) -prune -o \
    -type f \( -name ".env" -o -name ".env.local" -o -name ".env.production" \) \
    -print 2>/dev/null || true)

# ── MCP Config with hardcoded credentials ──
while IFS=: read -r file line match; do
    [ -n "$file" ] && log_finding "CRITICAL" "$file" "$line" "MCP Hardcoded Credential" "$match"
done < <(grep -rnoP -e '"(?:password|secret|key|token|api_key)":\s*"(?!\$\{)[^"]{8,}"' "$PROJECT_ROOT" \
    --include="*mcp*.json" --include="*claude*.json" --include="settings.json" \
    "${EXCLUDES[@]}" 2>/dev/null | head -50 || true)

# ── JWT Tokens in source ──
while IFS=: read -r file line match; do
    [ -n "$file" ] && log_finding "MEDIUM" "$file" "$line" "JWT Token in Source" "$match"
done < <(grep -rnoP -e 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' \
    "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROJECT_ROOT" 2>/dev/null | head -30 || true)

echo
echo "]"
echo "---"
echo "Total findings: $FINDING_COUNT"

if [ $FINDING_COUNT -eq 0 ]; then
    echo -e "${GREEN}No secrets detected.${NC}"
else
    echo -e "${RED}Found $FINDING_COUNT potential secrets. Review each finding carefully.${NC}"
fi
