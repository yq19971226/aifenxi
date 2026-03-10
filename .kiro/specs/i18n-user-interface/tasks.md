# 实施计划：国际化用户界面

## 概述

本实施计划将庄家视角多智能体分析系统的用户界面国际化，支持中文简体（zh-CN）、中文繁体（zh-TW）和英文（en）三种语言。实施将按照基础设施 → 前端组件 → 后端服务 → 集成测试的顺序进行，确保每个步骤都可以增量验证。

## 任务清单

- [x] 1. 数据库迁移和基础设施
  - [x] 1.1 扩展 user_preferences 表添加 locale 字段
    - 执行 SQL 迁移脚本添加 locale 列（VARCHAR(10)，默认 'zh-CN'）
    - 添加约束确保只能使用支持的语言（zh-CN、zh-TW、en）
    - 创建索引优化语言查询性能
    - _需求: 6.2, 6.3_
  
  - [x] 1.2 创建翻译资源文件结构
    - 创建 frontend/messages 目录结构（zh-CN/、zh-TW/、en/）
    - 为每种语言创建基础翻译文件（common.json、nav.json、errors.json）
    - 添加初始翻译内容（按钮、标签、导航菜单）
    - _需求: 5.1, 5.2, 5.3_
  
  - [x] 1.3 创建翻译验证脚本
    - 编写 scripts/validate-translations.js 检查翻译键完整性
    - 实现键结构比对逻辑，检测缺失和多余的键
    - 集成到构建流程（package.json 的 build 脚本）
    - _需求: 5.4, 5.5_

- [x] 2. 前端 next-intl 基础设施
  - [x] 2.1 安装和配置 next-intl
    - 安装 next-intl 依赖包
    - 创建 i18n.ts 配置文件，定义支持的语言
    - 配置错误处理和降级策略
    - _需求: 2.6, 10.1, 10.2_
  
  - [x] 2.2 配置 Next.js middleware
    - 创建 middleware.ts 实现语言路由
    - 配置语言检测和自动重定向
    - 设置路径匹配规则（排除 API 和静态文件）
    - _需求: 1.8, 6.4_
  
  - [x] 2.3 更新根布局支持多语言
    - 修改 app/[locale]/layout.tsx 添加语言参数
    - 集成 NextIntlClientProvider
    - 设置 HTML lang 属性动态化
    - 生成静态语言路径参数
    - _需求: 8.1_

- [x] 3. 语言切换器组件
  - [x] 3.1 实现 LanguageSwitcher 组件
    - 创建 components/layout/LanguageSwitcher.tsx
    - 使用 shadcn/ui DropdownMenu 实现下拉菜单
    - 添加语言选项（简体中文、繁體中文、English）和图标
    - 实现语言切换逻辑（更新 localStorage 和路由）
    - _需求: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 3.2 添加语言切换动画
    - 使用 Framer Motion 添加淡入淡出效果
    - 实现切换过渡动画（200ms 持续���间）
    - _需求: 1.9_
  
  - [x] 3.3 集成性能监控
    - 使用 Performance API 测量切换耗时
    - 记录超过 500ms 的慢切换事件
    - 添加性能日志和告警
    - _需求: 1.10, 9.4_
  
  - [x] 3.4 集成语言切换器到顶部导航
    - 修改 TopNav 组件添加 LanguageSwitcher
    - 定位在用户头像左侧
    - 确保响应式布局适配
    - _需求: 1.1_

- [x] 4. 前端页面国际化
  - [x] 4.1 国际化仪表盘页面
    - 创建 messages/*/dashboard.json 翻译文件
    - 使用 useTranslations hook 替换硬编码文本
    - 翻译页面标题、指标标签、按钮文本
    - _需求: 2.1, 2.2, 2.3_
  
  - [x] 4.2 国际化链上数据页面
    - 创建 messages/*/onchain.json 翻译文件
    - 翻译链上数据相关的所有 UI 元素
    - _需求: 2.1, 2.2_
  
  - [x] 4.3 国际化共识分析页面
    - 创建 messages/*/consensus.json 翻译文件
    - 翻译共识分析相关的 UI 元素
    - _需求: 2.1, 2.2_
  
  - [x] 4.4 国际化用户设置页面
    - 创建 messages/*/settings.json 翻译文件
    - 翻译设置页面的所有表单字段和标签
    - _需求: 2.1, 2.2_
  
  - [x] 4.5 国际化性能分析和预警规则页面
    - 创建 messages/*/performance.json 和 messages/*/alerts.json
    - 翻译性能指标和预警相关的 UI 元素
    - _需求: 2.1, 2.2_
  
  - [x] 4.6 国际化导航菜单和面包屑
    - 创建 messages/*/nav.json 翻译文件
    - 使用 useTranslations 翻译所有导航项
    - _需求: 2.3_
  
  - [x] 4.7 国际化表格和图表
    - 翻译表格列标题和数据标签
    - 翻译图表标题和图例文本
    - _需求: 2.4, 2.5_

- [x] 5. 数字和日期格式化
  - [x] 5.1 创建格式化工具函数
    - 创建 lib/i18n/formatters.ts
    - 实现 useNumberFormatter hook（价格、百分比、成交量）
    - 实现 useDateFormatter hook（日期时间、相对时间）
    - 使用 Intl API 进行本地化格式化
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [x] 5.2 集成格式化工具到组件
    - 在仪表盘组件中使用格式化工具
    - 在数据表格中使用格式化工具
    - 确保技术符号（BTC、ETH、USDT）不被格式化
    - _需求: 3.7, 3.8_

- [x] 6. 图表国际化
  - [x] 6.1 创建 LocalizedChart 组件
    - 创建 components/charts/LocalizedChart.tsx
    - 配置 TradingView Lightweight Charts 的 localization 选项
    - 实现时间格式化器（使用 Intl.DateTimeFormat）
    - 实现价格格式化器（使用 Intl.NumberFormat）
    - _需求: 3.1, 3.2, 3.3_
  
  - [x] 6.2 更新现有图表组件
    - 替换现有图表为 LocalizedChart
    - 确保图表标题和图例使用翻译
    - _需求: 2.4_

- [x] 7. 后端语言检测中间件
  - [x] 7.1 创建语言检测中间件
    - 创建 backend/app/core/i18n_middleware.py
    - 实现 detect_locale 函数（数据库 → Accept-Language → 默认）
    - 实现 get_locale_from_request 快速检测函数
    - 添加错误处理和降级逻辑
    - _需求: 1.8, 6.3, 6.4, 6.5, 6.6_

- [x] 8. 用户偏好服务
  - [x] 8.1 创建用户偏好服务
    - 创建 backend/app/services/user_preference_service.py
    - 实现 get_locale 方法读取用户语言偏好
    - 实现 update_locale 方法更新用户语言偏好
    - 添加输入验证和错误处理
    - _需求: 6.2, 6.3_
  
  - [x] 8.2 创建用户偏好 API 路由
    - 创建 backend/app/api/user_preferences.py
    - 实现 GET /api/user/preferences 接口
    - 实现 PATCH /api/user/preferences 接口
    - 添加 JWT 认证和请求验证
    - _需求: 6.7, 6.8_
  
  - [x] 8.3 集成用户偏好 API 到前端
    - 在 LanguageSwitcher 中调用 PATCH 接口同步语言偏好
    - 在应用启动时调用 GET 接口加载用户偏好
    - 添加错误处理（同步失败时仍然更新 localStorage）
    - _需求: 1.7, 6.2_

- [x] 9. AI Agent 多语言 Prompt
  - [x] 9.1 创建多语言 Prompt 模板
    - 创建 backend/app/agents/i18n_prompts.py
    - 为每个 Agent 类型创建三种语言的 Prompt 模板
    - 确保技术术语（MACD、RSI 等）在所有语言中保持不变
    - 实现 get_system_prompt 函数带降级处理
    - _需求: 4.2, 4.3, 4.7, 4.8_
  
  - [x] 9.2 更新 AI Agent 使用多语言 Prompt
    - 修改 backend/app/agents/onchain.py 使用多语言 Prompt
    - 修改 backend/app/agents/technical.py 使用多语言 Prompt
    - 修改 backend/app/agents/playbook.py 使用多语言 Prompt
    - 修改 backend/app/agents/risk.py 使用多语言 Prompt
    - 从请求中获取 locale 参数传递给 Agent
    - _需求: 4.1, 4.2, 4.3_
  
  - [x] 9.3 添加 AI 输出语言检测
    - 实现 detect_content_language 函数（基于字符集）
    - 在 AI 响应中添加 content_locale 和 language_mismatch 字段
    - 记录语言不匹配的警告日志
    - _需求: 4.9, 4.10_
  
  - [x] 9.4 更新分析 API 支持多语言
    - 修改 backend/app/api/analysis.py 传递 locale 参数
    - 修改 AnalysisRequest 模型添加 locale 字段
    - 修改 AnalysisOrchestrator 传递 locale 到 MarketData
    - 前端 runAnalysis 传递当前 locale
    - _需求: 4.1, 4.10_

- [x] 10. 推送通知国际化
  - [x] 10.1 创建多语言推送模板
    - 创建 backend/app/services/notification/i18n_templates.py
    - 定义 Telegram/标题/短消息模板（三种语言）
    - 实现 get_telegram_template / get_title_template / get_short_template
    - 实现 localize_variables / get_direction_label / get_severity_label
    - _需求: 7.2, 7.3, 7.4_
  
  - [x] 10.2 创建多语言邮件模板
    - 更新 backend/app/services/notification/email.py 支持 locale
    - StrategyEmailData 新增 locale 字段
    - build_strategy_html 使用本地化字符串（标题/标签/页脚）
    - HTML lang 属性动态化
    - _需求: 7.2, 7.4, 7.5_
  
  - [x] 10.3 更新推送服务使用多语言模板
    - push_dispatcher.dispatch() 读取 user_preferences.locale
    - get_template() 支持 locale 参数，优先 DB 模板再回退 i18n 内置模板
    - _prepare_variables() 使用 localize_variables() 本地化标签
    - _需求: 7.1, 7.8_

- [x] 11. WebSocket 实时数据国际化
  - [x] 11.1 更新 WebSocket 连接支持 locale 参数
    - 修改 backend/app/api/ws.py 从查询参数读取 locale
    - 新增 _AlertConnection 类保存 locale
    - _PriceConnection 新增 locale 字段
    - _需求: 7.1_
  
  - [x] 11.2 更新 WebSocket 消息格式
    - 广播和定向推送消息自动包含用户 locale 字段
    - _broadcast_alerts 和 broadcast_to_user 在消息中注入 locale
    - _需求: 7.1_
  
  - [x] 11.3 更新前端 WebSocket 客户端
    - AlertSocket 新增 setLocale() 方法，连接 URL 包含 locale 参数
    - useAlertSocket 使用 useLocale() 设置 locale
    - _需求: 7.1_

- [x] 12. SEO 元数据国际化
  - [x] 12.1 创建元数据翻译文件
    - 创建 messages/*/metadata.json 三语言
    - 在根 JSON 文件中添加 metadata 命名空间
    - _需求: 8.2, 8.3, 8.4_
  
  - [x] 12.2 实现动态元数据生成
    - 在每个页面添加 generateMetadata 函数
    - 使用 getTranslations 加载元数据翻译
    - 生成 alternates（canonical 和 hreflang）
    - 生成 Open Graph 标签
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 13. 错误消息国际化
  - [x] 13.1 创建错误消息翻译文件
    - messages/*/errors.json 已存在（三语言完整）
    - _需求: 2.2_
  
  - [x] 13.2 更新后端错误响应
    - 创建 backend/app/core/i18n_errors.py
    - 提供 get_error_message() 和 localized_http_exception()
    - 支持语言降级和模板变量替换
    - _需求: 2.2_

- [x] 14. 性能优化
  - [x] 14.1 实现翻译资源按需加载
    - i18n.ts 已使用 dynamic import 按 locale 加载
    - next-intl/plugin 处理 SSR 内存缓存
    - _需求: 9.1, 9.2, 9.3_
  
  - [x] 14.2 配置翻译资源缓存策略
    - next.config.js 添加 /_next/static Cache-Control: immutable
    - 启用 compress: true (Gzip)
    - _需求: 9.5, 9.6, 9.8_
  
  - [x] 14.3 优化服务端渲染
    - next-intl/plugin + getTranslations SSR 无闪烁
    - generateMetadata 在服务端生成
    - _需求: 9.7_

- [x] 15. Checkpoint - 核心功能验证
  - JSON 文件有效性验证通过
  - 后端 py_compile 全部通过
  - 前端 tsc --noEmit 通过
  - i18n_errors / i18n_templates 运行时验证通过

- [x] 16. 单元测试（tests/test_i18n.py — 27/27 passed ✅）
  - [x] 16.1 i18n_errors 测试（8 tests）
    - 三语言消息查找、未知 key 回退、语言降级、HTTPException 生成
  - [x] 16.2 i18n_templates 测试（11 tests）
    - 模板获取、方向/严重度标签、变量本地化、语言降级
  - [x] 16.3 i18n_middleware 测试（8 tests）
    - Accept-Language 解析、简化形式映射、空值/不支持语言处理

- [ ] 17. 集成测试
  - [ ]* 17.1 语言切换端到端流程测试
    - 测试切换语言后 API 调用使用正确语言
    - 测试数据库同步
    - 测试跨页面语言一致性
    - _需求: 1.4, 1.5, 1.6, 1.7_
  
  - [ ]* 17.2 推送通知多语言测试
    - 测试邮件推送使用正确语言
    - 测试 Telegram 推送使用正确语言
    - 测试技术符号不被翻译
    - _需求: 7.1, 7.2, 7.3, 7.6_
  
  - [ ]* 17.3 AI 分析多语言测试
    - 测试 AI 输出使用请求的语言
    - 测试语言不匹配的检测和标注
    - 测试降级响应使用正确语言
    - _需求: 4.1, 4.2, 4.3, 4.9, 4.10_

- [ ] 18. 属性测试（Property-Based Testing）
  - [ ]* 18.1 翻译降级一致性属性测试
    - **Property 3: 翻译降级一致性**
    - **验证需求: 2.6, 10.1, 10.2, 10.6**
    - 使用 Hypothesis 生成随机翻译键和语言
    - 验证降级过程永不崩溃
    - 验证最终返回有效字符串
  
  - [ ]* 18.2 技术内容不变性属性测试
    - **Property 5: 技术内容不变性**
    - **验证需求: 3.8, 4.7, 4.8, 7.6**
    - 使用 fast-check 生成随机技术符号和语言
    - 验证技术符号在格式化后保持不变
    - 验证 AI 输出和推送通知中技术符号不变
  
  - [ ]* 18.3 数字格式化属性测试
    - **Property 4: 数字和日期本地化**
    - **验证需求: 3.1, 3.2, 3.4, 3.5, 3.6**
    - 使用 fast-check 生成随机数值和语言
    - 验证格式化结果始终是有效字符串
    - 验证格式化符合语言区域习惯
  
  - [ ]* 18.4 变量插值正确性属性测试
    - **Property 7: 变量插值正确性**
    - **验证需求: 5.6**
    - 生成随机翻译模板和参数
    - 验证变量正确替换
    - 验证缺失参数不导致崩溃
  
  - [ ]* 18.5 语言切换完整性属性测试
    - **Property 1: 语言切换完整性**
    - **验证需求: 1.4, 1.5, 1.6, 1.7, 6.1, 6.2**
    - 对任意支持的语言测试切换流程
    - 验证 localStorage 和数据库都被更新
    - 验证界面刷新在 500ms 内完成

- [ ] 19. E2E 测试
  - [ ]* 19.1 语言切换性能测试
    - 使用 Playwright 测试语言切换
    - 使用 Performance API 测量切换时间
    - 验证切换时间 < 500ms
    - 验证界面正确更新
    - _需求: 1.5, 9.4_
  
  - [ ]* 19.2 跨页面语言一致性测试
    - 测试切换语言后导航到其他页面
    - 验证语言在所有页面保持一致
    - 测试刷新页面后语言保持
    - _需求: 1.8, 6.3_
  
  - [ ]* 19.3 翻译完整性测试
    - 遍历所有页面和语言组合
    - 检查是否有未翻译��文本（包含翻译键或警告标记）
    - 验证所有 UI 元素都已翻译
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [ ]* 19.4 跨设备语言同步测试
    - 模拟在设备 A 切换语言
    - 模拟在设备 B 登录
    - 验证设备 B 加载设备 A 的语言偏好
    - _需求: 6.3_

- [ ] 20. Checkpoint - 测试验证
  - 确保所有单元测试通过
  - 确保所有集成测试通过
  - 确保所有属性测试通过（至少 100 次迭代）
  - 确保所有 E2E 测试通过
  - 如有失败请向用户反馈

- [ ] 21. 文档和部署准备
  - [ ] 21.1 更新项目文档
    - 更新 README.md 添加国际化说明
    - 创建翻译贡献指南（docs/i18n-guide.md）
    - 记录翻译工作流程和术语表
    - _需求: 5.8_
  
  - [ ] 21.2 配置生产环境
    - 配置 CDN 部署翻译资源
    - 配置 Nginx 缓存策略
    - 设置监控指标（性能、错误、使用统计）
    - _需求: 9.5, 9.6_
  
  - [ ] 21.3 执行数据库迁移
    - 在生产环境执行 SQL 迁移脚本
    - 验证迁移成功
    - 备份数据库
    - _需求: 6.2_

## 注意事项

- 标记 `*` 的任务为可选任务，可以跳过以加快 MVP 交付
- 每个任务都引用了具体的需求编号，确保可追溯性
- 属性测试任务明确标注了对应的 Correctness Property 和验证的需求
- Checkpoint 任务用于增量验证，确保每个阶段的质量
- 所有测试任务都是可选的，但强烈建议执行以确保质量
- 翻译资源文件应该纳入版本控制，便于协作和回滚
