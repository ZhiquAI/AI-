import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Bot, Download, FileSpreadsheet, Sparkles, Frown } from 'lucide-react';
import { generateGradingInsight } from '../services/geminiService';
import { StudentResult } from '../types';

const AnalysisView: React.FC = () => {
  const [insight, setInsight] = useState("正在根据阅卷记录生成 AI 分析洞察...");
  const [stats, setStats] = useState<{
    avgScore: number;
    passRate: number;
    difficulty: number;
    count: number;
    distribution: { name: string; value: number; color: string }[];
  } | null>(null);

  useEffect(() => {
    calculateStats();
  }, []);

  const calculateStats = async () => {
    // 1. 从 localStorage 读取
    const saved = localStorage.getItem('grading_history');
    if (!saved) {
        setStats(null);
        setInsight("暂无数据。");
        return;
    }

    const history: StudentResult[] = JSON.parse(saved);
    if (!Array.isArray(history) || history.length === 0) {
        setStats(null);
        setInsight("暂无数据。");
        return;
    }

    // 2. 计算基础统计
    const count = history.length;
    const totalScore = history.reduce((acc, curr) => acc + curr.score, 0);
    const avgScore = totalScore / count;
    
    // 假设 60% 为及格 (如果 maxScore 不一致，取第一个或平均 maxScore)
    const maxScore = history[0].maxScore || 100;
    const passThreshold = maxScore * 0.6;
    const passCount = history.filter(s => s.score >= passThreshold).length;
    const passRate = (passCount / count) * 100;
    
    // 难度系数 (0-1, 通常指得分率，即 平均分/满分)
    const difficulty = avgScore / maxScore;

    // 3. 计算分布 (分为4档)
    // 0-60% (不及格)
    // 60-75% (及格)
    // 75-90% (良好)
    // 90-100% (优秀)
    const buckets = [0, 0, 0, 0];
    history.forEach(s => {
        const ratio = s.score / s.maxScore;
        if (ratio < 0.6) buckets[0]++;
        else if (ratio < 0.75) buckets[1]++;
        else if (ratio < 0.9) buckets[2]++;
        else buckets[3]++;
    });

    const distribution = [
      { name: '待加油', value: buckets[0], color: '#ef4444' }, // Red
      { name: '及格', value: buckets[1], color: '#f97316' },   // Orange
      { name: '良好', value: buckets[2], color: '#3b82f6' },   // Blue
      { name: '优秀', value: buckets[3], color: '#22c55e' },   // Green
    ];

    setStats({
        avgScore,
        passRate,
        difficulty,
        count,
        distribution
    });

    // 4. 生成 AI 洞察
    const aiText = await generateGradingInsight(avgScore, passRate);
    setInsight(aiText);
  };

  // Empty State
  if (!stats) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 text-gray-500 animate-in fade-in">
            <Frown className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm">暂无阅卷数据</p>
            <p className="text-xs mt-1">请先进行阅卷，数据将自动汇总至此。</p>
        </div>
      );
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-gray-50 animate-in fade-in duration-300">
      <div className="px-5 py-4 bg-white border-b border-gray-200 flex justify-between items-center shrink-0">
        <h2 className="font-bold text-gray-800 flex items-center">
          <FileSpreadsheet className="w-5 h-5 mr-2 text-blue-600" />
          考试数据报告
        </h2>
        <span className="text-xs text-gray-400">样本数: {stats.count}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6 no-scrollbar">
        {/* Key Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="平均分" value={stats.avgScore.toFixed(1)} color="text-gray-800" />
          <MetricCard label="及格率" value={`${stats.passRate.toFixed(0)}%`} color={stats.passRate >= 60 ? "text-green-600" : "text-red-600"} />
          <MetricCard label="得分率" value={stats.difficulty.toFixed(2)} color="text-blue-600" />
        </div>

        {/* AI Insight */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-4 rounded-xl shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-2 opacity-10">
            <Bot className="w-16 h-16 text-blue-600" />
          </div>
          <h3 className="text-sm font-bold text-blue-800 mb-2 flex items-center">
            <Sparkles className="w-4 h-4 mr-2" /> AI 教学洞察
          </h3>
          <p className="text-xs text-gray-700 leading-relaxed text-justify whitespace-pre-wrap">
            {insight}
          </p>
        </div>

        {/* Chart */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm h-64">
          <h3 className="text-sm font-bold text-gray-800 mb-4">分数分布</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.distribution}>
              <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ fontSize: '12px' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {stats.distribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const MetricCard = ({ label, value, color }: any) => (
  <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm text-center">
    <div className="text-xs text-gray-500 mb-1">{label}</div>
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
  </div>
);

export default AnalysisView;