import { GoogleGenAI, Type } from "@google/genai";
import { StudentResult, AppConfig, ModelProviderType } from "../types";

// Default Configuration
const DEFAULT_CONFIG: AppConfig = {
  provider: 'google',
  endpoint: '', // Google SDK handles this internally usually
  modelName: 'gemini-2.5-flash',
  apiKey: ''
};

// Storage Keys
const STORAGE_KEY_CONFIG = 'app_model_config';

/**
 * Load configuration from localStorage or environment
 */
export const getAppConfig = (): AppConfig => {
  const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
  if (saved) {
    return JSON.parse(saved);
  }
  // Default fallback
  return {
    ...DEFAULT_CONFIG,
    // If env key is present, use it as default for Google
    apiKey: process.env.API_KEY || '' 
  };
};

/**
 * Save configuration
 */
export const saveAppConfig = (config: AppConfig) => {
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
};

/**
 * Helper to get Google Client (Legacy/Env support)
 */
const getGoogleClient = (apiKeyOverride?: string) => {
  const apiKey = apiKeyOverride || process.env.API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

// 检查 API Key 是否配置 (Support both Env and Custom Config)
export const checkApiKeyConfigured = (): boolean => {
  const config = getAppConfig();
  if (config.provider === 'google') {
      return !!(config.apiKey || process.env.API_KEY);
  }
  return !!config.apiKey;
};

// 策略类型定义
export type GradingStrategy = 'flash' | 'pro' | 'reasoning';

/**
 * Get Model Name based on strategy or config
 */
const getModelName = (strategy: GradingStrategy = 'flash', config: AppConfig) => {
  // If user explicitly set a model name in settings (and it's not the default placeholder), use it?
  // Or if provider is NOT google, use config.modelName
  if (config.provider !== 'google') {
      return config.modelName;
  }

  // Google Strategy Mapping
  switch (strategy) {
    case 'reasoning': 
    case 'pro':
      return 'gemini-3-pro-preview';
    case 'flash':
    default:
      return 'gemini-2.5-flash';
  }
};

/**
 * Test Connection
 */
export const testConnection = async (config: AppConfig): Promise<boolean> => {
    try {
        if (config.provider === 'google') {
            const ai = getGoogleClient(config.apiKey);
            if (!ai) return false;
            await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: 'ping',
            });
            return true;
        } else {
            // OpenAI / Zhipu Compatible
            const headers: any = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            };
            
            // OpenAI standard body
            const body = {
                model: config.modelName,
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 5
            };

            const response = await fetch(config.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            
            return response.ok;
        }
    } catch (e) {
        console.error("Connection Test Failed", e);
        return false;
    }
};

/**
 * OpenAI Compatible Call Helper
 */
const callOpenAICompatible = async (
    config: AppConfig, 
    systemPrompt: string, 
    userPrompt: string, 
    imageBase64: string,
    jsonMode: boolean = true
): Promise<string> => {
    const messages = [
        { role: 'system', content: systemPrompt },
        { 
            role: 'user', 
            content: [
                { type: "text", text: userPrompt },
                { 
                    type: "image_url", 
                    image_url: { 
                        url: `data:image/jpeg;base64,${imageBase64}` 
                    } 
                }
            ] 
        }
    ];

    const body: any = {
        model: config.modelName,
        messages: messages,
        temperature: 0.3
    };

    if (jsonMode) {
        body.response_format = { type: "json_object" };
    }

    const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`Provider Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
};


/**
 * 1. Generate Rubric
 */
export const generateRubricFromImages = async (
  questionImageBase64: string,
  answerImageBase64: string
): Promise<string> => {
  const config = getAppConfig();
  
  const prompt = `
    你是一位资深的教育专家。
    请根据【试题图片】和【标准答案/评分要点图片】，制定一份详细的评分细则（Marking Scheme）。
    
    要求：
    1. 识别出题目的总分。
    2. 列出具体的得分点（例如：公式正确得2分，结果正确得1分）。
    3. 格式要求：请直接输出清晰的 Markdown 文本，不要包含 Markdown 代码块标记。
    4. 语言：中文。
  `;

  try {
    if (config.provider === 'google') {
        const ai = getGoogleClient(config.apiKey);
        if (!ai) throw new Error("未配置 Google API Key");

        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'image/jpeg', data: questionImageBase64 } },
              { inlineData: { mimeType: 'image/jpeg', data: answerImageBase64 } }
            ]
          },
          config: {
            thinkingConfig: { thinkingBudget: 4096 }
          }
        });
        return response.text || "生成评分标准失败。";

    } else {
        // Multi-image support for OpenAI is tricky in one message with some proxies, 
        // but standard gpt-4o supports multiple image_url blocks.
        // Simplified for this implementation:
        const messages = [
            { 
                role: 'user', 
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${questionImageBase64}` } },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${answerImageBase64}` } }
                ] 
            }
        ];
        
        const body: any = {
            model: config.modelName,
            messages: messages
        };

        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "生成失败";
    }
  } catch (error) {
    console.error("Rubric Gen Error:", error);
    throw error;
  }
};

/**
 * 2. Assess Student Answer
 */
export const assessStudentAnswer = async (
  studentImageBase64: string,
  rubricText: string,
  strategy: GradingStrategy = 'flash'
): Promise<StudentResult> => {
  const config = getAppConfig();
  
  // Prompt Construction
  const responseSchemaJSON = {
      score: 0,
      maxScore: 10,
      comment: "评语",
      breakdown: [{ label: "得分点", score: 0, max: 2, comment: "", isNegative: false }]
  };

  const systemPrompt = `你是一位阅卷老师。请严格按照评分标准进行评分。请以 JSON 格式输出结果。`;
  const userPrompt = `
    【评分标准】：
    ${rubricText}
    
    【学生答卷】：
    （见附图）
    
    请根据上述评分标准，对学生的答卷进行评分。
    返回的 JSON 结构示例：${JSON.stringify(responseSchemaJSON)}
  `;

  try {
    // Branch based on provider
    if (config.provider === 'google') {
        const ai = getGoogleClient(config.apiKey);
        if (!ai) throw new Error("未找到 API 密钥");

        const modelName = getModelName(strategy, config);
        
        // Define Schema for Gemini
        const responseSchema = {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER, description: "学生总得分" },
              maxScore: { type: Type.NUMBER, description: "本题满分" },
              comment: { type: Type.STRING, description: "简短的总体评语" },
              breakdown: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    max: { type: Type.NUMBER },
                    comment: { type: Type.STRING },
                    isNegative: { type: Type.BOOLEAN },
                    relevantArea: { type: Type.ARRAY, items: { type: Type.NUMBER } }
                  },
                  required: ["label", "score", "max", "isNegative"]
                }
              }
            },
            required: ["score", "maxScore", "comment", "breakdown"]
        };

        const geminiConfig: any = {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
        };

        if (strategy === 'reasoning') {
            geminiConfig.thinkingConfig = { thinkingBudget: 16384 };
        } else if (strategy === 'pro') {
            // gemini-3-pro-preview works only in thinking mode, so 0 is invalid.
            // We set a moderate budget for "Pro" mode (balanced speed/quality).
            geminiConfig.thinkingConfig = { thinkingBudget: 2048 }; 
        }

        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { text: userPrompt },
                    { inlineData: { mimeType: 'image/jpeg', data: studentImageBase64 } }
                ]
            },
            config: geminiConfig
        });

        const resultText = response.text || "{}";
        const parsed = JSON.parse(resultText);
        
        return {
            id: Date.now().toString(),
            name: "自动识别",
            className: "自动识别",
            ...parsed
        };

    } else {
        // OpenAI / Zhipu Logic
        const resultText = await callOpenAICompatible(config, systemPrompt, userPrompt, studentImageBase64, true);
        const parsed = JSON.parse(resultText);
        
        return {
            id: Date.now().toString(),
            name: "自动识别",
            className: "自动识别",
            ...parsed
        };
    }

  } catch (error) {
    console.error("Grading Error:", error);
    throw error;
  }
};

/**
 * 3. Stats Insight
 */
export const generateGradingInsight = async (avgScore: number, passRate: number): Promise<string> => {
    const config = getAppConfig();
    const prompt = `基于历史数据：平均分${avgScore.toFixed(1)}，及格率${passRate.toFixed(1)}%。写一段简短的中文教学分析总结（100字内）。`;

    try {
        if (config.provider === 'google') {
            const ai = getGoogleClient(config.apiKey);
            if (!ai) return "AI 未连接";
            const res = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            return res.text || "";
        } else {
            // Simplified text call
            const headers: any = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` };
            const body = { model: config.modelName, messages: [{ role: 'user', content: prompt }] };
            const res = await fetch(config.endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
            const data = await res.json();
            return data.choices?.[0]?.message?.content || "";
        }
    } catch (error) {
        return "无法生成分析。";
    }
};