---
description: 新增或修改前端页面时的质量检查清单，确保页面符合项目规范
---

# 前端页面质量检查清单

新增或大幅修改前端页面时，按以下清单逐项检查。

## 1. 数据获取

- [ ] 使用 `@tanstack/react-query`（useQuery / useMutation），不要 useState + useEffect + fetch
- [ ] API 调用走 `lib/api/` 封装函数，使用 `authFetch`
- [ ] 错误处理：`onError` 回调或 `isError` 状态都要有用户可见的中文提示
- [ ] 不要 `catch(() => {})`，至少 `console.error`

## 2. 权限守卫（admin 页面）

- [ ] 组件顶部检查角色：
```tsx
const { user } = useAuth();
if (!user || user.role !== "admin") {
  return <div className="p-6 text-zinc-500">无权限访问</div>;
}
```
- [ ] `lib/route-permissions.ts` 中已注册此路由
- [ ] 对应后端 API 有 `require_admin` / `require_operator` 依赖注入

## 3. 错误边界

- [ ] 所属路由组有 `error.tsx`（`app/(main)/error.tsx` 或 `app/(main)/admin/error.tsx`）
- [ ] 所属路由组有 `loading.tsx`

## 4. 文件规模

- [ ] 页面文件 ≤ 300 行
- [ ] 如果超过，业务逻辑提取到 hooks（`hooks/useXxx.ts`）或子组件

## 5. 样式一致性

- [ ] 使用 CSS 变量和 Tailwind zinc 色阶，不硬编码 hex
- [ ] 使用 globals.css 中的 `.card` / `.btn-primary` / `.input` 类
- [ ] 圆角：card 用 `rounded-lg`，button/input 用 `rounded-md`

## 6. 数据来源

- [ ] 元数据（智能体列表、模型列表、币种列表）从 API 获取，不在前端硬编码
- [ ] 如果 API 不存在，先创建后端端点

## 7. 占位检查

- [ ] 如果功能未实现，不要显示菜单入口（用 featureFlag 隐藏）
- [ ] 不要出现"即将推出"/"Coming Soon"占位页面

## 8. 构建验证

// turbo
```bash
cd d:\aifenxi\frontend && npx tsc --noEmit
```

检查无类型错误后再提交。
