# MyAI Strategy Memo

> **Status**: 本文档是当前产品战略的权威来源。早期愿景探索见 [IDEA-archive.md](./docs/archive/IDEA-archive.md)，当前版本的执行计划见 [PRD-v0.1.md](./PRD-v0.1.md)。

> 目标：把 MyAI 从”好概念”收敛成”可验证、可融资、可执行的 0-1 AI 产品”。

---

## 1. One-Line Thesis

MyAI 不是一个“AI 资产收藏夹”，而是一个 **AI workflow portability layer**：

**让团队已经验证有效的 AI 工作流，可以跨工具、跨机器、跨成员保存、恢复、复用和继承。**

对外叙事使用 `workflow portability`，但产品主对象是 `profile`，底层存储单元是 `asset`。

底层资产模型仍然是 `prompts + MCPs + preferences + skills`，但用户买单的不是“资产管理”，而是：

- 不重配
- 不重写
- 不重来

---

## 2. Problem Statement

今天的 AI 工作流已经开始具备“生产资料”特征，但仍然被锁在不同工具里：

- Claude Code 里的 rules、skills、MCP
- Codex CLI 里的 agent 配置
- ChatGPT / Claude.ai 里的长期 prompt 和偏好
- 团队内部口口相传的“那个最好用的 profile”

用户的真实痛点不是“我需要一个仓库”，而是：

1. 换工具后，之前的有效工作流带不过去
2. 换电脑后，要重新配置一遍
3. 团队里有人摸索出的最佳实践，其他人继承不了
4. AI 使用经验越多，反而越乱、越难找回

这意味着市场机会不是“配置同步”，而是 **AI workflow portability + reuse**。

## 2.1 Object Model

- `asset`: 底层存储单元，例如 prompt、MCP 定义、preference、skill 引用
- `profile`: 产品主对象，由一组 assets 组成，可被保存、搜索、应用、同步
- `workflow`: 用户要完成的任务场景，例如 code review、backend debug、onboarding

关系是：

`workflow -> uses -> profile -> references -> assets`

---

## 3. ICP

### Primary ICP

5-30 人的 AI-native 产品或工程团队，满足以下特征：

- 团队已高频使用至少两种 AI 工具，且当前 v0.1 试点必须包含 Claude Code 和 Codex CLI
- 团队成员会共享 prompt、规则、MCP、工作流
- 团队已出现“某个人最会配，别人继承不了”的问题
- 新成员 onboarding 或换机恢复已造成明确摩擦

### Secondary ICP

高频多工具独立开发者、技术创始人、AI power users。

### 暂不优先的用户

- 只使用单一聊天产品的轻度用户
- 没有团队协作场景的低频用户
- 只想“收藏 prompt”但没有复用行为的用户

---

## 4. Wedge

### Wedge Definition

**“团队 AI 工作流恢复与继承”** 是最强的切入点。

比起泛泛讲“个人 AI 资产仓库”，更强的前台价值应该是：

- 新成员 30 分钟恢复团队 AI profile
- Claude 里跑通的工作流，能在 Codex CLI 复用主要部分
- 团队最佳实践沉淀一次，其他成员直接继承

### 为什么这个 wedge 更强

1. 痛点更接近生产力损失，付费理由更硬
2. 团队场景比个人收藏更容易形成留存
3. “恢复”和“继承”天然带来可量化 ROI
4. 跨成员共享比单人仓库更容易形成组织惯性

### 非目标 wedge

以下叙事先不要当主卖点：

- “AI Native 资产管理”
- “统一管理所有 AI 配置”
- “prompt 收藏库”
- “AI 工作记忆系统”

这些方向都可能是未来扩展，但不适合作为冷启动入口。

---

## 5. Product Scope for v0.1

### 必须支持

- `profiles`：保存、搜索、应用、同步
- `prompts` / `mcps` / `preferences`：作为 profile 的底层 assets 被管理
- `workspace bootstrap`：新机器 / 新成员恢复基础 profile

### 可以弱支持

- `skills`：作为团队工作流模板保存，但不承诺跨工具完整兼容

### 明确不做

- 浏览器扩展
- marketplace
- 复杂自动整理
- 面向泛消费者的对话产品
- 同时支持所有 AI 平台
- Cursor 集成

---

## 6. 90-Day Validation Plan

### Phase 1: Weeks 1-3

目标：验证是否存在“非解决不可”的恢复与继承痛点。

动作：

- 访谈 15-20 个多工具 AI 团队用户
- 记录最近一次“换工具 / 换机 / 新人接手”案例
- 明确他们目前如何保存和传递 prompts / MCPs / rules
- 找出最高频的 3 个恢复场景

成功标准：

- 至少 8 个访谈对象明确表达当前方案不可持续
- 至少 5 个对象愿意试用一个早期手动版本

### Phase 2: Weeks 4-6

目标：打穿一个最小闭环。

动作：

- 支持 profile 保存、搜索、导出
- 支持 Claude Code -> Codex CLI 的 profile 迁移
- 支持团队 profile 初始化

成功标准：

- 5 个设计合作团队完成真实迁移
- 每个团队至少复用 1 次已保存 profile

### Phase 3: Weeks 7-9

目标：验证重复使用，而不是一次性兴趣。

动作：

- 加 usage tracking
- 加团队共享目录 / 模板机制
- 跟踪重复调用、跨工具复用、恢复时长

成功标准：

- 设计合作团队中 60% 在 14 天内再次使用
- 至少 3 个团队形成每周复用行为

### Phase 4: Weeks 10-12

目标：验证付费意愿和组织价值。

动作：

- 推出团队版手工收费试点
- 提供 onboarding / migration support
- 测试 seat-based 或 workspace-based 定价

成功标准：

- 至少 2 个团队愿意付费试点
- 至少 1 个团队将 MyAI 纳入正式 onboarding 流程

---

## 7. North Star and Key Metrics

### North Star

**Weekly Reused Profiles**

定义：每周被再次应用、跨场景复用或被团队成员继承使用的 profile 数量。

### Supporting Metrics

- Weekly created profiles
- 14-day repeat reuse rate
- Cross-tool profile reuse rate
- New environment recovery time
- Team shared profile adoption rate
- Search-to-use conversion

### 不要用作主指标

- 安装量
- 保存总量
- 注册用户数

这些指标很容易制造虚假繁荣。

---

## 8. Pricing Hypothesis

### 初步判断

个人版可以存在，但不应作为核心商业模型。真正值得验证的是团队付费。

### Pricing Direction

- Free: 个人本地仓库 + 基础导入导出
- Pro: 个人高级同步、版本历史、跨工具恢复
- Team: 共享工作流、权限、模板、审计、workspace 管理

### 更可能成立的付费锚点

- 团队 onboarding 节省的时间
- AI 最佳实践的继承效率
- 跨工具工作流的稳定迁移
- 关键 AI 配置的版本与权限控制

不建议一开始卖“更多 prompt 存储空间”或“更聪明的分类”，这些价值太软。

---

## 9. GTM

### 初始渠道

- 创始人网络中的 AI-native 小团队
- 高频使用 Claude Code / Codex 的开发者社区
- 公开发布“换机恢复 / 团队继承”案例，而不是泛泛宣传 AI vault 理念

### GTM Message

不要说：

“管理你的 AI 资产。”

要说：

“把你团队已经跑通的 AI 工作流保存下来，让新成员和新机器直接继承。”

### 最适合的销售动作

- Design partner 模式
- 手工迁移与 onboarding
- 小团队高接触支持

这个阶段不是靠自助式漏斗起量，而是靠把痛点打穿拿到第一批强留存。

---

## 10. Fundraising Narrative

### 可以讲给投资人的核心故事

AI coding 和 agent workflows 正在快速成为新的生产资料，但今天这些工作流仍然被锁在不同工具、不同机器和不同成员的个人 profiles 与本地配置中。

MyAI 要做的不是新的 AI 聊天入口，而是一层 **workflow portability infrastructure**：

- 保存已经验证有效的 AI profiles
- 在不同工具之间迁移核心能力
- 在团队内部继承最佳实践
- 让 AI 使用经验从“个人隐性知识”变成“组织可复用资产”

### 投资人会想看到的证据

- 团队级重复使用
- 明确的恢复时间节省
- 新人 onboarding 效率提升
- 部分平台能力无法替代的跨工具 portability

---

## 11. Main Risks

1. 产品最终只打动少数高级用户，扩不成市场
2. 平台逐步补齐单点同步能力，挤压表层价值
3. profile 定义不够清晰，用户仍按任务而不是按可复用对象理解产品
4. 过早扩展到浏览器、consumer、marketplace，导致主飞轮失焦

---

## 12. Kill Criteria

以下任一情况持续成立，应及时调整方向：

- 用户愿意保存，但 14 天内不复用
- 团队协作场景弱于个人收藏场景
- 用户更愿意手工维护 README / Git 仓库，而不愿持续使用产品
- 真实付费意愿始终停留在“有空再说”

---

## 13. Immediate Next Moves

1. 定义唯一的 repo schema 和 profile schema
2. 画出第一次“团队恢复 / 继承”闭环的具体交互
3. 规定 v0.1 指标的采集方式与事件日志格式
4. 只围绕恢复、复用、继承做最小实现，不扩展无关功能

---

*Drafted for founder strategy on 2026-03-30*
