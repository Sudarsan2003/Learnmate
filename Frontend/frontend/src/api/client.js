import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
});

// Attach the JWT (if we have one) to every request automatically.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("learnmate_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please log in again.";

// True when the JWT's own `exp` claim is in the past. Lets us recognise an
// expired login even from a backend that answers 403 instead of 401.
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

// An expired login makes every request fail. Rewrite those errors to say so
// (err.sessionExpired, and the message components already read from
// err.response.data.message), and tell App once so it can send the user
// back to the login screen.
api.interceptors.response.use(undefined, (err) => {
  const status = err.response?.status;
  // Login/register failures are about the credentials typed, never an old session.
  const isAuthCall = /\/api\/auth\/(login|register)$/.test(err.config?.url ?? "");
  const sentToken = err.config?.headers?.Authorization;
  const token = localStorage.getItem("learnmate_token");
  const expired =
    !isAuthCall && sentToken && (status === 401 || (status === 403 && token && isTokenExpired(token)));

  if (expired) {
    err.sessionExpired = true;
    err.message = SESSION_EXPIRED_MESSAGE;
    err.response.data = { ...(typeof err.response.data === "object" ? err.response.data : {}), message: SESSION_EXPIRED_MESSAGE };
    if (token) {
      localStorage.removeItem("learnmate_token");
      document.dispatchEvent(new CustomEvent("learnmate:session-expired"));
    }
  }
  return Promise.reject(err);
});

export async function register(username, password, profile = {}) {
  const { data } = await api.post("/api/auth/register", {
    username,
    password,
    email: profile.email || undefined,
    mobile: profile.mobile || undefined,
    gender: profile.gender || undefined,
    address: profile.address || undefined,
    institution: profile.institution || undefined,
    standard: profile.standard || undefined,
  });
  return data;
}

export async function login(username, password) {
  const { data } = await api.post("/api/auth/login", { username, password });
  return data;
}

export async function getMe() {
  const { data } = await api.get("/api/auth/me");
  return data;
}

export async function updateMyStandard(standard) {
  const { data } = await api.put("/api/auth/me/standard", { standard });
  return data;
}

export async function sendChatMessage(request) {
  const { data } = await api.post("/api/chat", request);
  return data;
}

// NOTE: the old fetchHistory / getChatHistory / clearChatHistory helpers were
// removed. The backend requires ?sessionId=..., so they always failed with 400.
// Use getSessionHistory(sessionId) and deleteSession(sessionId) below.

export async function changePassword(currentPassword, newPassword) {
  await api.put("/api/auth/change-password", {
    currentPassword,
    newPassword,
  });
}

export async function getChatSessions() {
  const { data } = await api.get("/api/chat/sessions");
  return data;
}

export async function getSessionHistory(sessionId) {
  const { data } = await api.get("/api/chat/history", { params: { sessionId } });
  return data;
}

export async function deleteSession(sessionId) {
  await api.delete("/api/chat/history", { params: { sessionId } });
}

// ---------------------------------------------------------------------------
// Practice quizzes generated in chat ("Quiz me on Biology Chapter 5").
// Only the logged-in student's own attempts are ever returned.
// ---------------------------------------------------------------------------

// List of completed practice quizzes:
// [{ id, topic, difficulty, scorePercent, correctCount, totalQuestions, completedAt }]
export async function getChatQuizResults() {
  const { data } = await api.get("/api/chat-quiz/results");
  return data;
}

// One attempt in full: { summary, results: [{ number, type, questionText,
// optionA-D, correctOption, selectedOption, studentAnswer, verdict, score,
// feedback, whatToReview, explanation, referenceAnswer }] }
export async function getChatQuizResult(id) {
  const { data } = await api.get(`/api/chat-quiz/results/${id}`);
  return data;
}

// Study material the student can pick for a chat quiz, scoped server-side to
// their own school + class: [{ id, name, subject }]. Send the chosen ids as
// `materialIds` with sendChatMessage to build the quiz from just those.
export async function getQuizMaterials() {
  const { data } = await api.get("/api/chat/materials");
  return data;
}

// --- Taking a practice quiz inside chat (powers the ChatQuiz card) ---------

// Loads the quiz card: { id, topic, difficulty, status, questions: [{ number,
// type, questionText, optionA-D }], answers: { "1": "B", ... }, detail }.
// `status` is IN_PROGRESS | COMPLETED | ABANDONED; `detail` (same shape as
// getChatQuizResult) is only present once graded. No correct answers are
// included while the quiz is in progress.
export async function getChatQuizAttempt(id) {
  const { data } = await api.get(`/api/chat-quiz/attempts/${id}`);
  return data;
}

// Autosave. `answers` is the FULL map of the student's current answers,
// e.g. { "1": "B", "6": "my written answer" } — it replaces what was saved.
export async function saveChatQuizAnswers(id, answers) {
  await api.put(`/api/chat-quiz/attempts/${id}/answers`, { answers });
}

// Grades the saved answers and returns the full result (same shape as
// getChatQuizResult). Safe to call twice.
export async function submitChatQuiz(id) {
  const { data } = await api.post(`/api/chat-quiz/attempts/${id}/submit`);
  return data;
}

export async function createQuiz(payload) {
  const { data } = await api.post("/api/quizzes", payload);
  return data;
}

// Phone camera photos are often 4000px+ and over the backend's 5 MB scan
// limit. Re-encode anything large as a JPEG no wider/taller than 2000px —
// still plenty for reading handwriting. Small images and GIFs pass through.
const SCAN_MAX_SIDE = 2000;
const SCAN_MAX_BYTES = 4 * 1024 * 1024;

async function shrinkPhoto(file) {
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // let the server report what's wrong with it
  }
  const scale = Math.min(1, SCAN_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SCAN_MAX_BYTES) {
    bitmap.close?.();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

// Teacher/Admin only (enforced server-side). Send a photo of handwritten or
// printed exam questions, get back structured MCQs in the same shape the
// Create Quiz form already uses for manualQuestions -- nothing is saved
// server-side by this call.
export async function scanQuizQuestions(imageFile) {
  const formData = new FormData();
  formData.append("image", await shrinkPhoto(imageFile));
  const { data } = await api.post("/api/quizzes/scan", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getAvailableQuizzes() {
  const { data } = await api.get("/api/quizzes/available");
  return data;
}

// Starts (or resumes) the caller's attempt at a quiz. Creates the
// QuizAttempt server-side on first call so the timer has a fixed
// startedAt/deadline; safe to call again (e.g. on refresh) since the
// backend just returns the same attempt instead of resetting the clock.
export async function startQuiz(quizId) {
  const { data } = await api.post(`/api/quizzes/${quizId}/start`);
  return data;
}

// "Ask LearnMate" about a submitted quiz — scoped strictly to that
// student's own attempt on the backend. `payload` is
// { question, questionId? } (questionId narrows to one question).
export async function askAboutQuiz(quizId, payload) {
  const { data } = await api.post(`/api/quizzes/${quizId}/ask`, payload);
  return data;
}

export async function submitQuiz(quizId, answers) {
  const { data } = await api.post(`/api/quizzes/${quizId}/submit`, { answers });
  return data;
}

export async function getQuizResults(quizId) {
  const { data } = await api.get(`/api/quizzes/${quizId}/results`);
  return data;
}

export async function closeQuiz(quizId) {
  await api.put(`/api/quizzes/${quizId}/close`);
}

// Every quiz the calling admin/teacher created — persisted server-side.
export async function getMyCreatedQuizzes() {
  const { data } = await api.get("/api/quizzes/mine");
  return data;
}

// ADMIN only: every quiz in the system, whoever created it. Each item carries
// the same fields as /mine plus { createdBy, createdByRole, createdAt } so the
// dashboard can show who made a quiz and when. See BACKEND_NOTES.md.
export async function getAllQuizzes() {
  const { data } = await api.get("/api/quizzes/all");
  return data;
}

// Live leaderboard for a quiz. Students need to have submitted it first.
export async function getQuizLeaderboard(quizId) {
  const { data } = await api.get(`/api/quizzes/${quizId}/leaderboard`);
  return data;
}

// Every quiz the calling student has submitted, with marks + date.
export async function getMyResults() {
  const { data } = await api.get("/api/quizzes/my-results");
  return data;
}

// Full per-question review of the caller's own submitted attempt.
export async function getMyAttemptDetail(quizId) {
  const { data } = await api.get(`/api/quizzes/${quizId}/my-attempt`);
  return data;
}

export async function listUsers() {
  const { data } = await api.get("/api/admin/users");
  return data;
}

export async function listInstitutions() {
  const { data } = await api.get("/api/admin/institutions");
  return data;
}

export async function updateUserRole(username, role) {
  const { data } = await api.put(`/api/admin/users/${username}/role`, { role });
  return data;
}

export async function updateUserProfile(
  username,
  { institution, standard, email, mobile, gender, address } = {}
) {
  const body = {};
  if (institution !== undefined) body.institution = institution;
  if (standard !== undefined) body.standard = standard;
  if (email !== undefined) body.email = email;
  if (mobile !== undefined) body.mobile = mobile;
  if (gender !== undefined) body.gender = gender;
  if (address !== undefined) body.address = address;
  const { data } = await api.put(`/api/admin/users/${username}/profile`, body);
  return data;
}

export async function resetUserPassword(username, newPassword) {
  const { data } = await api.put(`/api/admin/users/${username}/reset-password`, { newPassword });
  return data;
}

export async function deleteUser(username) {
  await api.delete(`/api/admin/users/${username}`);
}

export async function setUserLocked(username, locked) {
  const { data } = await api.put(`/api/admin/users/${username}/lock`, { locked });
  return data;
}

// Progress for every game (currently MATH and WORDS) for the logged-in
// student — level unlocked, stars, streak, etc. Powers GamesDashboard and
// lets MathGame/WordGame resume at the right level.
export async function getGameProgress() {
  const { data } = await api.get("/api/games/progress");
  return data;
}

// Call once a level ends (win or lose). `payload` is:
// { gameType: "MATH" | "WORDS", level, won, score, stars, correctCount, totalCount }
export async function completeGameLevel(payload) {
  const { data } = await api.post("/api/games/complete", payload);
  return data;
}

// Institute-wide leaderboard for one game ("MATH" | "WORDS"), ranked by
// total stars (ties broken by total points). Scoped server-side to
// students who share the caller's institution.
export async function getGameLeaderboard(gameType) {
  const { data } = await api.get(`/api/games/${gameType}/leaderboard`);
  return data;
}