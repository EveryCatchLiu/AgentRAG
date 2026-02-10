---
description: 將 Claude Code 引入代碼庫
---

# 上下文

## 流程

1. **掃描結構**
   - 運行 `git ls-files` 查看所有追蹤的文件

2. **閱讀關鍵文件**
   - CLAUDE.md、PRD.md 和其他架構文檔
   - 入口點和配置文件
   - 核心模式/模型

3. **檢查狀態**
   - 運行 `git status` 和 `git log -10 --oneline`

## 輸出

提供簡要摘要：
- 這個項目做什麼
- 技術棧
- 如何組織的
- 當前分支和近期活動
