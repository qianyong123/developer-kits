# 智谱 GLM 视觉 API 参考

## 端点与认证

- Endpoint：`POST https://open.bigmodel.cn/api/paas/v4/chat/completions`
- 认证头：`Authorization: Bearer <Z_AI_API_KEY>`
- 模型：
  - `glm-4.6v-flash` — 免费，默认
  - `glm-4.6v` — 旗舰版（付费，深度思考、复杂推理）
  - `glm-4v-flash` — 旧版免费兜底

## 请求体示例

图片（本地文件用 data URI）：

```json
{
  "model": "glm-4.6v-flash",
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}},
        {"type": "text", "text": "请详细描述这张图片"}
      ]
    }
  ]
}
```

- 视频：`{"type": "video_url", "video_url": {"url": "<URL>"}}`
- 文件：`{"type": "file_url", "file_url": {"url": "<URL>"}}`
- 可选：`"thinking": {"type": "enabled"}` 开启深度思考

注意：视频 / 文件接口通常要求公网 URL；本地文件优先走 MCP 的 `video_analysis`。一次请求只能包含一种模态（图片 / 视频 / 文件）+ 文本，不能混用。

## 限制

- 图片 < 10MB；本地视频 ≤ 8MB（MCP 限制）
- 上下文 128K tokens
- 支持格式：图片 png / jpg / gif / webp / bmp；视频 mp4 / mov / m4v；文件 pdf / txt / Office 文档等

## Codex 中配置该 MCP

`~/.codex/config.toml` 中已配置两个服务器：

```toml
[mcp_servers.zai-mcp-server]
command = "npx"
args = ["-y", "@z_ai/mcp-server"]
env = { Z_AI_API_KEY = "你的KEY", Z_AI_MODE = "ZHIPU" }

[mcp_servers.zhipu-vision]
command = "node"
args = ["...\\zhipu-vision-mcp\\server.js"]
env = { ZHIPU_API_KEY = "你的KEY" }
```

前提：Node.js 18+。配置后重启 Codex 使 MCP 工具生效。
官方文档：https://docs.bigmodel.cn/cn/coding-plan/mcp/vision-mcp-server
