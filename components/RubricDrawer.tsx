import React, { useState, useRef } from 'react';
import { ChevronLeft, FileQuestion, FileCheck2, Sparkles, BrainCircuit, RotateCcw } from 'lucide-react';
import { generateRubricFromImages } from '../services/geminiService';

interface RubricDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rubric: string) => void;
}

const RubricDrawer: React.FC<RubricDrawerProps> = ({ isOpen, onClose, onSave }) => {
  const [qImage, setQImage] = useState<string | null>(null);
  const [aImage, setAImage] = useState<string | null>(null);
  const [rubricText, setRubricText] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'done'>('idle');

  const qInputRef = useRef<HTMLInputElement>(null);
  const aInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setImg: (s: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Strip data url prefix for API
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        setImg(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!qImage || !aImage) return;
    
    setStatus('processing');
    try {
      const text = await generateRubricFromImages(qImage, aImage);
      setRubricText(text);
      setStatus('done');
    } catch (e) {
      console.error(e);
      setRubricText("生成评分标准时出错，请检查 API Key。");
      setStatus('idle');
    }
  };

  return (
    <div className={`absolute top-0 right-0 w-full h-full bg-slate-50 transform transition-transform duration-300 z-20 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shrink-0">
        <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500 flex items-center text-sm">
          <ChevronLeft className="w-5 h-5 mr-1" /> 返回
        </button>
        <span className="font-bold text-gray-800 text-sm">评分标准编辑器</span>
        <div className="w-6"></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Image Uploads */}
        <div className="grid grid-cols-2 gap-3">
           <UploadBox 
             label="上传题目" 
             hasImage={!!qImage} 
             onClick={() => qInputRef.current?.click()} 
             icon={FileQuestion}
           />
           <UploadBox 
             label="上传参考答案" 
             hasImage={!!aImage} 
             onClick={() => aInputRef.current?.click()} 
             icon={FileCheck2}
           />
           <input type="file" ref={qInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, setQImage)} />
           <input type="file" ref={aInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, setAImage)} />
        </div>

        <button 
          onClick={handleGenerate}
          disabled={!qImage || !aImage || status === 'processing'}
          className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-medium rounded-lg hover:shadow-md transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'idle' && <><Sparkles className="w-3 h-3 mr-1.5" /> AI 生成评分细则</>}
          {status === 'processing' && <><BrainCircuit className="w-3 h-3 mr-1.5 animate-pulse" /> AI 思考中...</>}
          {status === 'done' && <><RotateCcw className="w-3 h-3 mr-1.5" /> 重新生成</>}
        </button>

        <div className="relative">
           <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
           <div className="relative flex justify-center text-xs"><span className="px-2 bg-slate-50 text-gray-400">Markdown 结果</span></div>
        </div>

        <textarea 
          className="w-full h-64 p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono bg-white" 
          placeholder="评分细则将显示在这里..."
          value={rubricText}
          onChange={(e) => setRubricText(e.target.value)}
        />
      </div>

      <div className="p-4 bg-white border-t border-gray-200 shrink-0">
        <button onClick={() => onSave(rubricText)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
          保存并重新校准
        </button>
      </div>

    </div>
  );
};

const UploadBox = ({ label, hasImage, onClick, icon: Icon }: any) => (
  <div 
    onClick={onClick}
    className={`h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all flex items-center justify-center overflow-hidden group ${hasImage ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'}`}
  >
    {hasImage ? (
      <div className="text-center p-2">
        <Icon className="w-6 h-6 mx-auto text-blue-500 mb-1" />
        <span className="text-[10px] text-blue-600 font-medium">图片已加载</span>
      </div>
    ) : (
      <div className="text-center p-2 group-hover:opacity-70">
        <Icon className="w-6 h-6 mx-auto text-gray-400 mb-1" />
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
    )}
  </div>
);

export default RubricDrawer;