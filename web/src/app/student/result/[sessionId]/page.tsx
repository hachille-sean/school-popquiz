'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useParams } from 'next/navigation';

export default function StudentResult() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [sessionData, setSessionData] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);

  useEffect(() => {
    
    const sId = localStorage.getItem('popquiz_student_id');
    if (!sId) {
      router.push('/student/login');
      return;
    }
    
    fetchData(sId);

    // Subscribe to realtime changes on exam_sessions
    const sessionChannel = supabase.channel(`result_session_${sessionId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'exam_sessions', filter: `id=eq.${sessionId}` }, (payload) => {
        const updated = payload.new as any;
        setSessionData(updated);
        if (updated.status === 'finished') {
          fetchData(sId);
        }
      })
      .subscribe();

    // Subscribe to submission changes (e.g. deletion for re-take)
    const subChannel = supabase.channel(`result_sub_${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_submissions', filter: `session_id=eq.${sessionId}` }, () => {
        fetchData(sId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(subChannel);
    };
  }, [sessionId, router]);

  async function fetchData(studentId: string) {
    // Fetch session
    const { data: session } = await supabase.from('exam_sessions').select('*').eq('id', sessionId).maybeSingle();
    if (session) setSessionData(session);

    // Fetch submission
    const { data: sub } = await supabase.from('exam_submissions').select('*').eq('session_id', sessionId).eq('student_id', studentId).maybeSingle();
    setSubmission(sub);

    // AUTO-REDIRECT: If session is active but submission is missing, it means teacher allowed a re-take or student never started.
    if (session?.status === 'active' && !sub) {
       router.push(`/student/exam/${sessionId}`);
    }
  }

  // Removed the blocker to prevent mobile hang
  // if (!sessionData || !submission) return ...;

  // If NOT finished, show waiting room
  if (sessionData?.status !== 'finished') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex flex-col items-center justify-center p-8 font-sans">
        <div className="text-center max-w-2xl bg-white/70 backdrop-blur-xl border border-white/40 shadow-2xl p-12 rounded-[3rem]">
          <div className="inline-block p-6 rounded-3xl bg-emerald-100 text-emerald-600 mb-8 animate-bounce text-6xl shadow-sm border border-emerald-200">
            ✉️
          </div>
          <h1 className="text-3xl font-black mb-4 text-slate-800">답안 제출 완료!</h1>
          <p className="text-slate-500 font-medium text-lg leading-relaxed mb-6">
            모든 학생이 시험을 완료하거나<br/>선생님이 시험을 종료할 때까지 대기해주세요.
          </p>
          <div className="inline-block px-4 py-2 bg-slate-100 rounded-full text-slate-400 text-sm font-bold flex items-center gap-2 mx-auto w-fit">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            실시간 동기화 중...
          </div>
        </div>
      </div>
    );
  }

  // If FINISHED, show results
  const maxScore = submission?.answers?.length || 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans pb-24 relative overflow-hidden">
      
      {/* Silent Fallback for Mobile Hydration Hangs */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
          (function() {
            const SUPABASE_URL = "${process.env.NEXT_PUBLIC_SUPABASE_URL}";
            const SUPABASE_KEY = "${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}";
            const sessionId = window.location.pathname.split('/').pop();
            const studentId = localStorage.getItem('popquiz_student_id');
            
            async function fallbackFetch() {
              if (window.isReactHydrated) return;
              
              try {
                // 1. Fetch Session
                const sResp = await fetch(SUPABASE_URL + "/rest/v1/exam_sessions?id=eq." + sessionId, {
                  headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
                });
                const sData = await sResp.json();
                if (sData && sData[0]) {
                  const s = sData[0];
                  // Update Title
                  const h1 = document.querySelector('h1');
                  if (h1) h1.innerText = s.title + " 최종 결과";
                }

                // 2. Fetch Submission
                const subResp = await fetch(SUPABASE_URL + "/rest/v1/exam_submissions?session_id=eq." + sessionId + "&student_id=eq." + studentId, {
                  headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
                });
                const subData = await subResp.json();
                
                // AUTO-REDIRECT in Fallback
                if (sData[0]?.status === 'active' && (!subData || subData.length === 0)) {
                  window.location.href = "/student/exam/" + sessionId;
                  return;
                }

                if (subData && subData[0]) {
                  const sub = subData[0];
                  // Update Score
                  const scoreEl = document.querySelector('.text-6xl.font-black.text-blue-600');
                  if (scoreEl && sub.answers) scoreEl.innerHTML = sub.total_score + ' <span class="text-3xl text-slate-300">/ ' + sub.answers.length + '</span>';

                  // 3. Render Detail List
                  const listContainer = document.querySelector('.grid.grid-cols-1.gap-4:last-of-type');
                  if (listContainer && sub.answers) {
                    // Keep the header h2
                    const h2 = listContainer.querySelector('h2');
                    listContainer.innerHTML = '';
                    if (h2) listContainer.appendChild(h2);
                    
                    sub.answers.forEach((ans, idx) => {
                      const q = ans.question;
                      let qText = q.type === 'en' ? q.word.kr : (q.type === 'kr' ? q.word.en : \`\${q.word.en} (\${q.word.kr})\`);
                      let correctAns = q.type === 'en' ? q.word.en : (q.type === 'kr' ? q.word.kr : q.word.ext);
                      
                      const div = document.createElement('div');
                      div.className = "p-6 rounded-3xl border shadow-sm " + (ans.is_correct ? "bg-white border-emerald-200" : "bg-red-50/50 border-red-200");
                      div.innerHTML = \`
                        <div class="flex justify-between items-start mb-4">
                          <h3 class="font-bold text-lg flex items-center gap-3">
                            <span class="text-slate-400 bg-slate-100 w-8 h-8 flex items-center justify-center rounded-full text-sm">\${idx + 1}</span>
                            \${qText}
                          </h3>
                          <span class="px-4 py-1 rounded-full text-xs font-black \${ans.is_correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}">
                            \${ans.is_correct ? '정답' : '오답'}
                          </span>
                        </div>
                        <div class="grid grid-cols-1 gap-4">
                          <div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                             <span class="block text-xs text-slate-400 font-bold mb-1">내가 적은 답</span>
                             <span class="font-mono font-medium text-lg">\${ans.submitted_answer || '미입력'}</span>
                          </div>
                          <div class="bg-blue-50/30 p-4 rounded-xl border border-blue-100">
                             <span class="block text-xs text-blue-400 font-bold mb-1">정답</span>
                             <span class="font-mono font-bold text-blue-700 text-lg">\${correctAns}</span>
                          </div>
                        </div>
                      \`;
                      listContainer.appendChild(div);
                    });
                  }
                }
              } catch (e) { console.error(e); }
            }
            
            setInterval(fallbackFetch, 5000);
            fallbackFetch();
          })();
          `
        }}
      />
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        
        <header className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
          <h1 className="text-3xl font-black mb-2">{sessionData?.title || '시험 정보 로딩 중...'} 최종 결과</h1>
          
          <div className="mt-8">
            <span className="text-slate-500 font-medium text-lg">내 점수</span>
            <div className="text-6xl font-black text-blue-600 mt-2">
              {submission?.total_score ?? '-'} <span className="text-3xl text-slate-300">/ {maxScore || '-'}</span>
            </div>
          </div>
          
          {submission?.is_cheated && (
            <div className="mt-6 inline-block bg-red-50 text-red-600 px-6 py-3 rounded-2xl font-bold border border-red-200">
              🚨 화면 이탈(부정행위)로 인해 강제 제출된 답안입니다.
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 gap-4">
          <h2 className="text-xl font-bold px-2">문항별 상세 확인</h2>
          {submission?.answers?.map((ans: any, idx: number) => {
            let qText = '';
            if (ans.question.type === 'en') qText = ans.question.word.kr;
            if (ans.question.type === 'kr') qText = ans.question.word.en;
            if (ans.question.type === 'ext') qText = `${ans.question.word.en} (${ans.question.word.kr}) - 확장 표현`;

            return (
              <div key={idx} className={`p-6 rounded-3xl border ${ans.is_correct ? 'bg-white border-emerald-200' : 'bg-red-50/50 border-red-200'} shadow-sm`}>
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-lg flex items-center gap-3">
                    <span className="text-slate-400 bg-slate-100 w-8 h-8 flex items-center justify-center rounded-full text-sm">{idx + 1}</span>
                    {qText}
                  </h3>
                  <span className={`px-4 py-1 rounded-full text-xs font-black ${ans.is_correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    {ans.is_correct ? '정답' : '오답'}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <span className="block text-xs text-slate-400 font-bold mb-1">내가 적은 답</span>
                    <span className="font-mono font-medium text-lg">{ans.submitted_answer || <span className="text-slate-300 italic">미입력</span>}</span>
                  </div>
                  <div className="bg-blue-50/30 p-4 rounded-xl border border-blue-100">
                    <span className="block text-xs text-blue-400 font-bold mb-1">정답</span>
                    <span className="font-mono font-bold text-blue-700 text-lg">
                      {ans.question.type === 'en' && ans.question.word.en}
                      {ans.question.type === 'kr' && ans.question.word.kr}
                      {ans.question.type === 'ext' && ans.question.word.ext}
                    </span>
                  </div>
                </div>

                {ans.partial_score > 0 && (
                  <div className="mt-4 bg-purple-50 p-4 rounded-xl flex justify-between items-center border border-purple-100">
                    <span className="text-purple-700 font-bold">💎 부분 점수 인정 (+{ans.partial_score}점)</span>
                    <span className="text-purple-500 font-medium text-sm">사유: {ans.reason}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        <div className="text-center mt-8">
          <button onClick={() => router.push('/student/login')} className="px-8 py-4 bg-slate-200 text-slate-700 font-bold rounded-2xl hover:bg-slate-300 transition-colors">
            로그아웃 및 대문으로
          </button>
        </div>

      </div>
    </div>
  );
}
