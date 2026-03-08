# Design Spec — 全站 UI 高端重设计

## 设计对标

**$5M 级参考产品**: Stripe Dashboard, Linear, Mercury, Ramp, Vercel Dashboard

**核心哲学**: "安静的权威感"——让数据自己说话，界面退到幕后。

---

## 问题诊断

| 元素 | 当前问题 | 根因 |
|------|----------|------|
| TopNav Logo | Brain 图标 + indigo 背景 | AI 模板套路 |
| TopNav 布局 | 10+ 按钮挤在 48px 高的栏里 | 信息密度失控 |
| btn-primary | 紫色渐变按钮 | AI 味代表色 |
| input focus | indigo 光晕 box-shadow | 过度装饰 |
| section-label | 11px 全大写 + tracking-wider | 过度设计，像表格软件 |
| card header | 每张卡都有 icon + indigo 色块 | 图标滥用 |
| card padding | p-5 (20px) 太紧凑 | 缺乏呼吸感 |
| 分析面板 CTA | 紫色满宽按钮 + Zap 图标 | 最廉价的"科技感" |
| 交易对选择器 | indigo 选中态 pills | 颜色泛滥 |
| 模式选择器 | 圆角卡片 + indigo 边框 | 过度 UI 化 |
| loading 状态 | 圆形 spinner | 廉价感 |
| 整体色调 | 到处都是 indigo-500/15 | 单一 AI 模板色 |

---

## 全局设计规则

### 1. 色彩纪律

```
✅ 允许使用:
   - 灰度系列: zinc-50 ~ zinc-950 (界面骨架)
   - 数据信号色: emerald-500 (bullish), red-400 (bearish), amber-400 (warning)
   - 白色作为 primary action 色

❌ 绝对禁止:
   - indigo / purple / violet 任何变体
   - 渐变背景、光晕 glow
   - 彩色 icon 背景块 (如 bg-indigo-500/15)
```

### 2. 排版层次

```
页面标题:    text-[20px] font-medium text-zinc-100
区块标题:    text-[14px] font-medium text-zinc-200
标签/辅助:   text-[13px] text-zinc-500 (普通大小写，非全大写)
数据值:      text-[13px] font-mono tabular-nums text-zinc-300
说明文字:    text-[12px] text-zinc-600
```

### 3. 间距体系

```
页面容器:    max-w-[1400px] px-6 py-6
区块间距:    gap-5 (20px)
卡片内边距:  p-6 (24px)
表单字段间距: gap-5 (20px)
```

### 4. 卡片规范

```
背景:        bg-[#141417]
边框:        border border-white/[0.06]
圆角:        rounded-xl (12px)
hover:       border-white/[0.1]
无阴影 (暗色主题下阴影没意义)
```

### 5. 按钮规范

```
Primary:     bg-zinc-100 text-zinc-900 hover:bg-zinc-300 h-10 rounded-md font-medium text-[14px]
Secondary:   bg-white/[0.06] text-zinc-400 hover:bg-white/[0.1] hover:text-zinc-200 h-9 rounded-md text-[13px]
Ghost:       bg-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]
Danger:      bg-red-500/10 text-red-400 hover:bg-red-500/20
```

### 6. 输入框规范

```
背景:        bg-white/[0.03]
边框:        border border-white/[0.08]
focus:       border-zinc-500 (无 box-shadow glow)
圆角:        rounded-md (8px)
文字:        text-[14px] text-zinc-100
placeholder: text-zinc-600
```

### 7. 选中态 (tabs, pills, toggles)

```
选中:   bg-white/[0.08] text-zinc-100
未选中: text-zinc-500 hover:text-zinc-300
活跃指示: 底部 2px 白色 border (tab bar) 或 bg-white/[0.08] (pill)
绝不用 indigo
```

### 8. Loading 状态

```
骨架屏: .skeleton class (已有，应替代 spinner)
小型 spinner: border-zinc-700 border-t-zinc-400 (已有，保持)
绝不用 framer-motion 做 loading
```

---

## 组件级改动

### TopNav

**Before**: Brain icon + OmniMind 文字 + 10 个导航按钮 + 状态 + 时钟
**After**:

```
┌──────────────────────────────────────────────────────────────────────┐
│ OMNIMIND   看板  共识  链上  合约  绩效  工具▾  预警  ···    🔔  U  │
└──────────────────────────────────────────────────────────────────────┘
```

变更:
- Logo: 去掉 Brain 图标和 indigo 背景，纯文字 "OMNIMIND" 字母间距 0.2em, zinc-400
- 去掉时钟显示 (无用信息)
- 导航项: 增大到 text-[14px]，间距宽松
- 高度: h-12 → h-14 (56px)，给导航更多呼吸空间
- 右侧: 精简，只保留通知 bell + 用户头像
- 系统状态: 移到用户菜单 dropdown 里
- "增长"/"设置"/"管理": 收进 user dropdown 或 ··· 溢出菜单

### AnalysisPanel

**Before**: Indigo Zap icon + 全大写 label + indigo pills + 紫色满宽 CTA
**After**:

```
综合分析
─────────────────────────────────
交易对
┌─────────────────────────────┐
│ BTCUSDT                     │
└─────────────────────────────┘
BTC  ETH  SOL  BNB

分析模式
○ 实时短线    ○ 日内博弈 🔒   ○ 趋势布局 🔒

剩余 5/5 次
┌─────────────────────────────┐
│           开始分析           │
└─────────────────────────────┘
```

变更:
- 去掉 header icon
- 标题: text-[15px] font-medium，无 icon
- 交易对 pills: 白色选中态 (bg-white/[0.08])
- 模式选择: radio-button 风格，不用卡片
- CTA: 白色按钮 bg-zinc-100 text-zinc-900
- label: 普通大小写 text-[13px] text-zinc-500

### Dashboard 卡片 (CompositeSignal, WinRatePrediction, etc.)

- 去掉所有 header icon + 色块
- 标题直接用文字
- loading 改用 skeleton
- 数据呈现更大更自信

### globals.css 更新

- .btn-primary → 白色按钮
- .input focus → 无 glow，仅 border 变亮
- .section-label → 取消全大写
- .card → 更新背景色

---

## 实施顺序

1. globals.css 设计令牌更新 (最大影响面)
2. TopNav 重写
3. MainLayout 间距调整
4. AnalysisPanel 重写
5. Dashboard 卡片组件批量更新

## 不修改的部分

- 所有业务逻辑不变
- API 调用不变
- 路由结构不变
- 数据模型不变
- 信号颜色 (bull/bear/warn) 语义保持
