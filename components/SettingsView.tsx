import React, { useState, useEffect } from 'react';
import { BookOpen, Cpu, Wand2, CheckCircle2, Circle, FileEdit, AlertTriangle, ExternalLink, Zap, Brain, Lightbulb, Settings, Save, Wifi, Check, X } from 'lucide-react';
import { GradingStrategy, checkApiKeyConfigured, getAppConfig, saveAppConfig, testConnection } from '../services/geminiService';
import { AppConfig, ModelProviderType } from '../types';

interface SettingsViewProps {
  onOpenRubric: () => void;
  isRubricConfigured: boolean;
  currentStrategy: GradingStrategy;
  onStrategyChange: (s: GradingStrategy) => void;
}

// Default Constants
const PROVIDER_DEFAULTS = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o'
  },
  google: {
    endpoint: '', // Handled by SDK
    model: 'gemini-2.5-flash'
  },
  zhipu: {
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-plus'
  }
};

const SettingsView: React.FC<SettingsViewProps> = ({ 
  onOpenRubric, 
  isRubricConfigured, 
  currentStrategy, 
  onStrategyChange 
}) => {
  // Config State
  const [config, setConfig] = useState<AppConfig>(getAppConfig());
  const [isSaving, setIsSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'fail'>('idle');

  // Load config on mount
  useEffect(() => {
    setConfig(getAppConfig());
  }, []);

  // Handlers
  const handleProviderChange = (p: ModelProviderType) => {
    setConfig(prev => ({
      ...prev,
      provider: p,
      endpoint: PROVIDER_DEFAULTS[p].endpoint,
      modelName: PROVIDER_DEFAULTS[p].model
    }));
    setTestStatus('idle');
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    const ok = await testConnection(config);
    setTestStatus(ok ? 'success' : 'fail');
    if (ok) {
        setTimeout(() => setTestStatus('idle'), 3000);
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    saveAppConfig(config);
    // Simulate slight delay for feedback
    setTimeout(() => {
        setIsSaving(false);
        // Reload to apply? Or just let context handle it. 
        // For simple app structure, saving to LS is enough as service reads from LS.
    }, 500);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-50 animate-in fade-in duration-300">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        
        {/* === 1. Model Settings (Config) === */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800 flex items-center">
                    <Settings className="w-4 h-4 mr-2 text-blue-600" />
                    模型设置 (Model Settings)
                </h3>
            </div>
            
            <div className="p-4 space-y-4">
                {/* Provider Tabs */}
                <div>
                    <label className="text-xs text-gray-500 font-medium mb-2 block">选择服务商</label>
                    <div className="flex gap-2">
                        {['openai', 'google', 'zhipu'].map((p) => (
                            <button
                                key={p}
                                onClick={() => handleProviderChange(p as ModelProviderType)}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all capitalize ${
                                    config.provider === p 
                                    ? 'bg-blue-50 border-blue-500 text-blue-700' 
                                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {p === 'zhipu' ? '智谱AI' : (p === 'google' ? 'Google' : 'OpenAI')}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Endpoint Input */}
                {config.provider !== 'google' && (
                    <div>
                        <label className="text-xs text-gray-500 font-medium mb-1 block">API 端点 (Endpoint)</label>
                        <input 
                            type="text" 
                            value={config.endpoint}
                            onChange={(e) => setConfig(c => ({...c, endpoint: e.target.value}))}
                            className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono bg-gray-50"
                            placeholder="https://..."
                        />
                    </div>
                )}

                {/* Model Name Input */}
                <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">模型名称 (Model)</label>
                    <input 
                        type="text" 
                        value={config.modelName}
                        onChange={(e) => setConfig(c => ({...c, modelName: e.target.value}))}
                        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                        placeholder="e.g. gpt-4o"
                    />
                </div>

                {/* API Key Input */}
                <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">API 密钥 (Key)</label>
                    <div className="relative">
                        <input 
                            type="password" 
                            value={config.apiKey}
                            onChange={(e) => setConfig(c => ({...c, apiKey: e.target.value}))}
                            className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                            placeholder={config.provider === 'google' ? "留空则使用环境变量默认 Key" : "sk-..."}
                        />
                    </div>
                    {config.provider === 'google' && !config.apiKey && (
                        <p className="text-[10px] text-gray-400 mt-1 flex items-center">
                           <CheckCircle2 className="w-3 h-3 mr-1 text-green-500" /> 使用环境变量预设密钥
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                    <button 
                        onClick={handleTestConnection}
                        disabled={testStatus === 'testing'}
                        className={`flex-1 py-2 rounded-lg border text-xs font-bold transition-all flex items-center justify-center ${
                            testStatus === 'success' 
                            ? 'bg-green-50 border-green-200 text-green-700'
                            : (testStatus === 'fail' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
                        }`}
                    >
                        {testStatus === 'testing' && <Wifi className="w-3 h-3 mr-1.5 animate-pulse" />}
                        {testStatus === 'success' && <Check className="w-3 h-3 mr-1.5" />}
                        {testStatus === 'fail' && <X className="w-3 h-3 mr-1.5" />}
                        {testStatus === 'idle' ? '测试连接' : (testStatus === 'success' ? '连接成功' : (testStatus === 'fail' ? '连接失败' : '测试中...'))}
                    </button>
                    <button 
                        onClick={handleSave}
                        className="flex-1 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-black transition-colors flex items-center justify-center"
                    >
                        <Save className="w-3 h-3 mr-1.5" />
                        {isSaving ? '保存中...' : '保存配置'}
                    </button>
                </div>
            </div>
        </div>

        {/* === 2. Grading Strategy (Only for Google, or as general preference) === */}
        {config.provider === 'google' && (
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
              <div className="flex justify-between items-center">
                 <h3 className="text-sm font-bold text-gray-800 flex items-center">
                    <Cpu className="w-4 h-4 mr-2 text-purple-600" />
                    阅卷策略 (Grading Strategy)
                 </h3>
                 <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">仅 Google 模式生效</span>
              </div>

              <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 mb-2">
                  <div className="flex items-start">
                      <div className="mr-2 mt-0.5 text-blue-500"><Lightbulb className="w-4 h-4" /></div>
                      <div className="text-xs text-blue-800">
                          <p className="font-bold mb-0.5">策略说明</p>
                          此策略在"样题试阅"完成后生效。系统将根据您的校准结果自动推荐最佳策略。
                      </div>
                  </div>
              </div>

              <div className="space-y-2">
                 <StrategyOption 
                   title="GPT-4o 优先 (模拟)"
                   modelName="平衡模式"
                   desc="速度与准确度最佳均衡，自动推荐。"
                   selected={currentStrategy === 'pro'}
                   onClick={() => onStrategyChange('pro')}
                   icon={Brain}
                   badgeColor="bg-blue-100 text-blue-600"
                />

                <StrategyOption 
                   title="Gemini 优先"
                   modelName="Flash Mode"
                   desc="成本效益最高，适合简单题目。"
                   selected={currentStrategy === 'flash'}
                   onClick={() => onStrategyChange('flash')}
                   icon={Zap}
                />

                 <StrategyOption 
                   title="双模型交叉验证"
                   modelName="Reasoning Mode"
                   desc="准确度最高，但速度较慢且成本较高。"
                   selected={currentStrategy === 'reasoning'}
                   onClick={() => onStrategyChange('reasoning')}
                   icon={Cpu}
                />
              </div>
            </div>
        )}

        {/* === 3. Rubric Config === */}
        <div className={`p-4 rounded-xl border shadow-sm transition-all ${
          isRubricConfigured 
            ? 'bg-green-50/50 border-green-200' 
            : 'bg-white border-gray-200'
        }`}>
          <div className="flex justify-between items-start mb-2">
            <h3 className={`text-sm font-bold flex items-center ${isRubricConfigured ? 'text-green-800' : 'text-gray-800'}`}>
              <BookOpen className={`w-4 h-4 mr-2 ${isRubricConfigured ? 'text-green-600' : 'text-purple-600'}`} />
              评分标准
            </h3>
            {isRubricConfigured && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] rounded-full font-medium border border-green-200">
                已配置
              </span>
            )}
          </div>
          
          <p className="text-xs text-gray-500 mb-4">
            {isRubricConfigured 
              ? "系统已加载评分细则。如需调整，请点击下方按钮。"
              : "AI 需要先学习这道题的评分细则才能开始工作。"
            }
          </p>
          
          <button 
            onClick={onOpenRubric}
            className={`w-full py-2 border rounded-lg text-sm font-medium transition-colors flex items-center justify-center ${
              isRubricConfigured
                ? 'border-green-200 text-green-700 bg-white hover:bg-green-50'
                : 'border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100'
            }`}
          >
            {isRubricConfigured ? (
               <><FileEdit className="w-4 h-4 mr-2" /> 查看 / 修改现有标准</>
            ) : (
               <><Wand2 className="w-4 h-4 mr-2" /> 配置 / 生成评分细则</>
            )}
          </button>
        </div>

      </div>

      {/* 底部操作栏 */}
      <div className="p-3 bg-white border-t border-gray-200 shrink-0 flex justify-end space-x-2">
        <button 
            onClick={() => {
                localStorage.clear();
                window.location.reload();
            }}
            className="px-3 py-2 rounded-lg border border-red-200 text-xs text-red-600 font-medium hover:bg-red-50 transition-colors"
        >
            清除缓存数据
        </button>
      </div>
    </div>
  );
};

const StrategyOption = ({ title, modelName, desc, selected, onClick, badge, badgeColor, icon: Icon }: any) => (
  <div 
    onClick={onClick}
    className={`flex items-start p-3 rounded-lg border cursor-pointer transition-all ${
      selected 
        ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500' 
        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
    }`}
  >
    <div className={`mr-3 mt-0.5 shrink-0 ${selected ? 'text-blue-600' : 'text-gray-400'}`}>
       {selected ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
    </div>
    <div className="flex-1 min-w-0">
       <div className="flex items-center justify-between">
          <div className="flex items-center">
             {Icon && <Icon className={`w-3.5 h-3.5 mr-1.5 ${selected ? 'text-blue-600' : 'text-gray-500'}`} />}
             <span className={`text-sm font-bold ${selected ? 'text-blue-900' : 'text-gray-700'}`}>{title}</span>
          </div>
          {badge && <span className={`ml-2 px-1.5 py-0.5 text-[10px] rounded font-medium ${badgeColor || 'bg-gray-100 text-gray-600'}`}>{badge}</span>}
       </div>
       <p className="text-[11px] text-gray-500 leading-tight mt-1">{desc}</p>
    </div>
  </div>
);

export default SettingsView;