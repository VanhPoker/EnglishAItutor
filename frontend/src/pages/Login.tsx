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
        setError("Mật khẩu xác nhận không khớp.");
        return;
      }
      if (password.length < 8) {
        setError("Mật khẩu cần tối thiểu 8 ký tự.");
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
      navigate(res.user.role === "admin" ? "/admin" : "/");
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Gia sư AI tiếng Anh</h1>
          <p className="text-gray-500 mt-2">
            {isRegister ? "Tạo tài khoản học viên" : "Chào mừng quay lại"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="surface-card space-y-5 p-8"
        >
          {isRegister && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field"
                placeholder="Tên của bạn"
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
              className="field"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder="Mật khẩu"
              minLength={8}
              autoComplete={isRegister ? "new-password" : "current-password"}
            />
            {isRegister && (
              <p className="text-xs text-gray-500 mt-1">
                Dùng ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.
              </p>
            )}
          </div>

          {isRegister && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="field"
                  placeholder="Nhập lại mật khẩu"
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngôn ngữ mẹ đẻ</label>
                  <input
                    type="text"
                    value={nativeLanguage}
                    onChange={(e) => setNativeLanguage(e.target.value)}
                    className="field"
                    placeholder="vi"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trình độ CEFR</label>
                  <select
                    value={cefrLevel}
                    onChange={(e) => setCefrLevel(e.target.value)}
                    className="field bg-white"
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
            className="btn-primary flex w-full items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{loading ? "Đang xử lý..." : isRegister ? "Tạo tài khoản" : "Đăng nhập"}</span>
          </button>

          <p className="text-center text-sm text-gray-500">
            {isRegister ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError("");
                setPassword("");
                setConfirmPassword("");
              }}
              className="font-medium text-blue-700 hover:underline"
            >
              {isRegister ? "Đăng nhập" : "Tạo tài khoản"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
