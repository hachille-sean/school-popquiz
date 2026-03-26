'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface ParsedWord {
  id: string;
  en: string;
  kr: string;
  difficulty: number;
  selected: boolean;
}

export default function WordPoolManagement() {
  const [pools, setPools] = useState<any[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string | 'new'>('new');

  const [title, setTitle] = useState('');
  const [inputText, setInputText] = useState('');
  const [parsedWords, setParsedWords] = useState<ParsedWord[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchPools();
  }, []);

  async function fetchPools() {
    const { data } = await supabase.from('word_pools').select('id, title, words').order('created_at', { ascending: false });
    if (data) setPools(data);
  }

  const handleSelectPool = (id: string | 'new') => {
    setSelectedPoolId(id);
    setInputText('');
    if (id === 'new') {
      setTitle('');
      setParsedWords([]);
    } else {
      const pool = pools.find(p => p.id === id);
      if (pool) {
        setTitle(pool.title);
        // Load words and map them to ParsedWord with a selected=true default
        const words = pool.words.map((w: any, idx: number) => ({
          id: `db-word-${idx}-${Date.now()}`,
          en: w.en,
          kr: w.kr,
          difficulty: w.difficulty || 1,
          selected: true
        }));
        setParsedWords(words);
      }
    }
  };

  // Text Parsing Logic
  const handleParse = () => {
    // Expected format per line: "[English] [Korean]"
    // Support difficulty stars (*) anywhere in the line
    const lines = inputText.split('\n').filter(l => l.trim() !== '');
    const parsed = lines.map((line, idx) => {
      let textToParse = line.trim();
      let difficulty = 1;
      
      const starMatch = textToParse.match(/\*+/g);
      if (starMatch) {
        difficulty = Math.min(starMatch[0].length, 5);
        textToParse = textToParse.replace(/\*+/g, '').trim();
      }

      const parts = textToParse.split(/\s+/);
      const en = parts[0] || '';
      
      // The rest is Korean meaning, might contain spaces and commas
      const kr = parts.slice(1).join(' ');

      return {
        id: `word-${idx}-${Date.now()}`,
        en,
        kr,
        difficulty,
        selected: true
      };
    }).filter(w => w.en && w.kr); // Requires at least English and Korean

    setParsedWords(prev => [...prev, ...parsed]);
    setInputText('');
  };

  const toggleAll = (checked: boolean) => {
    setParsedWords(prev => prev.map(w => ({ ...w, selected: checked })));
  };

  const toggleWord = (id: string, checked: boolean) => {
    setParsedWords(prev => prev.map(w => w.id === id ? { ...w, selected: checked } : w));
  };

  const removeUnselectedAndGetWords = () => {
    return parsedWords.filter(w => w.selected).map(({ en, kr, difficulty }) => ({ en, kr, difficulty }));
  };

  const handleSave = async () => {
    if (!title.trim()) return alert('단어장 제목을 입력해주세요.');
    const newWordsList = removeUnselectedAndGetWords();
    if (newWordsList.length === 0) return alert('최소 1개 이상의 단어를 선택해야 합니다.');

    setIsSaving(true);
    try {
      if (selectedPoolId === 'new') {
        const { error } = await supabase.from('word_pools').insert({
          title,
          words: newWordsList
        });
        if (error) throw error;
        alert('단어장이 성공적으로 생성되었습니다!');
      } else {
        const { error } = await supabase.from('word_pools').update({
          title,
          words: newWordsList
        }).eq('id', selectedPoolId);
        if (error) throw error;
        alert('단어장이 성공적으로 수정되었습니다!');
      }

      await fetchPools();
      if (selectedPoolId === 'new') {
        setTitle('');
        setParsedWords([]);
      } else {
        // Refresh words list from db state after fetch
        handleSelectPool(selectedPoolId); // Will be re-run manually or we can just leave it as is 
        // Wait, fetchPools is async, so handleSelectPool might see old pools.
        // It's better to update parsedWords to match only what's selected to reflect the save.
        setParsedWords(parsedWords.filter(w=>w.selected));
      }
    } catch (err: any) {
      console.error(err);
      alert('저장 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePool = async () => {
    if (!confirm('정말 이 단어장을 삭제하시겠습니까? 관련 시험이 있으면 문제가 발생할 수 있습니다.')) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('word_pools').delete().eq('id', selectedPoolId);
      if (error) {
        if (error.code === '23503') {
          throw new Error('이 단어장으로 개설된 시험 내역이 존재하여 삭제할 수 없습니다. 관련 시험을 먼저 삭제해주세요.');
        }
        throw error;
      }
      alert('단어장이 삭제되었습니다.');
      await fetchPools();
      handleSelectPool('new');
    } catch (err: any) {
      console.error(err);
      alert('삭제 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans flex flex-col items-center">
      <div className="w-full max-w-7xl flex gap-6 flex-col">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 gap-4">
          <h1 className="text-2xl font-black flex items-center gap-3">
            <Link href="/teacher" className="text-slate-400 hover:text-blue-600 transition-colors">←</Link>
            단어 풀(Pool) 관리
          </h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Sidebar */}
          <div className="col-span-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4 max-h-[800px] overflow-hidden">
            <button 
              onClick={() => handleSelectPool('new')}
              className={`p-4 rounded-2xl font-bold transition-all text-left shadow-sm ${selectedPoolId === 'new' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
            >
              + 새 단어장 만들기
            </button>
            
            <hr className="border-slate-100" />
            
            <div className="flex flex-col gap-2 overflow-y-auto pr-2 pb-4">
              <h3 className="font-bold text-slate-500 px-2 text-sm mb-1">기존 단어장 목록</h3>
              {pools.map(pool => (
                <button
                  key={pool.id}
                  onClick={() => handleSelectPool(pool.id)}
                  className={`p-3 rounded-xl transition-all text-left border ${selectedPoolId === pool.id ? 'bg-slate-800 text-white border-slate-900 shadow-md' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'}`}
                >
                  <div className="font-bold truncate">{pool.title}</div>
                  <div className={`text-xs mt-1 ${selectedPoolId === pool.id ? 'text-slate-300' : 'text-slate-400'}`}>
                    총 {pool.words?.length || 0}단어
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4">
              <h2 className="text-lg font-bold">1. 붙여넣기</h2>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">단어장 제목</label>
                <input 
                  type="text" 
                  placeholder="예: 3단원 필수 단어" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  텍스트 추가 (영어 단어와 한국어 뜻을 띄어쓰기로 구분)
                </label>
                <textarea 
                  className="w-full flex-1 min-h-[300px] border border-slate-200 rounded-lg p-4 font-mono text-sm leading-relaxed outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                  placeholder="present 선물, 참석한, 현재의\napple 사과\n..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              </div>
              <button 
                onClick={handleParse}
                className="w-full py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors shadow-md"
              >
                단어 목록에 추가하기
              </button>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">2. 확인 및 관리</h2>
                {selectedPoolId !== 'new' && (
                  <button onClick={handleDeletePool} disabled={isSaving} className="text-sm font-bold text-red-500 hover:text-red-700 disabled:opacity-50">
                    단어장 삭제
                  </button>
                )}
              </div>
              
              <p className="text-xs text-slate-500 font-bold mb-4">
                체크 해제된 단어는 저장 시 삭제 처리됩니다.
              </p>
              
              {parsedWords.length > 0 ? (
                <div className="flex flex-col flex-1 gap-4 overflow-hidden">
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <label className="flex items-center gap-2 cursor-pointer font-semibold select-none">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                        checked={parsedWords.every(w => w.selected)}
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                      전체 유지 ({parsedWords.filter(w=>w.selected).length} / {parsedWords.length})
                    </label>
                  </div>

                  <div className="overflow-y-auto flex-1 pr-2 space-y-2 max-h-[400px]">
                    {parsedWords.map(word => (
                      <label 
                        key={word.id} 
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${word.selected ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 bg-white opacity-50 grayscale'}`}
                      >
                        <input 
                          type="checkbox"
                          checked={word.selected}
                          onChange={(e) => toggleWord(word.id, e.target.checked)}
                          className="w-5 h-5 mt-0.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                        />
                        <div className="flex-1 flex gap-2">
                          <span className={`font-bold w-2/5 truncate ${word.selected ? 'text-blue-900' : 'text-slate-500 line-through'}`} title={word.en}>{word.en}</span>
                          <span className={`font-medium w-2/5 truncate ${word.selected ? 'text-slate-700' : 'text-slate-400 line-through'}`} title={word.kr}>{word.kr}</span>
                          <span className="text-amber-500 text-sm font-bold shrink-0">{'★'.repeat(word.difficulty)}</span>
                        </div>
                      </label>
                    ))}
                  </div>

                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="mt-auto w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50"
                  >
                    {isSaving ? '저장 중...' : selectedPoolId === 'new' ? '새로운 단어장 저장' : '변경된 내용으로 단어장 업데이트'}
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-400 font-medium">
                  단어 목록이 비어있습니다.
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
