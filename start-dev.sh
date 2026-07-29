#!/usr/bin/env bash
# 以 tmux 在背景啟動永恆初心攻略站開發伺服器
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SESSION="${CG_SITE_TMUX_SESSION:-cg-originmood-site}"
HOST="${CG_SITE_HOST:-0.0.0.0}"
PORT="${CG_SITE_PORT:-4321}"
URL="http://localhost:${PORT}/"

cd "$ROOT"

if ! command -v tmux >/dev/null 2>&1; then
  echo "錯誤：找不到 tmux，請先安裝 tmux。" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "錯誤：找不到 npm。" >&2
  exit 1
fi

if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "→ 首次執行，安裝相依套件…"
  npm install
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "已有 tmux session：$SESSION"
  echo "附加：tmux attach -t $SESSION"
  echo "首頁：$URL"
  echo "停止：./stop-dev.sh"
  exit 0
fi

# 清掉可能殘留的同埠 process（非 tmux 啟動時）
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
fi

tmux new-session -d -s "$SESSION" -c "$ROOT" \
  "npm run dev -- --host ${HOST} --port ${PORT}; echo; echo '[dev 已結束] 按 Enter 關閉'; read"

sleep 1
echo "✓ 已在 tmux session「${SESSION}」啟動開發伺服器"
echo "  首頁：  ${URL}"
echo "  技能：  ${URL}技能總覽"
echo "  道具：  ${URL}道具總覽"
echo "  寵物：  ${URL}專屬寵物"
echo "  附加：  tmux attach -t ${SESSION}"
echo "  停止：  ./stop-dev.sh"
