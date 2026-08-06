# 开发工具包 Developer Kits

面向前端开发者的本地工具集。所有处理都在浏览器内完成，图片等文件**不会上传**到任何服务器。

## 已包含工具

- 图片压缩：手动质量 / 目标体积 / 批量格式转换（原格式 / WebP、JPEG、PNG）/ PNG 有损量化 / ZIP 打包

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

- [需求文档](docs/需求文档.md)
- [技术方案](docs/技术方案.md)
