#!/usr/bin/env bash
#
# run_ralph.sh — the classic external Ralph loop, for unattended/overnight runs.
#
# For an interactive session, prefer the official plugin instead:
#   /ralph-loop "$(cat docs/PROMPT.md)" --completion-promise "COMPLETE" --max-iterations 50
#
# Use this script when you want Claude Code to work across many FRESH sessions
# unattended (e.g. overnight), since each `claude -p` call below is stateless and
# relies only on the files in this repo (SPEC.md, TASKS.md, git history) for memory.

set -euo pipefail

PROMPT_FILE="docs/PROMPT.md"
MAX_ITERATIONS="${RALPH_MAX_ITERATIONS:-50}"
COMPLETION_PROMISE="<promise>COMPLETE</promise>"
LOG_DIR="ralph_logs"
SLEEP_BETWEEN_SECONDS="${RALPH_SLEEP_SECONDS:-5}"

mkdir -p "$LOG_DIR"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Missing $PROMPT_FILE — aborting." >&2
  exit 1
fi

echo "Ralph loop starting. Max iterations: $MAX_ITERATIONS"

for i in $(seq 1 "$MAX_ITERATIONS"); do
  TS=$(date +"%Y%m%d_%H%M%S")
  LOG_FILE="$LOG_DIR/iteration_${i}_${TS}.log"

  echo ""
  echo "=== Iteration $i / $MAX_ITERATIONS ($(date)) ==="

  # --print (-p) runs one non-interactive turn and exits.
  # --permission-mode acceptEdits lets it apply file edits without an interactive
  #   approval prompt, which is required for an unattended loop.
  # Adjust --allowedTools to whatever this project actually needs (Bash for tests/
  #   migrations, Read/Write/Edit for code, etc.) rather than leaving it unrestricted.
  set +e
  claude -p "$(cat "$PROMPT_FILE")" \
    --permission-mode acceptEdits \
    --allowedTools "Bash,Read,Write,Edit,Grep,Glob" \
    --output-format text \
    > "$LOG_FILE" 2>&1
  EXIT_CODE=$?
  set -e

  cat "$LOG_FILE"

  if [ $EXIT_CODE -ne 0 ]; then
    echo "claude exited non-zero ($EXIT_CODE) on iteration $i — check $LOG_FILE" >&2
  fi

  # Commit any progress made this iteration, even if it errored partway.
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "ralph: iteration $i ($(date +%Y-%m-%d %H:%M))" --quiet || true
  fi

  if grep -qF "$COMPLETION_PROMISE" "$LOG_FILE"; then
    echo ""
    echo "Completion promise detected on iteration $i. Stopping."
    exit 0
  fi

  sleep "$SLEEP_BETWEEN_SECONDS"
done

echo ""
echo "Reached max iterations ($MAX_ITERATIONS) without completion promise."
echo "Check docs/TASKS.md and docs/blockers.md for what's left / what's stuck."
exit 2
