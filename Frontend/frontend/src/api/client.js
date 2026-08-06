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

export async function fetchHistory() {
  const { data } = await api.get("/api/chat/history");
  return data;
}

export async function getChatHistory() {
  const { data } = await api.get("/api/chat/history");
  return data;
}

export async function clearChatHistory() {
  await api.delete("/api/chat/history");
}

export async function changePassword(currentPassword, newPassword) {
  await api.post("/api/auth/change-password", { currentPassword, newPassword });
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
export async function createQuiz(payload) {
  const { data } = await api.post("/api/quizzes", payload);
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