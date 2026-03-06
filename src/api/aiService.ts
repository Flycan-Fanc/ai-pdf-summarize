/**
 * AI 服务模块
 * 提供与 AI API 的通信功能，包括流式响应、打字机效果等
 */

/**
 * AI 提供商类型
 */
export type AiProvider = 'deepseek' | 'openai';

/**
 * AI 请求配置接口
 */
export interface AiRequestConfig {
  /** API 密钥 */
  apiKey: string;
  /** 基础 URL */
  baseUrl: string;
  /** 模型名称 */
  model: string;
  /** AI 提供商 */
  provider: AiProvider;
  /** 请求超时时间（毫秒） */
  timeout?: number;
}

/**
 * AI 消息接口
 */
export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * AI 请求参数接口
 */
export interface AiRequestParams {
  /** 消息数组 */
  messages: AiMessage[];
  /** 是否使用流式响应 */
  stream?: boolean;
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
}

/**
 * AI 响应处理器接口
 */
export interface AiResponseHandler {
  /** 处理流式响应的增量数据 */
  onDelta?: (delta: string) => void;
  /** 处理完整响应 */
  onComplete?: (content: string) => void;
  /** 处理错误 */
  onError?: (error: Error) => void;
  /** 处理中止 */
  onAbort?: () => void;
}

/**
 * AI 服务类
 */
export class AiService {
  private config: AiRequestConfig;
  private abortController: AbortController | null = null;

  constructor(config: AiRequestConfig) {
    this.config = config;
  }

  /**
   * 获取默认配置
   * @param provider - AI 提供商
   * @returns 默认配置
   */
  static getDefaultConfig(provider: AiProvider = 'deepseek'): Partial<AiRequestConfig> {
    if (provider === 'deepseek') {
      return {
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
      };
    } else {
      return {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
      };
    }
  }

  /**
   * 构建 AI 提示词
   * @param pdfText - PDF 文本
   * @returns 提示词字符串
   */
  static buildPrompt(pdfText: string): string {
    const maxChars = 60000;
    const clipped = pdfText.length > maxChars ? pdfText.slice(0, maxChars) : pdfText;

    return [
      '请阅读下面的 PDF 文本并总结，输出：',
      '1) 一句话摘要',
      '2) 关键要点（5-12条）',
      '3) 可执行建议（如果适用）',
      '',
      'PDF 文本如下：',
      clipped,
    ].join('\n');
  }

  /**
   * 发送 AI 请求
   * @param params - 请求参数
   * @param handlers - 响应处理器
   * @returns Promise，表示请求是否成功
   */
  async sendRequest(
    params: AiRequestParams,
    handlers: AiResponseHandler = {}
  ): Promise<boolean> {
    // 验证配置
    if (!this.config.apiKey.trim()) {
      handlers.onError?.(new Error('请先填写 API Key'));
      return false;
    }

    // 创建中止控制器
    this.abortController = new AbortController();
    const timeout = this.config.timeout || 30000;

    // 设置超时
    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
      handlers.onError?.(new Error('请求超时'));
    }, timeout);

    try {
      const url = this.joinUrl(this.config.baseUrl, '/chat/completions');
      
      const requestBody = {
        model: this.config.model,
        stream: params.stream !== false,
        temperature: params.temperature || 0.2,
        max_tokens: params.maxTokens,
        messages: params.messages,
      };

      const response = await fetch(url, {
        method: 'POST',
        signal: this.abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey.trim()}`,
        },
        body: JSON.stringify(requestBody),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await this.safeReadText(response);
        throw new Error(`HTTP ${response.status} ${response.statusText}\n${errorText}`);
      }

      if (params.stream !== false) {
        if (!response.body) {
          throw new Error('浏览器不支持 ReadableStream');
        }
        await this.readSSE(response.body, handlers.onDelta);
      } else {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        handlers.onComplete?.(content);
      }

      return true;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        handlers.onAbort?.();
      } else {
        handlers.onError?.(error instanceof Error ? error : new Error('请求失败'));
      }
      return false;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 中止当前请求
   */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * 读取 SSE（Server-Sent Events）流
   * @param body - 响应体
   * @param onDelta - 处理增量数据的回调函数
   */
  private async readSSE(
    body: ReadableStream<Uint8Array>,
    onDelta?: (text: string) => void
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 按空行分割 SSE 事件
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          const lines = event.split('\n');
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine.startsWith('data:')) continue;

            const data = trimmedLine.replace(/^data:\s*/, '');
            if (data === '[DONE]') return;

            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && onDelta) {
                onDelta(delta);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 安全读取响应文本
   * @param response - 响应对象
   * @returns 响应文本
   */
  private async safeReadText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }

  /**
   * 拼接 URL
   * @param base - 基础 URL
   * @param path - 路径
   * @returns 完整的 URL
   */
  private joinUrl(base: string, path: string): string {
    return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
  }
}

/**
 * 打字机效果管理器
 */
export class TypewriterManager {
  private output: string = '';
  private pending: string = '';
  private timer: number | null = null;
  private speed: number = 25; // 字/秒

  /**
   * 设置打字速度
   * @param speed - 打字速度（字/秒）
   */
  setSpeed(speed: number): void {
    this.speed = Math.max(5, Math.min(60, speed)); // 限制在 5-60 字/秒
  }

  /**
   * 获取当前输出
   * @returns 当前输出文本
   */
  getOutput(): string {
    return this.output;
  }

  /**
   * 添加待显示文本
   * @param text - 要添加的文本
   */
  addPending(text: string): void {
    this.pending += text;
  }

  /**
   * 开始打字机效果
   */
  start(): void {
    this.stop();
    
    const interval = Math.max(10, Math.floor(1000 / this.speed));
    this.timer = window.setInterval(() => {
      if (!this.pending) return;
      
      // 每次显示 1-2 个字符，根据剩余文本长度决定
      const chunkSize = this.pending.length > 1 ? 2 : 1;
      this.output += this.pending.slice(0, chunkSize);
      this.pending = this.pending.slice(chunkSize);
    }, interval);
  }

  /**
   * 停止打字机效果
   */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 立即完成所有待显示文本
   */
  finishImmediately(): void {
    if (this.pending) {
      this.output += this.pending;
      this.pending = '';
    }
    this.stop();
  }

  /**
   * 重置打字机
   */
  reset(): void {
    this.stop();
    this.output = '';
    this.pending = '';
  }

  /**
   * 检查是否正在运行
   * @returns 是否正在运行
   */
  isRunning(): boolean {
    return this.timer !== null;
  }
}

/**
 * 创建 AI 服务实例的工厂函数
 * @param config - AI 配置
 * @returns AI 服务实例
 */
export function createAiService(config: AiRequestConfig): AiService {
  return new AiService(config);
}

/**
 * 创建打字机效果管理器的工厂函数
 * @param speed - 初始打字速度
 * @returns 打字机效果管理器实例
 */
export function createTypewriterManager(speed: number = 25): TypewriterManager {
  const manager = new TypewriterManager();
  manager.setSpeed(speed);
  return manager;
}

/**
 * 构建默认的 AI 消息
 * @param pdfText - PDF 文本
 * @returns AI 消息数组
 */
export function buildDefaultMessages(pdfText: string): AiMessage[] {
  return [
    {
      role: 'system',
      content: '你是一个擅长总结 PDF 的助手。输出要结构化、精炼。',
    },
    {
      role: 'user',
      content: AiService.buildPrompt(pdfText),
    },
  ];
}