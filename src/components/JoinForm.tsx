'use client';

import { useState, KeyboardEvent } from 'react';
import MatchedNodes from './MatchedNodes';
import type { MatchedNode } from '@/lib/match';

const emptyForm = {
  name: '',
  city: '',
  doing: '',
  topics: [] as string[],
  experience: '',
  offer: '',
  seeking: '',
  product: '',
  wechat: '',
  email: '',
};

export default function JoinForm() {
  const [formData, setFormData] = useState(emptyForm);
  const [topicInput, setTopicInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [matches, setMatches] = useState<MatchedNode[]>([]);

  const handleTopicKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && topicInput.trim()) {
      e.preventDefault();
      if (!formData.topics.includes(topicInput.trim())) {
        setFormData(prev => ({
          ...prev,
          topics: [...prev.topics, topicInput.trim()],
        }));
      }
      setTopicInput('');
    }
  };

  const removeTopic = (topic: string) => {
    setFormData(prev => ({
      ...prev,
      topics: prev.topics.filter(t => t !== topic),
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    setStatus('submitting');

    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        setMatches(Array.isArray(json.matches) ? json.matches : []);
        setStatus('success');
      } else {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 3000);
      }
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleContinue = () => {
    setFormData(emptyForm);
    setMatches([]);
    setStatus('idle');
  };

  const inputClass = "w-full px-4 py-3 border-[1.5px] border-mist rounded-lg font-sans text-[0.93rem] text-text-primary bg-warm-cream outline-none transition-all focus:border-coral-soft focus:shadow-[0_0_0_3px_rgba(212,160,160,0.1)] focus:bg-white";
  const textareaClass = `${inputClass} min-h-[90px] resize-y`;
  const labelClass = "block font-serif text-[0.93rem] font-semibold text-forest-deep mb-1.5";

  return (
    <div className="max-w-[800px] mx-auto bg-white rounded-3xl p-12 shadow-[0_8px_40px_rgba(26,46,26,0.05)] border border-moss/8 max-md:p-7">
      <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
        <div>
          <label className={labelClass}>你是谁</label>
          <input className={inputClass} type="text" placeholder="你的名字或昵称"
            value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <label className={labelClass}>你在哪里</label>
          <input className={inputClass} type="text" placeholder="城市 / 地区"
            value={formData.city} onChange={e => setFormData(p => ({ ...p, city: e.target.value }))} />
        </div>
      </div>

      <div className="mt-6">
        <label className={labelClass}>你现在在做什么</label>
        <textarea className={textareaClass} rows={3} placeholder="你的工作、项目、正在探索的方向..."
          value={formData.doing} onChange={e => setFormData(p => ({ ...p, doing: e.target.value }))} />
      </div>

      <div className="mt-6">
        <label className={labelClass}>你关心什么议题</label>
        <p className="text-xs text-text-light mb-1.5">输入后按回车添加标签</p>
        <div className="flex flex-wrap gap-2 p-2.5 border-[1.5px] border-mist rounded-lg bg-warm-cream cursor-text min-h-[46px] items-center transition-all focus-within:border-coral-soft focus-within:shadow-[0_0_0_3px_rgba(212,160,160,0.1)] focus-within:bg-white">
          {formData.topics.map(topic => (
            <span key={topic} className="inline-flex items-center gap-1.5 px-3 py-1 bg-love-pink/8 border border-love-pink/15 rounded-full text-xs text-coral font-medium">
              {topic}
              <span className="cursor-pointer opacity-50 hover:opacity-100 text-base leading-none" onClick={() => removeTopic(topic)}>&times;</span>
            </span>
          ))}
          <input className="border-none outline-none bg-transparent font-sans text-sm min-w-[120px] flex-1 text-text-primary"
            placeholder="如：社区营造、爱与连接、可持续、AI..."
            value={topicInput} onChange={e => setTopicInput(e.target.value)}
            onKeyDown={handleTopicKeyDown} />
        </div>
      </div>

      <div className="mt-6">
        <label className={labelClass}>你的经验、优势与独特性</label>
        <textarea className={textareaClass} rows={3} placeholder="你在哪些领域有经验？你的独特优势是什么？"
          value={formData.experience} onChange={e => setFormData(p => ({ ...p, experience: e.target.value }))} />
      </div>

      <div className="mt-6">
        <label className={labelClass}>你可以提供什么支持</label>
        <textarea className={textareaClass} rows={2} placeholder="技能、经验、资源、空间、陪伴..."
          value={formData.offer} onChange={e => setFormData(p => ({ ...p, offer: e.target.value }))} />
      </div>

      <div className="mt-6">
        <label className={labelClass}>你正在寻找什么样的连接</label>
        <textarea className={textareaClass} rows={2} placeholder="你希望遇到什么样的人？参与什么样的事？"
          value={formData.seeking} onChange={e => setFormData(p => ({ ...p, seeking: e.target.value }))} />
      </div>

      <div className="mt-6">
        <label className={labelClass}>你是否有产品、服务或项目希望被看见</label>
        <textarea className={textareaClass} rows={2} placeholder="如果有，简单介绍一下"
          value={formData.product} onChange={e => setFormData(p => ({ ...p, product: e.target.value }))} />
      </div>

      <div className="grid grid-cols-2 gap-5 mt-6 max-md:grid-cols-1">
        <div>
          <label className={labelClass}>微信号</label>
          <input className={inputClass} type="text" placeholder="方便后续连接"
            value={formData.wechat} onChange={e => setFormData(p => ({ ...p, wechat: e.target.value }))} />
        </div>
        <div>
          <label className={labelClass}>邮箱</label>
          <input className={inputClass} type="email" placeholder="可选"
            value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={status === 'submitting' || status === 'success'}
        className={`w-full py-4 mt-6 font-sans text-base font-bold border-none rounded-2xl cursor-pointer transition-all
          ${status === 'success'
            ? 'bg-gradient-to-br from-leaf to-sage text-white'
            : 'bg-gradient-to-br from-coral-soft to-warmth text-forest-deep hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(212,160,160,0.3)]'
          }
          disabled:opacity-70 disabled:cursor-not-allowed`}
      >
        {status === 'submitting' && '提交中...'}
        {status === 'success' && '欢迎加入！你已成为森林的一棵树'}
        {status === 'error' && '提交失败，请稍后重试'}
        {status === 'idle' && '提交节点卡，加入附近森林'}
      </button>

      {status === 'success' && (
        <>
          <MatchedNodes matches={matches} />
          <div className="text-center mt-6">
            <button
              type="button"
              onClick={handleContinue}
              className="text-sm text-text-light hover:text-forest-deep underline underline-offset-4 transition-colors bg-transparent border-none cursor-pointer"
            >
              继续填写新节点
            </button>
          </div>
        </>
      )}
    </div>
  );
}
