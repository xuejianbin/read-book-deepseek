import axios from 'axios';

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

interface DeepSeekApiResponse {
  choices: Array<{
    text: string;
  }>;
}

interface ApiError {
  status?: number;
  data?: unknown;
  message: string;
}

export class DeepSeekClient {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.deepseek.com/beta';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createCompletion(options: CompletionOptions): Promise<CompletionResponse> {
    try {
      // Convert messages format to prompt format
      const prompt = options.messages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');
      
      const requestBody = {
        model: options.model,
        prompt: prompt,
        max_tokens: 1000,
        temperature: 0.7
      };

      console.log('Sending request to DeepSeek API:', requestBody);
      const response = await axios.post(
        `${this.baseUrl}/completions`, 
        requestBody, 
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const data = response.data as DeepSeekApiResponse;
      console.log('Received response:', data);
      
      return {
        choices: [{
          message: {
            content: data.choices[0].text
          }
        }]
      };
    } catch (error: unknown) {
      const apiError: ApiError = {
        message: 'Unknown error occurred'
      };

      if (typeof error === 'object' && error !== null) {
        const err = error as Record<string, unknown>;
        const response = err.response as Record<string, unknown> | undefined;
        
        if (err.isAxiosError) {
          apiError.status = response?.status as number | undefined;
          apiError.data = response?.data;
          apiError.message = err.message as string || 'Axios error occurred';
        } else if (error instanceof Error) {
          apiError.message = error.message;
        }
      }

      console.error('DeepSeek API Error:', apiError);
      throw apiError;
    }
  }
}
