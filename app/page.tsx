import type { Metadata } from "next";
import { BeadPatternApp } from "./BeadPatternApp";

export const metadata: Metadata = {
  title: "拼豆图纸转换器",
  description: "上传图片并按店铺色号表生成可编辑、可导出的拼豆图纸。",
};

export default function Home() {
  return <BeadPatternApp />;
}
