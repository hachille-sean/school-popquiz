'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useParams } from 'next/navigation';

export default function StudentWaitingRoom() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const [sessionData, setSessionData] = useState<any>(null);
  const [studentInfo, setStudentInfo] = useState<{name: string, number: string, id: string} | null>(null);
  const [presenceList, setPresenceList] = useState<any[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    
    // Basic Auth Check
    const sId = localStorage.getItem('popquiz_student_id');
    const sName = localStorage.getItem('popquiz_student_name');
    const sNum = localStorage.getItem('popquiz_student_number');
    
    if (!sId) {
      alert('로그인이 필요합니다.');
      router.push('/student/login');
      return;
    }

    setMounted(true);
    (window as any).isReactHydrated = true;
    
    setStudentInfo({ name: sName!, number: sNum!, id: sId });
    
    fetchSession();

    // Supabase Realtime for session status change
    const channel = supabase.channel(`waiting_room_${sessionId}`, {
      config: { presence: { key: sId } }
    });
    
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'exam_sessions', filter: `id=eq.${sessionId}` }, (payload) => {
        const updated = payload.new as any;
        setSessionData(updated);
        
        if (updated.status === 'active') {
          // The teacher started it! 
          router.push(`/student/exam/${sessionId}`);
        } else if (updated.status === 'finished') {
          // The teacher force-ended or natural end
          alert('시험이 이미 종료되었습니다. 결과 창으로 이동합니다.');
          router.push(`/student/result/${sessionId}`);
        }
      });
      
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const list = Object.values(state).flat();
      console.log('[Debug] Presence sync:', list);
      setPresenceList(list);
    });

    channel.on('presence', { event: 'join' }, ({ newPresences }) => {
      console.log('New student joined: ' + newPresences[0]?.name);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const presenceTrackStatus = await channel.track({
          name: sName!,
          student_number: sNum!,
          online_at: new Date().toISOString(),
        });
        console.log('[Debug] Presence track status:', presenceTrackStatus);
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, router]);

  async function fetchSession() {
    const { data } = await supabase.from('exam_sessions').select('*').eq('id', sessionId).single();
    if (data) {
      setSessionData(data);
      if (data.status === 'active') {
        router.push(`/student/exam/${sessionId}`);
      } else if (data.status === 'finished') {
        router.push(`/student/result/${sessionId}`);
      }
    }
  }

  // Removed the blocker to prevent mobile hang
  // if (!sessionData || !studentInfo) return ...;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-8 font-sans relative overflow-hidden">
      
      {/* Silent Fallback for Mobile Hydration Hangs */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
          (function() {
            const SUPABASE_URL = "${process.env.NEXT_PUBLIC_SUPABASE_URL}";
            const SUPABASE_KEY = "${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}";
            const sessionId = window.location.pathname.split('/').pop();
            const sId = localStorage.getItem('popquiz_student_id');
            const sName = localStorage.getItem('popquiz_student_name');
            const sNum = localStorage.getItem('popquiz_student_number');
            
            async function fallbackFetch() {
              if (window.isReactHydrated) return;
              
              try {
                const resp = await fetch(SUPABASE_URL + "/rest/v1/exam_sessions?id=eq." + sessionId, {
                  headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
                });
                const data = await resp.json();
                if (data && data[0]) {
                  const s = data[0];
                  const titleEl = document.querySelector('h2');
                  if (titleEl) titleEl.innerText = s.title;
                  
                  const durationEl = document.querySelector('.font-mono');
                  if (durationEl) durationEl.innerText = s.total_duration_minutes + '분';
                  
                  const targetEl = document.querySelectorAll('.text-xl.font-medium')[0];
                  if (targetEl) targetEl.innerText = s.target_class;
                  
                  const countEl = document.querySelector('.text-lg.font-medium');
                  if (countEl) countEl.innerText = "총 " + (s.q_en_count + s.q_kr_count + s.q_ext_count) + "문항";
                  
                  if (s.status === 'active') {
                    window.location.href = "/student/exam/" + sessionId;
                  }
                }
              } catch (e) {
                console.error('Fallback fetch error:', e);
              }
            }
            
            // Poll every 3 seconds if not mounted
            setInterval(fallbackFetch, 3000);
            fallbackFetch();

            // Setup Presence for fallback to appear on teacher's screen
            setTimeout(() => {
              if (window.isReactHydrated) return; // If React is working, let React handle Presence
              
              const script = document.createElement('script');
              script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
              script.onload = function() {
                const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                const channel = supabaseClient.channel('waiting_room_' + sessionId, {
                  config: { presence: { key: sId } }
                });

                channel.on('presence', { event: 'sync' }, () => {
                  const state = channel.presenceState();
                  const list = Object.values(state).flat();
                  
                  // Update UI
                  const countEl = document.getElementById('presence-count');
                  if (countEl) countEl.innerText = list.length;
                  
                  const listEl = document.getElementById('presence-list');
                  if (listEl) {
                    if (list.length === 0) {
                      listEl.innerHTML = '<span class="text-xs text-slate-500">대기 중...</span>';
                    } else {
                      listEl.innerHTML = list.map(p => \`<span class="text-xs px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg font-bold">\${p.student_number} \${p.name}</span>\`).join('');
                    }
                  }
                });

                channel.subscribe(async (status) => {
                  if (status === 'SUBSCRIBED') {
                    await channel.track({
                      name: sName,
                      student_number: sNum,
                      online_at: new Date().toISOString()
                    });
                  }
                });
              };
              document.head.appendChild(script);
            }, 500); // Small delay to let React mount first if it can
          })();
          `
        }}
      />

      <div className="absolute top-8 left-8 bg-slate-800 px-6 py-3 rounded-full text-slate-300 font-medium">
        학생: <span className="text-white font-bold">{studentInfo?.number} {studentInfo?.name}</span>
      </div>
      
      <div className="text-center max-w-2xl w-full">
        <div className="inline-block p-6 rounded-3xl bg-blue-500/20 text-blue-400 mb-8 animate-pulse text-6xl">
          ⏳
        </div>
        
        <h1 className="text-4xl md:text-5xl font-black mb-6 leading-tight">
          시험 개시를 <br/><span className="text-blue-400">대기하고 있습니다</span>
        </h1>
        
        <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 mx-auto max-w-lg shadow-2xl">
          <h2 className="text-2xl font-bold text-white mb-4">{sessionData?.title || '로딩 중...'}</h2>
          
          {/* Presence List Section */}
          <div className="mb-6 p-4 bg-slate-900/50 rounded-2xl border border-slate-700/50">
            <h3 className="text-sm font-black text-blue-400 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              입장한 학생 명단 (<span id="presence-count">{presenceList.length}</span>명)
            </h3>
            <div id="presence-list" className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-1">
              {presenceList.length === 0 ? (
                <span className="text-xs text-slate-500">대기 중...</span>
              ) : (
                presenceList.map((p, i) => (
                  <span key={i} className="text-xs px-3 py-1.5 bg-slate-700 text-slate-200 rounded-lg font-bold">
                    {p.student_number} {p.name}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-left">
            <div className="bg-slate-700/50 p-4 rounded-2xl">
              <span className="block text-slate-400 text-sm font-bold mb-1">시험 시간</span>
              <span className="text-xl font-mono text-white">{sessionData?.total_duration_minutes || '-'}분</span>
            </div>
            <div className="bg-slate-700/50 p-4 rounded-2xl">
              <span className="block text-slate-400 text-sm font-bold mb-1">대상 반</span>
              <span className="text-xl font-medium text-white">{sessionData?.target_class || '-'}</span>
            </div>
            <div className="col-span-2 bg-slate-700/50 p-4 rounded-2xl">
              <span className="block text-slate-400 text-sm font-bold mb-1">출제 문항 수</span>
              <span className="text-lg font-medium text-white">
                총 {(sessionData?.q_en_count || 0) + (sessionData?.q_kr_count || 0) + (sessionData?.q_ext_count || 0)}문항
              </span>
            </div>
          </div>
        </div>

        <p className="mt-12 text-slate-400 font-medium text-lg">
          선생님이 시작 버튼을 누르면 자동으로 앱 화면이 전환됩니다.<br />
          절대 탭을 이탈하거나 앱을 종료하지 마세요.
        </p>
      </div>
    </div>
  );
}
