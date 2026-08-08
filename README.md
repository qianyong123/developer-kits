# 工具箱 Developer Kits

面向前端开发者的本地工具集。所有处理都在浏览器内完成，图片等文件**不会上传**到任何服务器。

## 已包含工具

- 图片压缩：手动质量 / 目标体积 / 批量格式转换（原格式 / WebP、JPEG、PNG）/ PNG 有损量化 / ZIP 打包
- SVG 压缩：SVGO 引擎、三档压缩强度（高保真 / 平衡 / 极限）/ .svgz（gzip）输出 / 批量 + ZIP / 视觉与源码对比

## 开发

```bash
npm install
npm run dev
```

## 构建与部署

```bash
npm run build
```

产物在 `dist/`，纯静态站点，可部署到 Vercel、Cloudflare Pages、GitHub Pages 或对象存储 + CDN 等任意平台。

## 文档

- [文档索引](docs/README.md)：公共需求 / 公共技术方案，以及图片压缩、SVG 压缩、JSON 工具各模块的需求文档与技术方案
