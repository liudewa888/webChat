// ⚠ 本文件仅用于「源码上传到服务器 + npm ci && npm run build」方式。
// 若走本地打包上传(npm run pack → webChat.tar.gz),解压后目录里自带一份
// ecosystem.config.js(script 为 server.js),pm2 请用那一份,不要用这里的根目录版。
//
// pm2 配置 —— 必须单实例 fork 模式:房间状态、SSE 长连接、中转文件表都在本进程内存
// 严禁改成 cluster 模式或 instances>1,否则用户会被分发到不同内存的进程而互相看不见
module.exports = {
  apps: [
    {
      name: "webChat",
      script: "server.js",
      args: "start -p 3000",
      exec_mode: "fork",
      instances: 1,
      cwd: __dirname, // 必须是项目根:中转文件写在 cwd/tmp 下
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "200M", // 大文件中转的缓冲都在磁盘,内存占用应稳定;超阈值自动重启
      out_file: "logs/out.log",
      error_file: "logs/err.log",
      merge_logs: true,
      time: true, // 日志加时间戳
    },
  ],
};
