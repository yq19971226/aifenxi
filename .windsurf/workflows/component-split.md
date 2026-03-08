---
description: 当组件超过 300 行时，按此流程拆分为子组件/hooks/配置
---

# 组件拆分流程

当单个 `.tsx` 文件超过 300 行时，必须执行拆分。

## 1. 识别职责边界

阅读组件，标记出独立的职责块：
- **配置数据**：navItems、常量映射、AGENTS 列表 → 提取到同目录 `config.ts`
- **自定义 Hook**：useState + useEffect + 业务逻辑 → 提取到 `hooks/useXxx.ts`
- **子组件**：可独立渲染的 UI 片段 → 提取到同目录 `XxxSection.tsx`
- **工具函数**：格式化、计算 → 提取到 `utils.ts` 或 `lib/`

## 2. 拆分原则

- **props 向下、事件向上**：子组件通过 props 接收数据，通过回调通知父组件
- **不要跨层级传 ref**：如果需要，用 forwardRef 或状态提升
- **保持目录就近**：子组件放同一目录，不要散落到 components/ 顶层
- **一个文件一个 export default**：页面组件用 default export，工具组件用 named export

## 3. 拆分示例（TopNav 为例）

```
components/layout/
├── TopNav.tsx              # 主壳：<header> + 插槽编排（< 150 行）
├── TopNav.config.ts        # navItems 配置 + 类型定义
├── DesktopNav.tsx          # 桌面端导航条 + overflow 逻辑
├── MobileNav.tsx           # 移动端汉堡菜单 + 侧滑面板
├── UserMenu.tsx            # 用户头像 + 下拉菜单
├── NotificationBell.tsx    # 铃铛 + 未读角标
└── hooks/
    └── useNavLayout.ts     # ResizeObserver + visibleCount 计算
```

## 4. 拆分后检查

// turbo
```bash
cd d:\aifenxi\frontend && npx tsc --noEmit
```

- [ ] 每个拆分后的文件 ≤ 300 行
- [ ] 无循环依赖
- [ ] 原有功能不变（视觉 + 交互）
- [ ] 无未使用的 import/变量
