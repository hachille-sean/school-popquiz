import Link from 'next/link';

export default function TeacherDashboard() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <h1 className="text-3xl font-extrabold text-blue-700">🧑‍🏫 교사 대시보드</h1>
            <p className="text-slate-500 mt-2 font-medium">영단어 시험 관리 및 학생 모니터링</p>
          </div>
          <div className="flex gap-3">
            <Link href="/teacher/settings" className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors font-semibold">
              ⚙️ 설정
            </Link>
            <Link href="/" className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors font-semibold">
              홈으로
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link 
            href="/teacher/word-pools" 
            className="group block p-8 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-xl hover:border-blue-200 transition-all hover:-translate-y-1"
          >
            <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              📝
            </div>
            <h2 className="text-xl font-bold mb-2">단어 풀(Pool) 관리</h2>
            <p className="text-slate-500 font-medium leading-relaxed">
              엑셀이나 메모장에서 임의의 단어 목록을 복사/붙여넣기 하여 새 단어장을 생성합니다.
            </p>
          </Link>

          <Link 
            href="/teacher/exams/new" 
            className="group block p-8 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-xl hover:border-emerald-200 transition-all hover:-translate-y-1"
          >
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              ⏱️
            </div>
            <h2 className="text-xl font-bold mb-2">시험 예약 및 생성</h2>
            <p className="text-slate-500 font-medium leading-relaxed">
              대상이 되는 반과 시험 시간을 설정하고, 문항별 비율을 조정해 시험을 개설합니다.
            </p>
          </Link>

          <Link 
            href="/teacher/monitoring" 
            className="group block p-8 bg-white border border-slate-100 rounded-3xl shadow-sm hover:shadow-xl hover:border-purple-200 transition-all hover:-translate-y-1"
          >
            <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center text-2xl mb-6 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              📈
            </div>
            <h2 className="text-xl font-bold mb-2">실시간 감독 & 결과</h2>
            <p className="text-slate-500 font-medium leading-relaxed">
              학생들의 접속 현황 및 화면 이탈 이력을 모니터링하고 시험 결과를 확인합니다.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
