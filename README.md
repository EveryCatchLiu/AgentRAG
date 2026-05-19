# Claude Code Agentic RAG 

通过与 Claude Code 协作，从零开始构建一个 Agentic RAG 应用。跟随我们的视频系列，使用此仓库中的文档进行学习。

## 这是什么

一门实践课程，你通过与 Claude Code 协作来构建一个功能完整的 RAG 系统。你不是写代码的人——Claude 才是。你的工作是引导它、理解你在构建什么，并在需要时进行纠正。

**你不需要知道如何编程。** 你需要具备技术思维，并愿意学习 API、数据库和系统架构。

## 你将构建什么

- **聊天界面**，具有线程对话、流式传输、工具调用和子代理推理
- **文件导入**，具有拖放上传和处理状态
- **完整 RAG 管道**：分块、嵌入、混合搜索、重排序
- **代理模式**：文本转 SQL、网页搜索、具有隔离上下文的子代理

## 技术栈


| 层次    | 技术                                       |
| ----- | ---------------------------------------- |
| 前端    | React、TypeScript、Tailwind、shadcn/ui、Vite |
| 后端    | Python、FastAPI                           |
| 数据库   | Supabase（Postgres + pgvector + 认证 + 存储）  |
| 文件处理  | Docling                                  |
| AI 模型 | 本地（LM Studio）或云端（OpenAI、OpenRouter）      |
| 可观测性  | LangSmith                                |


## 8 个模块

1. **应用外壳** — 认证、聊天 UI、使用 OpenAI Responses API 的托管 RAG
2. **自建检索 + 记忆** — 导入、pgvector、切换到通用 Completions API
3. **记录管理器** — 内容哈希、去重
4. **元数据提取** — LLM 提取的元数据、过滤检索
5. **多格式支持** — 通过 Docling 支持 PDF、DOCX、HTML、Markdown
6. **混合搜索和重排序** — 关键词 + 向量搜索、RRF、重排序
7. **附加工具** — 文本转 SQL、网页搜索回退
8. **子代理** — 隔离上下文、文件分析委派

## 开始使用

1. 克隆此仓库
2. 安装 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
3. 在你的 IDE 中打开（Cursor、VS Code 等）
4. 在终端中运行 `claude`
5. 使用 `/onboard` 命令开始

## 文档

- [PRD.md](./PRD.md) — 要构建什么（8 个模块的详细说明）
- [CLAUDE.md](./CLAUDE.md) — Claude Code 的上下文
- [PROGRESS.md](./PROGRESS.md) — 追踪你的构建进度

## 加入社区

如果你想与数百位构建生产级 AI 和 RAG 系统的开发者交流，加入我们的 [The AI Automators 社区](https://www.skool.com/aiagent/about)。分享你的进度，在遇到困难时获得帮助，看看其他人在构建什么。