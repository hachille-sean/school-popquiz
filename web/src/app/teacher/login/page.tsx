'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function TeacherLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data, error: fetchError } = await supabase
        .from('popquiz_configs')
        .select('value')
        .eq('key', 'teacher_password')
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // Table or key probably doesn't exist yet
          setError('서버 설정이 완료되지 않았습니다. 관리자에게 문의하세요. (popquiz_configs 테이블 확인 필요)');
        } else {
          setError('로그인 중 오류가 발생했습니다: ' + fetchError.message);
        }
        setIsLoading(false);
        return;
      }

      if (data && data.value === password) {
        // Set auth cookie for middleware
        document.cookie = "teacher_auth=authenticated; path=/; max-age=86400; SameSite=Strict";
        router.push('/teacher');
      } else {
        setError('비밀번호가 올바르지 않습니다.');
      }
    } catch (err) {
      setError('로그인 중 알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-3xl p-8 md:p-12 shadow-2xl max-w-md w-full animate-in fade-in zoom-in duration-300">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-purple-100 text-purple-600 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6 shadow-sm">
            🔐
          </div>
          <h1 className="text-3xl font-black text-slate-800">교사 로그인</h1>
          <p className="text-slate-500 mt-2 font-medium italic">관리자 대시보드 접근을 위해 비밀번호를 입력하세요.</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-400 uppercase tracking-widest px-1">비밀번호</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-center text-xl font-bold tracking-widest focus:border-purple-500 focus:outline-none transition-colors"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold border border-red-100 animate-bounce">
              ⚠️ {error}
            </div>
          )}

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full py-5 bg-purple-600 text-white rounded-2xl text-lg font-black hover:bg-purple-700 active:scale-95 transition-all shadow-lg shadow-purple-600/20 disabled:opacity-50"
          >
            {isLoading ? '확인 중...' : '대시보드 입장'}
          </button>
        </form>

        <p className="text-center mt-10 text-slate-400 text-xs font-bold leading-relaxed">
          비밀번호 분실 시 데이터베이스(popquiz_configs)<br/> 설정을 통해 초기화해야 합니다.
        </p>
      </div>
    </div>
  );
}
