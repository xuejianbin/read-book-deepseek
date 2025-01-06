declare module 'deepseek-api-wrapper' {
  interface CompletionOptions {
    model: string;
    messages: Array<{
      role: 'system' | 'user';
      content: string;
    }>;
  }

  interface CompletionResponse {
    choices: Array<{
      message: {
        content: string | null;
      };
    }>;
  }

  class DeepSeek {
    constructor(apiKey: string);
    createCompletion(options: CompletionOptions): Promise<CompletionResponse>;
  }

  export = DeepSeek;
}
