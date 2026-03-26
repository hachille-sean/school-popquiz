'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useParams } from 'next/navigation';

export default function ActiveExam() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const [sessionData, setSessionData] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const hasCheatedRef = useRef(false);
  const isManualSubmittingRef = useRef(false);

  // Focus lock and Fullscreen tracking
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && !hasCheatedRef.current && !isSubmittingRef.current) {
        handleCheatDetected();
      }
    };

    const handleBlur = () => {
      // Ignore blur if we are actively submitting or if a confirm/alert is shown
      if (!hasCheatedRef.current && !isSubmittingRef.current && !isManualSubmittingRef.current) {
        handleCheatDetected();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    // Prompt fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn(`Fullscreen request failed: ${err.message}`);
      });
    }

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  useEffect(() => {
    // Basic setup logic
    const sId = localStorage.getItem('popquiz_student_id');
    if (!sId) {
      router.push('/student/login');
      return;
    }
    
    initializeExam();

    // Listen for session status changes (e.g. force end by teacher)
    const channel = supabase.channel(`session_monitoring_${sessionId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'exam_sessions',
        filter: `id=eq.${sessionId}` 
      }, (payload) => {
        if (payload.new.status === 'finished') {
          alert('시험이 관리자에 의해 종료되었습니다. 작성 중이던 답안이 자동 제출됩니다.');
          autoSubmit(false);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Timer logic
  useEffect(() => {
    if (timeLeft === null || isSubmitting) return;

    if (timeLeft <= 0) {
      autoSubmit(false); // Time out
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isSubmitting]);

  const handleCheatDetected = () => {
    if (hasCheatedRef.current || isSubmittingRef.current) return;
    hasCheatedRef.current = true;
    alert('[부정행위 감지] 화면 이탈이 감지되어 원격으로 시험이 강제 종료/제출 처리됩니다.');
    autoSubmit(true);
  };

  async function initializeExam() {
    // 1. Fetch Session
    const { data: session } = await supabase.from('exam_sessions').select('*, word_pools(words)').eq('id', sessionId).single();
    if (!session) return alert('유효하지 않은 시험입니다.');
    if (session.status === 'finished') {
      alert('이미 종료된 시험입니다.');
      return router.push(`/student/result/${sessionId}`);
    }
    setSessionData(session);
    
    // Resume Time Logic
    const savedTime = localStorage.getItem(`popquiz_time_${sessionId}`);
    if (savedTime !== null) {
      setTimeLeft(parseInt(savedTime, 10));
    } else {
      setTimeLeft(session.total_duration_minutes * 60);
    }

    // 2. Fetch or Create Template
    let { data: templates } = await supabase.from('exam_templates').select('*').eq('session_id', sessionId).eq('is_retake', false);
    
    if (!templates || templates.length === 0) {
      // Create new template logic
      const poolWords = session.word_pools.words;
      // Shuffle pool
      const shuffled = [...poolWords].sort(() => 0.5 - Math.random());
      
      let generated: any[] = [];
      let idx = 0;
      
      // Pick EN (Spelling)
      for (let i = 0; i < session.q_en_count && idx < shuffled.length; i++) {
        generated.push({ id: `q_${Date.now()}_${idx}`, type: 'en', word: shuffled[idx] });
        idx++;
      }
      // Pick KR (Meaning)
      for (let i = 0; i < session.q_kr_count && idx < shuffled.length; i++) {
        generated.push({ id: `q_${Date.now()}_${idx}`, type: 'kr', word: shuffled[idx] });
        idx++;
      }
      
      // Shuffle final questions again so types are mixed
      generated = generated.sort(() => 0.5 - Math.random());

      const { data: newTpl } = await supabase.from('exam_templates').insert({
        session_id: sessionId,
        is_retake: false,
        questions: generated
      }).select();

      if (newTpl && newTpl.length > 0) {
        setQuestions(newTpl[0].questions);
      } else {
        // Fallback if someone else just inserted
        const { data: tpls } = await supabase.from('exam_templates').select('*').eq('session_id', sessionId).eq('is_retake', false);
        setQuestions(tpls?.[0]?.questions || []);
      }
    } else {
      setQuestions(templates[0].questions);
    }
  }

  const handleAnswerChange = (index: number, val: string) => {
    setAnswers(prev => ({ ...prev, [index]: val }));
  };

  const autoSubmit = async (cheated = false) => {
    setIsSubmitting(true);
    isSubmittingRef.current = true;
    hasCheatedRef.current = cheated;
    
    // Save remaining time to allow resuming
    localStorage.setItem(`popquiz_time_${sessionId}`, (timeLeft || 0).toString());
    
    try {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(()=>{});
      }
    } catch(e) {}

    const sId = localStorage.getItem('popquiz_student_id');
    
    // Auto grader
    let score = 0;
    const finalAnswers = questions.map((q, idx) => {
      const submitted_answer = (answers[idx] || '').trim().toLowerCase();
      let is_correct = false;
      
      if (q.type === 'en') {
        const fullWord = q.word.en.toLowerCase();
        const withoutInitial = fullWord.slice(1);
        const subNoSpace = submitted_answer.replace(/\s+/g, '');
        is_correct = (subNoSpace === fullWord.replace(/\s+/g, '') || subNoSpace === withoutInitial.replace(/\s+/g, '')) && subNoSpace.length > 0;
      } else if (q.type === 'kr') {
        const correctMeanings = q.word.kr.split(',').map((m: string) => m.trim().replace(/\s+/g, ''));
        const exactSub = submitted_answer.replace(/\s+/g, '');
        is_correct = correctMeanings.some((m: string) => m === exactSub) && exactSub.length > 0;
      }
      
      if (is_correct) score += 0.5;
      return { question: q, submitted_answer, is_correct, partial_score: 0, reason: '' };
    });

    await supabase.from('exam_submissions').insert({
      session_id: sessionId,
      student_id: sId,
      is_retake: false,
      answers: finalAnswers,
      total_score: score,
      is_cheated: cheated
    });

    // Alert completion
    if (!cheated) {
      alert('답안이 정상적으로 제출되었습니다. 수고하셨습니다!');
    }

    router.replace(`/student/result/${sessionId}`);
  };

  const handleManualSubmit = () => {
    isManualSubmittingRef.current = true;
    if (confirm('답안을 제출하시겠습니까? 제출 후에는 수정할 수 없습니다.')) {
      autoSubmit(false);
    } else {
      isManualSubmittingRef.current = false;
    }
  };

  // Removed the blocker to prevent mobile hang
  // if (!sessionData || questions.length === 0) return ...;

  const minutes = Math.floor((timeLeft || 0) / 60);
  const seconds = (timeLeft || 0) % 60;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8 font-sans relative overflow-hidden">
      
      <script
        dangerouslySetInnerHTML={{
          __html: `
          (function() {
            const SUPABASE_URL = "${process.env.NEXT_PUBLIC_SUPABASE_URL}";
            const SUPABASE_KEY = "${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}";
            const sessionId = window.location.pathname.split('/').pop();
            const studentId = localStorage.getItem('popquiz_student_id');
            
            let fallbackQuestions = [];
            let fallbackTimeLeft = 0;
            
            async function fallbackInitialize() {
              if (window.isReactHydrated) return;
              
              try {
                const sResp = await fetch(SUPABASE_URL + "/rest/v1/exam_sessions?id=eq." + sessionId + "&select=*,word_pools(words)", {
                  headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
                });
                const sData = await sResp.json();
                if (!sData || !sData[0]) return;
                const session = sData[0];
                
                const h1 = document.querySelector('h1');
                if (h1) h1.innerText = session.title;
                fallbackTimeLeft = session.total_duration_minutes * 60;

                const tResp = await fetch(SUPABASE_URL + "/rest/v1/exam_templates?session_id=eq." + sessionId + "&is_retake=eq.false", {
                  headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
                });
                const tData = await tResp.json();
                if (tData && tData[0]) {
                  fallbackQuestions = tData[0].questions;
                  renderQuestions(fallbackQuestions);
                }
              } catch (e) { console.error(e); }
            }

            function renderQuestions(qs) {
              const container = document.getElementById('question-container');
              if (!container) return;
              container.innerHTML = qs.map((q, idx) => {
                let prompt = q.type === 'en' ? q.word.kr : q.word.en;
                let hint = q.type === 'en' ? '영어 스펠링 쓰기' : '우리말 뜻 쓰기';
                let initial = q.type === 'en' ? q.word.en.charAt(0).toUpperCase() : '';
                return \`
                  <div class="bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col gap-4 shadow-xl">
                    <div class="flex justify-between items-start">
                      <div class="flex items-center gap-4">
                        <span class="w-10 h-10 bg-slate-700 text-slate-300 font-black rounded-full flex items-center justify-center text-lg shrink-0">\${idx + 1}</span>
                        <h2 class="text-2xl font-bold">\${prompt}</h2>
                      </div>
                      <span class="text-xs px-3 py-1 bg-slate-700 text-slate-400 rounded-full font-bold">\${hint}</span>
                    </div>
                    <div class="relative flex items-center">
                      \${initial ? \`<span class="absolute left-5 text-2xl font-black text-blue-400">\${initial}</span>\` : ''}
                      <input id="answer-\${idx}" type="text" autocomplete="off" class="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-xl outline-none \${initial ? 'pl-10' : ''}" />
                    </div>
                  </div>
                \`;
              }).join('');
            }

            window.addEventListener('blur', function() {
              if (window.isReactHydrated) return;
              if (confirm('[부정행위 경고] 화면을 벗어나면 안 됩니다. 즉시 돌아오지 않으면 자동 제출됩니다.')) {
                 // Warning given
              }
            });
            
            setInterval(() => {
              if (window.isReactHydrated) return;
              if (fallbackTimeLeft > 0) {
                fallbackTimeLeft--;
                const min = Math.floor(fallbackTimeLeft / 60);
                const sec = fallbackTimeLeft % 60;
                const timerEl = document.querySelector('.text-3xl.font-mono') || document.querySelector('.font-mono');
                if (timerEl) timerEl.innerText = min + ":" + (sec < 10 ? '0' + sec : sec);
              } else {
                const btn = document.querySelector('#exam-submit-btn');
                if (btn && !btn.disabled) btn.click();
              }
            }, 1000);

            document.addEventListener('click', async function(e) {
              const btn = e.target.closest('#exam-submit-btn');
              if (btn && !window.isReactHydrated) {
                if (!confirm('답안을 제출하시겠습니까?')) return;
                btn.innerText = '제출 중...';
                btn.disabled = true;
                
                try {
                  let totalScore = 0;
                  const finalAnswers = fallbackQuestions.map((q, idx) => {
                    const input = document.getElementById('answer-' + idx);
                    const ans = (input ? input.value : '').trim().toLowerCase();
                    let correct = false;
                    
                    if (q.type === 'en') {
                      const fullWord = q.word.en.toLowerCase();
                      const withoutInitial = fullWord.slice(1);
                      const subNoSpace = ans.replace(/\\s+/g, '');
                      correct = (subNoSpace === fullWord.replace(/\\s+/g, '') || subNoSpace === withoutInitial.replace(/\\s+/g, '')) && subNoSpace.length > 0;
                    } else if (q.type === 'kr') {
                      const correctMeanings = q.word.kr.split(',').map(m => m.trim().replace(/\\s+/g, '').toLowerCase());
                      const exactSub = ans.replace(/\\s+/g, '');
                      correct = correctMeanings.some(m => m === exactSub) && exactSub.length > 0;
                    }
                    
                    if (correct) totalScore += 0.5;
                    return { question: q, submitted_answer: ans, is_correct: correct, partial_score: 0, reason: '' };
                  });

                  await fetch(SUPABASE_URL + "/rest/v1/exam_submissions", {
                    method: "POST",
                    headers: { 
                      "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, 
                      "Content-Type": "application/json" 
                    },
                    body: JSON.stringify({
                      session_id: sessionId, student_id: studentId,
                      is_retake: false, answers: finalAnswers,
                      total_score: totalScore, is_cheated: false
                    })
                  });
                  window.location.href = "/student/result/" + sessionId;
                } catch (err) {
                  alert('제출 실패: ' + err.message);
                  btn.innerText = '답안지 제출';
                  btn.disabled = false;
                }
              }
            }, true);

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = () => {
              if (window.isReactHydrated) return;
              const supabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
              
              const statusChannel = supabaseInstance.channel('status_monitoring_' + sessionId)
                .on('postgres_changes', { 
                  event: 'UPDATE', 
                  schema: 'public', 
                  table: 'exam_sessions',
                  filter: 'id=eq.' + sessionId 
                }, (payload) => {
                  if (window.isReactHydrated) return;
                  if (payload.new.status === 'finished') {
                    alert('시험이 관리자에 의해 종료되었습니다. 작성 중이던 답안이 자동 제출됩니다.');
                    const btn = document.querySelector('#exam-submit-btn');
                    if (btn && !btn.disabled) btn.click();
                  }
                })
                .subscribe();
            };
            document.head.appendChild(script);

            fallbackInitialize();
          })();
          `
        }}
      />

      <div className="max-w-4xl mx-auto flex flex-col h-full gap-6">
        
        {/* Top Header & Timer */}
        <header className="flex justify-between items-center bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-2xl sticky top-4 z-50">
          <div>
            <h1 className="text-xl md:text-2xl font-black">{sessionData?.title || '시험지 로딩 중...'}</h1>
            <p className="text-slate-400 font-medium text-xs mt-2 max-w-sm leading-relaxed">
              학번,이름,정답 쓰기 외 불필요한 조작 또는 다른 창이나 사이트, 앱으로 이동하면, 답안이 강제 제출 되고 종료되니 주의 바랍니다.
            </p>
          </div>
          <div className={`px-6 py-3 rounded-2xl font-mono text-2xl md:text-3xl font-black shrink-0 ${timeLeft && timeLeft < 60 ? 'bg-red-500/20 text-red-500 animate-pulse' : 'bg-blue-500/20 text-blue-400'}`}>
            {minutes}:{seconds.toString().padStart(2, '0')}
          </div>
        </header>

        {/* Questions List */}
        <div id="question-container" className="flex flex-col gap-6">
          {questions.map((q, idx) => {
            let promptText = '';
            let placeholder = '';
            let hint = '';
            let initialLetter = '';

            if (q.type === 'en') {
              promptText = q.word.kr;
              placeholder = '전체 단어를 쓰거나 이니셜 제외한 나머지 스펠링을 쓰시오';
              hint = '영어 스펠링 쓰기';
              initialLetter = q.word.en.charAt(0).toUpperCase();
            } else if (q.type === 'kr') {
              promptText = q.word.en;
              placeholder = '우리말 뜻을 쓰시오';
              hint = '우리말 뜻 쓰기';
            }
            
            return (
              <div key={q.id} className="bg-slate-800 p-6 md:p-8 rounded-3xl border border-slate-700 flex flex-col gap-4 shadow-xl">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <span className="w-10 h-10 bg-slate-700 text-slate-300 font-black rounded-full flex items-center justify-center text-lg shrink-0">{idx + 1}</span>
                    <h2 className="text-2xl font-bold break-keep">{promptText}</h2>
                  </div>
                  <span className="text-xs px-3 py-1 bg-slate-700 text-slate-400 rounded-full font-bold whitespace-nowrap">{hint}</span>
                </div>
                
                <div className="relative flex items-center">
                  {initialLetter && <span className="absolute left-5 text-2xl font-black text-blue-400 pointer-events-none">{initialLetter}</span>}
                  <input 
                    id={`answer-${idx}`}
                    type="text"
                    autoComplete="off"
                    value={answers[idx] || ''}
                    onChange={(e) => handleAnswerChange(idx, e.target.value)}
                    placeholder={placeholder}
                    className={`w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-xl p-4 text-xl outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium ${initialLetter ? 'pl-10' : ''}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
        
        <button 
          id="exam-submit-btn"
          onClick={handleManualSubmit}
          disabled={isSubmitting}
          className="w-full py-6 mt-4 bg-emerald-600 text-white text-xl font-black rounded-3xl hover:bg-emerald-700 transition-all shadow-xl disabled:opacity-50 active:scale-95"
        >
          {isSubmitting ? '제출 중...' : '답안지 제출'}
        </button>
      </div>
    </div>
  );
}
