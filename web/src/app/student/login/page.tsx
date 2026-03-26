'use client';

// Debug alert removed as loading confirmed

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function StudentLogin() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [studentNumber, setStudentNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    (window as any).isReactHydrated = true;
    
    if (typeof window !== 'undefined') {
      const storedId = localStorage.getItem('popquiz_student_id');
      const storedNum = localStorage.getItem('popquiz_student_number');
      if (storedId && storedNum) {
        setIsLoggedIn(true);
        fetchActiveSessions(storedNum);
      }
    }
  }, []);


  const fetchActiveSessions = async (snumStr: string) => {
    console.log('[Debug] Fetching active sessions for:', snumStr);
    const grade = snumStr.substring(0, 1);
    const cls = parseInt(snumStr.substring(1, 3)).toString();
    const targetStr = `${grade}학년 ${cls}반`;
    console.log('[Debug] target_class:', targetStr);
    
    const { data, error } = await supabase.from('exam_sessions')
      .select('*')
      .in('status', ['waiting', 'active'])
      .eq('target_class', targetStr)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('[Debug] fetchActiveSessions error:', error);
    }
    if (data) {
      console.log('[Debug] activeSessions found:', data.length);
      setActiveSessions(data);
    }
    return data;
  };

  const handleLogin = async () => {
    console.log('[Debug] handleLogin initiated');
    if (!name.trim() || !studentNumber.trim()) {
      return alert('이름과 학번을 모두 입력해주세요.');
    }

    if (!/^\d{5}$/.test(studentNumber)) {
      return alert('학번은 5자리 숫자로 입력해야 합니다. (예: 30112)');
    }

    setIsLoading(true);
    console.log('[Debug] Attempting login for:', { name, studentNumber });
    try {
      const { data: existingUser, error: fetchError } = await supabase.from('popquiz_users')
        .select('*')
        .eq('student_number', studentNumber)
        .eq('role', 'student')
        .maybeSingle();
      
      if (fetchError) {
        console.error('[Debug] fetch existingUser error:', fetchError);
        throw fetchError;
      }
        
      let user = existingUser;
      
      if (!existingUser) {
        console.log('[Debug] Creating new user');
        const { data: newUser, error: insertError } = await supabase.from('popquiz_users')
          .insert({ name, student_number: studentNumber, role: 'student' })
          .select()
          .single();
        if (insertError) {
          console.error('[Debug] insert newUser error:', insertError);
          throw insertError;
        }
        user = newUser;
      } else if (existingUser.name !== name) {
        console.log('[Debug] Updating user name');
        const { data: updatedUser, error: updateError } = await supabase.from('popquiz_users')
          .update({ name })
          .eq('id', existingUser.id)
          .select()
          .single();
        if (updateError) {
          console.error('[Debug] update user error:', updateError);
          throw updateError;
        }
        user = updatedUser;
      }
      
      console.log('[Debug] User identify OK:', user.id);
      localStorage.setItem('popquiz_student_id', user.id);
      localStorage.setItem('popquiz_student_name', user.name);
      localStorage.setItem('popquiz_student_number', user.student_number);
      setIsLoggedIn(true);
      
      const sessions = await fetchActiveSessions(user.student_number);
      if (sessions && sessions.length === 1) {
        console.log('[Debug] Auto-redirecting to session:', sessions[0].id);
        router.push(`/student/waiting/${sessions[0].id}`);
      } else {
        console.log('[Debug] Logged in, showing session list');
      }
    } catch (err: any) {
      console.error('[Debug] handleLogin catch error:', err);
      alert('로그인 오류: ' + (err.message || '알 수 없는 오류'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinSession = (sessionId: string) => {
    router.push(`/student/waiting/${sessionId}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('popquiz_student_id');
    localStorage.removeItem('popquiz_student_name');
    localStorage.removeItem('popquiz_student_number');
    setIsLoggedIn(false);
    setActiveSessions([]);
    setName('');
    setStudentNumber('');
  };

  // Removing the !mounted blocker as it might be hanging hydration on some mobile browsers
  // instead we will just render and let React hydrate over it.


  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      
      {/* Silent Fallback for Mobile Hydration Hangs */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
          (function() {
            const SUPABASE_URL = "${process.env.NEXT_PUBLIC_SUPABASE_URL}";
            const SUPABASE_KEY = "${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}";
            
            document.addEventListener('click', async function(e) {
              const btn = e.target.closest('#login-submit-btn');
              if (btn) {
                // If React is already handling it, do nothing extra
                if (window.isReactHydrated) return;
                
                // Silent Fallback Mode
                e.preventDefault();
                e.stopPropagation();
                
                const name = document.getElementById('login-name-input').value;
                const snum = document.getElementById('login-number-input').value;
                
                if (!name || !snum || snum.length !== 5) {
                   alert('이름과 학번(5자리)을 올바르게 입력해주세요.');
                   return;
                }
                
                try {
                  btn.innerText = '확인 중...';
                  btn.disabled = true;

                  const resp = await fetch(SUPABASE_URL + "/rest/v1/popquiz_users?student_number=eq." + snum + "&role=eq.student", {
                    headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
                  });
                  const users = await resp.json();
                  let user = users[0];
                  
                  if (!user) {
                    const insResp = await fetch(SUPABASE_URL + "/rest/v1/popquiz_users", {
                      method: "POST",
                      headers: { 
                        "apikey": SUPABASE_KEY, 
                        "Authorization": "Bearer " + SUPABASE_KEY, 
                        "Content-Type": "application/json",
                        "Prefer": "return=representation"
                      },
                      body: JSON.stringify({ name: name, student_number: snum, role: "student" })
                    });
                    const newUsers = await insResp.json();
                    user = newUsers[0];
                  }
                  
                  localStorage.setItem('popquiz_student_id', user.id);
                  localStorage.setItem('popquiz_student_name', user.name);
                  localStorage.setItem('popquiz_student_number', user.student_number);
                  
                  // Auto redirect logic
                  const targetClass = encodeURIComponent(snum[0] + "학년 " + parseInt(snum.substring(1,3)) + "반");
                  const sessResp = await fetch(SUPABASE_URL + "/rest/v1/exam_sessions?status=in.(waiting,active)&target_class=eq." + targetClass, {
                    headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY }
                  });
                  const sessions = await sessResp.json();
                  
                  if (sessions && sessions.length === 1) {
                    window.location.href = "/student/waiting/" + sessions[0].id;
                  } else {
                    // Since React is likely broken if we reached here, manually update the DOM 
                    // so the user knows they logged in successfully, instead of reloading and blanking out the form.
                    const formContainer = document.querySelector('.bg-white.shadow-xl.p-8');
                    if (formContainer) {
                      formContainer.innerHTML = '<h2 class="text-xl font-bold text-center mb-4">로그인 성공! (' + user.name + ')</h2><p class="text-center text-slate-500 font-medium">하지만 현재 선생님이 배정한 입장 가능한 시험이 없습니다.<br/><br/>시험이 개설된 후 아래 새로고침 버튼을 눌러주세요.</p><button onclick="window.location.reload()" class="w-full mt-6 py-4 bg-blue-600 text-white font-bold rounded-xl active:scale-95 transition-transform">새로고침</button>';
                    } else {
                      alert('로그인 성공! 하지만 현재 입장 가능한 시험이 없습니다. 잠시 후 새로고침 해주세요.');
                    }
                  }

                } catch (err) {
                  alert('입장 실패: 네트워크 상태를 확인해주세요. (' + err.message + ')');
                  btn.innerText = '입장하기';
                  btn.disabled = false;
                }
              }
            }, true); // Use capture phase
          })();
          `
        }}
      />

      <div className="w-full max-w-sm z-50">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
            Pop Quiz English
          </h1>
          <p className="text-slate-600 font-bold">학생용 단어 평가 시스템</p>
        </div>

        {!isLoggedIn ? (
          <div className="bg-white shadow-xl p-8 rounded-2xl flex flex-col justify-center border-t-4 border-blue-600">
            <h2 className="text-xl font-bold text-slate-800 mb-6 text-center">
              시험장에 입장하기
            </h2>
            <div className="flex flex-col gap-5">
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2 ml-1">이름</label>
                <input 
                  id="login-name-input"
                  type="text" 
                  placeholder="예: 홍길동"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl p-4 text-slate-800 outline-none transition-all placeholder:text-slate-400 font-medium font-sans"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2 ml-1">학번 (5자리 숫자)</label>
                <input 
                  id="login-number-input"
                  type="text" 
                  placeholder="예: 30101 (3학년 1반 1번)"
                  value={studentNumber}
                  onChange={e => setStudentNumber(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl p-4 text-slate-800 outline-none transition-all placeholder:text-slate-400 font-medium font-mono tracking-widest"
                />
              </div>
              <button 
                id="login-submit-btn"
                onClick={handleLogin}
                disabled={isLoading}
                className="relative z-[60] w-full mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black py-4 rounded-xl transition-all shadow-lg active:scale-95 touch-manipulation"
              >
                {isLoading ? '확인 중...' : '입장하기'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white/90 backdrop-blur-xl border border-white/40 shadow-2xl p-8 rounded-3xl flex flex-col animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span>📋</span> 입장 가능한 시험
              </h2>
              <button onClick={handleLogout} className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors">
                로그아웃
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 max-h-[400px]">
              {activeSessions.length > 0 ? activeSessions.map(session => (
                <div key={session.id} className="p-5 border border-slate-200 bg-white rounded-2xl hover:border-blue-400 hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-blue-900 truncate pr-4">{session.title}</h3>
                    <span className={`text-xs px-3 py-1 rounded-full font-bold whitespace-nowrap ${session.status === 'active' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                      {session.status === 'active' ? '진행 중' : '대기실 개방'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 mb-4 font-medium flex justify-between">
                    <span>대상: {session.target_class}</span>
                    <span>시간: {session.total_duration_minutes}분</span>
                  </div>
                  <button 
                    onClick={() => handleJoinSession(session.id)}
                    className="w-full py-3 bg-blue-50 text-blue-700 font-bold rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors"
                  >
                    시험 방 확인 및 입장
                  </button>
                </div>
              )) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center gap-3 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 p-8">
                  <span className="text-4xl">😴</span>
                  <p className="font-semibold">현재 선생님이 배정한<br />입장 가능한 시험이 없습니다.</p>
                  <p className="text-xs text-slate-400 mt-2">새로고침을 눌러 확인해보세요.</p>
                  <button onClick={() => fetchActiveSessions(localStorage.getItem('popquiz_student_number') || '')} className="mt-2 text-blue-500 text-sm font-bold hover:underline">새로고침</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
