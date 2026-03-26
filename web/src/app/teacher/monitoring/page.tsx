'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function MonitoringDashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSubmissions, setActiveSubmissions] = useState<any[]>([]);
  const [waitingStudents, setWaitingStudents] = useState<any[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string>('');
  
  const [activeTab, setActiveTab] = useState<'session' | 'class' | 'student'>('session');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedStudentNum, setSelectedStudentNum] = useState<string | null>(null);
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState('');
  const [now, setNow] = useState(Date.now());
  const [detailedSubmissionId, setDetailedSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchAllSubmissions();
    
    // Subscribe to realtime changes on exam_sessions
    const channel = supabase.channel('schema-db-monitoring')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_sessions' }, () => {
        fetchSessions();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exam_submissions' }, () => {
        fetchAllSubmissions();
        if (expandedSessionId) fetchSubmissionsForSession(expandedSessionId);
      })
      .subscribe();

    const interval = setInterval(() => {
      fetchSessions();
      fetchAllSubmissions();
      if (expandedSessionId) fetchSubmissionsForSession(expandedSessionId);
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [expandedSessionId]);

  async function fetchAllSubmissions() {
    const { data } = await supabase.from('exam_submissions')
      .select('*, popquiz_users(name, student_number), exam_sessions(title, target_class, status)')
      .order('submitted_at', { ascending: false });
    if (data) setAllSubmissions(data);
  }

  const groupedSessions = sessions.reduce((acc: any, s: any) => {
    const baseTitle = s.title.replace(/\s*\(\d+학년\s*\d+반\)$/, '').trim();
    if (!acc[baseTitle]) acc[baseTitle] = [];
    acc[baseTitle].push(s);
    return acc;
  }, {});

  const classesList = Array.from(new Set(sessions.map(s => s.target_class))).sort();

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

  const selectedStudentData: any = selectedStudentNum ? studentsMap[selectedStudentNum] : null;

  // Poll for presence when a session is expanded
  useEffect(() => {
    if (!expandedSessionId) return;
    const session = sessions.find(s => s.id === expandedSessionId);
    if (!session || session.status !== 'waiting') return;
    
    const channel = supabase.channel(`waiting_room_${expandedSessionId}`)
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        const students = [];
        for (const key in newState) {
          students.push(newState[key][0]);
        }
        students.sort((a: any, b: any) => String(a.student_number).localeCompare(String(b.student_number)));
        setWaitingStudents(students);
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    }
  }, [expandedSessionId, sessions]);

  async function fetchSessions() {
    const { data } = await supabase.from('exam_sessions').select('*').order('created_at', { ascending: false });
    if (data) setSessions(data);
  }

  async function handleExpandSession(id: string) {
    if (expandedSessionId === id) {
      setExpandedSessionId(null);
    } else {
      setExpandedSessionId(id);
      fetchSubmissionsForSession(id);
    }
  }

  async function fetchSubmissionsForSession(id: string) {
    setDbError('');
    const { data, error } = await supabase.from('exam_submissions')
      .select('*, popquiz_users(name, student_number)')
      .eq('session_id', id)
      .order('submitted_at', { ascending: false });
    if (error) {
      console.error(error);
      setDbError(error.message);
    }
    if (data) setActiveSubmissions(data);
  }

  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, type: 'start'|'end'|'resume'|null, payload: any, message: string}>({isOpen: false, type: null, payload: null, message: ''});

  const handleStart = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      type: 'start',
      payload: id,
      message: '정말 이 시험을 지금 개시하시겠습니까? 학생들이 일제히 시험을 시작하게 됩니다.'
    });
  }

  const handleEnd = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      type: 'end',
      payload: id,
      message: '시험을 강제 종료하시겠습니까? 진행 중인 모든 학생의 시험이 완전히 제출 처리됩니다.'
    });
  }

  const handleAllowResume = (subId: string, studentName: string) => {
    setConfirmDialog({
      isOpen: true,
      type: 'resume',
      payload: subId,
      message: `${studentName} 학생의 조기 제출된 답안을 삭제하고 다시 이어서 보게 하시겠습니까? (남은 시간 유지)`
    });
  };

  const processConfirm = async () => {
    const { type, payload } = confirmDialog;
    setConfirmDialog({ isOpen: false, type: null, payload: null, message: '' });

    if (type === 'start') {
      const { error } = await supabase.from('exam_sessions').update({ status: 'active' }).eq('id', payload);
      if (error) setDbError(error.message);
    } else if (type === 'end') {
      const { error } = await supabase.from('exam_sessions').update({ status: 'finished' }).eq('id', payload);
      if (error) setDbError(error.message);
    } else if (type === 'resume') {
      const { error } = await supabase.from('exam_submissions').delete().eq('id', payload);
      if (error) {
        setDbError(error.message);
      } else {
        setDbError('조기 제출 기록이 삭제되었습니다. 학생이 다시 로그인/새로고침하면 남은 시간으로 이어서 풀 수 있습니다.');
        if (expandedSessionId) fetchSubmissionsForSession(expandedSessionId);
      }
    }
  };

  const [partialState, setPartialState] = useState<Record<string, {score: string, reason: string}>>({});

  const handleUpdatePartialScore = async (sub: any, answerIdx: number) => {
    const key = `${sub.id}_${answerIdx}`;
    const state = partialState[key];
    if (!state) return;

    const newAnswers = [...sub.answers];
    const prevPartial = newAnswers[answerIdx].partial_score || 0;
    const newPartial = parseFloat(state.score) || 0;
    
    newAnswers[answerIdx] = {
      ...newAnswers[answerIdx],
      partial_score: newPartial,
      reason: state.reason || ''
    };

    const diff = newPartial - prevPartial;
    const newTotal = (parseFloat(sub.total_score) || 0) + diff;

    const { error } = await supabase.from('exam_submissions').update({ answers: newAnswers, total_score: newTotal }).eq('id', sub.id);

    if (error) {
      alert('부분 점수 업데이트 실패: ' + error.message);
    } else {
      alert('부분 점수가 반영되었습니다.');
      if (expandedSessionId === sub.session_id) fetchSubmissionsForSession(sub.session_id);
      fetchAllSubmissions();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Link href="/teacher" className="text-slate-400 hover:text-purple-600 transition-colors">←</Link>
            실시간 모니터링 및 결과
          </h1>
          <div className="flex gap-2">
            <button onClick={() => setActiveTab('session')} className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${activeTab === 'session' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>📚 시험 회차별</button>
            <button onClick={() => setActiveTab('class')} className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${activeTab === 'class' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>🏫 학급(반)별</button>
            <button onClick={() => setActiveTab('student')} className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${activeTab === 'student' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'}`}>🧑‍🎓 개별 학생별</button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* LEFT SIDEBAR (for Class/Student tabs) */}
          {(activeTab === 'class' || activeTab === 'student') && (
             <div className="lg:col-span-1 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col max-h-[800px] overflow-hidden">
                {activeTab === 'class' && (
                  <>
                    <h3 className="font-black text-slate-800 mb-4 px-2 tracking-tight">학급 목록</h3>
                    <div className="flex flex-col gap-2 overflow-y-auto pr-2 pb-4">
                      {classesList.map(cls => (
                        <button key={cls} onClick={() => setSelectedClass(cls)} className={`text-left p-4 rounded-2xl transition-all border ${selectedClass === cls ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 hover:bg-slate-100'}`}>
                          <div className="font-bold text-sm md:text-base">{cls}</div>
                          <div className="text-[10px] opacity-70">모니터링 중</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {activeTab === 'student' && (
                  <>
                    <h3 className="font-black text-slate-800 mb-4 px-2 tracking-tight">응시 학생</h3>
                    <div className="flex flex-col gap-2 mb-4">
                      <input type="text" placeholder="이름/학번 검색..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-100 border-none rounded-xl p-3 text-sm" />
                      <select 
                        value={studentClassFilter} 
                        onChange={e => setStudentClassFilter(e.target.value)}
                        className="w-full bg-slate-100 border-none rounded-xl p-3 text-sm font-bold text-slate-600 outline-none"
                      >
                        <option value="">모든 학급</option>
                        {studentClasses.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2 overflow-y-auto pr-2 pb-4">
                      {filteredStudents.map((stu: any) => (
                        <button key={stu.student_number} onClick={() => setSelectedStudentNum(stu.student_number)} className={`text-left p-4 rounded-2xl transition-all border ${selectedStudentNum === stu.student_number ? 'bg-purple-600 text-white shadow-md' : 'bg-slate-50 hover:bg-slate-100'}`}>
                          <div className="font-bold text-sm">{stu.name}</div>
                          <div className="text-[10px] opacity-70">{stu.student_number}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
             </div>
          )}

          <div className={activeTab === 'session' ? 'lg:col-span-4 flex flex-col gap-6' : 'lg:col-span-3 flex flex-col gap-6'}>
            {activeTab === 'session' && (
              Object.keys(groupedSessions).map(title => (
                <div key={title} className="flex flex-col gap-4">
                  <h3 className="text-sm font-black text-slate-400 px-2 uppercase tracking-widest">{title}</h3>
                  {groupedSessions[title].map((s: any) => (
                    <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                      <div className="p-6 flex flex-col md:flex-row gap-6 items-center justify-between">
                        <div>
                          <h2 className="text-xl font-bold flex items-center gap-3">
                            {s.title} 
                            <span className={`text-xs px-2 py-1 rounded-full font-bold ${s.status === 'waiting' ? 'bg-amber-100 text-amber-700' : s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                              {s.status === 'waiting' ? '대기 중' : s.status === 'active' ? '진행 중' : '종료됨'}
                            </span>
                          </h2>
                          <div className="text-slate-500 mt-2 flex flex-wrap gap-4 text-sm font-medium items-center">
                            <span className="bg-slate-100 px-2 py-1 rounded-md">대상: {s.target_class}</span>
                            <span className="bg-slate-100 px-2 py-1 rounded-md">문항: {s.q_en_count + s.q_kr_count + s.q_ext_count}문항</span>
                            {s.status === 'active' && (
                              <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full font-black animate-pulse">
                                ⏱️ 남은 시간: {(() => {
                                  const totalSec = s.total_duration_minutes * 60;
                                  const elapsed = Math.floor((now - new Date(s.created_at).getTime()) / 1000); // Fallback to created_at
                                  const remaining = Math.max(0, totalSec - elapsed);
                                  const mm = Math.floor(remaining / 60);
                                  const ss = remaining % 60;
                                  return `${mm}:${ss < 10 ? '0' : ''}${ss}`;
                                })()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-3 items-center">
                          {s.status === 'active' && (
                            <button onClick={() => handleExpandSession(s.id)} className="px-5 py-3 bg-purple-100 text-purple-700 font-bold rounded-xl hover:bg-purple-200 transition-colors">
                              {expandedSessionId === s.id ? '진행상황 숨기기' : '현황 모니터링'}
                            </button>
                          )}
                          {s.status === 'waiting' && (
                            <button onClick={() => handleExpandSession(s.id)} className="px-5 py-3 bg-indigo-100 text-indigo-700 font-bold rounded-xl hover:bg-indigo-200 transition-colors">
                              {expandedSessionId === s.id ? '대기실 숨기기' : '대기실 접속 확인'}
                            </button>
                          )}
                          {s.status === 'finished' && (
                            <button onClick={() => handleExpandSession(s.id)} className="px-5 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">
                              {expandedSessionId === s.id ? '결과 숨기기' : '결과 확인'}
                            </button>
                          )}
                          {s.status === 'waiting' && (
                            <button onClick={() => handleStart(s.id)} className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm">
                              🚀 시험 개시
                            </button>
                          )}
                          {s.status === 'active' && (
                            <button onClick={() => handleEnd(s.id)} className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-sm">
                              🛑 강제 종료
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {expandedSessionId === s.id && (
                        <div className="bg-slate-50 p-6 border-t border-slate-100">
                          {s.status === 'active' || s.status === 'finished' ? (
                            <>
                              <h3 className="font-bold text-slate-700 mb-4 flex items-center justify-between">
                                <span>{s.status === 'active' ? '실시간 제출 현황' : '최종 제출 결과'} ({activeSubmissions.length}건)</span>
                                <button onClick={() => fetchSubmissionsForSession(s.id)} className="text-xs bg-white border border-slate-200 px-3 py-1 rounded text-slate-500 hover:text-slate-800">새로고침 ↻</button>
                              </h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {activeSubmissions.map((sub: any) => (
                                  <div key={sub.id} className="bg-white border border-slate-200 rounded-xl flex flex-col shadow-sm overflow-hidden">
                                    <div className="p-4 flex justify-between items-center bg-white">
                                      <div>
                                        <span className="font-bold text-slate-800 block text-sm">{sub.popquiz_users?.name} <span className="text-slate-400 font-medium text-xs ml-1">{sub.popquiz_users?.student_number}</span></span>
                                        <div className="flex gap-2 items-center mt-1">
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sub.is_cheated ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                            {sub.is_cheated ? '부정행위 감지됨' : '정상 제출됨'}
                                          </span>
                                          <span className="text-xs font-black text-purple-600">{sub.total_score}점</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                         <button onClick={() => handleAllowResume(sub.id, sub.popquiz_users?.name)} className="bg-orange-50 text-orange-600 border border-orange-200 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-orange-100 transition-colors">재응시 허용</button>
                                         <button 
                                           onClick={() => setDetailedSubmissionId(detailedSubmissionId === sub.id ? null : sub.id)}
                                           className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                                         >
                                           {detailedSubmissionId === sub.id ? '닫기' : '상세보기'}
                                         </button>
                                      </div>
                                    </div>

                                    {detailedSubmissionId === sub.id && (
                                      <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {(sub.answers || []).map((ans: any, qIdx: number) => {
                                          const qTitle = ans.question?.word?.en || ans.question?.word?.kr || ans.question?.word || `문항 ${qIdx+1}`;
                                          const pKey = `${sub.id}_${qIdx}`;
                                          return (
                                            <div key={qIdx} className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col gap-3 text-xs">
                                              <div className="flex justify-between items-center">
                                                <div>
                                                  <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Q{qIdx+1}. {qTitle}</div>
                                                  <div className="font-bold">학생 답: {ans.submitted_answer || '(미입력)'}</div>
                                                </div>
                                                <span className={`px-2 py-1 rounded-md font-black ${ans.is_correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                  {ans.is_correct ? '정답' : '오답'}
                                                </span>
                                              </div>
                                              
                                              {!ans.is_correct && (
                                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col gap-2">
                                                  <div className="flex gap-2">
                                                    <input 
                                                      type="number" step="0.1" placeholder="점수" 
                                                      value={partialState[pKey]?.score || ans.partial_score || ''}
                                                      onChange={e => setPartialState(prev => ({...prev, [pKey]: {...(prev[pKey]||{reason:ans.reason||''}), score: e.target.value}}))}
                                                      className="w-16 bg-white border border-slate-200 rounded p-1 focus:outline-blue-500" 
                                                    />
                                                    <input 
                                                      type="text" placeholder="사유" 
                                                      value={partialState[pKey]?.reason || ans.reason || ''}
                                                      onChange={e => setPartialState(prev => ({...prev, [pKey]: {...(prev[pKey]||{score:ans.partial_score||''}), reason: e.target.value}}))}
                                                      className="flex-1 bg-white border border-slate-200 rounded p-1 focus:outline-blue-500" 
                                                    />
                                                    <button onClick={() => handleUpdatePartialScore(sub, qIdx)} className="bg-blue-600 text-white px-2 py-1 rounded font-bold text-[10px]">적용</button>
                                                  </div>
                                                </div>
                                              )}
                                              {(ans.is_correct || ans.partial_score > 0) && (
                                                <div className="text-[10px] font-bold text-purple-600">
                                                  배점: {ans.is_correct ? '0.5' : ans.partial_score}점 {ans.reason && `(${ans.reason})`}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {activeSubmissions.length === 0 && <div className="col-span-2 text-center py-4 text-slate-400 text-sm">기록이 없습니다.</div>}
                              </div>
                            </>
                          ) : (
                            <>
                              <h3 className="font-bold text-slate-700 mb-3">현재 대기실 접속자 ({waitingStudents.length}명)</h3>
                              <div className="flex flex-wrap gap-2">
                                {waitingStudents.map((stu: any, idx: number) => (
                                  <span key={idx} className="bg-indigo-100 text-indigo-800 font-bold px-3 py-1.5 rounded-lg text-xs">
                                    {stu.student_number}({stu.name})
                                  </span>
                                ))}
                                {waitingStudents.length === 0 && <div className="text-slate-400 text-sm italic">대기 중인 학생이 없습니다.</div>}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}

            {activeTab === 'class' && (
              !selectedClass ? (
                <div className="bg-white p-12 rounded-3xl text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 mt-10">좌측에서 학급을 선택하여 실시간 현황을 확인하세요.</div>
              ) : (
                <div className="flex flex-col gap-6">
                  <h2 className="text-2xl font-black">{selectedClass} 실시간 모니터링</h2>
                  <div className="grid grid-cols-1 gap-4">
                    {sessions.filter(s => s.target_class === selectedClass).map(s => {
                      const classSubs = allSubmissions.filter(sub => sub.session_id === s.id);
                      return (
                        <div key={s.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex justify-between items-center">
                          <div>
                            <h4 className="font-bold text-lg">{s.title}</h4>
                            <span className="text-sm text-slate-500">
                              상태: {s.status === 'active' ? '진행 중' : s.status === 'waiting' ? '대기 중' : '종료됨'} | 
                              제출: {classSubs.length}명 / {s.expected_students || '?'}명
                            </span>
                          </div>
                          <button onClick={() => { setActiveTab('session'); handleExpandSession(s.id); }} className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl text-sm">상세 보기</button>
                        </div>
                      );
                    })}
                    {sessions.filter(s => s.target_class === selectedClass).length === 0 && <div className="text-slate-400 font-medium">검색된 시험이 없습니다.</div>}
                  </div>
                </div>
              )
            )}

            {activeTab === 'student' && (
              !selectedStudentData ? (
                <div className="bg-white p-12 rounded-3xl text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 mt-10">좌측에서 학생을 선택하여 실시간 상태를 확인하세요.</div>
              ) : (
                <div className="flex flex-col gap-6">
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-6">
                    <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-black">{selectedStudentData.name[0]}</div>
                    <div>
                      <h2 className="text-2xl font-black">{selectedStudentData.name} 학생</h2>
                      <span className="text-slate-500 font-bold">{selectedStudentData.student_number}</span>
                    </div>
                  </div>
                  <h3 className="font-bold text-slate-700">실시간/최근 시험 진행 현황</h3>
                  <div className="flex flex-col gap-3">
                    {selectedStudentData.submissions.map((sub: any, idx: number) => (
                      <div key={sub.id || idx} className="bg-white rounded-2xl border border-slate-100 flex flex-col overflow-hidden shadow-sm">
                        <div className="p-4 flex justify-between items-center bg-white">
                          <div>
                            <p className="font-bold text-slate-800">{sub.exam_sessions?.title}</p>
                            <span className={`text-[10px] font-black uppercase ${sub.is_cheated ? 'text-red-500' : 'text-emerald-500'}`}>{sub.is_cheated ? '기록: 부정행위' : '기록: 정상완료'}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-xl font-black text-purple-600">{sub.total_score}점</div>
                            <button 
                              onClick={() => setDetailedSubmissionId(detailedSubmissionId === sub.id ? null : sub.id)}
                              className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                            >
                              {detailedSubmissionId === sub.id ? '닫기' : '상세보기'}
                            </button>
                          </div>
                        </div>
                        
                        {detailedSubmissionId === sub.id && (
                          <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-2">
                             {(sub.answers || []).map((ans: any, qIdx: number) => {
                               const qTitle = ans.question?.word?.en || ans.question?.word?.kr || ans.question?.word || `문항 ${qIdx+1}`;
                               const pKey = `${sub.id}_${qIdx}`;
                               return (
                                 <div key={qIdx} className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col gap-3 text-xs">
                                   <div className="flex justify-between items-center">
                                      <div>
                                        <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Q{qIdx+1}. {qTitle}</div>
                                        <div className="font-bold">학생 답: {ans.submitted_answer || '(미입력)'}</div>
                                      </div>
                                      <span className={`px-2 py-1 rounded-md font-black ${ans.is_correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                        {ans.is_correct ? '정답' : '오답'}
                                      </span>
                                   </div>
                                   
                                   {!ans.is_correct && (
                                     <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col gap-2">
                                       <p className="text-[10px] text-slate-500 font-bold">부정답/부분점수 부여</p>
                                       <div className="flex gap-2">
                                          <input 
                                            type="number" 
                                            step="0.1" 
                                            placeholder="점수 (예: 0.3)" 
                                            value={partialState[pKey]?.score || ans.partial_score || ''}
                                            onChange={e => setPartialState(prev => ({...prev, [pKey]: {...(prev[pKey]||{reason:ans.reason||''}), score: e.target.value}}))}
                                            className="w-24 bg-white border border-slate-200 rounded p-1.5 focus:outline-blue-500" 
                                          />
                                          <input 
                                            type="text" 
                                            placeholder="사유 (예: 오이타)" 
                                            value={partialState[pKey]?.reason || ans.reason || ''}
                                            onChange={e => setPartialState(prev => ({...prev, [pKey]: {...(prev[pKey]||{score:ans.partial_score||''}), reason: e.target.value}}))}
                                            className="flex-1 bg-white border border-slate-200 rounded p-1.5 focus:outline-blue-500" 
                                          />
                                          <button 
                                            onClick={() => handleUpdatePartialScore(sub, qIdx)}
                                            className="bg-blue-600 text-white px-3 py-1.5 rounded font-bold hover:bg-blue-700 transition-colors"
                                          >
                                            적용
                                          </button>
                                       </div>
                                     </div>
                                   )}
                                   {(ans.is_correct || ans.partial_score > 0) && (
                                     <div className="text-[10px] font-bold text-purple-600">
                                       최종 배점: {ans.is_correct ? '0.5' : ans.partial_score}점 {ans.reason && `(${ans.reason})`}
                                     </div>
                                   )}
                                 </div>
                               );
                             })}
                             {(!sub.answers || sub.answers.length === 0) && <div className="text-slate-400 italic text-sm py-2">문항 데이터가 없습니다.</div>}
                          </div>
                        )}
                      </div>
                    ))}
                    {selectedStudentData.submissions.length === 0 && <div className="text-slate-400 italic">제출 이력이 없습니다.</div>}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* Custom Confirm Dialog Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black mb-4 flex items-center gap-3">
              {confirmDialog.type === 'start' && '🚀 시험 개시'}
              {confirmDialog.type === 'end' && '🛑 전체 강제 종료'}
              {confirmDialog.type === 'resume' && '🔄 재응시 허용'}
            </h3>
            <p className="text-slate-600 font-medium mb-8 leading-relaxed">
              {confirmDialog.message}
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setConfirmDialog({ isOpen: false, type: null, payload: null, message: '' })}
                className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                취소
              </button>
              <button 
                onClick={processConfirm}
                className={`flex-1 py-4 font-bold rounded-xl text-white transition-colors shadow-sm ${
                  confirmDialog.type === 'start' ? 'bg-emerald-600 hover:bg-emerald-700' :
                  confirmDialog.type === 'end' ? 'bg-red-600 hover:bg-red-700' :
                  'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                확인 및 실행
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
