# 色卡数据规范

## 目标

让不同拼豆店、品牌和供应链都能用同一套格式导入色号，确保图片转换结果能对应真实可购买的豆子。

## MVP CSV 格式

当前工具支持两种 CSV：

```csv
code,name,hex
A01,Snow White,#f7f5ef
A02,Ivory,#f2dfbf
```

或：

```csv
code,hex
A01,#f7f5ef
A02,#f2dfbf
```

字段说明：

- `code`：店铺或品牌色号，必填，建议唯一。
- `name`：颜色名称，可选。
- `hex`：标准 RGB 十六进制颜色，必填，例如 `#f7f5ef`。

## 推荐正式格式

后续建议扩展为：

```csv
brand,series,code,name,hex,stock,price,aliases,enabled
Artkal,S,A01,Snow White,#f7f5ef,12000,0.015,"white|纯白",true
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
      "series": "S",
      "code": "A01",
      "name": "Snow White",
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
