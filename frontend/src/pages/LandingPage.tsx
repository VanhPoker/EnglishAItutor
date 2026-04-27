import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, MessageSquare, ShieldCheck } from "lucide-react";
import { getPlans, type PlanInfo } from "../lib/api";
import { useEffect, useState } from "react";

function formatPrice(value: number) {
  return value === 0 ? "Miễn phí" : `${value.toLocaleString("vi-VN")}đ/tháng`;
}

function limitText(value: number | null, unit: string) {
  return value == null ? `Không giới hạn ${unit}` : `${value} ${unit}/ngày`;
}

export default function LandingPage() {
  const [plans, setPlans] = useState<PlanInfo[]>([]);

  useEffect(() => {
    getPlans()
      .then(setPlans)
      .catch(() =>
        setPlans([
          { code: "free", name: "Free", price_vnd: 0, chat_limit: 5, quiz_limit: 10, description: "" },
          { code: "plus", name: "Plus", price_vnd: 99000, chat_limit: 25, quiz_limit: null, description: "" },
          { code: "ultra", name: "Ultra", price_vnd: 199000, chat_limit: null, quiz_limit: null, description: "" },
        ])
      );
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold">Gia sư AI tiếng Anh</p>
              <p className="text-xs text-gray-500">Luyện nói, làm quiz, nhận xét bằng AI</p>
            </div>
          </div>
          <Link to="/login" className="btn-primary inline-flex items-center gap-2">
            Đăng nhập
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="relative min-h-[620px] overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1800&q=80"
          alt="Học tiếng Anh cùng nhóm bạn"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative mx-auto flex min-h-[620px] max-w-6xl items-center px-4 py-16">
          <div className="max-w-2xl text-white">
            <p className="text-sm font-semibold uppercase">English AI Tutor</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-6xl">
              Luyện nói tiếng Anh có đo tiến bộ rõ ràng
            </h1>
            <p className="mt-5 text-lg text-white/85">
              Chat với gia sư AI, làm quiz theo kho đề, xem AI review điểm mạnh và điểm cần cải thiện sau mỗi bài.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className="btn-primary inline-flex items-center gap-2 bg-white text-gray-900 hover:bg-gray-100">
                Bắt đầu miễn phí
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#plans" className="btn-secondary border-white/70 bg-white/10 text-white hover:bg-white/20">
                Xem gói học
              </a>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-14">
        <section className="grid gap-4 md:grid-cols-3">
          {[
            "5 lượt chat miễn phí mỗi ngày để bắt đầu ngay.",
            "Quiz có điểm số và AI review điểm mạnh, điểm yếu.",
            "Thanh toán QR đơn giản, admin duyệt gói sau khi nhận chuyển khoản.",
          ].map((item) => (
            <div key={item} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <p className="mt-3 text-sm text-gray-700">{item}</p>
            </div>
          ))}
        </section>

        <section id="plans" className="mt-14">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-700">Gói đăng ký</p>
              <h2 className="mt-1 text-3xl font-bold">Chọn mức học phù hợp</h2>
            </div>
            <p className="max-w-xl text-sm text-gray-500">
              Free phù hợp demo nhanh. Plus dành cho người làm nhiều quiz. Ultra mở toàn bộ giới hạn.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.code} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <p className="mt-1 text-2xl font-bold text-blue-700">{formatPrice(plan.price_vnd)}</p>
                  </div>
                  {plan.code === "ultra" && (
                    <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                      Đầy đủ
                    </span>
                  )}
                </div>
                <ul className="mt-5 space-y-3 text-sm text-gray-600">
                  <li>{limitText(plan.chat_limit, "lượt chat")}</li>
                  <li>{limitText(plan.quiz_limit, "lượt làm quiz")}</li>
                  <li>Thanh toán bằng QR chuyển khoản</li>
                </ul>
                <Link
                  to="/login"
                  className={plan.code === "free" ? "btn-secondary mt-6 inline-flex w-full justify-center" : "btn-primary mt-6 inline-flex w-full justify-center"}
                >
                  {plan.code === "free" ? "Tạo tài khoản" : "Đăng nhập để thanh toán QR"}
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-lg border border-gray-200 bg-gray-50 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-5 w-5 text-gray-700" />
              <div>
                <h2 className="font-semibold">Luồng thanh toán QR</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Người dùng tạo yêu cầu nâng cấp, quét QR chuyển khoản, admin xác nhận và mở gói.
                </p>
              </div>
            </div>
            <Link to="/login" className="btn-primary inline-flex items-center justify-center gap-2">
              Vào hệ thống
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
