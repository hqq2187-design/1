# Netlify 后台推送迁移

此迁移保留原有 `api/` 业务逻辑，通过 Netlify Functions 适配器继续使用原来的 API 地址。

## Netlify 站点设置

- Base directory: `secret-base-upload/secret-base-pwa-project`
- Build command: 留空（纯静态站点）
- Publish directory: `.`
- Functions directory: `netlify/functions`（由 netlify.toml 配置）

## 环境变量

在 Netlify Site configuration → Environment variables 添加以下变量，作用范围至少包括 Functions：

| Key | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | 原 VAPID 公钥 |
| `VAPID_PRIVATE_KEY` | 原 VAPID 私钥（保密） |
| `VAPID_SUBJECT` | `mailto:你的联系邮箱` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token（保密） |
| `CRON_SECRET` | 随机长字符串（保密） |
| `PUSH_TIME_ZONE` | `Asia/Tokyo`（可按需要调整） |
| `PUSH_RUN_PROBABILITY` | `100` |

保存变量后必须重新触发 production deploy。

## API 验证

- `GET /api/push/config`：应返回 `publicKey`，未配置公钥时返回 503。
- `POST /api/push/subscribe`：由网页订阅流程调用。
- `POST /api/push/unsubscribe`：取消订阅。
- `GET /api/push/status`：仅接受 `Authorization: Bearer <CRON_SECRET>`，不会返回密钥内容。
- `POST /api/cron/role-messages`：仅接受相同 Bearer 密钥，可用于受控手动测试。

## 定时主动推送

`role-messages-scheduled.js` 使用 UTC cron `0 0,5,12 * * *`。Netlify Scheduled Functions 只在已发布的 production deploy 上运行。单次函数执行有 30 秒上限；如果订阅设备非常多，需要把推送任务拆批或使用独立队列/调度服务。

## 重要限制

- 只有完成环境变量配置、重新部署、并从 iPhone 主屏幕 PWA 成功订阅后，才可能收到系统推送。
- Scheduled Function 的主动消息仍然是原项目预设语料随机抽取，不是 AI 实时生成。
- 用户发消息后秦彻和夏以昼在网页前台各自回复的逻辑仍在原前端；iOS 后台冻结网页时，不能保证尚未生成的聊天回复继续执行。
- 不要把任何私钥、Redis Token 或 CRON_SECRET 提交到 GitHub。
