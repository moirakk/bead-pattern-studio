# Bead Pattern Studio / 拼豆图纸转换器

拼豆创作平台原型：从“任意图片转拼豆图纸”开始，逐步扩展到图纸识别、个人作品集、社群分享、店铺色卡和材料包。当前版本是网页 MVP，已验证核心流程：上传图片、裁剪、像素化、限制成品尺寸/豆数、默认按 MARD 221 标准色卡匹配、可导入店铺色卡 CSV、手工改单格、撤销/重做、统计用量，并导出带网格、坐标、色号和图例的 PNG/PDF 图纸。手机端还包含社区发现原型，可查看作品详情、收藏并复刻为保留原作来源的本地可编辑图纸。

线上原型：
https://bead-pattern-studio.moirahou1.chatgpt.site

## 项目目标

面向拼豆玩家、拼豆店主、图纸设计师和手作教程创作者，提供一个从图片到图纸、从图纸到作品、从作品到分享和材料连接的一站式平台。

短期目标是做出准确、好用的图纸生成器；中期目标是支持项目保存、作品集和小程序传播；长期目标是接入真实店铺色卡、库存、价格、订单估算和图纸商城。

## 当前 MVP

- 图片上传与本地浏览器处理
- 百分比裁剪控制
- 成品宽高与自动比例
- 豆子数量预估
- 默认 MARD 221 标准色卡
- 店铺色卡 CSV 导入覆盖
- RGB 转 Lab 后做最近色匹配
- 色数上限控制
- 单格点击改色
- 撤销/重做
- 色号用量统计
- PNG/PDF 图纸导出

## 项目文档

- [产品蓝图](docs/product-blueprint.md)
- [产品计划](docs/product-plan.md)
- [技术架构](docs/technical-architecture.md)
- [色卡数据规范](docs/palette-format.md)
- [色号来源交叉验证](docs/color-source-audit.md)
- [算法路线图](docs/algorithm-roadmap.md)
- [社区产品设计](docs/community-product.md)

## 本地开发

```bash
npm install
npm run dev
npm run build
```

核心页面在 `app/BeadPatternApp.tsx`，样式在 `app/globals.css`。

## 下一步

1. 做更专业的导出模板：A4 分页、坐标索引、采购清单、封面。
2. 设计项目保存能力，为作品集和小程序/App 做数据模型准备。
3. 增加真实品牌/店铺色卡管理。
4. 引入抖动、边缘保护、肤色保护、手工锁色等进阶算法。
5. 做公开作品页和个人作品集原型。
