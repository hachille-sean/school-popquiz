'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function HistoricalResults() {
  const [activeTab, setActiveTab] = useState<'session' | 'class' | 'student'>('session');
  
  const [sessions, setSessions] = useState<any[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);

  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedStudentNum, setSelectedStudentNum] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('');

  useEffect(() => {
    fetchSessions();
    fetchAllSubmissions();
  }, []);

  async function fetchSessions() {
    const { data } = await supabase.from('exam_sessions').select('*').order('created_at', { ascending: false });
    if (data) setSessions(data);
  }

  async function fetchAllSubmissions() {
    const { data } = await supabase.from('exam_submissions')
      .select('*, popquiz_users(name, student_number), exam_sessions(title, target_class, created_at, status)')
      .order('submitted_at', { ascending: false });
    if (data) setAllSubmissions(data);
  }

  async function handleSelectSession(session: any) {
    setSelectedSession(session);
    setActiveTab('session');
    const { data } = await supabase.from('exam_submissions')
      .select('*, popquiz_users(name, student_number)')
      .eq('session_id', session.id)
      .order('total_score', { ascending: false });
    if (data) setSubmissions(data);
  }

  const handleUpdatePartialScore = async (subId: string, answerIdx: number, partialScore: string, reason: string) => {
    const sub = submissions.find(s => s.id === subId);
    if (!sub) return;

    const newAnswers = [...sub.answers];
    const prevPartial = newAnswers[answerIdx].partial_score || 0;
    const newPartial = parseFloat(partialScore) || 0;
    
    newAnswers[answerIdx] = {
      ...newAnswers[answerIdx],
      partial_score: newPartial,
      reason: reason || ''
    };

    const diff = newPartial - prevPartial;
    const newTotal = (parseFloat(sub.total_score) || 0) + diff;

    const { error } = await supabase.from('exam_submissions').update({ answers: newAnswers, total_score: newTotal }).eq('id', subId);

    if (error) {
      alert('부분 점수 업데이트 실패: ' + error.message);
    } else {
      alert('부분 점수가 반영되었습니다.');
      handleSelectSession(selectedSession);
      fetchAllSubmissions(); // Also update global pool
    }
  };

  const handleAllowResume = async (subId: string, studentName: string) => {
    if (!confirm(`${studentName} 학생의 제출(응시 기록)을 완전히 삭제하고 이어서 시험을 볼 수 있게 다시 개방하시겠습니까?`)) return;
    
    const { error } = await supabase.from('exam_submissions').delete().eq('id', subId);
    if (error) {
      alert('기록 삭제 실패: ' + error.message);
    } else {
      alert('응시 기록이 삭제되어 학생이 다시 로그인하면 이어서 풀 수 있습니다.');
      if (selectedSession) handleSelectSession(selectedSession);
      fetchAllSubmissions();
    }
  };

  // Derivations
  const classesList = Array.from(new Set(sessions.map(s => s.target_class)));
  
  const groupedSessions = sessions.reduce((acc: any, s: any) => {
    // Strip the class suffix like " (3학년1반)" or " (3학년 1반)"
    const baseTitle = s.title.replace(/\s*\(\d+학년\s*\d+반\)$/, '').trim();
    if (!acc[baseTitle]) acc[baseTitle] = [];
    acc[baseTitle].push(s);
    return acc;
  }, {});

  const studentsMap = allSubmissions.reduce((acc: any, sub: any) => {
    const snum = sub.popquiz_users?.student_number;
    if (!snum) return acc;
    if (!acc[snum]) {
       acc[snum] = {
         name: sub.popquiz_users.name,
         student_number: snum,
         submissions: []
       };
    }
    acc[snum].submissions.push(sub);
    return acc;
  }, {});

  function getStudentClass(snum: string) {
    if (!snum || snum.length !== 5) return '기타/미지정';
    const grade = snum.substring(0, 1);
    const cls = parseInt(snum.substring(1, 3), 10);
    return `${grade}학년 ${cls}반`;
  }

  const studentClasses = Array.from(new Set(Object.values(studentsMap).map((stu: any) => getStudentClass(String(stu.student_number))))).sort();

  const filteredStudents = Object.values(studentsMap).filter((stu: any) => {
    const matchesSearch = stu.name.includes(searchQuery) || String(stu.student_number).includes(searchQuery);
    const stuClass = getStudentClass(String(stu.student_number));
    const matchesClass = studentClassFilter === '' || stuClass === studentClassFilter;
    return matchesSearch && matchesClass;
  });
  
  const selectedStudentData: any = selectedStudentNum ? studentsMap[selectedStudentNum as keyof typeof studentsMap] : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans flex flex-col items-center">
      <div className="w-full max-w-7xl flex gap-6 flex-col">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100 gap-4">
          <h1 className="text-2xl font-black flex items-center gap-3">
            <Link href="/teacher" className="text-slate-400 hover:text-blue-600 transition-colors">←</Link>
            과거 시험 추적 및 채점 관리
          </h1>
          
          <div className="flex gap-2">
            <button onClick={() => { setActiveTab('session'); setSelectedSession(null); }} className={`px-5 py-3 rounded-xl font-bold transition-all shadow-sm ${activeTab === 'session' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>📚 시험 회차별 보기</button>
            <button onClick={() => { setActiveTab('class'); setSelectedClass(null); }} className={`px-5 py-3 rounded-xl font-bold transition-all shadow-sm ${activeTab === 'class' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>🏫 학급(반)별 보기</button>
            <button onClick={() => { setActiveTab('student'); setSelectedStudentNum(null); }} className={`px-5 py-3 rounded-xl font-bold transition-all shadow-sm ${activeTab === 'student' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>🧑‍🎓 개별 학생별 추적</button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* LEFT SIDEBAR */}
          <div className="lg:col-span-1 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col max-h-[800px] overflow-hidden">
            {activeTab === 'session' && (
              <>
                <h3 className="font-black text-slate-800 mb-4 px-2 tracking-tight">모든 시험 목록</h3>
                <div className="flex flex-col gap-4 overflow-y-auto pr-2 pb-4">
                  {Object.keys(groupedSessions).map(title => (
                    <div key={title} className="flex flex-col gap-1">
                      <div className="font-bold text-slate-800 px-3 py-2 bg-slate-100 rounded-lg text-sm">{title}</div>
                      {groupedSessions[title].map((s: any) => (
                        <button 
                          key={s.id} 
                          onClick={() => handleSelectSession(s)}
                          className={`text-left p-3 ml-2 rounded-xl transition-all border ${selectedSession?.id === s.id ? 'bg-blue-600 text-white shadow-md border-blue-700' : 'bg-slate-50 hover:bg-blue-50/50 hover:border-blue-200 text-slate-600 border-slate-100'}`}
                        >
                          <div className={`text-sm font-bold tracking-wide ${selectedSession?.id === s.id ? 'text-blue-100' : 'text-slate-500'}`}>{s.target_class}</div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'class' && (
              <>
                <h3 className="font-black text-slate-800 mb-4 px-2 tracking-tight">학급(반) 목록</h3>
                <div className="flex flex-col gap-2 overflow-y-auto pr-2 pb-4">
                  {classesList.map((cls: any) => (
                    <button 
                      key={cls} 
                      onClick={() => setSelectedClass(cls)}
                      className={`text-left p-4 rounded-2xl transition-all border ${selectedClass === cls ? 'bg-indigo-600 text-white shadow-md border-indigo-700' : 'bg-slate-50 hover:bg-indigo-50/50 hover:border-indigo-200 text-slate-700 border-slate-100'}`}
                    >
                      <div className="font-black text-lg">{cls}</div>
                      <div className={`text-xs mt-1 font-bold ${selectedClass === cls ? 'text-indigo-200' : 'text-slate-400'}`}>치른 시험: {sessions.filter(s => s.target_class === cls).length}회</div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'student' && (
              <>
                <h3 className="font-black text-slate-800 mb-4 px-2 tracking-tight">응시 이력 학생</h3>
                <div className="flex flex-col gap-2 mb-4">
                  <select 
                    value={studentClassFilter} 
                    onChange={e => setStudentClassFilter(e.target.value)}
                    className="w-full bg-slate-100 border-none rounded-xl p-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-purple-400 appearance-none"
                  >
                    <option value="">모든 학급 보기</option>
                    {studentClasses.map(c => <option key={c as string} value={c as string}>{c as string}</option>)}
                  </select>
                  <input 
                    type="text" 
                    placeholder="이름이나 학번 검색..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-100 border-none rounded-xl p-3 text-sm font-medium outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
                <div className="flex flex-col gap-2 overflow-y-auto pr-2 pb-4">
                  {filteredStudents.map((stu: any) => (
                    <button 
                      key={stu.student_number} 
                      onClick={() => setSelectedStudentNum(stu.student_number)}
                      className={`text-left p-4 rounded-2xl transition-all border flex justify-between items-center ${selectedStudentNum === stu.student_number ? 'bg-purple-600 text-white shadow-md border-purple-700' : 'bg-slate-50 hover:bg-purple-50/50 hover:border-purple-200 text-slate-700 border-slate-100'}`}
                    >
                      <div>
                        <div className="font-black">{stu.name}</div>
                        <div className={`text-xs mt-1 font-bold ${selectedStudentNum === stu.student_number ? 'text-purple-200' : 'text-slate-400'}`}>{stu.student_number}</div>
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${selectedStudentNum === stu.student_number ? 'bg-purple-500' : 'bg-slate-200 text-slate-500'}`}>
                        {stu.submissions.length}건
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="lg:col-span-3">
            
            {/* 1. SESSION VIEW CONTENT */}
            {activeTab === 'session' && (
              !selectedSession ? (
                <div className="h-full min-h-[400px] flex items-center justify-center bg-white/50 backdrop-blur rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 font-bold p-8 text-center">
                  좌측에서 개별 시험 회차를 선택하여 상세 채점 결과를 열람하세요.
                </div>
              ) : (
                <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-200">
                  <header className="flex justify-between items-start">
                    <div>
                      <h2 className="text-3xl font-black mb-2 tracking-tight">{selectedSession.title}</h2>
                      <p className="text-slate-500 font-bold">대상: {selectedSession.target_class} | 응시 완료: {submissions.length}명 / {selectedSession.expected_students}명</p>
                    </div>
                  </header>

                  <div className="flex flex-col gap-6">
                    <h3 className="text-xl font-black flex items-center gap-2">👨‍🎓 학생별 상세 성적 및 채점</h3>
                    {submissions.map((sub, sIdx) => (
                      <div key={sub.id} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:border-blue-300 transition-colors">
                        <div className="bg-slate-50 p-5 flex justify-between items-center border-b border-slate-200">
                          <div className="flex items-center gap-4">
                            <span className="font-black text-xl text-slate-800">{sIdx + 1}등. {sub.popquiz_users.name}</span>
                            <span className="text-sm font-bold text-slate-400">{sub.popquiz_users.student_number}</span>
                            {sub.is_cheated && <span className="bg-red-500 text-white text-xs px-3 py-1 rounded-lg font-bold shadow-sm">부정행위/강제제출</span>}
                          </div>
                          <div className="flex items-center gap-6">
                            <button onClick={() => handleAllowResume(sub.id, sub.popquiz_users.name)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:border-slate-400 transition-colors shadow-sm">
                              이 기록 폐기 및 이어보기 허용
                            </button>
                            <div className="text-3xl font-black text-blue-600">{sub.total_score} <span className="text-lg text-slate-300">점</span></div>
                          </div>
                        </div>
                        
                        <div className="p-0 bg-white max-h-[500px] overflow-y-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50/50 sticky top-0 backdrop-blur shadow-sm">
                              <tr className="text-slate-400 font-bold tracking-wider text-xs">
                                <th className="p-4 w-12 text-center">#</th>
                                <th className="p-4 w-1/4">문제</th>
                                <th className="p-4 w-1/4">정답</th>
                                <th className="p-4 w-1/4">학생 입력칸</th>
                                <th className="p-4">채점 및 가산점 제어</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {sub.answers.map((ans: any, idx: number) => {
                                const qText = ans.question.type === 'en' ? ans.question.word.kr : ans.question.word.en;
                                const ansText = ans.question.type === 'en' ? ans.question.word.en : ans.question.word.kr;
                                
                                return (
                                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="p-4 font-black text-slate-300 text-center">{idx + 1}</td>
                                    <td className="p-4 font-bold text-slate-700">{qText}</td>
                                    <td className="p-4 text-emerald-600 font-bold">{ansText}</td>
                                    <td className="p-4 font-mono font-bold text-slate-600 bg-slate-50/30">{ans.submitted_answer || <i className="text-slate-300 font-sans">미입력</i>}</td>
                                    <td className="p-4">
                                      <div className="flex flex-col gap-2 relative">
                                        <div className="flex items-center gap-3">
                                          {ans.is_correct ? <span className="text-emerald-500 font-black text-lg bg-emerald-50 w-8 h-8 flex items-center justify-center rounded-full">O</span> : <span className="text-red-500 font-black text-lg bg-red-50 w-8 h-8 flex items-center justify-center rounded-full">X</span>}
                                          {ans.partial_score > 0 && <span className="text-purple-600 font-black bg-purple-50 px-2 py-1 rounded-lg text-xs">+{ans.partial_score} 가산점 ({ans.reason})</span>}
                                        </div>
                                        
                                          {!ans.is_correct && (
                                            <div className="mt-2 flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm w-[320px]">
                                              <input type="number" step="0.1" placeholder="점수" id={`score-${sub.id}-${idx}`} defaultValue={ans.partial_score || ''} className="w-16 bg-slate-50 border border-slate-200 p-2 text-xs font-bold outline-none rounded-lg focus:border-blue-500 transition-all text-center" />
                                              <input type="text" placeholder="가산점 부여 사유 (선택)" id={`reason-${sub.id}-${idx}`} defaultValue={ans.reason || ''} className="flex-1 bg-slate-50 border border-slate-200 p-2 text-xs font-bold outline-none rounded-lg focus:border-blue-500 transition-all" />
                                              <button onClick={() => {
                                                const scoreInput = document.getElementById(`score-${sub.id}-${idx}`) as HTMLInputElement;
                                                const reasonInput = document.getElementById(`reason-${sub.id}-${idx}`) as HTMLInputElement;
                                                handleUpdatePartialScore(sub.id, idx, scoreInput.value, reasonInput.value);
                                              }} className="px-3 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shadow-sm">
                                                저장
                                              </button>
                                            </div>
                                          )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* 2. CLASS VIEW CONTENT */}
            {activeTab === 'class' && (
              !selectedClass ? (
                 <div className="h-full min-h-[400px] flex items-center justify-center bg-white/50 backdrop-blur rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 font-bold p-8 text-center">
                  좌측에서 학급(반)을 선택하여 해당 학급이 치른 지난 시험 이력을 추적하세요.
                </div>
              ) : (
                <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
                  <h2 className="text-3xl font-black tracking-tight">{selectedClass} 전용 포트폴리오</h2>
                  <p className="text-slate-500 font-bold mb-4">해당 학급에 배정되었던 모든 시험의 평균적인 성과 프레임을 보여줍니다.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sessions.filter(s => s.target_class === selectedClass).map(s => {
                      const classSubs = allSubmissions.filter(sub => sub.session_id === s.id);
                      const avgScore = classSubs.length > 0 ? (classSubs.reduce((acc, sub) => acc + sub.total_score, 0) / classSubs.length).toFixed(1) : 0;
                      
                      return (
                        <div key={s.id} className="border border-slate-200 p-6 rounded-2xl bg-slate-50 hover:bg-white hover:border-indigo-300 hover:shadow-lg transition-all flex flex-col gap-4">
                          <h4 className="font-black text-xl text-slate-800 truncate">{s.title}</h4>
                          <div className="flex justify-between items-end">
                            <div className="flex flex-col gap-1 text-sm font-bold text-slate-500">
                              <span>일자: {new Date(s.created_at).toLocaleDateString()}</span>
                              <span>응시: {classSubs.length} / {s.expected_students}명</span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-black text-slate-400 block mb-1">학급 평균 점수</span>
                              <span className="text-3xl font-black text-indigo-600">{avgScore}점</span>
                            </div>
                          </div>
                          <button onClick={() => handleSelectSession(s)} className="w-full mt-2 py-3 bg-white border border-slate-200 font-bold text-slate-700 rounded-xl hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors">
                            이 시험 전체 채점기록 열람하기
                          </button>
                        </div>
                      );
                   })}
                  </div>
                </div>
              )
            )}

            {/* 3. STUDENT VIEW CONTENT */}
            {activeTab === 'student' && (
              !selectedStudentData ? (
                <div className="h-full min-h-[400px] flex items-center justify-center bg-white/50 backdrop-blur rounded-3xl border-2 border-dashed border-slate-200 text-slate-400 font-bold p-8 text-center">
                  좌측에서 학생을 선택하여 해당 학생의 과거 시험지와 오답 이력을 집중 분석하세요.
                </div>
              ) : (
                <div className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 flex flex-col gap-8 animate-in fade-in zoom-in-95 duration-200">
                  <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-6">
                      <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex justify-center items-center text-white text-3xl font-black shadow-lg">
                        {selectedStudentData.name.substring(0, 1)}
                      </div>
                      <div>
                        <h2 className="text-3xl font-black text-slate-900 mb-1">{selectedStudentData.name} 학생</h2>
                        <span className="text-slate-500 font-bold tracking-widest">{selectedStudentData.student_number}</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-6 mt-6 md:mt-0 px-6 py-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">총 응시</span>
                        <span className="text-2xl font-black text-slate-800">{selectedStudentData.submissions.length}회</span>
                      </div>
                      <div className="w-px bg-slate-200"></div>
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">누적 평균</span>
                        <span className="text-2xl font-black text-purple-600">
                          {(selectedStudentData.submissions.reduce((acc: any, curr: any) => acc + curr.total_score, 0) / selectedStudentData.submissions.length).toFixed(1)}점
                        </span>
                      </div>
                    </div>
                  </header>

                  <div className="flex flex-col gap-4">
                    <h3 className="font-black text-xl flex items-center gap-2 mb-2">📄 응시한 시험지 보관함</h3>
                    {selectedStudentData.submissions.sort((a:any, b:any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()).map((sub: any, idx: number) => {
                       const exam = sub.exam_sessions;
                       const totalQ = sub.answers.length;
                       const correctQ = sub.answers.filter((a:any) => a.is_correct).length;
                       
                       return (
                         <div key={idx} className="border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-all group bg-white">
                           <div className="p-5 flex justify-between items-center bg-white group-hover:bg-slate-50 transition-colors">
                             <div>
                               <h4 className="font-black text-lg text-slate-800 flex items-center gap-3">
                                 {exam?.title || '알 수 없는 시험'}
                                 {sub.is_cheated && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded-md font-black uppercase tracking-wider">부정행위/강제제출 전적</span>}
                               </h4>
                               <p className="text-sm text-slate-500 font-bold mt-1">응시일: {new Date(sub.submitted_at).toLocaleString()}</p>
                             </div>
                             <div className="flex items-center gap-6">
                               <div className="text-right hidden sm:block">
                                 <span className="text-xs font-bold text-slate-400 block">정답률</span>
                                 <span className="font-bold text-slate-700">{correctQ} / {totalQ} 문제</span>
                               </div>
                               <div className="text-3xl font-black text-purple-600 w-24 text-right">{sub.total_score}<span className="text-lg text-slate-300">점</span></div>
                             </div>
                           </div>
                           
                           <div className="p-4 bg-slate-50/50 border-t border-slate-100 hidden group-hover:block transition-all max-h-[300px] overflow-y-auto">
                             <table className="w-full text-xs font-bold text-left">
                               <thead className="text-slate-400 border-b border-slate-200">
                                 <tr><th className="pb-2">문제</th><th className="pb-2">단어 정답</th><th className="pb-2">학생 작성답안</th><th className="pb-2">결과</th></tr>
                               </thead>
                               <tbody className="divide-y divide-slate-100">
                                 {sub.answers.map((ans: any, i: number) => (
                                   <tr key={i}>
                                     <td className="py-3 text-slate-600">{ans.question.type === 'en' ? ans.question.word.kr : ans.question.word.en}</td>
                                     <td className="py-3 text-emerald-600">{ans.question.type === 'en' ? ans.question.word.en : ans.question.word.kr}</td>
                                     <td className="py-3 font-mono text-slate-500">{ans.submitted_answer || '-'}</td>
                                     <td className="py-3">{ans.is_correct ? '✅' : ans.partial_score > 0 ? `🔺(+${ans.partial_score})` : '❌'}</td>
                                   </tr>
                                 ))}
                               </tbody>
                             </table>
                           </div>
                         </div>
                       );
                    })}
                  </div>
                </div>
              )
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
