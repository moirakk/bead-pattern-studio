# 技术架构

## 当前形态

当前 MVP 是一个浏览器端网页应用。图片处理、色号匹配、图纸编辑和导出都在本地浏览器完成，不上传用户图片。

```text
Image File
  -> Browser Image
  -> Canvas crop/resize
  -> RGB cells
  -> Lab nearest-color matcher
  -> Pattern model
  -> Canvas editor
  -> PNG / PDF pattern exporters
```

## 核心数据结构

```ts
type RGB = { r: number; g: number; b: number };
type Lab = { l: number; a: number; b: number };

type BeadColor = {
  code: string;
  name: string;
  hex: string;
  rgb: RGB;
  lab: Lab;
};

type Cell = {
  code: string;
  hex: string;
  source: RGB;
};

type Pattern = {
  width: number;
  height: number;
  cells: Cell[];
};
```

## 推荐模块拆分

当前已把颜色、色卡、图纸生成和编辑历史拆到 `lib/pattern`。后续继续把导出、存储和社群模块拆成独立边界：

```text
app/
  BeadPatternApp.tsx
  globals.css

lib/
  palette/
    parsePalette.ts
    normalizePalette.ts
  pattern/
    color.ts
    palette.ts
    buildPattern.ts
    summarizePattern.ts
    history.ts
  export/
    exportPng.ts
    exportPdf.ts
  projects/
    projectModel.ts
    localDrafts.ts
  community/
    visibility.ts
    feedModel.ts
```

这样可以让同一套核心逻辑服务：

- Web 页面
- Web Worker
- 微信小程序
- React Native / Expo App
- 服务端批处理

## 前端架构

### UI 层

负责上传、参数控制、画布展示、手工编辑、导出按钮和状态提示。

### Core 层

负责纯函数转换，不依赖 React：

- `cropAndSampleImage`
- `rgbToLab`
- `nearestColor`
- `buildPattern`
- `limitPalette`
- `summarizePattern`

### Export 层

负责从 `Pattern` 和 `Palette` 生成交付物：

- 图纸 Canvas
- PNG
- PDF

### Storage 层

未来负责项目保存：

- 本地草稿：IndexedDB
- 云端项目：D1/Postgres
- 图片源文件：R2 或对象存储

### Account 层

负责用户身份和权限：

- Web：邮箱/社交登录
- 小程序：微信登录
- 店铺后台：店铺成员与角色

### Community 层

负责公开作品、收藏、评论、标签和主题活动。

### Shop 层

负责店铺色卡、库存、价格、材料包和报价。

## 长期系统形态

```text
Web / Mini Program / App
  -> API
  -> Pattern Core
  -> Project Service
  -> Community Service
  -> Shop Service
  -> Database + Object Storage
```

建议先保持单仓库和模块化代码，等功能边界稳定后再拆服务。

## 后续性能优化

- 大图处理移入 Web Worker，避免卡 UI。
- 对色卡 Lab 值预计算。
- 最近色匹配可加 KD-tree 或缓存。
- 大尺寸图纸分块渲染，不一次性画完整 Canvas。
- 导出 PDF 时按页流式生成。

## 小程序/App 迁移策略

核心算法保持 TypeScript 纯函数，图片采样部分按平台替换：

- Web：Canvas 2D
- 小程序：Canvas API / 离屏 Canvas
- App：Skia / native image module

只要输入稳定为 `RGB[] + width + height + palette + settings`，后续平台迁移成本就会低很多。
