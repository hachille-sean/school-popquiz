-- 선생님/학생 정보 관리
CREATE TABLE public.popquiz_users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('teacher', 'student')),
  name text NOT NULL,
  student_number text, -- 학생 전용 (선생님은 NULL 가능)
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 시험 단어장 (Word Pool)
CREATE TABLE public.word_pools (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid REFERENCES public.popquiz_users(id),
  title text NOT NULL,
  words jsonb NOT NULL, -- [{ en: "apple", kr: "사과", ext: "" }, ...]
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 시험 회차 (Session) 관리
CREATE TABLE public.exam_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid REFERENCES public.popquiz_users(id),
  title text NOT NULL,          -- 예: "3단원 단어시험"
  target_class text NOT NULL,   -- 예: "3학년 1반"
  total_duration_minutes integer NOT NULL,
  expected_students integer NOT NULL,
  q_en_count integer NOT NULL,  -- 영어 스펠링 쓰기 문제 수
  q_kr_count integer NOT NULL,  -- 한글 뜻 쓰기 문제 수
  q_ext_count integer NOT NULL, -- 확장 문제 수
  status text NOT NULL DEFAULT 'waiting', -- waiting, active, finished
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 학생별 시험지 템플릿 (같은 반 동일 문제 제공 용도)
CREATE TABLE public.exam_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.exam_sessions(id) NOT NULL,
  is_retake boolean DEFAULT false NOT NULL, -- 재응시용 템플릿인지 파악
  questions jsonb NOT NULL,     -- 확정된 랜덤 문제 배열 (모든 학생 공통)
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 학생 제출 답안 (Submissions)
CREATE TABLE public.exam_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid REFERENCES public.exam_sessions(id) NOT NULL,
  student_id uuid REFERENCES public.popquiz_users(id) NOT NULL,
  is_retake boolean DEFAULT false NOT NULL,
  answers jsonb NOT NULL,       -- 학생 입력 답안 (사후 부분 점수, 사유 등 포함 반영 가능)
  total_score numeric,
  is_cheated boolean DEFAULT false NOT NULL,      -- Focus 이탈 등에 의한 강제 처리 여부
  submitted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Realtime 활성화 (선생님의 시험 '개시' 신호를 학생들이 실시간으로 감지하기 위해)
alter publication supabase_realtime add table exam_sessions;
