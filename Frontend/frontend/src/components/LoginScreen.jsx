import { useState } from "react";
import { login, register } from "../api/client";

export default function LoginScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("USER");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const result = mode === "login"
        ? await login(username, password)
        : await register(username, password, role);
      console.log(result);
      localStorage.setItem("learnmate_token", result.token);
      localStorage.setItem("learnmate_username", result.username);
      onAuthenticated(result);
    } catch (err) {
      setError(err.response?.data?.message ?? "Something went wrong. Check your username and password.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-ink text-parchment">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded-lg border border-moss bg-moss/20 p-6">
        <h1 className="font-display text-2xl">
          LearnMate<span className="text-amber">.</span>
        </h1>

        <div className="flex overflow-hidden rounded border border-moss font-mono text-xs uppercase">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 py-2 ${mode === "login" ? "bg-amber text-ink" : ""}`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 py-2 ${mode === "register" ? "bg-amber text-ink" : ""}`}
          >
            Register
          </button>
        </div>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="w-full rounded border border-moss bg-transparent px-3 py-2 text-sm focus:border-amber focus:outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border border-moss bg-transparent px-3 py-2 text-sm focus:border-amber focus:outline-none"
        />

        {mode === "register" && (
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded border border-moss bg-ink px-3 py-2 text-sm focus:border-amber focus:outline-none"
          >
            <option value="USER">Learner</option>
            <option value="ADMIN">Admin (can upload documents)</option>
          </select>
        )}

        {error && <p className="text-xs text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={isLoading || !username || !password}
          className="w-full rounded-md bg-amber py-2 text-sm font-medium text-ink disabled:opacity-40"
        >
          {mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}