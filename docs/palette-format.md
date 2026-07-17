# 色卡数据规范

## 目标

让不同拼豆店、品牌和供应链都能用同一套格式导入色号，确保图片转换结果能对应真实可购买的豆子。

## 重要说明

当前应用默认内置 `MARD 221 标准色卡`，这是中文拼豆工具和大陆零售场景中最常见的 5mm midi 色号体系之一。正式接店铺材料包、报价或库存时，仍可导入店铺或品牌提供的真实色卡 CSV 覆盖默认色卡。

导出的 PNG/PDF 会记录当前色卡来源。使用内置 MARD 221 时，会标注 HEX 为屏幕近似值，实物颜色以豆子批次为准。

## MVP CSV 格式

当前工具支持两种 CSV：

```csv
code,name,hex
SHOP001,Warm White,#f7f5ef
SHOP002,Ivory,#f2dfbf
```

或：

```csv
code,hex
SHOP001,#f7f5ef
SHOP002,#f2dfbf
```

字段说明：

- `code`：店铺或品牌色号，必填，建议唯一。
- `name`：颜色名称，可选。
- `hex`：标准 RGB 十六进制颜色，必填，例如 `#f7f5ef`。

## 推荐正式格式

后续建议扩展为：

```csv
brand,series,code,name,hex,stock,price,aliases,enabled
MyShop,Midi,SHOP001,Warm White,#f7f5ef,12000,0.015,"white|暖白",true
```

字段说明：

- `brand`：品牌，如 Artkal、Hama、Perler、自有品牌。
- `series`：系列，如 midi、mini、透明、夜光。
- `code`：主色号。
- `name`：颜色名称。
- `hex`：色值。
- `stock`：库存颗数，可选。
- `price`：单颗成本或销售价，可选。
- `aliases`：别名，用 `|` 分隔，可选。
- `enabled`：是否参与匹配。

## JSON 格式

适合后台、App 或版本化管理：

```json
{
  "id": "shop-main-midi-2026",
  "name": "店铺主色卡 Midi",
  "unit": "bead",
  "colors": [
    {
      "brand": "Artkal",
      "series": "5mm S",
      "code": "S01",
      "name": "示例色名",
      "hex": "#f7f5ef",
      "stock": 12000,
      "price": 0.015,
      "aliases": ["white", "纯白"],
      "enabled": true
    }
  ]
}
```

## 数据校验规则

- `code` 不能为空。
- 同一色卡内 `code` 不能重复。
- `hex` 必须是 6 位 RGB。
- `enabled=false` 的颜色不参与自动匹配，但可保留历史项目兼容。
- `stock` 为空时表示不做库存检查。
- 导入时预计算 `rgb` 和 `lab`，不要每次匹配重复转换。

## 店铺实用建议

- 用真实豆子在固定光源下拍摄或用校色仪测色，比官网色卡更准。
- 不同批次可能有轻微色差，正式系统可记录 `batch`。
- 对常用肤色、黑白灰、透明色建立人工优先级。
- 缺货色不要简单删除，最好标记为不可用并配置替代色。
