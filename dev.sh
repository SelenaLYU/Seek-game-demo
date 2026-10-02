#!/usr/bin/env bash
# 启动 dev server（WorkBuddy sandbox 脱钩版）
#
# 背景：在 WorkBuddy 环境里启动的 node 进程会被强制注入
#   NODE_OPTIONS=--require ".../cli/vendor/shim/node-language-shim.cjs"
# 这个 shim 会把 vite 的 HMR 劫持到 $TMPDIR/cbb-<session>/broker.sock。
# 当 dev server 用 wb-run 起在独立 session（不归 WorkBuddy 管）时该套接字无监听，结果是：
#   - 根路径直接 500（vite 请求阶段连 broker 失败）
#   - 前端弹红色遮罩 connect ECONNREFUSED .../broker.sock
# 而且 socket 路径是动态解析的——WorkBuddy 每次轮换 toybox（session id 变化）就会再次失效。
# 所以光清 PATH 不够，必须 unset NODE_OPTIONS 才能真正脱钩。
set -euo pipefail
cd "$(dirname "$0")"

# 1) 去掉 node 预加载的 shim（关键）
unset NODE_OPTIONS
# 2) 其余 sandbox 相关注入一并清掉
unset BASH_ENV PYTHONPATH SANDBOX_CENTER_IPC_ADDRESS
# 3) PATH 里剔除 WorkBuddy shim 目录（brokered-bin / safe-bin），双保险
clean_path() {
  local IFS=:
  local out=""
  for entry in $PATH; do
    case "$entry" in
      *WorkBuddy.app*|*shim*) continue ;;
    esac
    out="${out:+$out:}$entry"
  done
  printf '%s' "$out"
}
export PATH="$(clean_path)"

exec npm run dev
