/**
 * PDF 解析工具模块
 * 提供 PDF 文件解析、文本提取和相关工具函数
 */

import * as pdfjsLib from "pdfjs-dist";

// 初始化 PDF.js worker
const workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * PDF 解析结果接口
 */
export interface PdfParseResult {
  /** 解析的文本内容 */
  text: string;
  /** 解析耗时（毫秒） */
  parseTimeMs: number;
  /** 页面数量 */
  pageCount: number;
  /** 文件名 */
  fileName: string;
}

/**
 * PDF 解析选项接口
 */
export interface PdfParseOptions {
  /** 最大字符数限制（0 表示无限制） */
  maxChars?: number;
  /** 是否包含页面分隔符 */
  includePageSeparators?: boolean;
}

/**
 * 检查文件是否为 PDF
 * @param file - 文件对象
 * @returns 是否为 PDF 文件
 */
export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * 解析 PDF 文件并提取文本
 * @param file - PDF 文件
 * @param options - 解析选项
 * @returns 解析结果
 */
export async function parsePdfFile(file: File, options: PdfParseOptions = {}): Promise<PdfParseResult> {
  const startTime = performance.now();

  try {
    // 读取文件为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // 加载 PDF 文档
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const pageCount = pdf.numPages;
    const texts: string[] = [];

    // 逐页提取文本
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // 提取页面文本
      const pageText = (textContent.items as any[]).map((item) => (typeof item.str === "string" ? item.str : "")).join(" ");

      texts.push(pageText);
    }

    // 合并文本
    const separator = options.includePageSeparators !== false ? "\n\n" : " ";
    let fullText = texts.join(separator);

    // 应用字符数限制
    if (options.maxChars && options.maxChars > 0 && fullText.length > options.maxChars) {
      fullText = fullText.slice(0, options.maxChars);
    }

    const parseTimeMs = Math.round(performance.now() - startTime);

    return {
      text: fullText,
      parseTimeMs,
      pageCount,
      fileName: file.name,
    };
  } catch (error) {
    console.error("PDF 解析失败:", error);
    throw new Error(`PDF 解析失败: ${error instanceof Error ? error.message : "未知错误"}`);
  }
}

/**
 * 处理文件选择事件
 * @param event - 文件选择事件
 * @returns 选中的文件或 null
 */
export function handleFileSelect(event: Event): File | null {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] || null;

  // 重置 input 值，允许重复选择同一文件
  input.value = "";

  return file;
}

/**
 * 处理文件拖放事件
 * @param event - 拖放事件
 * @returns 拖放的文件或 null
 */
export function handleFileDrop(event: DragEvent): File | null {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0] || null;
  return file;
}

/**
 * 处理拖放区域的 dragover 事件
 * @param event - dragover 事件
 */
export function handleDragOver(event: DragEvent): void {
  event.preventDefault();
}

/**
 * 构建 PDF 解析提示信息
 * @param result - PDF 解析结果
 * @returns 提示信息字符串
 */
export function buildParseInfo(result: PdfParseResult): string {
  const { fileName, pageCount, parseTimeMs, text } = result;
  const charCount = text.length;

  let info = `文件: ${fileName}\n`;
  info += `页面: ${pageCount}\n`;
  info += `字符数: ${charCount}\n`;

  if (parseTimeMs > 0) {
    info += `解析耗时: ${parseTimeMs}ms`;
  }

  return info;
}

/**
 * 复制文本到剪贴板
 * @param text - 要复制的文本
 * @returns Promise，表示复制操作是否成功
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const safeText = sanitizeText(text);
    await navigator.clipboard.writeText(safeText);
    return true;
  } catch (error) {
    console.error("复制到剪贴板失败:", error);

    // 降级方案：使用 document.execCommand
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textArea);
      return success;
    } catch (fallbackError) {
      console.error("降级复制方案也失败:", fallbackError);
      return false;
    }
  }
}

/**
 * 文本字符清洗，防止特殊字符对复制结果造成干扰
 * @param text
 * @returns
 */
function sanitizeText(text: string): string {
  return (
    text
      // 去掉 NUL 字符
      .replace(/\u0000/g, "")
      // 去掉大部分控制字符，但保留 \n \r \t
      .replace(/[\u0001-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, "")
      // 去掉零宽字符和 BOM
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      // 可选：统一 Unicode 行分隔符/段分隔符
      .replace(/\u2028/g, "\n")
      .replace(/\u2029/g, "\n\n")
  );
}

/**
 * 格式化文件大小
 * @param bytes - 字节数
 * @returns 格式化后的文件大小字符串
 */
/**
 * 格式化文件大小，将字节数转换为更易读的格式（如 KB、MB、GB）
 * @param bytes 文件大小的字节数
 * @returns 格式化后的文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  // 如果字节数为0，直接返回"0 B"
  if (bytes === 0) return "0 B";

  // 定义单位转换基数（1024字节=1KB）
  const k = 1024;
  // 定义文件大小单位数组
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * 创建文件输入元素
 * @param accept - 接受的文件类型
 * @param multiple - 是否允许多选
 * @returns 文件输入元素
 */
export function createFileInput(accept: string = "application/pdf,.pdf", multiple: boolean = false): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.multiple = multiple;
  input.style.display = "none";

  return input;
}

/**
 * 触发文件选择对话框
 * @param input - 文件输入元素
 */
export function triggerFileSelect(input: HTMLInputElement): void {
  input.click();
}

/**
 * PDF 解析器类（高级用法）
 */
export class PdfParser {
  /**
   * 批量解析多个 PDF 文件
   * @param files - PDF 文件数组
   * @param options - 解析选项
   * @returns 解析结果数组
   */
  async parseMultipleFiles(files: File[], options: PdfParseOptions = {}): Promise<PdfParseResult[]> {
    const results: PdfParseResult[] = [];

    for (const file of files) {
      if (isPdfFile(file)) {
        try {
          const result = await parsePdfFile(file, options);
          results.push(result);
        } catch (error) {
          console.error(`文件 ${file.name} 解析失败:`, error);
          // 可以在这里添加错误处理逻辑
        }
      }
    }
    return results;
  }

  /**
   * 获取 PDF 元数据
   * @param file - PDF 文件
   * @returns PDF 元数据
   */
  async getPdfMetadata(file: File): Promise<any> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;

      const metadata = await pdf.getMetadata();
      return metadata;
    } catch (error) {
      console.error("获取 PDF 元数据失败:", error);
      throw error;
    }
  }
}
