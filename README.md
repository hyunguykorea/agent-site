# AI Agent Website (Next.js Pages Router · 파일명 전부 유일)

Copilot Studio 에이전트를 시크릿 값만 바꿔 연결하는 MVP 사이트.
음성으로 묻고(STT) 음성으로 듣습니다(TTS).

```
사용자 → STT → Copilot Studio Agent → 응답 → 텍스트 정제 → TTS → 사용자
```

## ⚠️ 이전 버전과 달라진 점 (파일명 충돌 해결)

App Router는 `page.tsx`·`route.ts`가 폴더마다 반복돼 파일이 섞이면 에러가 납니다.
**Pages Router로 바꿔서 22개 파일 전부 이름이 유일**합니다. (중복 검사 통과)

| 이전(App Router) | 지금(Pages Router) |
|---|---|
| `app/page.tsx` | `pages/index.tsx` |
| `app/chat/page.tsx` | `pages/chat.tsx` |
| `app/history/page.tsx` | `pages/history.tsx` |
| `app/survey/page.tsx` | `pages/survey.tsx` |
| `app/layout.tsx` | `pages/_app.tsx` |
| `app/api/directline/token/route.ts` | `pages/api/directline-token.ts` |
| `app/globals.css` | `styles/globals.css` |
| `lib/directline.ts` | `lib/dlClient.ts` |
| `lib/useSpeech.ts` | `lib/speechHooks.ts` |
| `lib/cleanText.ts` | `lib/ttsClean.ts` |
| `lib/history.ts` | `lib/historyStore.ts` |
| `lib/types.ts` | `lib/appTypes.ts` |

## 파일 배치 (중요)

```
agent-site/
├─ package.json
├─ tsconfig.json
├─ next.config.mjs
├─ tailwind.config.ts
├─ postcss.config.mjs
├─ setup-project.sh          ← 파일이 섞였을 때 자동 정리
├─ env-example.txt           ← .env.local 로 복사
├─ gitignore-template.txt    ← .gitignore 로 복사
├─ pages/
│  ├─ _app.tsx
│  ├─ index.tsx
│  ├─ chat.tsx
│  ├─ history.tsx
│  ├─ survey.tsx
│  └─ api/directline-token.ts
├─ components/
│  ├─ NavBar.tsx
│  └─ ChatWindow.tsx
├─ lib/
│  ├─ dlClient.ts
│  ├─ speechHooks.ts
│  ├─ ttsClean.ts
│  ├─ historyStore.ts
│  └─ appTypes.ts
└─ styles/globals.css
```

파일이 한 폴더에 납작하게 받아졌다면:

```bash
bash setup-project.sh   # 폴더 자동 생성 + 파일 이동 + .env.local/.gitignore 생성
```

## 1. Copilot Studio 설정

1. 에이전트 **게시(Publish)** 1회 실행
2. **설정 → 채널 → 사용자 지정 웹사이트(Direct Line)** → **Secret 키 1** 복사
3. 응답이 안 오면 **설정 → 보안 → 인증 → "인증 없음"** 으로 변경 후 재게시

에이전트를 바꾸려면 `DIRECTLINE_SECRET` 값만 교체하면 됩니다. 코드 수정 불필요.

## 2. 로컬 실행

```bash
npm install
cp env-example.txt .env.local     # Windows PowerShell: copy env-example.txt .env.local
npm run dev                       # http://localhost:3000
```

`.env.local`

```env
DIRECTLINE_SECRET=붙여넣은_시크릿
NEXT_PUBLIC_SURVEY_URL=https://forms.gle/xxxx
NEXT_PUBLIC_AGENT_NAME=한입 에이전트
NEXT_PUBLIC_AGENT_DESC=무엇이든 물어보세요.
```

마이크는 `localhost` 또는 `https` 에서만 동작합니다.

## 3. GitHub 연동

```bash
cp gitignore-template.txt .gitignore
git init
git add .
git commit -m "feat: copilot studio agent site (chat + stt + tts)"
git branch -M main
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git push -u origin main
```

`.gitignore` 에 `.env.local` 이 있어 시크릿은 커밋되지 않습니다.

## 4. Vercel 배포

1. vercel.com → **Add New → Project → Import Git Repository** → 저장소 선택
2. Framework Preset: **Next.js** (자동 인식), Root Directory 그대로
3. **Environment Variables** 추가 (Production / Preview / Development 전부 체크)
   - `DIRECTLINE_SECRET`
   - `NEXT_PUBLIC_SURVEY_URL`
   - `NEXT_PUBLIC_AGENT_NAME`
   - `NEXT_PUBLIC_AGENT_DESC`
4. **Deploy** → `https://<프로젝트>.vercel.app`

이후 `git push` 마다 자동 재배포. 환경변수를 바꾸면 **Deployments → ⋯ → Redeploy** 필요.

CLI 방식:

```bash
npm i -g vercel
vercel
vercel env add DIRECTLINE_SECRET production
vercel --prod
```

## 5. TTS 정제 규칙 (검증 완료)

제거 대상: 이모지 제목줄 · URL/링크 · 이메일 · 이모지 · `( )` · `[ ]` · `#태그` · 마크다운 기호

```
입력                                  출력
🎉 오늘의 발견
[음식]
피자는 노동자들의 음식에서 시작됐다.  →  피자는 노동자들의 음식에서 시작됐다.
https://example.com
```

## 6. 문제 해결

| 증상 | 해결 |
|---|---|
| `Module not found: Can't resolve '@/lib/...'` | 파일이 `lib/` 폴더 안에 있는지 확인 → `bash setup-project.sh` |
| `DIRECTLINE_SECRET 환경변수가 설정되지 않았습니다` | `.env.local` 만든 뒤 **dev 서버 재시작**, Vercel은 Redeploy |
| 토큰 발급 401 | 시크릿 오타 또는 에이전트 미게시 |
| 응답 없음 | Copilot Studio 인증을 "인증 없음"으로 변경 후 재게시 |
| 마이크 버튼 비활성 | Chrome/Edge, https 또는 localhost 필요 |
| 소리 안 남 | 화면 한 번 클릭 후 재시도, 우상단 🔊 ON 확인 |
