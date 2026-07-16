# Bead Pattern Studio / 拼豆图纸转换器

把任意图片转换成适配拼豆店色号表的可编辑图纸。当前版本是网页 MVP，已验证核心流程：上传图片、裁剪、像素化、限制成品尺寸/豆数、按色号表最近色匹配、手工改单格、统计用量，并导出 PNG/PDF/CSV。

线上原型：
https://bead-pattern-studio.moirahou1.chatgpt.site

## 项目目标

面向拼豆玩家、拼豆店主和手作教程创作者，提供一个从图片到可采购、可制作、可交付图纸的一站式工具。

短期目标是做出准确、好用的图纸生成器；中期目标是接入真实店铺色卡、库存、价格和订单估算；长期目标是把核心算法沉淀成可复用模块，支持网页、小程序和 App。

## 当前 MVP

- 图片上传与本地浏览器处理
- 百分比裁剪控制
- 成品宽高与自动比例
- 豆子数量预估
- 店铺色卡 CSV 导入
- RGB 转 Lab 后做最近色匹配
- 色数上限控制
- 单格点击改色
- 色号用量统计
- PNG/PDF/CSV 导出

## 项目文档

- [产品计划](docs/product-plan.md)
- [技术架构](docs/technical-architecture.md)
- [色卡数据规范](docs/palette-format.md)
- [算法路线图](docs/algorithm-roadmap.md)

## 本地开发

```bash
npm install
npm run dev
npm run build
```

核心页面在 `app/BeadPatternApp.tsx`，样式在 `app/globals.css`。

## 下一步

1. 把图像转换核心逻辑拆到独立模块，便于测试和移植。
2. 增加真实品牌/店铺色卡管理。
3. 做更专业的导出模板：A4 分页、坐标索引、采购清单、封面。
4. 引入抖动、边缘保护、肤色保护、手工锁色等进阶算法。
5. 设计项目保存能力，为小程序/App 做数据模型准备。
