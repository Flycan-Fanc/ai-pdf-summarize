# AI PDF Summarize

一个基于 **Vue 3 + TypeScript** 开发的纯前端 AI PDF 总结工具。  
用户可以上传 PDF 文档，前端完成文本提取，再结合 AI 生成内容总结，并通过流式输出和打字机效果逐步展示结果。

## 在线体验

[GitHub Pages 在线地址](https://flycan-fanc.github.io/ai-pdf-summarize/)

---

## 项目简介

这个项目主要用于解决 **长文档阅读成本高** 的问题，让用户能够更快抓住 PDF 的核心内容。  
整体定位是一个轻量化的 **文档阅读与 AI 总结工具**，适合作为 AI 应用前端落地的练习项目。

项目当前采用纯前端方案实现，核心流程包括：

- 上传 PDF 文档
- 前端提取 PDF 文本
- 调用 AI 接口生成总结
- 流式接收返回内容
- 通过打字机效果逐步展示结果
- 支持深浅主题切换

---

## 核心功能

### 1. PDF 上传

- 支持点击上传
- 支持拖拽上传

### 2. 前端文本解析

- 基于 `pdfjs-dist` 在浏览器端提取 PDF 文本
- 不依赖服务端完成基础文档解析

### 3. AI 总结生成

- 将提取后的文本发送给 AI 接口
- 用于生成文档核心内容总结

### 4. 流式输出展示

- 支持以流式方式接收 AI 返回结果
- 提升交互实时性

### 5. 打字机效果

- 将流式返回结果以更平滑的节奏逐步展示
- 优化阅读体验，避免内容瞬间堆叠

### 6. 深浅主题切换

- 支持不同主题模式
- 提升页面观感与使用体验

---

## 技术栈

### 前端

- Vue 3
- TypeScript
- Vite
- Element Plus

### 文档解析

- pdfjs-dist

### 部署

- GitHub Pages

---

## 项目亮点

### 1. 纯前端实现 PDF 解析与 AI 总结链路

项目不依赖传统后端解析 PDF，而是直接在前端完成文本提取，再进入 AI 总结流程，适合快速验证产品思路。

### 2. 流式输出与展示解耦

在 AI 返回内容时，不是简单把结果直接渲染到页面，而是通过流式接收 + 打字机展示的方式，让交互过程更平滑。

### 3. 更贴近真实 AI 应用前端场景

这个项目不仅是一个页面 demo，而是围绕“上传文档 → 解析 → 总结 → 展示”这条完整链路来设计的，具备一定的产品化思路。

---

## 本地运行

### 1. 克隆项目

```bash
git clone https://github.com/Flycan-Fanc/ai-pdf-summarize.git
cd ai-pdf-summarize
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发环境

```bash
npm run dev
```

### 4. 打包构建

```bash
npm run build
```

### 5. 本地预览构建结果

```bash
npm run preview
```

---

## 项目结构

```bash
ai-pdf-summarize
├─ .github/
│  └─ workflows/         # GitHub Pages 自动部署工作流
├─ public/               # 静态资源
├─ src/
│  ├─ components/        # 页面核心组件
│  ├─ App.vue
│  └─ main.ts
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

---

## 我在这个项目中完成了什么

这个项目由我独立完成，主要负责：

- 项目功能设计
- 技术选型
- 前端页面搭建
- PDF 文本提取链路实现
- AI 接口接入
- 流式响应处理
- 打字机展示效果实现
- GitHub Pages 部署上线

---

## 后续优化方向

- 优化复杂 PDF 的文本提取效果
- 增加图像解析功能
- 增加长文档分段总结能力
- 补充错误处理与异常提示
- 引入后端代理，提升接口安全性
- 进一步优化移动端与响应式体验

---

## License

本项目基于 Apache License 2.0 开源。
