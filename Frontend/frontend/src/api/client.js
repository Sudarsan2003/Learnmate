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

export async function getQuizQuestions(quizId) {
  const { data } = await api.get(`/api/quizzes/${quizId}/questions`);
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

export async function listUsers() {
  const { data } = await api.get("/api/admin/users");
  return data;
}

export async function updateUserRole(username, role) {
  const { data } = await api.put(`/api/admin/users/${username}/role`, { role });
  return data;
}

export async function updateUserProfile(username, { institution, standard } = {}) {
  const body = {};
  if (institution !== undefined) body.institution = institution;
  if (standard !== undefined) body.standard = standard;
  const { data } = await api.put(`/api/admin/users/${username}/profile`, body);
  return data;
}