# Risu — 项目架构

## 1. 技术栈

| 层级 | 选型 |
|---|---|
| 框架 | React 18+ |
| 语言 | TypeScript 5+ |
| 构建 | Vite 6+ |
| 3D | React Three Fiber + drei + Three.js |
| 状态 | Zustand + immer |
| 样式 | Tailwind CSS 4 |
| UI 基础组件 | shadcn/ui |
| 测试 | Vitest |
| 部署 | 静态托管（Vercel / Netlify / CDN） |

纯前端 SPA，无后端依赖。

## 2. 目录结构

```
risu/
│
├── docs/                       # 产品 & 设计文档
│
├── public/                     # 静态资源（不经 Vite 处理）
│   └── models/                 #   GLB 3D 模型
│
├── src/
│   ├── app/                    # 应用层：入口、Provider、全局布局
│   │   ├── main.tsx            #   ReactDOM 挂载入口
│   │   ├── App.tsx             #   根组件（组装 Provider + Layout）
│   │   ├── providers.tsx       #   全局 Provider 组合（Theme 等）
│   │   └── layout.tsx          #   顶层响应式布局骨架
│   │
│   ├── components/             # 通用 UI 组件（跨 feature 复用）
│   │   └── ui/                 #   shadcn/ui 原子组件
│   │
│   ├── features/               # 业务功能模块（按领域隔离）
│   │   └── <feature>/          #   每个 feature 独立目录
│   │       ├── components/     #     该 feature 内部组件
│   │       ├── hooks/          #     该 feature 内部 hooks
│   │       └── index.ts        #     对外导出的公共 API
│   │
│   ├── engine/                 # 纯业务逻辑层（零 UI 依赖）
│   │   └── __tests__/          #   单元测试
│   │
│   ├── stores/                 # Zustand 状态管理
│   │
│   ├── hooks/                  # 全局共享 hooks
│   │
│   ├── types/                  # 全局共享 TypeScript 类型
│   │
│   ├── config/                 # 应用常量 & 静态配置
│   │
│   ├── lib/                    # 纯工具函数（零 React 依赖）
│   │
│   └── styles/
│       └── globals.css         # Tailwind 入口 & 全局样式
│
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── components.json             # shadcn/ui 配置
└── ARCHITECTURE.md
```

## 3. 分层架构

```
┌─────────────────────────────────────────────────────────┐
│  app/                                                    │
│  应用层 — 入口、Provider、Layout                          │
│  组装所有 feature，不含业务逻辑                            │
└────────────────────────┬────────────────────────────────┘
                         │ 组合
┌────────────────────────▼────────────────────────────────┐
│  features/                                               │
│  功能模块层 — 按业务域隔离                                 │
│  每个 feature 封装自己的 components/hooks                  │
│  feature 之间不直接 import，通过 store 通信                │
└───┬────────────┬────────────┬────────────┬──────────────┘
    │            │            │            │
    ▼            ▼            ▼            ▼
┌────────┐ ┌────────┐ ┌──────────┐ ┌───────────┐
│ stores/│ │engine/ │ │components│ │  hooks/   │
│ 状态层  │ │逻辑层   │ │ 组件层    │ │  Hook 层  │
└───┬────┘ └───┬────┘ └──────────┘ └───────────┘
    │          │
    ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐
│ types/ │ │  lib/  │ │config/ │
│ 类型层  │ │ 工具层  │ │ 配置层  │
└────────┘ └────────┘ └────────┘
```

## 4. 各层职责与约束

### 4.1 `app/` — 应用层

- `main.tsx`：ReactDOM 挂载，Strict Mode
- `App.tsx`：根组件，组装 providers → layout → features
- `providers.tsx`：全局 Context Provider（Theme、GPU Tier 等）
- `layout.tsx`：顶层布局骨架（响应式 PC/Mobile 切换）

**约束**：只做组装和 Provider 编排，不写业务逻辑。

### 4.2 `components/` — 通用组件层

- `ui/`：shadcn/ui 安装的原子组件（Button、Dialog、Sheet 等）
- 自定义的跨 feature 通用组件

**约束**：无业务语义，不依赖任何 store 或 feature。纯 props 驱动。

### 4.3 `features/` — 功能模块层

每个 feature 是一个独立业务域，内部结构：

```
features/<name>/
├── components/     # 该 feature 的 UI 组件
├── hooks/          # 该 feature 的 hooks
└── index.ts        # 对外公共 API（只导出其他模块需要的东西）
```

**约束**：
- feature 之间**禁止**直接 import 内部文件，只能 import `index.ts` 导出的公共 API
- feature 之间的数据传递走 `stores/`
- feature 可依赖 `components/`、`hooks/`、`stores/`、`engine/`、`lib/`、`types/`、`config/`

### 4.4 `engine/` — 纯业务逻辑层

纯 TypeScript 模块，封装所有与 UI 无关的领域逻辑。

**约束**：
- **禁止** import React、Three.js 或任何 UI 库
- 只依赖 `types/` 和 `lib/`
- 所有函数必须是纯函数或可独立单测的模块
- 自带 `__tests__/` 目录

### 4.5 `stores/` — 状态层

Zustand store，全局状态中心。

**约束**：
- 每个 store 文件对应一个独立关注点
- store action 内调用 `engine/` 做校验，校验通过才更新状态
- 使用 `immer` 中间件做不可变更新

### 4.6 `hooks/` — 全局 Hook 层

跨 feature 复用的 React hooks。

**约束**：可依赖 `stores/`、`lib/`、`config/`，不依赖具体 feature。

### 4.7 `types/` — 类型层

全局共享的 TypeScript 类型定义。

**约束**：纯类型，零运行时代码。不依赖任何其他模块。

### 4.8 `config/` — 配置层

应用级常量、预设数据、枚举映射等。

**约束**：纯数据/常量，不含逻辑。可被任何层 import。

### 4.9 `lib/` — 工具层

纯工具函数。

**约束**：
- **禁止** import React 或任何框架
- 只依赖 `types/`（如果需要）
- 每个文件可独立使用

## 5. 依赖规则总览

```
app/         → features/, components/, stores/, hooks/, config/, styles/
features/*   → stores/, engine/, components/, hooks/, lib/, types/, config/
stores/      → engine/, types/, lib/
engine/      → types/, lib/               ← 禁止 React / Three.js
hooks/       → stores/, lib/, config/
components/  → lib/, types/               ← 禁止 store 依赖
lib/         → types/                     ← 禁止框架依赖
types/       → (无依赖)
config/      → types/
```

**核心原则**：依赖只能向下，禁止循环。底层模块（`types/`、`lib/`、`config/`）对上层零感知。

## 6. 命名约定

| 类别 | 规则 | 示例 |
|---|---|---|
| 目录 | kebab-case | `features/property-panel/` |
| React 组件文件 | PascalCase.tsx | `BlockModel.tsx` |
| 非组件 TS 文件 | kebab-case.ts | `rule-engine.ts` |
| Hook 文件 | use-xxx.ts | `use-keyboard.ts` |
| Store 文件 | xxx-store.ts | `editor-store.ts` |
| 测试文件 | 同名 + .test.ts | `rule-engine.test.ts` |
| 类型文件 | kebab-case.ts（纯类型） | `editor.ts` |
| 导出入口 | index.ts | `features/catalog/index.ts` |
