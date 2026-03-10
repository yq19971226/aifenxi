# 需求文档 - 国际化用户界面

## 简介

为庄家视角多智能体分析系统添加多语言支持，使系统能够服务全球用户。本功能聚焦于用户界面的国际化，支持中文简体、中文繁体和英文三种语言，提升产品的国际化水平和用户体验。

## 技术约束

### 前端国际化框架
- **框架选型**: 使用 next-intl（专为 Next.js 优化，支持 App Router）
- **集成方式**: 通过 Next.js 14 App Router 的 middleware 和 layout 实现语言路由
- **SSR/CSR策略**: 
  - SSR场景：通过 URL 路径前缀（/zh-CN、/zh-TW、/en）或 Accept-Language header 确定语言
  - CSR场景：通过 localStorage 读取用户偏好，动态切换语言无需刷新页面
  - 语言切换：客户端优先使用 next-intl 的动态切换，避免页面重载

### 数据存储
- **用户语言偏好表**: 
  - 表名：`user_preferences`
  - 字段：`user_id` (INT, FK), `locale` (VARCHAR(10)), `updated_at` (TIMESTAMP)
  - 索引：PRIMARY KEY (`user_id`), INDEX (`locale`)
- **翻译资源存储**: 
  - 文件结构：`frontend/messages/{locale}.json`
  - 命名空间：按页面模块分割（如 `dashboard.json`, `settings.json`）
  - 版本控制：翻译文件纳入 Git 管理

### API规范
- **语言参数传递**: 
  - HTTP Header: `Accept-Language: zh-CN` 或 `Accept-Language: zh-TW` 或 `Accept-Language: en`
  - 查询参数（备选）: `?locale=zh-CN`
- **响应格式**: 
  - 所有 API 响应包含 `locale` 字段标识内容语言
  - 示例：`{"locale": "zh-CN", "data": {...}}`
- **错误响应**: 
  - 错误消息根据 Accept-Language 返回对应语言
  - 错误码保持不变，仅 message 字段国际化

### 图表库国际化
- **TradingView Lightweight Charts**: 
  - 时间格式：通过 `localization.timeFormatter` 自定义
  - 坐标轴：通过 `localization.priceFormatter` 格式化价格
  - 图表标题/图例：使用 next-intl 的 `useTranslations` hook 翻译后传入

### WebSocket实时数据
- **语言处理机制**: 
  - WebSocket 连接建立时通过查询参数传递 locale：`ws://host/ws?locale=zh-CN`
  - 服务端推送数据包含 `locale` 字段
- **客户端翻译策略**: 
  - 固定文本（如信号类型）：客户端使用 next-intl 动态翻译
  - 动态内容（如AI分析）：服务端根据用户 locale 生成对应语言

### 性能基准
- **切换时间验证**: 
  - 使用 Performance API 测量 `performance.mark()` 到 UI 更新完成的时间
  - 目标：< 500ms（包含资源加载和 DOM 更新）
- **测试方法**: 
  - 自动化测试：Playwright 测试语言切换耗时
  - 性能监控：生产环境通过 Web Vitals 收集实际切换时间

## 术语表

- **I18n_System**: 国际化系统，负责管理多语言资源和语言切换
- **User_Interface**: 用户界面，指所有面向普通用户的前端页面（不包括后台管理界面）
- **Language_Switcher**: 语言切换器，用户用于选择界面语言的UI组件
- **Translation_Resource**: 翻译资源，存储各语言文本的键值对数据
- **AI_Agent**: AI智能体，指系统中的链上解读、技术分析、剧本推演等智能体
- **Locale**: 语言区域代码，如 zh-CN（中文简体）、zh-TW（中文繁体）、en（英文）
- **Backend_API**: 后端API服务，提供数据和业务逻辑
- **Browser_Storage**: 浏览器存储，用于持久化保存用户语言偏好
- **next-intl**: Next.js 专用的国际化库，支持 App Router 和服务端渲染

## 需求

### 需求 1: 语言切换功能

**用户故事:** 作为系统用户，我希望能够在界面上切换语言，以便使用我熟悉的语言查看内容。

#### 验收标准

1. THE Language_Switcher SHALL 显示在页面顶部导航栏的右侧区域（用户头像左侧）
2. THE Language_Switcher SHALL 使用下拉菜单样式，显示当前语言图标和名称
3. THE Language_Switcher SHALL 提供三个选项：简体中文（🇨🇳）、繁體中文（🇭🇰）、English（🇺🇸）
4. WHEN 用户点击语言选项，THE I18n_System SHALL 使用 next-intl 的 `useRouter` 和 `usePathname` 动态切换语言
5. WHEN 语言切换完成，THE User_Interface SHALL 在 500ms 内刷新所有静态文本内容为目标语言
6. THE I18n_System SHALL 将用户选择的语言保存到 localStorage（键名：`preferred_locale`）
7. WHEN 用户已登录，THE Backend_API SHALL 同步更新 `user_preferences` 表的 `locale` 字段
8. WHEN 用户再次访问系统，THE I18n_System SHALL 按优先级加载语言：用户配置 > localStorage > 浏览器语言 > 默认中文简体
9. THE Language_Switcher SHALL 使用 Framer Motion 添加切换动画效果
10. THE I18n_System SHALL 使用 Performance API 记录切换耗时，超过 500ms 时记录警告日志

**UI/UX规范**:
- 切换器宽度：120px，高度：36px
- 字体：Noto Sans SC（中文）/ Inter（英文）
- 下拉菜单使用 shadcn/ui 的 DropdownMenu 组件
- 切换动画：淡入淡出效果，持续 200ms

**测试策略**:
- 单元测试：验证 localStorage 读写逻辑
- 集成测试：验证 API 同步用户偏好
- E2E测试：Playwright 测量切换时间 < 500ms

### 需求 2: 用户界面文本国际化

**用户故事:** 作为系统用户，我希望所有界面元素都能显示我选择的语言，以便完整理解系统功能。

#### 验收标准

1. THE User_Interface SHALL 支持以下页面的多语言显示：仪表盘、链上数据、共识分析、历史案例、用户设置、性能分析、预警规则
2. THE I18n_System SHALL 翻译所有按钮、标签、提示信息、表单字段、错误消息
3. THE I18n_System SHALL 翻译所有导航菜单项和面包屑导航
4. THE I18n_System SHALL 翻译所有图表标题、坐标轴标签和图例文本
5. THE I18n_System SHALL 翻译所有表格列标题和数据标签
6. WHEN 翻译资源缺失某个键，THE I18n_System SHALL 显示该键的英文版本作为降级处理
7. THE I18n_System SHALL 保持后台管理界面（/admin 路径）使用中文简体
8. THE I18n_System SHALL 使用 next-intl 的 `useTranslations` hook 在客户端组件中获取翻译
9. THE I18n_System SHALL 使用 next-intl 的 `getTranslations` 函数在服务端组件中获取翻译

**翻译资源结构**:
```
frontend/messages/
├── zh-CN.json          # 中文简体
├── zh-TW.json          # 中文繁体
└── en.json             # 英文

文件内容示例：
{
  "nav": {
    "dashboard": "仪表盘",
    "onchain": "链上数据",
    "consensus": "共识分析"
  },
  "dashboard": {
    "title": "市场概览",
    "price": "价格",
    "volume": "成交量"
  }
}
```

**翻译完整性测试**:
- 构建时脚本：比对所有语言文件的键结构，检测缺失键
- 开发环境：next-intl 配置 `onError` 回调，在控制台显示缺失键警告
- CI/CD：添加 GitHub Action 验证翻译文件完整性

**布局适配策略**:
- 英文文本通常比中文长 20-40%，使用 Tailwind 的 `min-w-*` 和 `max-w-*` 类控制宽度
- 按钮文本使用 `truncate` 类处理超长文本
- 表格列宽使用百分比而非固定像素
- 导航菜单项预留 30% 额外空间

**字体选择规范**:
- 中文：Noto Sans SC（简体）/ Noto Sans TC（繁体）
- 英文：Inter
- 等宽字体（代码/数字）：JetBrains Mono

### 需求 3: 数字和日期格式本地化

**用户故事:** 作为系统用户，我希望数字和日期按照我的语言习惯显示，以便更自然地阅读数据。

#### 验收标准

1. WHEN 语言为中文，THE I18n_System SHALL 使用中文日期格式（2025年3月9日 14:30）
2. WHEN 语言为英文，THE I18n_System SHALL 使用英文日期格式（Mar 9, 2025 2:30 PM）
3. THE I18n_System SHALL 使用 JavaScript Intl.DateTimeFormat API 格式化日期时间
4. THE I18n_System SHALL 根据语言区域格式化数字的千位分隔符（中文：10,000 / 英文：10,000）
5. THE I18n_System SHALL 根据语言区域格式化货币符号位置（中文：¥1,000 或 $1,000 / 英文：$1,000）
6. THE I18n_System SHALL 根据语言区域格式化百分比显示（统一使用 12.34%）
7. THE I18n_System SHALL 使用 Intl.NumberFormat API 格式化所有数值
8. THE I18n_System SHALL 保持加密货币符号不变（BTC、ETH、USDT）

**图表时间格式国际化**:
- TradingView Lightweight Charts 配置示例：
```typescript
chart.applyOptions({
  localization: {
    locale: currentLocale,
    timeFormatter: (timestamp) => {
      return new Intl.DateTimeFormat(currentLocale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(timestamp * 1000);
    },
    priceFormatter: (price) => {
      return new Intl.NumberFormat(currentLocale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8
      }).format(price);
    }
  }
});
```

**测试策略**:
- 单元测试：验证各语言的日期/数字格式化输出
- 快照测试：对比不同语言下的格式化结果
- 边界测试：极大/极小数值、特殊日期（闰年、时区边界）

### 需求 4: AI智能体输出内容国际化

**用户故事:** 作为系统用户，我希望AI智能体生成的分析内容也能使用我选择的语言，以便完整理解分析结果。

#### 验收标准

1. WHEN 用户请求分析，THE Backend_API SHALL 从 Accept-Language header 或用户配置表读取目标语言
2. THE Backend_API SHALL 在 API 请求中包含 `locale` 参数传递给 Agent 层
3. THE AI_Agent SHALL 在系统提示词中包含目标语言指令（如 "请用简体中文回答"）
4. WHEN 语言为中文简体，THE AI_Agent SHALL 使用简体中文生成分析内容
5. WHEN 语言为中文繁体，THE AI_Agent SHALL 使用繁体中文生成分析内容
6. WHEN 语言为英文，THE AI_Agent SHALL 使用英文生成分析内容
7. THE AI_Agent SHALL 保持技术术语的一致性（如 "MACD"、"RSI"、"EMA" 等指标名称不翻译）
8. THE AI_Agent SHALL 保持交易对符号不变（如 "BTCUSDT"）
9. IF AI_Agent 生成的语言与请求语言不匹配，THEN THE Backend_API SHALL 记录警告日志并标注 `language_mismatch: true`
10. THE Backend_API SHALL 在响应中包含 `content_locale` 字段标识实际生成的语言

**Prompt 模板示例**:
```python
# 中文简体
system_prompt = f"""你是一个专业的加密货币分析师。请用简体中文分析以下数据。
保持技术指标名称不变（如 MACD、RSI）。
{base_instructions}"""

# 英文
system_prompt = f"""You are a professional cryptocurrency analyst. Please analyze the following data in English.
Keep technical indicator names unchanged (e.g., MACD, RSI).
{base_instructions}"""
```

**AI Token 成本评估**:
- 多语言 Prompt 增加约 50-100 tokens/请求
- 预估月增量：专业版用户 ~$5/月，旗舰版用户 ~$15/月
- 总体成本增幅：< 10%

**安全审查机制**:
- AI 生成内容通过 XSS 过滤器（DOMPurify）处理后再渲染
- 敏感词过滤：检测并替换可能的不当内容
- 内容长度限制：单次响应 < 5000 字符

**测试策略**:
- 单元测试：验证不同语言的 Prompt 构建逻辑
- 集成测试：调用真实 AI 模型验证输出语言正确性
- 回归测试：每次更新 Prompt 模板后验证所有语言输出

### 需求 5: 翻译资源管理

**用户故事:** 作为开发者，我希望翻译资源易于管理和维护，以便快速添加新的翻译内容。

#### 验收标准

1. THE I18n_System SHALL 使用 JSON 格式存储翻译资源
2. THE I18n_System SHALL 为每种语言创建独立的翻译文件（zh-CN.json、zh-TW.json、en.json）
3. THE I18n_System SHALL 使用嵌套键结构组织翻译内容（如 dashboard.title、settings.push.email）
4. THE I18n_System SHALL 在构建时验证所有语言文件的键完整性
5. WHEN 检测到缺失的翻译键，THE I18n_System SHALL 在开发环境输出警告信息到控制台
6. THE I18n_System SHALL 支持翻译内容中的变量插值（如 "欢迎 {username}"）
7. THE I18n_System SHALL 支持复数形式处理（如 "{count} 个结果" / "{count} results"）
8. THE I18n_System SHALL 使用 next-intl 的命名空间功能按页面模块组织翻译

**翻译文件结构**:
```
frontend/messages/
├── zh-CN/
│   ├── common.json       # 通用文本（按钮、标签）
│   ├── nav.json          # 导航菜单
│   ├── dashboard.json    # 仪表盘
│   ├── onchain.json      # 链上数据
│   ├── consensus.json    # 共识分析
│   ├── settings.json     # 用户设置
│   └── errors.json       # 错误消息
├── zh-TW/
│   └── [同上结构]
└── en/
    └── [同上结构]
```

**翻译工作流程**:
1. 开发阶段：开发者在代码中使用翻译键（如 `t('dashboard.title')`）
2. 提取阶段：运行脚本扫描代码，提取所有翻译键到模板文件
3. 翻译阶段：
   - 中文简体：开发者直接编写
   - 中文繁体：使用 OpenCC 工具自动转换 + 人工校对
   - 英文：使用 AI 翻译（GPT-4）+ 人工校对
4. 验证阶段：CI/CD 检查键完整性和格式正确性
5. 更新流程：新增功能时，先更新 zh-CN.json，再同步到其他语言

**翻译质量保证**:
- 术语表：维护统一的技术术语翻译对照表（存储在 `docs/glossary.md`）
- 代码审查：PR 必须包含所有语言的翻译更新
- 自动化测试：验证翻译文件 JSON 格式正确性
- 人工审查：关键页面的翻译由母语者审核

**构建时验证脚本**:
```bash
# scripts/validate-translations.js
# 检查所有语言文件的键是否一致
# 检查是否有未使用的翻译键
# 检查是否有硬编码的文本（通过 ESLint 规则）
```

**翻译维护成本**:
- 初期翻译：约 2000-3000 个键，预计 40-60 小时
- 日常维护：每个新功能增加 20-50 个键，约 1-2 小时/功能
- 季度审查：每季度全面审查翻译质量，约 8 小时

### 需求 6: 语言偏好持久化

**用户故事:** 作为系统用户，我希望我的语言选择能够在不同设备和会话中保持，以便获得一致的体验。

#### 验收标准

1. THE I18n_System SHALL 将语言偏好保存到 Browser_Storage 的 localStorage（键名：`preferred_locale`）
2. WHEN 用户已登录，THE Backend_API SHALL 将语言偏好保存到 `user_preferences` 表的 `locale` 字段
3. WHEN 用户在新设备登录，THE I18n_System SHALL 从服务器加载用户的语言偏好
4. WHEN 用户未登录，THE I18n_System SHALL 从 Browser_Storage 读取语言偏好
5. WHEN 用户首次访问且未设置语言，THE I18n_System SHALL 根据浏览器 `navigator.language` 自动选择最匹配的语言
6. IF 浏览器语言不在支持列表中，THEN THE I18n_System SHALL 默认使用中文简体
7. THE Backend_API SHALL 提供 `PATCH /api/user/preferences` 接口更新用户语言偏好
8. THE Backend_API SHALL 在用户登录响应中包含 `locale` 字段

**数据库表结构**:
```sql
-- 用户偏好表（已存在，需添加 locale 字段）
ALTER TABLE user_preferences ADD COLUMN locale VARCHAR(10) DEFAULT 'zh-CN';
CREATE INDEX idx_user_preferences_locale ON user_preferences(locale);
```

**API 接口规范**:
```typescript
// 更新用户语言偏好
PATCH /api/user/preferences
Request: { "locale": "zh-CN" | "zh-TW" | "en" }
Response: { "success": true, "locale": "zh-CN" }

// 获取用户配置（包含语言偏好）
GET /api/user/preferences
Response: { "locale": "zh-CN", "theme": "dark", ... }
```

**语言选择优先级**:
1. 用户手动选择（localStorage + 数据库）
2. 服务器用户配置（已登录用户）
3. 浏览器语言（navigator.language）
4. 默认语言（zh-CN）

**测试策略**:
- 单元测试：验证语言选择优先级逻辑
- 集成测试：验证 localStorage 和数据库同步
- E2E测试：跨设备登录验证语言偏好同步

### 需求 7: 推送通知国际化

**用户故事:** 作为系统用户，我希望收到的邮件和Telegram推送也使用我选择的语言，以便理解推送内容。

#### 验收标准

1. THE Backend_API SHALL 在发送推送前从 `user_preferences` 表读取用户的语言偏好
2. WHEN 发送邮件推送，THE Backend_API SHALL 使用用户语言渲染邮件模板
3. WHEN 发送Telegram推送，THE Backend_API SHALL 使用用户语言生成消息文本
4. THE Backend_API SHALL 为每种语言创建独立的邮件模板文件
5. THE Backend_API SHALL 翻译推送中的所有固定文本（如 "价格预警"、"策略信号"）
6. THE Backend_API SHALL 保持推送中的数值、时间戳和交易对符号不变
7. THE Backend_API SHALL 使用 Jinja2 模板引擎渲染多语言邮件
8. THE Backend_API SHALL 在推送日志中记录使用的语言

**邮件模板结构**:
```
backend/templates/email/
├── zh-CN/
│   ├── alert_triggered.html      # 预警触发通知
│   ├── strategy_signal.html      # 策略信号通知
│   └── subscription_expiry.html  # 会员到期提醒
├── zh-TW/
│   └── [同上结构]
└── en/
    └── [同上结构]
```

**Telegram 消息模板**:
```python
# backend/app/services/notification/templates.py
TELEGRAM_TEMPLATES = {
    "zh-CN": {
        "alert_triggered": "🚨 预警触发\n交易对: {symbol}\n价格: {price}\n触发条件: {condition}",
        "strategy_signal": "📊 策略信号\n交易对: {symbol}\n信号: {signal}\n置信度: {confidence}%"
    },
    "zh-TW": {
        "alert_triggered": "🚨 預警觸發\n交易對: {symbol}\n價格: {price}\n觸發條件: {condition}",
        "strategy_signal": "📊 策略信號\n交易對: {symbol}\n信號: {signal}\n置信度: {confidence}%"
    },
    "en": {
        "alert_triggered": "🚨 Alert Triggered\nSymbol: {symbol}\nPrice: {price}\nCondition: {condition}",
        "strategy_signal": "📊 Strategy Signal\nSymbol: {symbol}\nSignal: {signal}\nConfidence: {confidence}%"
    }
}
```

**WebSocket 实时推送国际化**:
```python
# 服务端推送数据格式
{
    "type": "alert",
    "locale": "zh-CN",  # 用户语言
    "data": {
        "symbol": "BTCUSDT",
        "price": 50000,
        "message_key": "alert.price_above",  # 翻译键
        "message_params": {"threshold": 50000}  # 参数
    }
}
```

**测试策略**:
- 单元测试：验证模板渲染逻辑
- 集成测试：发送测试邮件/TG消息到测试账号
- 回归测试：每次更新模板后验证所有语言版本

### 需求 8: SEO和元数据国际化

**用户故事:** 作为产品运营人员，我希望页面的SEO元数据也能支持多语言，以便提升国际市场的搜索排名。

#### 验收标准

1. THE User_Interface SHALL 根据当前语言设置页面的 HTML lang 属性（如 `<html lang="zh-CN">`）
2. THE User_Interface SHALL 为每种语言提供独立的页面标题（title）
3. THE User_Interface SHALL 为每种语言提供独立的页面描述（meta description）
4. THE User_Interface SHALL 为每种语言提供独立的 Open Graph 标签（og:title, og:description）
5. THE User_Interface SHALL 在 HTML head 中添加 hreflang 标签指向不同语言版本
6. THE User_Interface SHALL 使用 Next.js 的 `generateMetadata` 函数动态生成多语言元数据
7. THE User_Interface SHALL 为每个页面提供规范 URL（canonical）

**元数据配置示例**:
```typescript
// app/[locale]/dashboard/page.tsx
export async function generateMetadata({ params: { locale } }) {
  const t = await getTranslations({ locale, namespace: 'metadata' });
  
  return {
    title: t('dashboard.title'),
    description: t('dashboard.description'),
    alternates: {
      canonical: `https://example.com/${locale}/dashboard`,
      languages: {
        'zh-CN': 'https://example.com/zh-CN/dashboard',
        'zh-TW': 'https://example.com/zh-TW/dashboard',
        'en': 'https://example.com/en/dashboard'
      }
    },
    openGraph: {
      title: t('dashboard.og_title'),
      description: t('dashboard.og_description'),
      locale: locale,
      alternateLocale: ['zh-CN', 'zh-TW', 'en'].filter(l => l !== locale)
    }
  };
}
```

**翻译资源示例**:
```json
// messages/zh-CN/metadata.json
{
  "dashboard": {
    "title": "市场仪表盘 - 庄家视角分析系统",
    "description": "实时监控加密货币市场，AI解读庄家意图，提供专业交易策略",
    "og_title": "庄家视角多智能体分析系统",
    "og_description": "链上数据不会说谎，庄家行为有迹可循"
  }
}
```

**测试策略**:
- 单元测试：验证元数据生成逻辑
- SEO审计：使用 Lighthouse 检查 SEO 分数
- 爬虫测试：验证搜索引擎能正确识别 hreflang 标签

### 需求 9: 性能优化

**用户故事:** 作为系统用户，我希望语言切换和页面加载速度快，以便获得流畅的使用体验。

#### 验收标准

1. THE I18n_System SHALL 在应用启动时仅加载当前语言的翻译资源
2. THE I18n_System SHALL 使用 Next.js 动态导入（dynamic import）按页面加载翻译资源
3. THE I18n_System SHALL 缓存已加载的翻译资源到内存
4. WHEN 用户切换语言，THE I18n_System SHALL 在 200ms 内完成翻译资源加载
5. THE I18n_System SHALL 使用 gzip 压缩翻译资源文件以减少传输大小
6. THE I18n_System SHALL 使用浏览器缓存策略（Cache-Control: max-age=31536000）缓存翻译资源文件
7. THE I18n_System SHALL 使用 next-intl 的服务端渲染能力避免客户端闪烁
8. THE I18n_System SHALL 预加载用户可能切换的语言资源（link rel="prefetch"）

**性能基准测试**:
```typescript
// 使用 Performance API 测量切换时间
performance.mark('locale-switch-start');
await switchLocale(newLocale);
performance.mark('locale-switch-end');
performance.measure('locale-switch', 'locale-switch-start', 'locale-switch-end');

const measure = performance.getEntriesByName('locale-switch')[0];
if (measure.duration > 500) {
  console.warn(`Locale switch took ${measure.duration}ms, exceeds 500ms target`);
}
```

**优化策略**:
- 翻译文件分割：按页面模块分割，避免加载不需要的翻译
- 资源预加载：在用户悬停语言切换器时预加载目标语言
- CDN 加速：将翻译文件部署到 CDN
- 构建优化：使用 Webpack 的 Tree Shaking 移除未使用的翻译键

**性能监控**:
```typescript
// 生产环境性能监控
if (typeof window !== 'undefined' && window.performance) {
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'locale-switch' && entry.duration > 500) {
        // 上报到监控系统
        analytics.track('slow_locale_switch', {
          duration: entry.duration,
          locale: newLocale
        });
      }
    }
  });
  observer.observe({ entryTypes: ['measure'] });
}
```

**测试策略**:
- 性能测试：Lighthouse 性能分数 > 90
- 负载测试：模拟 1000 并发用户切换语言
- 网络测试：在 3G 网络下验证切换时间 < 1s

### 需求 10: 错误处理和降级

**用户故事:** 作为系统用户，即使翻译资源加载失败，我也希望系统能够正常使用，以便不影响核心功能。

#### 验收标准

1. IF 翻译资源加载失败，THEN THE I18n_System SHALL 使用英文作为降级语言
2. IF 特定翻译键缺失，THEN THE I18n_System SHALL 显示该键的英文版本
3. IF AI_Agent 无法生成目标语言内容，THEN THE Backend_API SHALL 返回英文内容并标注 `language_mismatch: true`
4. THE I18n_System SHALL 记录所有翻译相关错误到日志系统（使用 Winston 或 Pino）
5. THE I18n_System SHALL 在开发环境显示缺失翻译键的可视化提示（红色边框 + 工具提示）
6. THE I18n_System SHALL 在生产环境静默处理翻译错误，不影响用户体验
7. THE Backend_API SHALL 在 AI 调用超时时返回降级响应，包含多语言错误消息
8. THE I18n_System SHALL 提供降级翻译函数，确保关键功能始终可用

**错误处理配置**:
```typescript
// next-intl 配置
export default getRequestConfig(async ({ locale }) => {
  return {
    messages: await import(`./messages/${locale}.json`).catch(() => {
      console.error(`Failed to load locale ${locale}, falling back to en`);
      return import('./messages/en.json');
    }),
    onError: (error) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('i18n error:', error);
      } else {
        // 生产环境记录到日志系统
        logger.warn('i18n_error', { error: error.message });
      }
    },
    getMessageFallback: ({ namespace, key, error }) => {
      const path = [namespace, key].filter(Boolean).join('.');
      if (process.env.NODE_ENV === 'development') {
        return `⚠️ ${path}`;
      }
      return path; // 生产环境返回键名
    }
  };
});
```

**降级策略**:
```python
# backend/app/core/i18n.py
async def get_localized_message(key: str, locale: str, **params) -> str:
    """获取本地化消息，带降级处理"""
    try:
        messages = await load_messages(locale)
        template = messages.get(key)
        if not template:
            logger.warning(f"Missing translation key: {key} for locale: {locale}")
            # 降级到英文
            messages = await load_messages('en')
            template = messages.get(key, key)
        return template.format(**params)
    except Exception as e:
        logger.error(f"i18n error: {e}")
        return key  # 最终降级：返回键名
```

**开发环境可视化提示**:
```css
/* 缺失翻译键的样式 */
[data-i18n-missing="true"] {
  border: 2px dashed red;
  background-color: rgba(255, 0, 0, 0.1);
  position: relative;
}

[data-i18n-missing="true"]::after {
  content: "⚠️ Missing translation";
  position: absolute;
  top: -20px;
  left: 0;
  font-size: 10px;
  color: red;
}
```

**测试策略**:
- 单元测试：模拟翻译文件加载失败
- 集成测试：删除特定翻译键验证降级逻辑
- 混沌测试：随机删除翻译键验证系统稳定性
- 监控告警：生产环境缺失翻译键超过阈值时触发告警
