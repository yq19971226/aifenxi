/**
 * dashboard-enrichment — signalUtils 纯函数属性测试 + 单元测试
 *
 * 覆盖 Property 1-6：信号映射、分歧度警示、加权胜率、样本警示、仪表盘角度、恐贪区间
 */

import { describe, it, expect } from 'vitest'
import {
  mapSignalMeta,
  shouldShowDivergenceWarning,
  computeWeightedWinRate,
  shouldShowSampleWarning,
  computeGaugeAngle,
  mapFearGreedZone,
} from '@/lib/dashboard/signalUtils'
import type { SignalDirection } from '@/lib/dashboard/signalUtils'

// ── Property 1: 信号方向与颜色/标签映射 ────────────────────────────────

describe('mapSignalMeta', () => {
  it('bullish → 做多 + 绿色', () => {
    const meta = mapSignalMeta('bullish')
    expect(meta.label).toBe('做多')
    expect(meta.color).toBe('var(--color-bull)')
  })

  it('bearish → 做空 + 红色', () => {
    const meta = mapSignalMeta('bearish')
    expect(meta.label).toBe('做空')
    expect(meta.color).toBe('var(--color-bear)')
  })

  it('neutral → 观望 + 灰色', () => {
    const meta = mapSignalMeta('neutral')
    expect(meta.label).toBe('观望')
    expect(meta.color).toBe('#6B7280')
  })

  it('所有方向返回的 meta 都有 label 和 color', () => {
    const directions: SignalDirection[] = ['bullish', 'bearish', 'neutral']
    for (const d of directions) {
      const meta = mapSignalMeta(d)
      expect(meta.label).toBeTruthy()
      expect(meta.color).toBeTruthy()
    }
  })
})

// ── Property 2: 分歧度警示阈值 ─────────────────────────────────────────

describe('shouldShowDivergenceWarning', () => {
  it('divergence=51 → true', () => {
    expect(shouldShowDivergenceWarning(51)).toBe(true)
  })

  it('divergence=50 → false（边界）', () => {
    expect(shouldShowDivergenceWarning(50)).toBe(false)
  })

  it('divergence=0 → false', () => {
    expect(shouldShowDivergenceWarning(0)).toBe(false)
  })

  it('divergence=100 → true', () => {
    expect(shouldShowDivergenceWarning(100)).toBe(true)
  })

  it('属性：任意 >50 返回 true', () => {
    for (let d = 51; d <= 100; d += 10) {
      expect(shouldShowDivergenceWarning(d)).toBe(true)
    }
  })

  it('属性：任意 <=50 返回 false', () => {
    for (let d = 0; d <= 50; d += 10) {
      expect(shouldShowDivergenceWarning(d)).toBe(false)
    }
  })
})

// ── Property 3: 加权胜率计算 ────────────────────────────────────────────

describe('computeWeightedWinRate', () => {
  it('单智能体加权', () => {
    const result = computeWeightedWinRate({ a: 0.8 }, { a: 1.0 })
    expect(result).toBeCloseTo(0.8)
  })

  it('多智能体加权平均', () => {
    const byAgent = { a: 0.6, b: 0.8 }
    const weights = { a: 0.5, b: 0.5 }
    const result = computeWeightedWinRate(byAgent, weights)
    expect(result).toBeCloseTo(0.7)
  })

  it('权重不相等', () => {
    const byAgent = { a: 1.0, b: 0.0 }
    const weights = { a: 0.8, b: 0.2 }
    const result = computeWeightedWinRate(byAgent, weights)
    // (1.0*0.8 + 0.0*0.2) / (0.8+0.2) = 0.8
    expect(result).toBeCloseTo(0.8)
  })

  it('无匹配 key 返回 null', () => {
    const result = computeWeightedWinRate({ a: 0.5 }, { b: 1.0 })
    expect(result).toBeNull()
  })

  it('空数据返回 null', () => {
    expect(computeWeightedWinRate({}, {})).toBeNull()
  })

  it('权重为 0 的 key 被忽略', () => {
    const result = computeWeightedWinRate({ a: 0.5, b: 0.9 }, { a: 0, b: 1.0 })
    expect(result).toBeCloseTo(0.9)
  })
})

// ── Property 4: 样本不足警示阈值 ───────────────────────────────────────

describe('shouldShowSampleWarning', () => {
  it('settledCount=4 → true', () => {
    expect(shouldShowSampleWarning(4)).toBe(true)
  })

  it('settledCount=5 → false（边界）', () => {
    expect(shouldShowSampleWarning(5)).toBe(false)
  })

  it('settledCount=0 → true', () => {
    expect(shouldShowSampleWarning(0)).toBe(true)
  })

  it('settledCount=100 → false', () => {
    expect(shouldShowSampleWarning(100)).toBe(false)
  })

  it('属性：任意 <5 返回 true', () => {
    for (let s = 0; s < 5; s++) {
      expect(shouldShowSampleWarning(s)).toBe(true)
    }
  })
})

// ── Property 5: 仪表盘指针角度计算 ─────────────────────────────────────

describe('computeGaugeAngle', () => {
  it('value=0 → 180°（最左）', () => {
    expect(computeGaugeAngle(0)).toBe(180)
  })

  it('value=100 → 0°（最右）', () => {
    expect(computeGaugeAngle(100)).toBe(0)
  })

  it('value=50 → 90°（中间）', () => {
    expect(computeGaugeAngle(50)).toBe(90)
  })

  it('属性：角度在 [0, 180] 范围内', () => {
    for (let v = 0; v <= 100; v += 5) {
      const angle = computeGaugeAngle(v)
      expect(angle).toBeGreaterThanOrEqual(0)
      expect(angle).toBeLessThanOrEqual(180)
    }
  })

  it('属性：角度随 value 递减（单调性）', () => {
    let prev = computeGaugeAngle(0)
    for (let v = 1; v <= 100; v++) {
      const curr = computeGaugeAngle(v)
      expect(curr).toBeLessThan(prev)
      prev = curr
    }
  })
})

// ── Property 6: 恐贪指数区间映射 ───────────────────────────────────────

describe('mapFearGreedZone', () => {
  it('0 → 极度恐慌', () => {
    expect(mapFearGreedZone(0).label).toBe('极度恐慌')
  })

  it('20 → 极度恐慌（边界）', () => {
    expect(mapFearGreedZone(20).label).toBe('极度恐慌')
  })

  it('21 → 恐慌', () => {
    expect(mapFearGreedZone(21).label).toBe('恐慌')
  })

  it('40 → 恐慌（边界）', () => {
    expect(mapFearGreedZone(40).label).toBe('恐慌')
  })

  it('41 → 中性', () => {
    expect(mapFearGreedZone(41).label).toBe('中性')
  })

  it('60 → 中性（边界）', () => {
    expect(mapFearGreedZone(60).label).toBe('中性')
  })

  it('61 → 贪婪', () => {
    expect(mapFearGreedZone(61).label).toBe('贪婪')
  })

  it('80 → 贪婪（边界）', () => {
    expect(mapFearGreedZone(80).label).toBe('贪婪')
  })

  it('81 → 极度贪婪', () => {
    expect(mapFearGreedZone(81).label).toBe('极度贪婪')
  })

  it('100 → 极度贪婪', () => {
    expect(mapFearGreedZone(100).label).toBe('极度贪婪')
  })

  it('属性：所有值 0-100 返回有效 color', () => {
    for (let v = 0; v <= 100; v++) {
      const meta = mapFearGreedZone(v)
      expect(meta.color).toBeTruthy()
      expect(meta.label).toBeTruthy()
    }
  })

  it('属性：5 个区间覆盖完整', () => {
    const labels = new Set<string>()
    for (let v = 0; v <= 100; v++) {
      labels.add(mapFearGreedZone(v).label)
    }
    expect(labels.size).toBe(5)
    expect(labels).toContain('极度恐慌')
    expect(labels).toContain('恐慌')
    expect(labels).toContain('中性')
    expect(labels).toContain('贪婪')
    expect(labels).toContain('极度贪婪')
  })
})
