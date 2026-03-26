'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function TeacherSettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.');
      setIsLoading(false);
      return;
    }

    try {
      // Verify current password first
      const { data, error: fetchError } = await supabase
        .from('popquiz_configs')
        .select('value')
        .eq('key', 'teacher_password')
        .single();

      if (fetchError || !data || data.value !== currentPassword) {
        setError('현재 비밀번호가 올바르지 않습니다.');
        setIsLoading(false);
        return;
      }

      // Update password
      const { error: updateError } = await supabase
        .from('popquiz_configs')
        .update({ value: newPassword })
        .eq('key', 'teacher_password');

      if (updateError) {
        setError('비밀번호 변경 중 오류가 발생했습니다: ' + updateError.message);
      } else {
        setSuccess('비밀번호가 성공적으로 변경되었습니다. 보안 유지를 위해 다시 로그인 해주세요.');
        // Optionally logout after password change
        setTimeout(() => {
          handleLogout();
        }, 2000);
      }
    } catch (err) {
      setError('비밀번호 변경 중 알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    document.cookie = "teacher_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    router.replace('/teacher/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-2xl mx-auto">
        <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
          <div className="flex items-center gap-4">
             <Link href="/teacher" className="text-slate-400 hover:text-purple-600 transition-colors text-2xl">←</Link>
             <h1 className="text-2xl font-black text-slate-800">선생님 관리 및 설정</h1>
          </div>
          <button onClick={handleLogout} className="px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all text-sm font-bold">로그아웃</button>
        </header>

        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
           <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-2xl">🔑</div>
              <div>
                <h3 className="text-xl font-bold">비밀번호 변경</h3>
                <p className="text-slate-400 text-sm font-medium">관리자 대시보드 접근용 마스터 비밀번호를 수정합니다.</p>
              </div>
           </div>

           <form onSubmit={handleUpdatePassword} className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                   <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">현재 비밀번호</label>
                   <input 
                      type="password" 
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="bg-slate-50 border border-slate-100 rounded-xl p-4 focus:border-blue-500 focus:outline-none transition-colors"
                      required
                   />
                </div>
                <div className="hidden md:block"></div>

                <div className="flex flex-col gap-2">
                   <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">새 비밀번호</label>
                   <input 
                      type="password" 
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="bg-slate-50 border border-slate-100 rounded-xl p-4 focus:border-blue-500 focus:outline-none transition-colors"
                      required
                   />
                </div>
                <div className="flex flex-col gap-2">
                   <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">비밀번호 확인</label>
                   <input 
                      type="password" 
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="bg-slate-50 border border-slate-100 rounded-xl p-4 focus:border-blue-500 focus:outline-none transition-colors"
                      required
                   />
                </div>
              </div>

              {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm font-bold border border-red-100">{error}</div>}
              {success && <div className="bg-emerald-50 text-emerald-600 p-4 rounded-xl text-sm font-bold border border-emerald-100">{success}</div>}

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full py-4 bg-slate-800 text-white rounded-xl text-lg font-black hover:bg-slate-900 active:scale-98 transition-all disabled:opacity-50 mt-4"
              >
                {isLoading ? '변경 중...' : '비밀번호 변경 적용'}
              </button>
           </form>
        </div>

        <div className="mt-8 bg-amber-50 rounded-2xl p-6 border border-amber-100 flex gap-4 items-start">
           <div className="text-2xl mt-1">💡</div>
           <div className="text-sm text-amber-800 font-medium leading-relaxed">
             <strong>보안 팁:</strong> 비밀번호는 영어, 숫자, 특수 기호를 섞어 8자 이상으로 만드시는 것을 권장합니다. 
             Vercel 서버 환경에서도 동일하게 작동하나, 데이터베이스 설정(SQL)을 먼저 실행해 주셨는지 꼭 확인해 주세요.
           </div>
        </div>
      </div>
    </div>
  );
}
