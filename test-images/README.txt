测试图片集（用于验证图片压缩工具）

说明：下载图片仅用于本地功能测试；自生成图片可自由使用。

1. photo-jpeg-large.jpg   (269KB)  照片类，JPEG，1600x900
   来源：Lorem Picsum（Unsplash 照片，免费使用）
   测试点：照片压缩 / WebP 转换 / 目标体积

2. photo-jpeg-medium.jpg  (21KB)   照片类，JPEG，1200x800
   来源：Lorem Picsum（Unsplash 照片，免费使用）
   测试点：中图 JPEG 压缩

3. photo-png.png          (375KB)  照片类，PNG（真彩色，无透明）
   来源：Google WebP Gallery（Google 官方测试图）
   测试点：PNG 有损量化对照片的效果、与原图的色差

4. photo-webp.webp        (30KB)   照片类，WebP
   来源：Google WebP Gallery
   测试点：WebP 原格式压缩

5. illustration-webp.webp (177KB)  插画类，WebP
   来源：Google WebP Gallery
   测试点：WebP 插画压缩

6. glow-gradient.png      (93KB)   半透明光晕渐变，PNG（真彩色 + alpha）
   本地生成
   测试点：半透明渐变、发光雾化效果是否被保留（最考验量化器）

7. flat-icon.png          (1.5KB)  扁平图标，PNG（4 色 + 圆角透明）
   本地生成
   测试点：扁平小图、透明边缘、是否有锯齿/色偏

8. icon-bloated.svg       (0.9KB)  设计工具导出的冗余 SVG（含注释/元数据/冗余精度）
   本地生成
   测试点：SVG 无损清理、精度舍入、对比源码

9. icon-set-duplicates.svg (1.1KB) 含大量重复路径的 SVG 图标集
   本地生成
   测试点：极限档路径复用（reusePaths）、取最小结果

10. tiny-minimal.svg        (93B)    手写极简 SVG（无注释/无冗余）
    本地生成
    测试点：已精简文件压缩率应很小（预期 <2%），用于验证“无明显变化”场景

11. pre-optimized.svg       (242B)   已按 SVGO 风格优化过的 SVG
    本地生成
    测试点：二次优化压缩率应很小（预期 <1%）

12. already-optimal.svg     (293B)   SVGO 输出回灌（理论上已是最优）
    本地生成
    测试点：保留原文件策略 / 0% 附近压缩率展示

13. icon-bloated.svgz       (469B)   icon-bloated.svg 的 gzip 版本
   本地生成
   测试点：svgz 输入自动解压、压缩率对比口径

14. opaque.svg              (130B)   铺满白色背景 + 圆形，完全不透明
   本地生成
   测试点：预览背景自动识别（不透明 → 白色）

15. tiny-icon.png           (743B)   48x48 半透明蓝色圆角图标
   本地生成
    测试点：小图预览放大（contain 放大居中，不裁切）
