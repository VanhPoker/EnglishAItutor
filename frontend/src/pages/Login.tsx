import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { login, register } from "../lib/api";
import { useAuthStore } from "../stores/authStore";

const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("vi");
  const [cefrLevel, setCefrLevel] = useState("B1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isRegister) {
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
    }

    setLoading(true);

    try {
      const res = isRegister
        ? await register({
            email,
            password,
            name: name || email.split("@")[0],
            native_language: nativeLanguage,
            cefr_level: cefrLevel,
          })
        : await login(email, password);

      setSession(res.token, res.user);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">English AI Tutor</h1>
          <p className="text-gray-500 mt-2">
            {isRegister ? "Create your account" : "Welcome back"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-8 space-y-5"
        >
          {isRegister && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition"
              placeholder="••••••••"
              minLength={8}
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
            {isRegister && (
              <p className="text-xs text-gray-500 mt-1">
                Use 8+ characters with uppercase, lowercase, a number, and a special character.
              </p>
            )}
          </div>

          {isRegister && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition"
                  placeholder="Repeat your password"
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Native Language</label>
                  <input
                    type="text"
                    value={nativeLanguage}
                    onChange={(e) => setNativeLanguage(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition"
                    placeholder="vi"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CEFR Level</label>
                  <select
                    value={cefrLevel}
                    onChange={(e) => setCefrLevel(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition bg-white"
                  >
                    {levels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{loading ? "Working..." : isRegister ? "Create Account" : "Sign In"}</span>
          </button>

          <p className="text-center text-sm text-gray-500">
            {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError("");
                setPassword("");
                setConfirmPassword("");
              }}
              className="text-blue-600 hover:underline font-medium"
            >
              {isRegister ? "Sign In" : "Create one"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
