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

export async function register(username, password, role, profile = {}) {
  const { data } = await api.post("/api/auth/register", {
    username,
    password,
    role,
    email: profile.email || undefined,
    mobile: profile.mobile || undefined,
    gender: profile.gender || undefined,
    address: profile.address || undefined,
    institution: profile.institution || undefined,
  });
  return data;
}

export async function login(username, password) {
  const { data } = await api.post("/api/auth/login", { username, password });
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