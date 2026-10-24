// 保存设置后 server 以约定退出码 75 退出,Electron main 看到 75 用新配置重启子进程。
export const RESTART_EXIT_CODE = 75;

export function scheduleRestart(delayMs = 400): void {
  console.log(`[settings] restarting to apply new settings (exit ${RESTART_EXIT_CODE} in ${delayMs}ms)`);
  // 留出时间让 200 响应写完
  setTimeout(() => process.exit(RESTART_EXIT_CODE), delayMs);
}
