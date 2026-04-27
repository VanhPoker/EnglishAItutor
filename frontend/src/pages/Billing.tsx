import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Loader2, QrCode, RefreshCw } from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import {
  createPaymentRequest,
  getBillingStatus,
  getMyPaymentRequests,
  getPlans,
  type BillingStatus,
  type PaymentRequestInfo,
  type PlanInfo,
  type SubscriptionPlan,
} from "../lib/api";
import { subscriptionLabel } from "../lib/labels";

function formatPrice(value: number) {
  return value === 0 ? "Miễn phí" : `${value.toLocaleString("vi-VN")}đ/tháng`;
}

function usageText(used: number, limit: number | null) {
  return limit == null ? `${used}/Không giới hạn` : `${used}/${limit}`;
}

function qrUrl(payload: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payload)}`;
}

export default function Billing() {
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [payments, setPayments] = useState<PaymentRequestInfo[]>([]);
  const [creatingPlan, setCreatingPlan] = useState<SubscriptionPlan | null>(null);
  const [error, setError] = useState("");

  const latestPending = useMemo(
    () => payments.find((item) => item.status === "pending"),
    [payments]
  );

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [planData, billingData, paymentData] = await Promise.all([
        getPlans(),
        getBillingStatus(),
        getMyPaymentRequests(),
      ]);
      setPlans(planData);
      setStatus(billingData);
      setPayments(paymentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được thông tin gói");
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreatePayment = async (plan: Exclude<SubscriptionPlan, "free">) => {
    setCreatingPlan(plan);
    setError("");
    try {
      const payment = await createPaymentRequest(plan);
      setPayments((current) => [payment, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tạo được yêu cầu thanh toán");
    } finally {
      setCreatingPlan(null);
    }
  };

  return (
    <Layout>
      <div className="page-shell">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-700">Gói học</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Thanh toán QR</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Chọn gói, quét QR chuyển khoản và chờ admin xác nhận để mở giới hạn.
            </p>
          </div>
          <button type="button" onClick={() => void loadData()} className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Tải lại
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm text-gray-500">Gói hiện tại</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {subscriptionLabel(status?.subscription_plan || "free")}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Chat hôm nay</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {usageText(status?.chat_used_today ?? 0, status?.chat_limit ?? 5)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Quiz hôm nay</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {usageText(status?.quiz_used_today ?? 0, status?.quiz_limit ?? 10)}
            </p>
          </Card>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.code} className={status?.subscription_plan === plan.code ? "border-blue-300 bg-blue-50" : ""}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
                  <p className="mt-1 text-2xl font-bold text-blue-700">{formatPrice(plan.price_vnd)}</p>
                </div>
                {status?.subscription_plan === plan.code && <Badge variant="success">Đang dùng</Badge>}
              </div>
              <ul className="mt-5 space-y-2 text-sm text-gray-600">
                <li>{plan.chat_limit == null ? "Không giới hạn chat" : `${plan.chat_limit} lượt chat/ngày`}</li>
                <li>{plan.quiz_limit == null ? "Không giới hạn quiz" : `${plan.quiz_limit} lượt quiz/ngày`}</li>
                <li>Phương thức thanh toán: QR chuyển khoản</li>
              </ul>
              {plan.code === "free" ? (
                <button className="btn-secondary mt-6 w-full" disabled>Gói mặc định</button>
              ) : (
                <button
                  type="button"
                  disabled={creatingPlan === plan.code}
                  onClick={() => void handleCreatePayment(plan.code as Exclude<SubscriptionPlan, "free">)}
                  className="btn-primary mt-6 inline-flex w-full items-center justify-center gap-2"
                >
                  {creatingPlan === plan.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Thanh toán QR
                </button>
              )}
            </Card>
          ))}
        </div>

        {latestPending && (
          <Card className="mt-6">
            <div className="grid gap-6 md:grid-cols-[260px_1fr]">
              <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
                <img src={qrUrl(latestPending.qr_payload)} alt="QR thanh toán" className="mx-auto h-56 w-56" />
                <div className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-gray-700">
                  <QrCode className="h-4 w-4" />
                  Quét QR để chuyển khoản
                </div>
              </div>
              <div>
                <Badge variant="warning">Chờ admin xác nhận</Badge>
                <h2 className="mt-3 text-xl font-bold text-gray-900">
                  Yêu cầu nâng cấp {subscriptionLabel(latestPending.plan)}
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  Số tiền: <span className="font-semibold">{latestPending.amount_vnd.toLocaleString("vi-VN")}đ</span>
                </p>
                <div className="mt-4 rounded-lg bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-500">Nội dung QR</p>
                  <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{latestPending.qr_payload}</pre>
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
