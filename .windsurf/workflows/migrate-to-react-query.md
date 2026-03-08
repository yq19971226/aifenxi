---
description: 将 useState+useEffect+fetch 模式迁移为 @tanstack/react-query 的标准流程
---

# 迁移到 React Query

当发现页面使用 `useState + useEffect + fetch` 手动管理异步状态时，按此流程迁移。

## 1. 识别待迁移模式

搜索目标文件中的以下模式：
```tsx
// 旧模式（禁止）
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetchSomething().then(setData).finally(() => setLoading(false));
}, []);
```

## 2. 创建/确认 API 封装函数

确保 `lib/api/` 下有对应的封装函数：
```ts
// lib/api/xxx.ts
import { authFetch } from "./auth";

export async function fetchXxx(): Promise<XxxResponse> {
  const res = await authFetch("/api/xxx");
  if (!res.ok) throw new Error(`获取失败: ${res.status}`);
  return res.json();
}
```

## 3. 替换为 useQuery

```tsx
// 新模式（标准）
import { useQuery } from "@tanstack/react-query";
import { fetchXxx } from "@/lib/api/xxx";

const { data, isLoading, error } = useQuery({
  queryKey: ["xxx"],
  queryFn: fetchXxx,
});

if (error) return <div className="text-red-400">加载失败：{error.message}</div>;
```

## 4. 替换写操作为 useMutation

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: updateXxx,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["xxx"] });
  },
  onError: (err) => {
    console.error("操作失败:", err);
    // TODO: toast 提示
  },
});
```

## 5. 清理

- [ ] 删除 `useState` 中的 loading/error/data 状态
- [ ] 删除对应的 `useEffect`
- [ ] 删除手动的 `setLoading(false)` / `setData(...)` 调用
- [ ] 确保没有空的 `catch(() => {})`

## 6. 验证

// turbo
```bash
cd d:\aifenxi\frontend && npx tsc --noEmit
```
