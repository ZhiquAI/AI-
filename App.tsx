import React, { useState, useEffect } from 'react';
import { PenTool, BarChart3, Settings2 } from 'lucide-react';
import GradingView from './components/GradingView';
import AnalysisView from './components/AnalysisView';
import SettingsView from './components/SettingsView';
import RubricDrawer from './components/RubricDrawer';
import { Tab } from './types';
import { GradingStrategy } from './services/geminiService';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.Grading);
  const [isRubricDrawerOpen, setIsRubricDrawerOpen] = useState(false);
  
  // Global Grading State
  const [isRubricConfigured, setIsRubricConfigured] = useState(false);
  const [rubricContent, setRubricContent] = useState(''); // 存储 Markdown 格式的评分标准
  
  // Settings State
  const [gradingStrategy, setGradingStrategy] = useState<GradingStrategy>('pro');

  // --- Persistence Logic ---
  useEffect(() => {
    // Load from LocalStorage on mount
    const savedRubric = localStorage.getItem('app_rubric_content');
    const savedStrategy = localStorage.getItem('app_grading_strategy');
    
    if (savedRubric) {
      setRubricContent(savedRubric);
      setIsRubricConfigured(true);
    }
    
    if (savedStrategy) {
      // Simple migration for legacy values
      if (savedStrategy === 'gpt4' || savedStrategy === 'dual') {
          setGradingStrategy('pro');
      } else if (savedStrategy === 'gemini') {
          setGradingStrategy('flash');
      } else {
          setGradingStrategy(savedStrategy as GradingStrategy);
      }
    }
  }, []);

  const handleSaveRubric = (text: string) => {
    if (text.trim().length > 0) {
      setIsRubricConfigured(true);
      setRubricContent(text);
      localStorage.setItem('app_rubric_content', text); // Save
    }
    setIsRubricDrawerOpen(false);
  };

  const handleStrategyChange = (newStrategy: GradingStrategy) => {
    setGradingStrategy(newStrategy);
    localStorage.setItem('app_grading_strategy', newStrategy); // Save
  };

  return (
    <div className="fixed right-0 top-0 w-[450px] h-screen bg-white shadow-2xl flex flex-col z-50 font-sans">
      {/* Top Navigation */}
      <div className="flex border-b border-gray-200 bg-white shrink-0 z-10">
        <NavButton 
          isActive={activeTab === Tab.Grading} 
          onClick={() => setActiveTab(Tab.Grading)} 
          icon={PenTool} 
          label="智能批改" 
        />
        <NavButton 
          isActive={activeTab === Tab.Analysis} 
          onClick={() => setActiveTab(Tab.Analysis)} 
          icon={BarChart3} 
          label="数据分析" 
        />
        <NavButton 
          isActive={activeTab === Tab.Settings} 
          onClick={() => setActiveTab(Tab.Settings)} 
          icon={Settings2} 
          label="设置" 
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden bg-white">
        {activeTab === Tab.Grading && (
          <GradingView 
            onOpenRubric={() => setIsRubricDrawerOpen(true)}
            isRubricConfigured={isRubricConfigured}
            currentRubric={rubricContent}
            gradingStrategy={gradingStrategy}
          />
        )}
        {activeTab === Tab.Analysis && <AnalysisView />}
        {activeTab === Tab.Settings && (
          <SettingsView 
            onOpenRubric={() => setIsRubricDrawerOpen(true)} 
            isRubricConfigured={isRubricConfigured}
            currentStrategy={gradingStrategy}
            onStrategyChange={handleStrategyChange}
          />
        )}
        
        {/* Drawers overlaying the content area */}
        <RubricDrawer 
          isOpen={isRubricDrawerOpen} 
          onClose={() => setIsRubricDrawerOpen(false)}
          onSave={handleSaveRubric}
        />
      </div>
    </div>
  );
};

const NavButton = ({ isActive, onClick, icon: Icon, label }: any) => (
  <button 
    onClick={onClick} 
    className={`flex-1 py-3 flex items-center justify-center text-[13px] transition-colors relative ${
      isActive 
        ? 'text-blue-600 bg-blue-50 font-semibold' 
        : 'text-slate-500 hover:text-slate-700 hover:bg-gray-50'
    }`}
  >
    <Icon className="w-4 h-4 mr-1.5" />
    {label}
    {isActive && (
      <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600" />
    )}
  </button>
);

export default App;