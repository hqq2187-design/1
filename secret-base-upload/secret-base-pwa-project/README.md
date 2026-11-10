# 我们的秘密基地 · iPhone PWA 推送版

项目包含 PWA、iOS Web Push 订阅界面、Vercel API、Upstash Redis 订阅存储、角色随机消息和定时推送后台。

## 用户发消息后的双角色回复与逐条通知

- 每次发送普通聊天消息，前端都会分别安排秦彻与夏以昼回复，各至少 1 条；原版逻辑每人随机 1–3 条，分别调用各自角色状态语料，避免只随机抽中其中一位。
- 每条新产生的秦彻/夏以昼消息都会尝试通过 Service Worker `showNotification()` 显示独立系统通知，不再只在网页失焦时通知；通知使用独立 tag，避免两个人的消息互相覆盖。
- 需要先在 iPhone 主屏幕 Web App 中授权通知。用户消息本身、历史记录回放、自己的消息不会触发角色通知。
- **重要边界：** 目前聊天回复仍由网页前端的 JavaScript 定时生成。iOS 将 PWA 切到后台后可能冻结网页脚本，因此不能保证冻结期间尚未执行的回复继续生成并逐条推送。当前服务端 Cron 仍可独立发送定时主动消息。若要做到 App 完全关闭后也能基于用户刚发的内容生成两位角色回复并推送，需要进一步把聊天生成迁移到服务端，并配置 AI 模型 API 与安全的用户/设备身份验证；本版本没有伪装成已实现这项能力。

## 推送链路

1. iPhone 用户把网站添加到主屏幕，并在主屏幕 Web App 中点击授权。
2. 浏览器生成 PushSubscription，服务端将 endpoint 和加密密钥存入 Upstash Redis。
3. Vercel Cron 定时调用 `/api/cron/role-messages`。
4. 后台按每台设备的角色开关、勿扰时间随机选择秦彻或夏以昼，并通过 Web Push 发送到 Apple Push 服务。
5. Service Worker 收到 push 后立即调用 `showNotification()`，通知点击后打开对应角色聊天。

每次定时任务对每台设备最多发送一条。两位角色都开启时，系统会随机抽取，同时避免连续两次抽到同一角色；只开启其中一位时只发送该角色。默认每次计划任务都会尝试发送（`PUSH_RUN_PROBABILITY=100`），消息正文从角色语料池随机抽取。用户可以在网页通知设置里关闭任一角色或设置勿扰时间。

后台已加入：Redis SCAN 分页（不使用阻塞式 KEYS）、任务级锁、每设备每时段去重标记、无效订阅自动清理、短暂网络/服务端错误重试、结构化执行结果，以及受 `CRON_SECRET` 保护的后台状态检查接口。

## 部署

1. 将整个文件夹上传到 GitHub 仓库，并在 Vercel 导入仓库部署。GitHub Pages 只能静态托管，不能运行这里的 `/api` 后台。
2. 在 Upstash 创建 Redis 数据库，复制 REST URL 和 REST Token。
3. 在本地运行 `npx web-push generate-vapid-keys` 生成 VAPID 公私钥。
4. 在 Vercel Project Settings → Environment Variables 配置以下变量，然后重新部署：

| 变量 | 用途 |
|---|---|
| `VAPID_PUBLIC_KEY` | 浏览器订阅使用的公钥 |
| `VAPID_PRIVATE_KEY` | 服务端签名私钥，绝不能放前端或公开仓库 |
| `VAPID_SUBJECT` | 联系方式，例如 `mailto:you@example.com` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis Token，必须保密 |
| `CRON_SECRET` | 定时任务与状态接口的访问密钥，必须保密 |
| `PUSH_RUN_PROBABILITY` | 每轮执行概率，建议 `100`；可设 0–100 |
| `PUSH_TIME_ZONE` | 勿扰时间时区，默认 `Asia/Tokyo` |

5. 确认 Vercel 项目已部署到 HTTPS 域名。
6. iPhone Safari 打开网站 → 分享 → 添加到主屏幕。由主屏幕图标打开网页 → ✿ → iPhone通知 → 点击开启并允许系统通知。
7. 收到“通知连接成功啦”表示订阅测试推送成功。

## 定时频率与 Vercel 计划

当前 `vercel.json` 在 UTC 00:00、05:00、12:00 触发，约为日本时间 09:00、14:00、21:00（夏令时/地区时区请按目标地区核对）。**三次/天的 Vercel Cron 需要支持一天多次运行的计划（通常为 Pro）；Hobby 免费计划的 Cron 受每日运行频率限制，不能按当前三次/天配置稳定执行。** 如果使用 Hobby，请把 `vercel.json` 改成每天一次的 Cron，或另接支持每日多次定时 HTTP 请求的调度服务，并让它向 `/api/cron/role-messages` 发送 `Authorization: Bearer <CRON_SECRET>`。不要把这个密钥写进网页代码或公开仓库。

## 后台状态检查

部署并配置环境变量后，可用带授权头的 GET 请求检查后台配置和订阅数量：

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://你的域名/api/push/status
```

接口只返回各项密钥是否存在，不会返回密钥内容。检查 Cron 最近执行结果请在 Vercel Project → Logs 中查看 `/api/cron/role-messages` 的执行日志。

## iPhone 要求与限制

Apple 支持 iOS/iPadOS 16.4 或更高版本的主屏幕 Web App 使用 Web Push。必须添加到主屏幕、在主屏幕 Web App 中由用户手势触发授权。无需 Apple Developer Program。系统专注模式、静音、网络和 iOS 通知设置仍可能影响横幅展示；服务器收到推送服务的成功响应也不等于手机屏幕必定显示横幅。

官方说明：
- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/

## 安全与行为边界

- 不要将 `VAPID_PRIVATE_KEY`、`CRON_SECRET` 或 Upstash Token 写入 `index.html` 或公开仓库。
- 项目目前没有账号登录系统；如果站点公开给其他人使用，需要另加管理员身份验证和订阅所有权管理。
- 主动推送内容是服务端预设语料池随机抽取，不是 AI 实时生成，也不会读取浏览器本机聊天记录。
- 推送送达取决于 Vercel Cron、Upstash、Apple Push 服务和设备通知权限；任何服务都不能承诺 iOS 横幅 100% 必达。
