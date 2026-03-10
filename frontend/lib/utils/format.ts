/**
 * 全局格式化工具函数。
 *
 * 价格格式化规则（项目约定）：
 *   ≥1000  千分位 + 2 位小数
 *   ≥1     4 位小数（去尾零）
 *   <1     6 位小数（去尾零）
 */

export function formatPrice(value: number | null | undefined): string {
  if (value == null) return "--";
  if (value >= 1000) {
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (value >= 1) {
    // 4 位小数，去尾零
    return `$${parseFloat(value.toFixed(4))}`;
  }
  // 6 位小数，去尾零
  return `$${parseFloat(value.toFixed(6))}`;
}
