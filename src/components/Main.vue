<template>
  <div class="app" :data-theme="effectiveTheme">
    <div class="shell">
      <!-- Header -->
      <div class="header card">
        <div class="brand">
          <div class="title">AI PDF 助手（纯前端）</div>
          <el-tag v-if="pdfName" size="small" type="info" class="fileTag">{{ pdfName }}</el-tag>
        </div>

        <div class="toolbar">
          <el-select v-model="provider" class="w-provider">
            <el-option label="DeepSeek（OpenAI兼容）" value="deepseek" />
            <el-option label="OpenAI（Chat Completions）" value="openai" />
          </el-select>

          <el-input v-model="apiKey" class="w-key" placeholder="API Key（仅本地演示）" show-password />

          <el-input v-model="baseUrl" class="w-base" placeholder="Base URL" />
          <el-input v-model="model" class="w-model" placeholder="Model" />

          <div class="typing">
            <el-slider v-model="typingSpeed" :min="5" :max="60" class="w-slider" />
            <div class="muted">打字：{{ typingSpeed }} 字/秒</div>
          </div>

          <el-segmented v-model="themeMode" :options="themeOptions" />
        </div>
      </div>

      <!-- Grid -->
      <div class="grid">
        <!-- Left: PDF -->
        <div class="card">
          <div class="cardHead">1) 选择 PDF 并解析文字</div>

          <!-- hidden input -->
          <input ref="fileInput" type="file" accept="application/pdf,.pdf" style="display: none" @change="onFileChange" />

          <div class="dropzone" @dragover.prevent @drop.prevent="onDrop" @click="pickFile" :class="{ disabled: loadingParse }" title="点击选择或拖拽 PDF 到这里">
            <div class="dzTitle">点击选择 / 拖拽 PDF 到这里</div>
            <div class="dzTip muted">纯前端解析。大 PDF 会慢一些；文本提取质量取决于 PDF 是否是"扫描图像"。</div>
            <div class="dzActions">
              <el-button type="primary" :loading="loadingParse" @click.stop="pickFile">选择 PDF</el-button>
              <el-button :disabled="!pdfText || loadingParse" @click.stop="copyPdfText">复制解析文本</el-button>
              <el-button :disabled="loadingParse" @click.stop="clearAll">清空</el-button>
            </div>
          </div>

          <div class="metaRow" v-if="pdfText">
            <el-tag size="small" type="success">解析完成</el-tag>
            <div class="muted">
              字符数：{{ pdfText.length }} <span v-if="parseMs">｜耗时：{{ parseMs }} ms</span>
            </div>
          </div>

          <el-collapse v-if="pdfText" class="collapse">
            <el-collapse-item title="查看解析文本（可选）">
              <el-input v-model="pdfText" type="textarea" :rows="10" />
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- Right: Summary -->
        <div class="card">
          <div class="cardHead rowBetween">
            <span>2) AI 总结输出（SSE + 打字机）</span>
            <el-tag v-if="loadingAI" type="warning">生成中…</el-tag>
            <el-tag v-else type="info">就绪</el-tag>
          </div>

          <el-alert v-if="errorMsg" type="error" show-icon :closable="true" :title="errorMsg" class="mb" @close="errorMsg = ''" />

          <div class="actions">
            <el-button type="primary" :disabled="!pdfText || loadingAI" :loading="loadingAI" @click="summarize"> 发送总结（流式） </el-button>
            <el-button type="danger" plain :disabled="!loadingAI" @click="abortStream">停止</el-button>
            <el-button :disabled="!output" @click="copyOutput">复制总结</el-button>
            <el-button :disabled="!output" @click="output = ''">清空总结</el-button>
          </div>

          <div class="output">
            <pre class="pre">{{ output }}</pre>
          </div>

          <div class="muted foot">注意：纯前端直连 API 可能被浏览器 CORS 拦截；这是浏览器安全策略，不是代码问题。</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from "vue";
import { ElMessage } from "element-plus";

// 导入模块
import { ThemeManager } from "../utils/theme";
import { isPdfFile, parsePdfFile, handleFileSelect, handleFileDrop, handleDragOver, copyToClipboard } from "../utils/pdfHelper";
import { AiService, buildDefaultMessages, createAiService, createTypewriterManager } from "../api/aiService";

// -------------------- 主题管理 --------------------
const themeManager = new ThemeManager(ref("system"), ref(false));

onMounted(() => {
  themeManager.init();
});

onBeforeUnmount(() => {
  themeManager.cleanup();
});

const themeMode = themeManager.themeMode;
const effectiveTheme = computed(() => themeManager.getEffectiveTheme());
const themeOptions = ThemeManager.getThemeOptions();

watch(themeMode, (newValue) => {
  themeManager.setThemeMode(newValue);
});

// -------------------- AI 配置 --------------------
type Provider = "deepseek" | "openai";

const provider = ref<Provider>("deepseek");
const apiKey = ref<string>("");
const baseUrl = ref<string>("https://api.deepseek.com");
const model = ref<string>("deepseek-chat");

watch(provider, (p) => {
  if (p === "deepseek") {
    baseUrl.value = "https://api.deepseek.com";
    model.value = "deepseek-chat";
  } else {
    baseUrl.value = "https://api.openai.com/v1";
    model.value = "gpt-4o-mini";
  }
});

// -------------------- PDF 相关状态 --------------------
const fileInput = ref<HTMLInputElement | null>(null);
const pdfName = ref("");
const pdfText = ref("");
const parseMs = ref<number | null>(null); //解析耗时
const loadingParse = ref(false);

// -------------------- AI 相关状态 --------------------
const errorMsg = ref("");
const output = ref("");
const loadingAI = ref(false);
const typingSpeed = ref(25);

// -------------------- 打字机效果管理器 --------------------
const typewriterManager = createTypewriterManager(typingSpeed.value);
// 设置打字机的增量回调，打字机输出内容时通知页面更新
typewriterManager.setOnUpdate((text) => {
  output.value = text;
});

watch(typingSpeed, (newSpeed) => {
  typewriterManager.setSpeed(newSpeed);
  if (typewriterManager.isRunning()) {
    typewriterManager.stop();
    typewriterManager.start();
  }
});

// -------------------- AI 服务实例 --------------------
let aiService: AiService | null = null;

watch(
  [apiKey, baseUrl, model, provider],
  () => {
    aiService = createAiService({
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: model.value,
      provider: provider.value,
      timeout: 30000,
    });
  },
  { immediate: true },
);

// -------------------- 文件处理函数 --------------------
function pickFile() {
  fileInput.value?.click();
}

async function onFileChange(e: Event) {
  const file = handleFileSelect(e);
  if (file) {
    await parsePdf(file);
  }
}

async function onDrop(e: DragEvent) {
  handleDragOver(e);
  const file = handleFileDrop(e);
  if (file) {
    await parsePdf(file);
  }
}

// -------------------- PDF 解析函数 --------------------
async function parsePdf(file: File) {
  errorMsg.value = "";
  output.value = "";
  typewriterManager.reset();

  if (!isPdfFile(file)) {
    ElMessage.error("请选择 PDF 文件");
    return;
  }

  loadingParse.value = true;
  try {
    pdfName.value = file.name;

    const result = await parsePdfFile(file, {
      maxChars: 60000,
      includePageSeparators: true,
    });

    pdfText.value = result.text;
    parseMs.value = result.parseTimeMs;

    ElMessage.success("解析完成");
  } catch (err: any) {
    console.error(err);
    errorMsg.value = err?.message || "PDF 解析失败（可能是 worker 路径或 PDF 损坏）";
  } finally {
    loadingParse.value = false;
  }
}

// -------------------- AI 总结函数 --------------------
async function summarize() {
  errorMsg.value = "";
  output.value = "";
  typewriterManager.reset();

  if (!apiKey.value.trim()) {
    errorMsg.value = "请先填写 API Key";
    return;
  }

  if (!pdfText.value.trim()) {
    errorMsg.value = "请先上传并解析 PDF";
    return;
  }

  if (!aiService) {
    errorMsg.value = "AI 服务未初始化";
    return;
  }

  loadingAI.value = true;
  typewriterManager.start();

  try {
    const messages = buildDefaultMessages(pdfText.value);

    const success = await aiService.sendRequest(
      {
        messages,
        stream: true,
        temperature: 0.2,
      },
      {
        onDelta: (delta) => {
          typewriterManager.addPending(delta);
        },
        onComplete: (content) => {
          output.value = content;
        },
        onError: (error) => {
          errorMsg.value = error.message || "请求失败（可能是 CORS 或 Key/模型/地址错误）";
        },
        onAbort: () => {
          ElMessage.info("已停止");
        },
      },
    );

    if (!success) {
      // 错误已经在 onError 回调中处理
      return;
    }
  } catch (err: any) {
    console.error(err);
    errorMsg.value = err?.message || "请求失败";
  } finally {
    loadingAI.value = false;
    typewriterManager.finishImmediately();
    output.value = typewriterManager.getOutput();
  }
}

function abortStream() {
  if (aiService) {
    aiService.abort();
  }
}

// -------------------- 工具函数 --------------------
async function copyPdfText() {
  const success = await copyToClipboard(pdfText.value);
  if (success) {
    ElMessage.success("已复制解析文本");
  } else {
    ElMessage.error("复制失败");
  }
}

async function copyOutput() {
  const success = await copyToClipboard(output.value);
  if (success) {
    ElMessage.success("已复制总结");
  } else {
    ElMessage.error("复制失败");
  }
}

function clearAll() {
  errorMsg.value = "";
  pdfName.value = "";
  pdfText.value = "";
  parseMs.value = null;
  output.value = "";
  typewriterManager.reset();
  abortStream();
}
</script>

<style scoped>
/* ----------------------
   Theme variables
---------------------- */
.app {
  --pad: 16px;
  --gap: 12px;
  --radius: 14px;
  --maxw: 1200px;

  --bg: #f6f7fb;
  --panel: #ffffff;
  --text: #1f2328;
  --muted: #6b7280;
  --border: rgba(0, 0, 0, 0.1);
  --shadow: 0 10px 26px rgba(0, 0, 0, 0.08);

  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

.app[data-theme="dark"] {
  --bg: #0b0f17;
  --panel: #0f172a;
  --text: #e5e7eb;
  --muted: #9aa4b2;
  --border: rgba(255, 255, 255, 0.12);
  --shadow: 0 14px 34px rgba(0, 0, 0, 0.6);
}

/* ----------------------
   Layout
---------------------- */
.shell {
  max-width: var(--maxw);
  margin: 0 auto;
  padding: var(--pad);
  display: flex;
  flex-direction: column;
  gap: var(--gap);
  box-sizing: border-box;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: var(--gap);
}

.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 14px;
}

/* header */
.header {
  padding: 14px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.title {
  font-weight: 700;
  font-size: 18px;
}
.fileTag {
  transform: translateY(1px);
}
.toolbar {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.typing {
  display: flex;
  align-items: center;
  gap: 10px;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}

.cardHead {
  font-weight: 700;
  margin-bottom: 10px;
}
.rowBetween {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* widths (PC default) */
.w-provider {
  width: 190px;
}
.w-key {
  width: 320px;
}
.w-base {
  width: 300px;
}
.w-model {
  width: 200px;
}
.w-slider {
  width: 200px;
}

/* dropzone */
.dropzone {
  border: 1px dashed var(--border);
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  background: color-mix(in oklab, var(--panel) 92%, var(--bg));
}
.dropzone.disabled {
  opacity: 0.6;
  pointer-events: none;
}
.dzTitle {
  font-weight: 700;
}
.dzTip {
  margin-top: 6px;
  line-height: 1.5;
}
.dzActions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.metaRow {
  margin-top: 10px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.collapse {
  margin-top: 10px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.output {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  min-height: 360px;
  background: color-mix(in oklab, var(--panel) 92%, var(--bg));
  overflow: auto;
}

.pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.65;
}

.mb {
  margin-bottom: 10px;
}

.foot {
  margin-top: 10px;
}

/* ----------------------
   Responsive
---------------------- */

/* Pad: <= 1024 */
@media (max-width: 1024px) {
  .grid {
    grid-template-columns: 1fr;
  }
}

/* Mobile: <= 768 */
@media (max-width: 768px) {
  .app {
    --pad: 12px;
    --gap: 10px;
  }
  .title {
    font-size: 16px;
  }
  /* inputs full width */
  .w-provider,
  .w-key,
  .w-base,
  .w-model,
  .w-slider {
    width: 100%;
  }
  .typing {
    width: 100%;
  }
  .output {
    min-height: 300px;
  }
}

/* Element Plus 深色适配：让输入框背景更贴合变量（轻量覆盖） */
:deep(.el-input__wrapper),
:deep(.el-textarea__inner),
:deep(.el-select__wrapper) {
  background: color-mix(in oklab, var(--panel) 92%, var(--bg));
  border-color: var(--border);
}
</style>
