# Bead Pattern Studio

把任意一张图片，变成一张真的能照着拼的拼豆图纸。

## 为什么做这个

每个拼豆玩家大概都经历过这样的时刻：看到一张喜欢的图，想把它拼出来——然后卡住了。手动数格子太累，网上的转换工具要么颜色对不上手里的豆子，要么导出的图纸没有色号和坐标，拼到一半就数乱了。「想拼」和「能拼」之间，隔着一整晚的对格子。

Bead Pattern Studio 想抹平的就是这段距离。上传图片、选好色卡和成品尺寸，它会用 Lab 色彩空间做最近色匹配，把图片转成一格一格标好色号的图纸；匹配不满意的格子可以直接点击改色，支持完整的撤销重做。最后导出带网格、坐标、色号图例和用量统计的 PNG 或 A4 分页 PDF——打印出来，按图索豆，直接开拼。

色卡是这类工具最容易「糊弄」的地方，这里认真对待：内置 MARD 291 全色与 221 常用色卡（色号经过交叉校验），也支持导入店铺自己的 CSV 色卡，让图纸上的色号和你手里能买到的豆子一一对应。

## 核心功能

- **图片预处理**：裁剪、亮度/对比度/饱和度调节、一键去背景，大图自动缩放
- **智能匹配**：RGB → Lab 最近色匹配，可设色数上限与抖动模式，生成过程跑在 Web Worker 里不卡界面
- **精确控制**：按成品尺寸设定网格，逐格点击改色，完整撤销/重做历史
- **真实色卡**：MARD 291 / 221 内置，支持店铺 CSV 色卡导入
- **专业导出**：PNG 图纸与 A4 分页 PDF，含网格坐标、色号图例、按用量排序的采购参考
- **本地作品库**：项目保存在设备本地，支持备份导出与作品海报分享

## Stack

[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

核心算法（色彩转换、匹配、抖动、图纸构建）是纯 TypeScript 函数，集中在 `lib/pattern/`，带单元测试，不依赖任何 UI 框架。另有 Capacitor 打包的 iOS 版本在 `mobile/` 与 `ios/`。

## 快速开始

```bash
npm install
npm run dev      # 启动开发服务器
npm run test     # 构建校验 + 核心算法测试
```

在线体验：[bead-pattern-studio.moirahou1.chatgpt.site](https://bead-pattern-studio.moirahou1.chatgpt.site)

更多设计文档见 [docs/](docs/)：产品蓝图、算法路线、色卡数据规范与色号来源校验等。

---

<sub>拼豆的乐趣在拼，不在数格子。</sub>
