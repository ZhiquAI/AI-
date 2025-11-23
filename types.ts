

export enum Tab {
  Grading = 'grading',
  Analysis = 'analysis',
  Settings = 'settings'
}

export enum GradingMode {
  Trial = 'trial', // 试阅校准
  Batch = 'batch'  // 批量阅卷
}

export enum ModelProvider {
  OpenAI = 'openai',
  Google = 'google',
  Zhipu = 'zhipu'
}

export type ModelProviderType = 'openai' | 'google' | 'zhipu';

export interface AppConfig {
  provider: ModelProviderType;
  endpoint: string;
  modelName: string;
  apiKey: string;
}

export interface StudentResult {
  id: string;
  name: string;
  className?: string;
  studentNo?: string;
  score: number;
  maxScore: number;
  comment: string;
  breakdown: { 
    label: string; 
    score: number; 
    max: number; 
    comment?: string; 
    isNegative?: boolean;
    relevantArea?: number[]; // [ymin, xmin, ymax, xmax] (0-1)
  }[];
}

// 从页面抓取的数据上下文
export interface PageContext {
  platform: string;
  studentName: string;
  answerImageBase64: string; // 纯答题卡图片
  timestamp?: number;
}

export interface GradingStats {
  avgScore: number;
  passRate: number; // Percentage 0-100
  difficulty: number; // 0-1
  distribution: number[]; // Array of counts for score ranges
}