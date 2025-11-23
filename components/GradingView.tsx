import React, { useState, useEffect, useRef } from 'react';
import { 
  Check, Microscope, ScanLine, AlertCircle, RefreshCcw, 
  Zap, Play, Pencil, Bot,
  Wifi, WifiOff, BookCheck, BookX, Link2, Link2Off, Layers, FlaskConical, Sparkles,
  Eye, EyeOff, Lightbulb
} from 'lucide-react';
import { StudentResult, PageContext, GradingMode } from '../types';
import { assessStudentAnswer, GradingStrategy, checkApiKeyConfigured } from '../services/geminiService';

// Declare chrome for TS
declare const chrome: any;

// 模拟数据 (仅用于无插件环境的开发演示)
const MOCK_DATA_URL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; 

// 通用评分标准兜底
const DEFAULT_GENERIC_RUBRIC = "通用评分模式：重点检查答案正确性（权重60%）与过程完整性（权重40%）。若题目未标注满分，默认按10分制评判。请对解题思路进行简要点评。";

interface GradingViewProps {
  onOpenRubric: () => void;
  isRubricConfigured: boolean;
  currentRubric: string;
  gradingStrategy: GradingStrategy;
}

const GradingView: React.FC<GradingViewProps> = ({ 
  onOpenRubric, 
  isRubricConfigured,
  currentRubric,
  gradingStrategy
}) => {
  // --- State ---
  const [mode, setMode] = useState<GradingMode>(GradingMode.Trial); // 当前模式
  const [status, setStatus] = useState<'scanning' | 'grading' | 'review' | 'error' | 'sleeping'>('scanning');
  
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [result, setResult] = useState<StudentResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Highlighting State
  const [showEvidence, setShowEvidence] = useState(false);
  const [activeBreakdownIndex, setActiveBreakdownIndex] = useState<number | null>(null);

  // 系统健康检查
  const [health, setHealth] = useState({
      api: false,
      rubric: false,
      pageLink: false
  });

  // 批量控制
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  const [scanWaitCount, setScanWaitCount] = useState(0); // 追踪等待下一份的尝试次数
  
  // Refs for loop control
  const isBatchRunningRef = useRef(false); 
  const lastGradedNameRef = useRef<string | null>(null);
  const scanIntervalRef = useRef<any>(null);

  // --- Effects ---

  // 初始加载或模式切换时
  useEffect(() => {
    // 1. 检查 API 配置
    const isApiOk = checkApiKeyConfigured();
    
    // 2. 立即执行一次环境检查 (Page Link Check)
    checkSystemHealth(isApiOk);

    // 3. 启动轮询检查 (每3秒检查一次页面状态，确保实时性)
    const interval = setInterval(() => checkSystemHealth(isApiOk), 3000);
    return () => clearInterval(interval);
  }, [isRubricConfigured]);

  // 模式切换处理
  useEffect(() => {
    stopBatch();
    // 切换模式时不强制立即 Scan，而是依靠用户的操作或批量启动
    // 但我们可以把状态置为 sleeping 等待
    if (mode === GradingMode.Trial) {
        setStatus('scanning');
        scanPage(); // 试阅模式下，切回来自动扫一次方便
    } else {
        setStatus('sleeping');
    }
  }, [mode]);

  // --- System Health Logic ---
  
  const checkSystemHealth = (apiStatus: boolean) => {
      const rubricStatus = isRubricConfigured;

      // Check Page Link via Content Script
      if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
             if (tabs[0]?.id) {
                 chrome.tabs.sendMessage(tabs[0].id, { type: 'CHECK_READY' }, (res: any) => {
                     // 如果 lastError 存在，说明没连接上 content script
                     const isPageOk = !chrome.runtime.lastError && res?.hasImage;
                     setHealth({
                         api: apiStatus,
                         rubric: rubricStatus,
                         pageLink: !!isPageOk
                     });
                 });
             }
          });
      } else {
          // Dev Mode
          setHealth({
              api: true,
              rubric: rubricStatus,
              pageLink: true
          });
      }
  };

  // --- Core Logic ---

  // 1. 扫描/定位页面
  const scanPage = async () => {
    if (!isBatchRunningRef.current) {
        setStatus('scanning');
        setScanWaitCount(0); // 手动扫描重置计数
    }
    setErrorMsg(null);
    setPageContext(null);
    setShowEvidence(false); // Reset evidence view
    setActiveBreakdownIndex(null);

    // Dev Mock
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      console.log("Dev Mode: Simulating auto-scan...");
      setTimeout(() => {
        const mockName = `学生_${Math.floor(Math.random() * 100)}`;
        if (mockName === lastGradedNameRef.current && isBatchRunningRef.current) {
            setScanWaitCount(prev => prev + 1);
            setTimeout(scanPage, 1000);
            return;
        }
        setScanWaitCount(0);
        handlePageData({
          platform: 'DEV_MOCK',
          studentName: mockName,
          answerImageBase64: MOCK_DATA_URL.split(',')[1]
        });
      }, 1000);
      return;
    }

    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
         const activeTab = tabs[0];
         if (!activeTab?.id) {
            handleScanError("无法获取当前标签页信息");
            return;
         }

         chrome.tabs.sendMessage(activeTab.id, { type: 'REQUEST_PAGE_DATA' }, (response: any) => {
            if (chrome.runtime.lastError) {
               handleScanError("连接失败：请刷新页面或确认已打开阅卷页");
               return;
            }

            if (response && response.success && response.data) {
               // 检查是否是刚刚评过的学生
               if (isBatchRunningRef.current && response.data.studentName === lastGradedNameRef.current) {
                   console.log("Waiting for next student...");
                   setScanWaitCount(prev => prev + 1);
                   setTimeout(scanPage, 1500);
               } else {
                   setScanWaitCount(0); // 找到新学生，重置
                   handlePageData(response.data);
               }
            } else {
               if (isBatchRunningRef.current) {
                   setScanWaitCount(prev => prev + 1);
                   setTimeout(scanPage, 2000);
               } else {
                   handleScanError(response?.error || "未在页面上定位到答题卡图片");
               }
            }
         });
      });
    } catch (e) {
      handleScanError("插件通信发生未知错误");
    }
  };

  const handleScanError = (msg: string) => {
    if (isBatchRunningRef.current) {
        console.warn("Batch scan retry:", msg);
        setTimeout(scanPage, 2000);
        return;
    }
    setErrorMsg(msg);
    setStatus('error');
  };

  const handlePageData = (data: PageContext) => {
    setPageContext(data);
    
    // 决定使用的评分标准
    let targetRubric = currentRubric;

    if (!isRubricConfigured || !targetRubric) {
      // 如果是批量模式，为了安全起见，通常要求必须配置
      if (mode === GradingMode.Batch && isBatchRunningRef.current) {
          setStatus('review');
          setResult(null);
          stopBatch();
          alert("批量阅卷已暂停：请先配置评分标准以确保准确性。");
          return;
      }
      // 试阅模式下，允许使用兜底通用标准
      targetRubric = DEFAULT_GENERIC_RUBRIC;
    }

    startGrading(data, targetRubric);
  };

  // 2. AI 评分
  const startGrading = async (ctx: PageContext, rubric: string) => {
    setStatus('grading');
    try {
      const res = await assessStudentAnswer(ctx.answerImageBase64, rubric, gradingStrategy);
      res.name = ctx.studentName || "未知学生";
      setResult(res);
      setStatus('review');
      // 默认展开证据视图以便查看高亮
      setShowEvidence(true);

      if (mode === GradingMode.Batch && isBatchRunningRef.current) {
          setTimeout(() => {
             handleSubmitScore(res.score, res.name);
          }, 800); 
      }
    } catch (e) {
      console.error(e);
      if (isBatchRunningRef.current) {
          stopBatch();
          setErrorMsg("AI 服务响应异常，批量阅卷已安全暂停。");
          setStatus('error');
      } else {
          setErrorMsg("AI 服务响应异常，请检查网络或 API Key");
          setStatus('error');
      }
    }
  };

  // 3. 提交分数
  const handleSubmitScore = (score: number, studentName: string) => {
    if (pageContext?.platform && typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
             if (tabs[0]?.id) {
                 chrome.tabs.sendMessage(tabs[0].id, { 
                     type: 'FILL_SCORE', 
                     score: score,
                     platform: pageContext.platform
                 }, (res: any) => {
                    if (mode === GradingMode.Trial) {
                        if (res?.success) {
                            alert(`已自动填入分数: ${score}`);
                        } else {
                            console.warn("填分失败", res?.error);
                        }
                    }
                 });
             }
         });
    }

    recordHistory(score, studentName);

    if (mode === GradingMode.Batch && isBatchRunningRef.current) {
        setBatchCount(prev => prev + 1);
        lastGradedNameRef.current = studentName;
        setTimeout(scanPage, 2000);
    }
  };

  // 4. 数据持久化
  const recordHistory = (score: number, studentName: string) => {
      if (!result) return;
      
      const historyItem: StudentResult = {
          ...result,
          score,
          name: studentName,
          id: Date.now().toString()
      };

      try {
          const raw = localStorage.getItem('grading_history');
          const list: StudentResult[] = raw ? JSON.parse(raw) : [];
          list.unshift(historyItem);
          if (list.length > 500) list.pop();
          localStorage.setItem('grading_history', JSON.stringify(list));
      } catch (e) {
          console.error("Storage error", e);
      }
  };

  // --- Batch Control ---
  const startBatch = () => {
      // 检查环境
      if (!health.api || !health.rubric || !health.pageLink) {
          alert("请确保 API 连接、评分标准和答题卡定位均已就绪 (请看上方状态灯)。");
          return;
      }
      setIsBatchRunning(true);
      isBatchRunningRef.current = true;
      setBatchCount(0);
      setScanWaitCount(0); // 重置等待计数
      lastGradedNameRef.current = null;
      scanPage();
  };

  const stopBatch = () => {
      setIsBatchRunning(false);
      isBatchRunningRef.current = false;
      setStatus('sleeping');
  };

  // --- UI Helpers ---
  const renderStatus = () => {
    switch (status) {
      case 'scanning':
        return <div className="text-blue-600 flex flex-col items-center"><ScanLine className="w-8 h-8 animate-pulse mb-2" />正在扫描答卷...</div>;
      case 'grading':
        return <div className="text-purple-600 flex flex-col items-center"><Microscope className="w-8 h-8 animate-bounce mb-2" />AI 正在阅卷...</div>;
      case 'error':
        return (
          <div className="text-red-500 flex flex-col items-center text-center px-4">
            <AlertCircle className="w-8 h-8 mb-2" />
            <span className="text-sm font-medium">{errorMsg || "发生错误"}</span>
            <button onClick={scanPage} className="mt-3 px-4 py-1 text-xs border border-red-200 rounded-full hover:bg-red-50">重试</button>
          </div>
        );
      case 'sleeping':
        // 在 Sleeping 状态展示更详细的引导
        return (
          <div className="text-gray-400 flex flex-col items-center text-center p-4">
            <Zap className="w-10 h-10 mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">准备就绪</p>
            <p className="text-xs text-gray-400 mt-1">
               {health.api && health.rubric && health.pageLink 
                 ? "所有系统检测正常，点击上方开始阅卷"
                 : "请检查上方状态栏的红色警告项"
               }
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  // 状态指示灯组件
  const StatusBadge = ({ active, icon: Icon, label, offIcon: OffIcon }: any) => (
      <div className={`flex items-center px-2 py-1.5 rounded-md border text-[10px] font-medium transition-colors flex-1 justify-center mx-0.5 ${
          active 
          ? 'bg-green-50 text-green-700 border-green-200' 
          : 'bg-gray-50 text-gray-400 border-gray-200'
      }`}>
          {active ? <Icon className="w-3 h-3 mr-1.5" /> : <OffIcon className="w-3 h-3 mr-1.5" />}
          {label}
      </div>
  );

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      {/* Improved Header Area */}
      <div className="bg-white border-b border-gray-200 shadow-sm z-10 sticky top-0">
          
          {/* Main Toolbar with Balanced Layout */}
          <div className="px-4 py-3 flex items-center gap-3">
             
             {/* 1. Segmented Control (Full Width Balanced) */}
             <div className="flex-1 grid grid-cols-2 bg-gray-100/80 p-1 rounded-xl shadow-inner">
                <button 
                   onClick={() => setMode(GradingMode.Trial)}
                   className={`relative py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                     mode === GradingMode.Trial 
                     ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5' 
                     : 'text-gray-500 hover:text-gray-700'
                   }`}
                >
                   <FlaskConical className={`w-3.5 h-3.5 mr-1.5 ${mode === GradingMode.Trial ? 'fill-blue-100' : ''}`} /> 
                   试阅校准
                </button>
                <button 
                   onClick={() => setMode(GradingMode.Batch)}
                   className={`relative py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                     mode === GradingMode.Batch 
                     ? 'bg-white text-purple-600 shadow-sm ring-1 ring-black/5' 
                     : 'text-gray-500 hover:text-gray-700'
                   }`}
                >
                   <Layers className={`w-3.5 h-3.5 mr-1.5 ${mode === GradingMode.Batch ? 'fill-purple-100' : ''}`} /> 
                   批量阅卷
                </button>
             </div>
             
             {/* 2. Contextual Actions (Compact on the right) */}
             <div className="shrink-0">
                 {mode === GradingMode.Batch ? (
                     <div className="flex items-center animate-in fade-in slide-in-from-right-2 duration-300">
                         {isBatchRunning ? (
                             <button 
                               onClick={stopBatch} 
                               className="flex items-center px-3 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold border border-red-200 hover:bg-red-100 transition-colors"
                             >
                                 <div className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2 animate-pulse" />
                                 暂停
                             </button>
                         ) : (
                             <button 
                               onClick={startBatch} 
                               disabled={!health.rubric}
                               className="flex items-center px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg hover:shadow-purple-200 transition-all disabled:opacity-50 disabled:grayscale"
                             >
                                 <Play className="w-3.5 h-3.5 mr-1.5 fill-white" /> 启动
                             </button>
                         )}
                     </div>
                 ) : (
                     <button 
                       onClick={scanPage} 
                       className="h-[34px] w-[34px] flex items-center justify-center bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 rounded-lg transition-all shadow-sm" 
                       title="重新扫描页面"
                     >
                         <RefreshCcw className="w-4 h-4" />
                     </button>
                 )}
             </div>
          </div>

          {/* System Health Dashboard */}
          <div className="px-3 py-2 flex justify-between bg-slate-50/80 border-t border-gray-100 backdrop-blur-sm">
              <StatusBadge 
                  active={health.api} 
                  icon={Wifi} 
                  offIcon={WifiOff} 
                  label={health.api ? "API 正常" : "API 断开"} 
              />
              <StatusBadge 
                  active={health.rubric} 
                  icon={BookCheck} 
                  offIcon={BookX} 
                  label={health.rubric ? "标准已配" : "无标准"} 
              />
              <StatusBadge 
                  active={health.pageLink} 
                  icon={Link2} 
                  offIcon={Link2Off} 
                  label={health.pageLink ? "答卷定位" : "未见答卷"} 
              />
          </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 relative">
         {/* Empty / Loading State */}
         {(status !== 'review' || !result) && (
             <div className="h-full flex flex-col items-center justify-center opacity-70">
                 {renderStatus()}
             </div>
         )}

         {/* Result Review */}
         {status === 'review' && result && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
                 
                 {/* Evidence Viewer (Toggleable) */}
                 {pageContext?.answerImageBase64 && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <button 
                          onClick={() => setShowEvidence(!showEvidence)}
                          className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-xs font-medium text-gray-500"
                        >
                            <span className="flex items-center">
                                {showEvidence ? <EyeOff className="w-3.5 h-3.5 mr-2" /> : <Eye className="w-3.5 h-3.5 mr-2" />}
                                答卷透视 {showEvidence ? "(点击收起)" : "(点击查看)"}
                            </span>
                        </button>
                        
                        {showEvidence && (
                            <div className="relative w-full bg-slate-100 border-t border-gray-200">
                                <img 
                                    src={`data:image/jpeg;base64,${pageContext.answerImageBase64}`} 
                                    className="w-full h-auto block" 
                                    alt="Answer Sheet" 
                                />
                                {/* SVG Overlay for Bounding Boxes */}
                                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                                    {result.breakdown.map((item, idx) => {
                                        if (!item.relevantArea || item.relevantArea.length !== 4) return null;
                                        const [ymin, xmin, ymax, xmax] = item.relevantArea;
                                        const isActive = idx === activeBreakdownIndex;
                                        
                                        // Only show bounding box if active or if no specific item is active (show all faintly?)
                                        // Strategy: Only show active one clearly.
                                        if (!isActive) return null;

                                        return (
                                            <rect 
                                                key={idx}
                                                x={`${xmin * 100}%`}
                                                y={`${ymin * 100}%`}
                                                width={`${(xmax - xmin) * 100}%`}
                                                height={`${(ymax - ymin) * 100}%`}
                                                fill="rgba(239, 68, 68, 0.1)"
                                                stroke="#ef4444"
                                                strokeWidth="2"
                                                rx="4"
                                                className="animate-pulse"
                                            />
                                        );
                                    })}
                                </svg>
                            </div>
                        )}
                    </div>
                 )}

                 {/* 1. Main Score Card */}
                 <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden transition-all hover:shadow-lg">
                     {/* Header */}
                     <div className={`relative p-5 text-white ${
                       mode === GradingMode.Batch 
                         ? 'bg-gradient-to-br from-purple-600 via-purple-500 to-indigo-600' 
                         : 'bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600'
                     }`}>
                        {/* Decorative background circles */}
                        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 rounded-full bg-white/10 blur-xl"></div>
                        <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-20 h-20 rounded-full bg-black/5 blur-lg"></div>

                        <div className="relative flex justify-between items-start">
                            <div>
                                <div className="flex items-center space-x-2 mb-1">
                                     <div className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-medium border border-white/10">
                                        {mode === GradingMode.Batch ? '自动批改' : '试阅结果'}
                                     </div>
                                     {result.score === result.maxScore && (
                                        <div className="bg-yellow-400/90 text-yellow-900 px-2 py-0.5 rounded text-[10px] font-bold flex items-center shadow-sm">
                                            <Sparkles className="w-2.5 h-2.5 mr-1" /> 满分
                                        </div>
                                     )}
                                </div>
                                <h2 className="font-bold text-xl tracking-tight text-white">{result.name}</h2>
                                <div className="text-blue-50 text-xs mt-0.5 font-medium opacity-90">{pageContext?.platform === 'ZHIXUE' ? '智学网' : (pageContext?.platform === 'HAOFENSHU' ? '好分数/七天' : '通用平台')}</div>
                            </div>
                            <div className="text-right">
                                <div className="flex items-baseline justify-end">
                                    <span className="text-5xl font-black tracking-tighter drop-shadow-sm">{result.score}</span>
                                    <span className="text-lg text-white/60 font-medium ml-1">/{result.maxScore}</span>
                                </div>
                            </div>
                        </div>
                     </div>

                     {/* Content */}
                     <div className="p-5">
                         {/* AI Comment Box */}
                         <div className="mb-5 relative">
                            <div className={`absolute top-0 left-0 w-1 h-full rounded-full ${
                                mode === GradingMode.Batch ? 'bg-purple-500' : 'bg-blue-500'
                            }`}></div>
                            <div className="pl-4 py-1">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center">
                                   <Bot className="w-3 h-3 mr-1" /> AI 综合评语
                                </h3>
                                <p className="text-sm text-gray-700 leading-relaxed font-medium">
                                    {result.comment}
                                </p>
                            </div>
                         </div>

                         <div className="h-px bg-gray-100 my-4"></div>

                         {/* Breakdown List */}
                         <div className="space-y-3">
                             <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">得分细则 (点击查看证据)</h3>
                             {result.breakdown.map((item, idx) => {
                                 const isFull = item.score === item.max;
                                 const isZero = item.score === 0;
                                 const percent = (item.score / item.max) * 100;
                                 const isActive = idx === activeBreakdownIndex;
                                 
                                 return (
                                     <div 
                                        key={idx} 
                                        onClick={() => {
                                            setActiveBreakdownIndex(isActive ? null : idx);
                                            setShowEvidence(true);
                                        }}
                                        className={`group cursor-pointer p-2 rounded-lg transition-all border ${
                                            isActive 
                                            ? 'bg-blue-50 border-blue-200 shadow-sm' 
                                            : 'border-transparent hover:bg-gray-50'
                                        }`}
                                     >
                                         <div className="flex justify-between items-center mb-1.5">
                                             <div className="flex items-center overflow-hidden">
                                                 <div className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 ${
                                                     isFull ? 'bg-green-500' : (isZero ? 'bg-red-400' : 'bg-orange-400')
                                                 }`}></div>
                                                 <span className={`text-sm font-medium truncate mr-2 ${isActive ? 'text-blue-700' : 'text-gray-700'}`} title={item.label}>{item.label}</span>
                                                 {item.relevantArea && <ScanLine className="w-3 h-3 text-gray-300 ml-1" />}
                                             </div>
                                             <div className="flex items-center shrink-0">
                                                 <span className={`font-mono text-sm font-bold ${
                                                     isFull ? 'text-green-600' : (isZero ? 'text-red-500' : 'text-orange-500')
                                                 }`}>
                                                     {item.score}
                                                 </span>
                                                 <span className="text-xs text-gray-400 ml-0.5">/{item.max}</span>
                                             </div>
                                         </div>
                                         
                                         {/* Progress Bar */}
                                         <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-1.5">
                                             <div 
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    isFull ? 'bg-green-500' : (isZero ? 'bg-red-400' : 'bg-orange-400')
                                                }`} 
                                                style={{ width: `${percent}%` }}
                                             ></div>
                                         </div>

                                         {/* Item specific comment if any */}
                                         {item.comment && (
                                             <p className="text-[10px] text-gray-500 pl-3.5 border-l border-gray-100 ml-0.5 leading-tight">
                                                {item.comment}
                                             </p>
                                         )}
                                     </div>
                                 );
                             })}
                         </div>
                     </div>
                 </div>

                 {/* Action Buttons (Only in Trial Mode) */}
                 {mode === GradingMode.Trial && (
                    <div className="flex gap-3">
                       <button 
                           onClick={scanPage}
                           className="flex-1 py-3 bg-white text-gray-600 border border-gray-200 rounded-xl font-bold shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all flex justify-center items-center text-xs"
                       >
                           <RefreshCcw className="w-4 h-4 mr-2 text-gray-400" /> 重试
                       </button>
                       <button 
                           onClick={() => handleSubmitScore(result.score, result.name)}
                           className="flex-[2] py-3 bg-blue-600 text-white border border-transparent rounded-xl font-bold shadow-md hover:bg-blue-700 hover:shadow-lg transition-all flex justify-center items-center text-xs group"
                       >
                           <Check className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" /> 确认填分
                       </button>
                    </div>
                 )}

                 {/* Generic Rubric Hint */}
                 {!isRubricConfigured && (
                     <div className="bg-blue-50 text-blue-900 px-4 py-3 rounded-xl text-xs flex items-start border border-blue-100 shadow-sm mt-2">
                         <Lightbulb className="w-4 h-4 mr-2 shrink-0 mt-0.5 text-blue-600" />
                         <div className="flex-1">
                            <span className="font-bold flex items-center justify-between">
                                使用通用标准评分
                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">Trial Mode</span>
                            </span>
                            <p className="mt-1 opacity-80 mb-2">
                                未检测到当前题目的评分细则。AI 已应用默认逻辑：
                            </p>
                            <div className="bg-white/60 p-2 rounded border border-blue-100/50 font-mono text-blue-800/80 mb-2 leading-relaxed">
                                {DEFAULT_GENERIC_RUBRIC}
                            </div>
                            <button onClick={onOpenRubric} className="text-blue-700 font-bold hover:underline flex items-center">
                                <Pencil className="w-3 h-3 mr-1" />
                                立即配置准确标准
                            </button>
                         </div>
                     </div>
                 )}
             </div>
         )}
         
         {/* Batch Mode Overlay Curtain */}
         {mode === GradingMode.Batch && isBatchRunning && status === 'review' && (
             <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center z-20 animate-in fade-in duration-300">
                 <div className="bg-white p-6 rounded-2xl shadow-2xl border border-purple-100 text-center animate-bounce scale-110">
                     <div className="text-purple-600 font-black text-4xl mb-1">+{result?.score}</div>
                     <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                        已自动处理 {batchCount} 份
                     </div>
                 </div>
                 <div className="mt-8 flex flex-col items-center">
                    <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin mb-2"></div>
                    <div className="text-xs text-purple-600 font-medium">
                        {scanWaitCount > 0 
                            ? `等待页面切换 (已尝试 ${scanWaitCount} 次)...` 
                            : "即将跳转下一份..."
                        }
                    </div>
                    {scanWaitCount > 4 && (
                        <p className="text-[10px] text-gray-400 mt-2 max-w-[200px] text-center leading-tight animate-pulse">
                           如果页面长时间未自动跳转，请手动点击平台上的“下一份”按钮。
                        </p>
                    )}
                 </div>
             </div>
         )}
      </div>
    </div>
  );
};

export default GradingView;