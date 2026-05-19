---
description: 将 Claude Code 引入代码库
---

# 上下文

## 流程

1. **扫描结构**
   - 运行 `git ls-files` 查看所有追踪的文件

2. **阅读关键文件**
   - CLAUDE.md、PRD.md 和其他架构文档
   - 入口点和配置文件
   - 核心模式/模型

3. **检查状态**
   - 运行 `git status` 和 `git log -10 --oneline`

## 输出

提供简要摘要：
- 这个项目做什么
- 技术栈
- 如何组织的
- 当前分支和近期活动
