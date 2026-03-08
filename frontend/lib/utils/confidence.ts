/**
 * Maps a numeric confidence value (0.0–1.0) to a human-readable semantic label.
 *
 * Thresholds:
 *   < 0.3  → 低置信度 — 仅供参考
 *   0.3–0.6 → 中等置信度 — 需结合其他信号
 *   0.6–0.8 → 较高置信度 — 可作为主要参考
 *   > 0.8  → 高置信度 — 多维度信号一致
 */
export function mapConfidenceLabel(confidence: number): string {
  if (confidence < 0.3) {
    return "低置信度 — 仅供参考";
  }
  if (confidence <= 0.6) {
    return "中等置信度 — 需结合其他信号";
  }
  if (confidence <= 0.8) {
    return "较高置信度 — 可作为主要参考";
  }
  return "高置信度 — 多维度信号一致";
}
