# 进度

## 惯例
- `[ ]` = 未开始
- `[-]` = 进行中
- `[x]` = 已完成

## 模块

### 模块 1：应用外壳 + 可观测性 [x]

- [x] 1.1 项目脚手架（前后端）
- [x] 1.2 Supabase 数据库 Schema（`threads` + `messages` 表 + RLS）
- [x] 1.3 前端认证 UI
- [x] 1.4 聊天 UI 界面
- [x] 1.5 Chat Completions API 后端
- [x] 1.6 LangSmith 可观测性
- [x] 1.7 端到端联调 + 验证

### 服务状态
- 后端：运行中 `http://localhost:8000`
- 前端：运行中 `http://localhost:5173`

### 模块 3：记录管理器 [x]

- [x] 3.1 数据库迁移（content_hash 列 + 索引 + RLS）
- [x] 3.2 后端去重逻辑（SHA-256 + 跳过/更新/新建三分支）
- [x] 3.3 前端去重通知（跳过/更新横幅提示）
- [x] 3.4 端到端验证

### 模块 4：元数据提取 [x]

- [x] 4.1 Pydantic DocumentMetadata 模型
- [x] 4.2 LLM 结构化元数据提取（extract_metadata）
- [x] 4.3 扩展 match_chunks RPC（元数据过滤参数）
- [x] 4.4 扩展 search_chunks（filter_file_ids/filter_topics/filter_doc_types）
- [x] 4.5 SSE sources 事件（检索来源推送前端）
- [x] 4.6 前端来源卡片（可折叠的 SourceCard）
- [x] 4.7 前端过滤栏（FilterBar + metadata/filters API）

### 模块 5：多格式支持 [x]

- [x] 5.1 Markdown 解析（_strip_markdown 去语法）
- [x] 5.2 CSV/TSV 解析（_parse_csv 结构化）
- [x] 5.3 数据库级联删除（ON DELETE CASCADE）
- [x] 5.4 依赖补全（beautifulsoup4 + python-docx）
- [x] 5.5 前端文件类型过滤（accept 属性）

### 模块 6：混合搜索和重排序 [x]

- [x] 6.1 关键词搜索 RPC（LIKE 子串匹配，支持中文）
- [x] 6.2 RRF 融合（向量 + 关键词双路结果合并）
- [x] 6.3 LLM 重排序（cross-encoder prompt 打分）
- [x] 6.4 端到端验证

### 模块 7：附加工具 [x]

- [x] 7.1 search_web 工具（DuckDuckGo 网页搜索回退）
- [x] 7.2 query_database 工具（自然语言→SQL 查询元数据）
- [x] 7.3 Tool-calling loop（LLM 自主决定是否调用工具）
- [x] 7.4 SSE tool_calls 事件 + 前端工具调用展示

### 模块 8：子代理 [x]

- [x] 8.1 数据库 migration（messages.metadata JSONB 列）
- [x] 8.2 get_full_document_text 函数（加载完整文档文本）
- [x] 8.3 SubAgentExecutor 模块（隔离上下文 + search_document 工具）
- [x] 8.4 delegate_to_subagent 工具（LLM 自主决定委派子代理）
- [x] 8.5 SSE 委派事件 + reasoning 事件 + 嵌套 tool_calls
- [x] 8.6 ToolCallCard 组件（递归嵌套工具调用展示）
- [x] 8.7 ReasoningPanel 组件（推理过程折叠展示）
- [x] 8.8 前端 store 接口更新 + Chat.tsx SSE 处理
- [x] 8.9 边缘情况处理（空文档、缺失文件、深度限制、token 截断）
