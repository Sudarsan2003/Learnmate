import { useState } from "react";
import ChatWindow from "./components/ChatWindow";
import LoginScreen from "./components/LoginScreen";
import LandingPage from "./components/LandingPages";
import DocumentUpload from "./components/DocumentUpload";
import Sidebar from "./components/Sidebar";
import ManageUsers from "./components/ManageUsers";
import Quizzes from "./components/Quizzes";
import ProfilePage from "./components/Profilepage";
import Dashboard from "./components/Dashboard";
import PageFrame from "./components/PageFrame";
import { ThemeProvider } from "./components/ThemeContext";

export default function App() {
  const [user, setUser] = useState(() => {
    const username = localStorage.getItem("learnmate_username");
    const token = localStorage.getItem("learnmate_token");
    const role = localStorage.getItem("learnmate_role");

    return username && token ? { username, token, role } : null;
  });

  // Visitors who aren't logged in land on the marketing page first.
  // "landing" | "login" — logged-in users skip both and go straight to the app.
  const [authScreen, setAuthScreen] = useState("landing");
  const [authMode, setAuthMode] = useState("login"); // which tab LoginScreen opens on

  // "chat" | "dashboard" | "upload" | "users" | "quizzes" | "profile"
  const [view, setView] = useState("chat");
  const [sessionId, setSessionId] = useState(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  function handleLogout() {
    localStorage.removeItem("learnmate_token");
    localStorage.removeItem("learnmate_username");
    localStorage.removeItem("learnmate_role");
    setUser(null);
    setView("chat");
    setSessionId(null);
    setAuthScreen("landing");
  }

  function handleSessionCreated(newSessionId) {
    setSessionId(newSessionId);
    setSidebarRefreshKey((k) => k + 1); // makes the new session show up in the sidebar right away
  }

  function handleNewChat() {
    setSessionId(null);
    setView("chat");
  }

  const isAdmin = user?.role === "ADMIN";
  const canUpload = isAdmin || user?.role === "TEACHER";
  const backToChat = () => setView("chat");

  return (
    <ThemeProvider>
      {/* h-full (not h-screen/w-screen): #root is sized to the *visible*
          viewport in index.css, so this doesn't get cut off by the mobile
          browser toolbar or add a sideways scrollbar. */}
      <div className="h-full w-full bg-[var(--bg)] text-[var(--text)]">
        {user ? (
          <div className="flex h-full w-full">
            <Sidebar
              activeSessionId={sessionId}
              refreshKey={sidebarRefreshKey}
              onSelectSession={(id) => {
                setSessionId(id);
                setView("chat");
              }}
              onNewChat={handleNewChat}
            />

            {/* min-w-0 lets this column shrink instead of overflowing when the
                page inside it is wider than the space beside the sidebar. */}
            <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
              {view === "dashboard" ? (
                <PageFrame onBack={backToChat}>
                  <Dashboard
                    role={user.role}
                    currentUsername={user.username}
                    onOpenQuizzes={() => setView("quizzes")}
                  />
                </PageFrame>
              ) : view === "upload" && canUpload ? (
                <PageFrame onBack={backToChat}>
                  <DocumentUpload
                    token={user.token}
                    role={user.role}
                    apiBase={`${import.meta.env.VITE_API_BASE_URL}/api/documents`}
                  />
                </PageFrame>
              ) : view === "users" && isAdmin ? (
                <PageFrame onBack={backToChat}>
                  <ManageUsers currentUsername={user.username} />
                </PageFrame>
              ) : view === "quizzes" ? (
                <PageFrame onBack={backToChat}>
                  <Quizzes
                    currentUsername={user.username}
                    role={user.role}
                    onAskLearnMate={backToChat}
                  />
                </PageFrame>
              ) : view === "profile" ? (
                <PageFrame onBack={backToChat}>
                  <ProfilePage />
                </PageFrame>
              ) : (
                <ChatWindow
                  currentUser={user.username}
                  currentRole={user.role}
                  onLogout={handleLogout}
                  isAdmin={canUpload}
                  onOpenUpload={() => setView("upload")}
                  onOpenUsers={() => setView("users")}
                  onOpenQuizzes={() => setView("quizzes")}
                  onOpenProfile={() => setView("profile")}
                  onOpenDashboard={() => setView("dashboard")}
                  sessionId={sessionId}
                  onSessionCreated={handleSessionCreated}
                  onNewChat={handleNewChat}
                />
              )}
            </div>
          </div>
        ) : authScreen === "landing" ? (
          <LandingPage
            onEnter={(mode) => {
              setAuthMode(mode);
              setAuthScreen("login");
            }}
          />
        ) : (
          <LoginScreen
            initialMode={authMode}
            onBack={() => setAuthScreen("landing")}
            onAuthenticated={(result) => {
              localStorage.setItem("learnmate_token", result.token);
              localStorage.setItem("learnmate_username", result.username);
              localStorage.setItem("learnmate_role", result.role);

              setUser({
                username: result.username,
                token: result.token,
                role: result.role,
              });
            }}
          />
        )}
      </div>
    </ThemeProvider>
  );
}