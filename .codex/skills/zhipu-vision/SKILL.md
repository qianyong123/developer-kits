---
name: zhipu-vision
description: "Use Zhipu AI (智谱) GLM vision models to recognize and analyze images, videos, screenshots, and document files — OCR text, describe content, understand diagrams/UI, summarize videos. Use when the user asks to 识别/描述/读取/看懂 图片、截图、视频、文件，when the current model cannot see an attached image and needs a vision model, or when the user says to use 智谱/zhipu MCP 识别."
metadata:
  short-description: 用智谱 GLM 识别图片、视频、文件
---

# Zhipu Vision（智谱视觉识别）

把图片、视频、文件交给智谱 GLM 视觉模型识别。优先使用智谱视觉 MCP；MCP 不可用时回退到 REST API。

## 触发场景

- 用户要求识别、描述、解读图片 / 截图 / 海报 / 图表 / 文档 / 视频
- 用户要求 OCR（提取图中文字、从截图提取文字）
- 当前模型无法直接“看”图片，需要视觉模型代看
- 用户明确提到“用智谱 / zhipu 的 MCP 识别”

## 执行路径

### 路径 A：智谱视觉 MCP（首选）

会话中可能出现两个智谱 MCP 服务器：

1. 官方 `zai-mcp-server`（`@z_ai/mcp-server`，功能最全，含视频）：
   `image_analysis`、`video_analysis`、`extract_text_from_screenshot`、`diagnose_error_screenshot`、`understand_technical_diagram`、`analyze_data_visualization`、`ui_diff_check`、`ui_to_artifact`
2. 本地 `zhipu-vision` MCP（图片专用，零依赖 Node 实现）：
   `analyze_image`（单图）、`analyze_images`（多图，最多 4 张）、`extract_text`（OCR）

按内容类型选工具：

| 需求 | 优先工具 |
|---|---|
| 通用图片理解 | `image_analysis`（没有时用 `analyze_image`） |
| OCR / 截图文字提取 | `extract_text_from_screenshot` 或 `extract_text` |
| 多图对比 | `analyze_images` 或 `ui_diff_check` |
| 错误弹窗 / 堆栈 / 日志截图 | `diagnose_error_screenshot` |
| 架构图 / 流程图 / UML / ER 图 | `understand_technical_diagram` |
| 仪表盘 / 统计图表 | `analyze_data_visualization` |
| UI 截图转代码 / 设计规范 | `ui_to_artifact` |
| 视频理解（MP4 / MOV / M4V，本地 ≤8MB） | `video_analysis` |

要点：

- 把待识别文件放到工作目录，调用工具时传**本地绝对路径**；不要依赖聊天里粘贴的图片（粘贴的图片不会自动走 MCP）。
- 一次请求只传一个文件（视频 / 图片 / 文件不能混用）。
- 没有匹配的专项工具时，用 `image_analysis` / `analyze_image` 兜底。

### 路径 B：REST API 回退

MCP 工具不可用时，运行本技能自带的脚本（路径相对本 SKILL.md）：

```bash
python scripts/zhipu_vision.py <文件路径> [--prompt "请描述..."] [--model glm-4.6v-flash] [--thinking]
```

- 脚本自动读取文件、base64 编码，调用 `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- API Key 读取顺序：`--api-key` > 环境变量 `Z_AI_API_KEY` / `ZHIPU_API_KEY` > `~/.codex/config.toml` 里 `[mcp_servers.zai-mcp-server]` 的 `env.Z_AI_API_KEY`
- 本机没有 Python 时，按 references/api.md 中的 HTTP 示例构造请求

## 关键约束

- 图片建议 < 10MB；本地视频 ≤ 8MB；一次请求只支持一种模态
- 默认模型 `glm-4.6v-flash`（免费）；复杂任务可用 `glm-4.6v`（付费，支持深度思考）
- 接口细节、MCP 配置方法见 references/api.md
