#!/usr/bin/env bash
# 停止 tmux 中的攻略站開發伺服器
set -euo pipefail

SESSION="${CG_SITE_TMUX_SESSION:-cg-originmood-site}"
PORT="${CG_SITE_PORT:-4321}"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux kill-session -t "$SESSION"
  echo "✓ 已關閉 tmux session：$SESSION"
else
  echo "（沒有名為 $SESSION 的 session）"
fi

# 保險：釋放埠
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
fi

echo "完成。"
