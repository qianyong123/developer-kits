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
