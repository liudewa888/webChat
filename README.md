# 网传(webChat)— 手机 ↔ 电脑网页互传工具

浏览器打开同一「房间」即可互传 **文件、文字、截图(图片预览)**。优先走 WebRTC P2P 直连,
打不通时自动降级为服务器中转(HTTP 上传 + 下载链接)。无需安装任何 App。

## 功能

- 房间码 / 扫码配对(最多 4 个房间,每房间最多 4 人,超限自动提示并返回首页)
- **消息房间暂存 10 分钟**:两人不必同时在线,后连接/断线重连都能看到这 10 分钟内的文字与文件
- 文件互传:P2P 分块直传(16KB chunk + 背压),失败自动走服务器中转;**单次上限 10MB**(服务器暂存文件有效期 10 分钟、临时目录总量上限 100MB)
- 文本/剪贴板:发送后点击气泡即复制;**截图 Ctrl+V / 手机长按粘贴直接发送**
- 拖拽发送:桌面端把文件拖进窗口即发
- 图片消息内联缩略图,点击全屏预览
- 移动端/桌面端自适应,中文界面

## 本地开发

```bash
npm install          # 已配置 .npmrc 走 npmmirror,网络不畅时可保留
npm run dev
# 手机连同一 WiFi:http://<电脑IP>:3000(Windows 需放行 node.exe 防火墙)
```

快速自测:开两个浏览器标签(如 Chrome + Edge)访问同一 `http://localhost:3000/r/<任意房间码>`。
WebRTC 信令等改动请用 `npm run build && npm start` 验证——dev 热重载会断开 SSE 长连接。

> `http://localhost` 与 `https://` 下体验最完整;`http://<内网IP>` 下 WebRTC 数据通道仍可用,
> 但 `navigator.clipboard` 写入不可用(已内置 `execCommand` 兜底)。

## 部署(云服务器 VPS)

**不适用 Vercel 等 Serverless 平台**:本应用依赖常驻 Node 进程(SSE 长连接)+ 单进程内存状态。

### 方式一(推荐):本地打包,整包上传

产物 `webChat.tar.gz` ≈ 7MB,自带精简 node_modules 与 pm2 配置,**服务器只要有 Node ≥20,不需要 npm install / build**。

```bash
# 本地:
npm run pack                    # = next build + 组装 deploy/ + 压成 webChat.tar.gz
scp webChat.tar.gz root@<服务器IP>:/opt/

# 服务器:
apt install nodejs 或装 Node 22 LTS(仅此一次)
mkdir -p /opt/webChat && tar xzf /opt/webChat.tar.gz -C /opt/webChat
cd /opt/webChat
npm i -g pm2                    # 仅此一次
pm2 start ecosystem.config.js   # 监听 127.0.0.1:3000(包内已配好,单实例 fork)
pm2 save && pm2 startup         # 开机自启
```

以后每次发版:本地 `npm run pack` → 传 → 解压覆盖(或先清空目录)→ `pm2 restart webChat`。

```bash
cd home/node/app/webChat

rm -rf next/

mkdir next

tar xzf webChat.tar.gz -C next

docker restart node
```

### 方式二:源码上传,服务器上构建

```bash
rsync -av --exclude node_modules --exclude .next --exclude logs ./ root@<IP>:/opt/webChat/
# 服务器上:
npm ci && npm run build
pm2 start ecosystem.config.js && pm2 save && pm2 startup
```

### 日常运维(两种方式通用)

```bash
pm2 status / pm2 logs webChat / pm2 restart webChat
```

> 重启会掐断所有人的 SSE,房间里设备需刷新重进;选空闲时间操作。
> **严禁改成 cluster / 多实例**:房间状态与长连接都在单进程内存(配置文件里有警告注释)。

nginx 反向代理 + HTTPS(certbot):

```nginx
server {
  listen 443 ssl http2;
  server_name your.domain.com;
  # ssl_certificate ... ssl_certificate_key ...

  client_max_body_size 20m;           # 中转上传上限(单文件 10MB + 余量)

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $https on;
    proxy_buffering off;              # SSE 必须
    proxy_read_timeout 3600s;         # 长连接不被掐
  }
}
```

公网使用务必 HTTPS:房间码、信令、中转文件下载链接均为能力凭证,明文传输会被嗅探。

## 架构

```
浏览器 ──EventSource──▶ app/api/rooms/[code]/events   在线状态 / WebRTC 信令 / 文本兜底
浏览器 ──POST─────────▶ .../signal .../message        定向转发 + 写入房间暂存(globalThis 内存房间表)
浏览器 ◀─DataChannel──▶ 另一台浏览器                   聊天文本 + 文件字节(16KB 分块)
浏览器 ──PUT──────────▶ .../upload → /api/f/[token]   P2P 打不通时的文件中转(临时目录+TTL)
```

- `lib/server/hub.ts` — 房间/成员/心跳/回收,单进程内存
- `lib/rtc.ts` — mesh 信令状态机,「小 id 发起 offer」避免 glare,8s 看门狗降级中转
- `lib/protocol.ts` — DataChannel 控制帧 + 文件分块协议

## 已知限制

- 未部署 TURN:对称 NAT / 部分公司校园网下 P2P 打不通,会自动改走服务器中转(速度受服务器带宽限制)
- 消息暂存 10 分钟、文件暂存 10 分钟(临时目录总量上限 100MB,超出按最旧优先淘汰),均只存于进程内存,重启即丢失;无账号体系、无长期历史
- 微信内置浏览器对下载/WebRTC 支持差,已提示改用系统浏览器
