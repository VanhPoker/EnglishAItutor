import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import Layout from "../components/ui/Layout";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import {
  getAdminPayments,
  updateAdminPayment,
  type PaymentRequestInfo,
  type PaymentStatus,
} from "../lib/api";
import { subscriptionLabel } from "../lib/labels";

function formatDate(value: string) {
  return new Date(value).toLocaleString("vi-VN");
}

function statusVariant(status: PaymentStatus): "success" | "warning" | "error" {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  return "warning";
}

function statusLabel(status: PaymentStatus) {
  return {
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    rejected: "Từ chối",
  }[status];
}

export default function AdminPayments() {
  const [payments, setPayments] = useState<PaymentRequestInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const pendingCount = useMemo(
    () => payments.filter((item) => item.status === "pending").length,
    [payments]
  );

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayments(await getAdminPayments());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được yêu cầu thanh toán");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const handleUpdate = async (payment: PaymentRequestInfo, status: PaymentStatus) => {
    setUpdatingId(payment.id);
    setError("");
    try {
      const updated = await updateAdminPayment(payment.id, { status });
      setPayments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không cập nhật được thanh toán");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Layout>
      <div className="page-shell">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-700">Quản trị thanh toán</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">Yêu cầu QR</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Kiểm tra chuyển khoản ngoài hệ thống, sau đó duyệt để mở gói cho người dùng.
            </p>
          </div>
          <button type="button" onClick={() => void loadPayments()} className="btn-secondary inline-flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
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
            <p className="text-sm text-gray-500">Tổng yêu cầu</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{payments.length}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">Chờ duyệt</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{pendingCount}</p>
          </Card>
          <Card>
            <p className="text-sm text-gray-500">QR only</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">Bật</p>
          </Card>
        </div>

        <Card className="mt-6">
          {loading ? (
            <div className="flex items-center gap-3 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải thanh toán...
            </div>
          ) : payments.length === 0 ? (
            <p className="py-8 text-sm text-gray-500">Chưa có yêu cầu thanh toán.</p>
          ) : (
            <div className="divide-y divide-gray-200">
              {payments.map((payment) => (
                <div key={payment.id} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-gray-900">{payment.user_name || payment.user_email}</h2>
                      <Badge variant={statusVariant(payment.status)}>{statusLabel(payment.status)}</Badge>
                      <Badge variant="info">{subscriptionLabel(payment.plan)}</Badge>
                    </div>
                    <p className="mt-1 break-all text-sm text-gray-500">{payment.user_email}</p>
                    <p className="mt-2 text-sm text-gray-600">
                      {payment.amount_vnd.toLocaleString("vi-VN")}đ · {formatDate(payment.created_at)}
                    </p>
                    <pre className="mt-3 max-w-3xl whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                      {payment.qr_payload}
                    </pre>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={payment.status !== "pending" || updatingId === payment.id}
                      onClick={() => void handleUpdate(payment, "approved")}
                      className="btn-primary inline-flex items-center gap-2"
                    >
                      {updatingId === payment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Duyệt
                    </button>
                    <button
                      type="button"
                      disabled={payment.status !== "pending" || updatingId === payment.id}
                      onClick={() => void handleUpdate(payment, "rejected")}
                      className="btn-secondary inline-flex items-center gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <XCircle className="h-4 w-4" />
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
