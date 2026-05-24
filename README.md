# KuRa

KuRa 是一个基于 React + Three.js 的 3D 收纳编辑器，用于在网格化空间中摆放、移动和管理物品布局。

## 功能概览

- 3D 视口编辑：支持轨道相机、视角切换、拖拽放置和网格吸附
- 目录面板：按分类浏览物品，拖拽到场景中进行摆放
- 布局操作：支持选择、移动、删除、批量清空等常用编辑动作
- 主题切换：支持明暗主题快速切换
- 预设能力：支持预设方案读取与相关导入导出流程

## 技术栈

- React + TypeScript + Vite
- Three.js + React Three Fiber + drei
- Zustand + immer
- Tailwind CSS + shadcn/ui
- Vitest

## 本地开发

### 环境要求

- Node.js 20+
- npm 10+

### 安装依赖

```bash
npm ci
```

### 启动开发环境

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 本地预览构建产物

```bash
npm run preview
```

### 运行测试

```bash
npm run test
```

## 目录结构

```text
kura/
├── docs/                    # 产品与技术文档
├── public/                  # 静态资源
├── deploy/                  # 服务器部署脚本和 Nginx 配置
├── src/
│   ├── app/                 # 应用入口与布局
│   ├── components/          # 通用 UI 组件
│   ├── features/            # 业务功能模块
│   ├── stores/              # Zustand 状态管理
│   ├── hooks/               # 全局 hooks
│   ├── config/              # 常量与配置
│   ├── types/               # 类型定义
│   └── lib/                 # 工具函数
├── .github/workflows/       # CI/CD 工作流
└── ARCHITECTURE.md          # 架构说明
```

## 开源许可与署名

- 适用范围：仅模型与素材文件（如 `public/models`、`public/images`、相关数据文件）
- 许可协议：`CC BY 4.0`（允许商业使用，需署名）
- 署名要求：需明确标注作者 `Lee` 与项目名 `KuRa`
- 源代码：不开放，保留所有权利（All Rights Reserved）
- 许可文件：`LICENSE`
- 署名示例：`ATTRIBUTION.md`

## CI/CD 与部署

- 已提供 `release` 分支自动部署工作流：`.github/workflows/release-deploy.yml`
- 服务器部署脚本：`deploy/server-deploy.sh`
- Nginx 配置模板：`deploy/nginx/miaoplus.com.conf`
- 部署细节文档：`docs/ci-cd-deploy.md`

当代码推送到 `release` 分支时，会自动构建并发布到服务器。

## 说明

- 项目当前为前端 SPA 架构
- 更多架构约束和分层说明请查看 `ARCHITECTURE.md`
