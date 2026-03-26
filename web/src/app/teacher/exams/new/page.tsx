'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ExamCreation() {
  const router = useRouter();

  const [pools, setPools] = useState<any[]>([]);
  const [waitingSessions, setWaitingSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | 'new'>('new');
  const [lastExamTitle, setLastExamTitle] = useState('');

  // Form State (for new)
  const [selectedPool, setSelectedPool] = useState('');
  const [title, setTitle] = useState('');
  const [targetGrade, setTargetGrade] = useState('3');
  const [targetClass, setTargetClass] = useState('1');
  const [duration, setDuration] = useState('10');
  const [expectedStudents, setExpectedStudents] = useState('20');
  const [qEn, setQEn] = useState('0');
  const [qKr, setQKr] = useState('0');

  const [isSaving, setIsSaving] = useState(false);

  // Preview / Edit State
  const [previewActive, setPreviewActive] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editEn, setEditEn] = useState('');
  const [editKr, setEditKr] = useState('');

  // UI State for sidebar
  const [expandedTitles, setExpandedTitles] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    const { data: pData } = await supabase.from('word_pools').select('id, title, words').order('created_at', { ascending: false });
    if (pData) setPools(pData);

    await fetchWaitingSessions();
    
    // Fetch last session title for placeholder
    const { data: lastS } = await supabase.from('exam_sessions').select('title').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (lastS) setLastExamTitle(lastS.title);
  }

  async function fetchWaitingSessions() {
    // We only care about editing "waiting" sessions, or maybe all? The req implies waiting exams.
    const { data: sData } = await supabase.from('exam_sessions').select('*').eq('status', 'waiting').order('created_at', { ascending: false });
    if (sData) {
      setWaitingSessions(sData);
      
      // Auto expand all by default
      const initialExpanded: any = {};
      const titles = Array.from(new Set(sData.map(s => s.title)));
      titles.forEach(t => initialExpanded[t as string] = true);
      setExpandedTitles(prev => ({ ...initialExpanded, ...prev }));
    }
  }

  const handleSelectSession = async (id: string | 'new') => {
    setSelectedSessionId(id);
    setPreviewActive(false);
    setEditingIdx(null);
    setGeneratedQuestions([]);

    if (id === 'new') {
      setTitle('');
      setSelectedPool('');
      setTargetGrade('3');
      setTargetClass('1');
      setDuration('10');
      setExpectedStudents('20');
      setQEn('0');
      setQKr('0');
    } else {
      // Load existing session details and questions
      const session = waitingSessions.find(s => s.id === id);
      if (session) {
        setTitle(session.title);
        // target_class is like "3학년 1반"
        const m = session.target_class.match(/(\d+)학년\s+(\d+)반/);
        if (m) {
          setTargetGrade(m[1]);
          setTargetClass(m[2]);
        }
        setDuration(session.total_duration_minutes.toString());
        setExpectedStudents(session.expected_students.toString());
        setSelectedPool(session.word_pool_id);
        
        // Fetch questions
        const { data: tpls } = await supabase.from('exam_templates').select('questions').eq('session_id', id);
        if (tpls && tpls.length > 0) {
          setGeneratedQuestions(tpls[0].questions);
          setPreviewActive(true); // jump straight to preview/edit mode
        }
      }
    }
  };

  const handleGeneratePreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPool || !title || !targetGrade || !targetClass || !duration || !expectedStudents) {
      return alert('모든 필수 항목을 입력해주세요.');
    }

    const enC = parseInt(qEn) || 0;
    const krC = parseInt(qKr) || 0;
    
    if (enC + krC === 0) {
      return alert('출제할 총 문항 수가 0개 이상이어야 합니다.');
    }

    const pool = pools.find(p => p.id === selectedPool);
    if (!pool) return alert('단어장을 찾을 수 없습니다.');

    const words = [...pool.words].sort(() => 0.5 - Math.random());
    
    let generated: any[] = [];
    let idx = 0;
    
    // Pick EN
    for (let i = 0; i < enC && idx < words.length; i++) {
      generated.push({ id: `q_${Date.now()}_${idx}`, type: 'en', word: words[idx] });
      idx++;
    }
    // Pick KR
    for (let i = 0; i < krC && idx < words.length; i++) {
      generated.push({ id: `q_${Date.now()}_${idx}`, type: 'kr', word: words[idx] });
      idx++;
    }
    
    generated.sort(() => 0.5 - Math.random());
    setGeneratedQuestions(generated);
    setPreviewActive(true);
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditEn(generatedQuestions[idx].word.en);
    setEditKr(generatedQuestions[idx].word.kr);
  };

  const saveEdit = (idx: number) => {
    if (!editEn.trim() || !editKr.trim()) {
      return alert('영어 스펠링과 한국어 뜻을 필수로 입력해야 합니다.');
    }
    setGeneratedQuestions(prev => {
      const copy = [...prev];
      copy[idx].word = { ...copy[idx].word, en: editEn.trim(), kr: editKr.trim() };
      return copy;
    });
    setEditingIdx(null);
  };

  const handleDeleteSession = async () => {
    if (selectedSessionId === 'new') return;
    if (!confirm('정말 이 대기 중인 시험을 삭제하시겠습니까?')) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('exam_sessions').delete().eq('id', selectedSessionId);
      if (error) throw error;
      alert('시험이 삭제되었습니다.');
      await fetchWaitingSessions();
      handleSelectSession('new');
    } catch (err: any) {
      console.error(err);
      alert('삭제 중 오류: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveToDB = async () => {
    if (editingIdx !== null) {
      return alert('편집 중인 문항의 저장을 먼저 완료해주세요.');
    }
    setIsSaving(true);
    
    // Auto-append class info if not already present
    const classSuffixNoSpace = `(${targetGrade}학년${targetClass}반)`;
    const classSuffixWithSpace = `(${targetGrade}학년 ${targetClass}반)`;
    const finalTitle = (title.includes(classSuffixNoSpace) || title.includes(classSuffixWithSpace)) 
      ? title 
      : `${title.trim()} ${classSuffixNoSpace}`;

    try {
      if (selectedSessionId === 'new') {
        const { data: sessionData, error: sessionErr } = await supabase.from('exam_sessions').insert({
          title: finalTitle,
          target_class: `${targetGrade}학년 ${targetClass}반`,
          total_duration_minutes: parseInt(duration),
          expected_students: parseInt(expectedStudents),
          q_en_count: parseInt(qEn) || 0,
          q_kr_count: parseInt(qKr) || 0,
          q_ext_count: 0,
          status: 'waiting',
          word_pool_id: selectedPool
        }).select();

        if (sessionErr) throw sessionErr;
        const newSessionId = sessionData[0].id;

        const { error: tplErr } = await supabase.from('exam_templates').insert({
          session_id: newSessionId,
          is_retake: false,
          questions: generatedQuestions
        });

        if (tplErr) throw tplErr;
        
        alert('시험이 성공적으로 개설되었습니다!');
        await fetchWaitingSessions();
        handleSelectSession(newSessionId);
      } else {
        // Only saving the questions and maybe basic session info if it changed
        const { error: sessionErr } = await supabase.from('exam_sessions').update({
          title: finalTitle,
          target_class: `${targetGrade}학년 ${targetClass}반`,
          total_duration_minutes: parseInt(duration),
          expected_students: parseInt(expectedStudents)
        }).eq('id', selectedSessionId);
        
        if (sessionErr) throw sessionErr;

        const { error: tplErr } = await supabase.from('exam_templates').update({
          questions: generatedQuestions
        }).eq('session_id', selectedSessionId);

        if (tplErr) throw tplErr;
        
        alert('시험 변경사항이 저장되었습니다.');
        await fetchWaitingSessions();
      }
    } catch (err: any) {
      console.error(err);
      alert('저장 오류: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartExamDirectly = async () => {
    if (selectedSessionId === 'new') return;
    if (!confirm('이 시험을 지금 바로 개시하시겠습니까? (이 메뉴를 벗어나 모니터링 메뉴로 이동합니다)')) return;
    
    // First save any pending changes
    await handleSaveToDB();
    
    // Then start
    const { error } = await supabase.from('exam_sessions').update({ status: 'active' }).eq('id', selectedSessionId);
    if (error) {
      alert('오류: ' + error.message);
    } else {
      router.push('/teacher/monitoring');
    }
  };

  const groupedSessions = waitingSessions.reduce((acc: any, s: any) => {
    if (!acc[s.title]) acc[s.title] = [];
    acc[s.title].push(s);
    return acc;
  }, {});

  const toggleGroup = (title: string) => {
    setExpandedTitles(prev => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans flex flex-col items-center">
      <div className="w-full max-w-7xl flex flex-col gap-6">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 gap-4">
          <h1 className="text-2xl font-black flex items-center gap-3">
            <Link href="/teacher" className="text-slate-400 hover:text-emerald-600 transition-colors">←</Link>
            새로운 시험 개설 및 문제 점검
          </h1>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* LEFT SIDEBAR */}
          <div className="col-span-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4 max-h-[800px] overflow-hidden">
            <button 
              onClick={() => handleSelectSession('new')}
              className={`p-4 rounded-2xl font-bold transition-all text-left shadow-sm flex items-center gap-2 ${selectedSessionId === 'new' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
            >
              <span className="text-xl">+</span> 새 시험 설정
            </button>
            
            <hr className="border-slate-100" />
            
            <div className="flex flex-col gap-2 overflow-y-auto pr-2 pb-4">
              <h3 className="font-bold text-slate-500 px-2 text-sm mb-1 uppercase tracking-wider">대기 중인 시험</h3>
              {Object.keys(groupedSessions).length === 0 && (
                <div className="text-xs text-slate-400 px-2 py-4 text-center">대기 중인 시험이 없습니다.</div>
              )}
              {Object.keys(groupedSessions).map(groupTitle => (
                <div key={groupTitle} className="flex flex-col gap-1">
                  <button 
                    onClick={() => toggleGroup(groupTitle)}
                    className="flex justify-between items-center px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors group"
                  >
                    <span className="font-black text-slate-800 text-sm">{groupTitle}</span>
                    <span className="text-xs text-slate-400 font-bold group-hover:text-slate-600 transition-colors">
                      {expandedTitles[groupTitle] ? '▼' : '▶'}
                    </span>
                  </button>
                  
                  {expandedTitles[groupTitle] && (
                    <div className="flex flex-col gap-1 mt-1 mb-2">
                      {groupedSessions[groupTitle].map((s: any) => (
                        <button 
                          key={s.id} 
                          onClick={() => handleSelectSession(s.id)}
                          className={`text-left p-2.5 ml-2 rounded-xl transition-all border ${selectedSessionId === s.id ? 'bg-emerald-50 border-emerald-300 shadow-sm' : 'bg-transparent hover:bg-emerald-50/50 hover:border-emerald-200 border-transparent text-slate-600'}`}
                        >
                          <div className={`text-sm font-bold tracking-wide ${selectedSessionId === s.id ? 'text-emerald-700' : 'text-slate-500'}`}>
                            ↳ {s.target_class}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="col-span-3">
            
            {!previewActive ? (
              <form onSubmit={handleGeneratePreview} className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between flex-wrap gap-4 items-center">
                  <div>
                    <h2 className="text-2xl font-black">새 시험 기본설정</h2>
                    <p className="text-slate-500 font-bold mt-1 text-sm">시험의 제목, 대상 반, 시간을 설정하고 문제 자동 출제 옵션을 지정합니다.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div>
                    <label className="block text-sm font-black text-slate-700 mb-2">단어 풀 선택 (필수)</label>
                    <select required value={selectedPool} onChange={e => setSelectedPool(e.target.value)} className="w-full border-none p-4 rounded-xl focus:ring-4 focus:ring-emerald-500/20 outline-none bg-white font-bold text-slate-700 shadow-sm">
                      <option value="">단어장을 선택하세요</option>
                      {pools.map(p => (
                        <option key={p.id} value={p.id}>{p.title} ({p.words?.length || 0}단어)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-black text-slate-700 mb-2">시험 제목</label>
                    <input required type="text" placeholder={lastExamTitle ? `예: ${lastExamTitle}` : "예: 3단원 단어시험"} value={title} onChange={e => setTitle(e.target.value)} className="w-full border-none p-4 rounded-xl focus:ring-4 focus:ring-emerald-500/20 outline-none bg-white font-bold text-slate-700 shadow-sm" />
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-black text-slate-700 mb-2">대상 학년</label>
                      <div className="flex items-center gap-2">
                        <input required type="number" min="1" max="6" value={targetGrade} onChange={e => setTargetGrade(e.target.value)} className="w-full border-none p-4 rounded-xl focus:ring-4 focus:ring-emerald-500/20 outline-none bg-white font-bold text-slate-700 shadow-sm text-center" />
                        <span className="font-black text-slate-400 shrink-0">학년</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-black text-slate-700 mb-2">대상 반</label>
                      <div className="flex items-center gap-2">
                        <input required type="number" min="1" max="20" value={targetClass} onChange={e => setTargetClass(e.target.value)} className="w-full border-none p-4 rounded-xl focus:ring-4 focus:ring-emerald-500/20 outline-none bg-white font-bold text-slate-700 shadow-sm text-center" />
                        <span className="font-black text-slate-400 shrink-0">반</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-black text-slate-700 mb-2">총 시험 시간 (분)</label>
                      <input required type="number" min="1" value={duration} onChange={e => setDuration(e.target.value)} className="w-full border-none p-4 rounded-xl focus:ring-4 focus:ring-emerald-500/20 outline-none bg-white font-bold text-slate-700 shadow-sm text-center" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-black text-slate-700 mb-2">예상 학생 수 (명)</label>
                      <input required type="number" min="1" value={expectedStudents} onChange={e => setExpectedStudents(e.target.value)} className="w-full border-none p-4 rounded-xl focus:ring-4 focus:ring-emerald-500/20 outline-none bg-white font-bold text-slate-700 shadow-sm text-center" />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-black mb-4 flex items-center gap-2"><span className="text-2xl">🎲</span> 무작위 자동 출제 도구</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-center">
                      <label className="block text-sm font-black text-blue-600 mb-1">영어 스펠링 쓰기</label>
                      <p className="text-xs text-slate-400 font-bold mb-3">학생에게 <span className="text-slate-600">한국어 뜻</span>을 보여줌</p>
                      <input type="number" min="0" value={qEn} onChange={e => setQEn(e.target.value)} className="w-24 border-none p-3 rounded-lg focus:ring-4 focus:ring-blue-500/20 outline-none text-center font-black text-2xl bg-blue-50 text-blue-900" />
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 text-center">
                      <label className="block text-sm font-black text-purple-600 mb-1">한국어 뜻 쓰기</label>
                      <p className="text-xs text-slate-400 font-bold mb-3">학생에게 <span className="text-slate-600">영어 단어</span>를 보여줌</p>
                      <input type="number" min="0" value={qKr} onChange={e => setQKr(e.target.value)} className="w-24 border-none p-3 rounded-lg focus:ring-4 focus:ring-purple-500/20 outline-none text-center font-black text-2xl bg-purple-50 text-purple-900" />
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <button type="submit" className="w-full py-5 bg-slate-900 text-white font-black text-xl rounded-2xl hover:bg-slate-800 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1">
                    문제지 생성 및 수동 검토 단계로 가기 →
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 flex flex-col gap-6 animate-in slide-in-from-bottom-4 duration-300">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                  <div>
                    <h2 className="text-2xl font-black">
                      {selectedSessionId === 'new' ? '출제된 문제 수동 검토 및 편집' : `${title} (${targetGrade}학년 ${targetClass}반) 문제 점검`}
                    </h2>
                    <p className="text-slate-500 font-bold mt-1 text-sm">
                      원하는 문항의 단어나 뜻을 직접 편집하여 수동으로 교체하실 수 있습니다.
                    </p>
                  </div>
                  
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setPreviewActive(false)} className="px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm shadow-sm">
                      ← 설정으로 뒤로가기
                    </button>
                    {selectedSessionId !== 'new' && (
                      <button onClick={handleDeleteSession} disabled={isSaving} className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 font-bold rounded-xl hover:bg-red-100 transition-colors text-sm shadow-sm disabled:opacity-50">
                        이 시험 삭제
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {generatedQuestions.map((q, idx) => {
                    const hint = q.type === 'en' ? '영어 스펠링' : '한글 뜻';
                    const prompt = q.type === 'en' ? q.word.kr : q.word.en;
                    const correct = q.type === 'en' ? q.word.en : q.word.kr;
                    
                    return (
                      <div key={idx} className={`p-4 border rounded-2xl transition-all ${editingIdx === idx ? 'bg-amber-50 border-amber-300 shadow-md' : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-300 hover:shadow-sm'}`}>
                        {editingIdx === idx ? (
                          <div className="flex flex-col gap-3">
                            <div className="flex gap-3">
                              <input type="text" placeholder="영어 스펠링" value={editEn} onChange={e => setEditEn(e.target.value)} className="flex-1 p-3 border-none bg-white rounded-xl focus:ring-4 focus:ring-amber-500/20 outline-none font-bold text-slate-800 shadow-sm" />
                              <input type="text" placeholder="한글 뜻 (복수일 경우 쉼표로 표기)" value={editKr} onChange={e => setEditKr(e.target.value)} className="flex-1 p-3 border-none bg-white rounded-xl focus:ring-4 focus:ring-amber-500/20 outline-none font-bold text-slate-800 shadow-sm" />
                            </div>
                            <div className="flex justify-end gap-2 mt-2">
                              <button onClick={() => setEditingIdx(null)} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">취소</button>
                              <button onClick={() => saveEdit(idx)} className="px-5 py-2.5 text-sm font-black bg-amber-500 text-white rounded-xl shadow-md hover:bg-amber-600 hover:-translate-y-0.5 transition-all">수정 저장</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center sm:flex-row flex-col gap-4">
                            <div className="flex gap-4 items-center w-full">
                              <span className="w-10 h-10 shrink-0 rounded-full bg-slate-800 text-white font-black flex items-center justify-center text-sm shadow-sm">{idx + 1}</span>
                              <span className={`text-xs font-black px-3 py-1.5 rounded-lg w-24 text-center shrink-0 ${q.type === 'en' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{hint}</span>
                              <span className="font-black text-lg w-1/3 truncate text-slate-800">{prompt}</span>
                              <span className="text-slate-300 font-bold shrink-0">→</span>
                              <span className="font-mono font-black text-emerald-600 flex-1 truncate">{correct}</span>
                            </div>
                            <button onClick={() => startEdit(idx)} className="sm:ml-4 sm:w-auto w-full px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-50 hover:text-slate-800 focus:ring-4 focus:ring-slate-100 transition-all shadow-sm shrink-0">
                              ✏️ 편집
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <hr className="my-4 border-slate-200" />
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={handleSaveToDB}
                    disabled={isSaving}
                    className="flex-1 py-5 bg-emerald-600 text-white text-lg font-black rounded-2xl hover:bg-emerald-700 transition-all shadow-xl disabled:opacity-50 hover:-translate-y-1"
                  >
                    {isSaving ? '저장 중...' : selectedSessionId === 'new' ? '이 문제지로 배포 (대기 중 상태로 저장)' : '문제 변경사항 데이터베이스에 저장'}
                  </button>
                  {selectedSessionId !== 'new' && (
                    <button 
                      onClick={handleStartExamDirectly}
                      disabled={isSaving}
                      className="flex-1 py-5 bg-blue-600 text-white text-lg font-black rounded-2xl hover:bg-blue-700 transition-all shadow-xl disabled:opacity-50 hover:-translate-y-1"
                    >
                       🚀 모니터링 메뉴로 이동하여 시험 즉시 개시
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
