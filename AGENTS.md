# developer-kits 项目约定

## 图片识别

- 本项目的图片识别、图片分析、OCR 统一使用 **zhipu-vision** MCP（智谱视觉模型），不要使用其他图片识别方案。
- 使用入口：zhipu-vision 提供 `analyze_image` / `extract_text` 等工具。
- MCP 配置在 `.codex/config.toml`（本地配置，已被 `.gitignore` 忽略，不随仓库提交）。

## 项目简介

- 前端开发工具箱（React + Vite + TypeScript），当前包含图片压缩工具。
- 图片压缩目标：默认有损压缩、保真优先（肉眼几乎看不出差异）、支持批量格式转换、质量/压缩比例档位选择。
