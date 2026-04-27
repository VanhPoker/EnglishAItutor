import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { forgotPassword, login, register, resetPassword } from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import BrandMark from "../components/ui/BrandMark";

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [nativeLanguage, setNativeLanguage] = useState("vi");
  const [resetCode, setResetCode] = useState("");
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (isForgotPassword) {
      setLoading(true);
      try {
        if (!resetCodeSent) {
          await forgotPassword(email);
          setResetCodeSent(true);
          setMessage("Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi qua Gmail.");
        } else {
          if (password !== confirmPassword) {
            setError("Mật khẩu xác nhận không khớp.");
            return;
          }
          await resetPassword({ email, code: resetCode, password });
          setMessage("Đổi mật khẩu thành công. Bạn có thể đăng nhập lại.");
          setIsForgotPassword(false);
          setResetCodeSent(false);
          setResetCode("");
          setPassword("");
          setConfirmPassword("");
        }
      } catch (err: any) {
        setError(err.message || "Không xử lý được yêu cầu đặt lại mật khẩu.");
      } finally {
        setLoading(false);
      }
      return;
    }

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
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8fafc_0%,#eef6ff_55%,#f8fafc_100%)] p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark size="lg" />
          <p className="mt-3 text-gray-500">
            {isForgotPassword ? "Đặt lại mật khẩu bằng mã Gmail" : isRegister ? "Tạo tài khoản học viên" : "Chào mừng quay lại"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="surface-card space-y-5 border-white/70 bg-white/95 p-8 shadow-xl shadow-blue-900/5"
        >
          {isRegister && !isForgotPassword && (
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

          {isForgotPassword && resetCodeSent && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mã xác nhận</label>
              <input
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                className="field"
                placeholder="Nhập mã 6 số"
                inputMode="numeric"
              />
            </div>
          )}

          {(!isForgotPassword || resetCodeSent) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
              placeholder={isForgotPassword ? "Mật khẩu mới" : "Mật khẩu"}
              minLength={8}
              autoComplete={isRegister || isForgotPassword ? "new-password" : "current-password"}
            />
            {(isRegister || isForgotPassword) && (
              <p className="text-xs text-gray-500 mt-1">
                Dùng ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.
              </p>
            )}
          </div>
          )}

          {isRegister && !isForgotPassword && (
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

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                Tài khoản mới bắt đầu ở B1. Admin sẽ điều chỉnh CEFR sau khi kiểm tra năng lực.
              </div>

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
            </>
          )}

          {isForgotPassword && resetCodeSent && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="field"
                placeholder="Nhập lại mật khẩu mới"
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          )}

          {message && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {message}
            </p>
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
            <span>
              {loading
                ? "Đang xử lý..."
                : isForgotPassword
                ? resetCodeSent
                  ? "Đổi mật khẩu"
                  : "Gửi mã qua Gmail"
                : isRegister
                ? "Tạo tài khoản"
                : "Đăng nhập"}
            </span>
          </button>

          {!isRegister && !isForgotPassword && (
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(true);
                setError("");
                setMessage("");
                setPassword("");
              }}
              className="w-full text-center text-sm font-medium text-blue-700 hover:underline"
            >
              Quên mật khẩu?
            </button>
          )}

          <p className="text-center text-sm text-gray-500">
            {isForgotPassword ? "Nhớ mật khẩu rồi?" : isRegister ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
            <button
              type="button"
              onClick={() => {
                if (isForgotPassword) {
                  setIsForgotPassword(false);
                  setResetCodeSent(false);
                  setResetCode("");
                } else {
                  setIsRegister(!isRegister);
                }
                setError("");
                setMessage("");
                setPassword("");
                setConfirmPassword("");
              }}
              className="font-medium text-blue-700 hover:underline"
            >
              {isForgotPassword ? "Đăng nhập" : isRegister ? "Đăng nhập" : "Tạo tài khoản"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
