# Checklist test MVP English AI Tutor

Tài khoản test nên có 2 vai trò: `admin` để quản trị dữ liệu và `learner` để học.

## 1. Luồng khách chưa đăng nhập

- Mở `/` thấy landing page, logo, mô tả sản phẩm và 3 gói Free, Plus, Ultra.
- Bấm `Bắt đầu miễn phí` hoặc `Đăng nhập` vào được màn đăng nhập.
- Tạo tài khoản mới với mật khẩu đủ mạnh.

## 2. Luồng học viên

- Vào trang `Học tập`, chọn CEFR và chủ đề.
- Vào `Luyện nói`, gửi text và nói bằng mic; kiểm tra transcript hiện trong chat và agent không trả trùng tin.
- Nghe được TTS ở nhiều lượt trả lời, không chỉ lượt đầu.
- Vào `Bài quiz`, mở quiz, làm bài, nộp bài.
- Trang kết quả hiển thị điểm, câu đúng/sai, giải thích và AI review điểm mạnh/yếu.
- Vào `Gói học`, kiểm tra quota hôm nay và tạo yêu cầu thanh toán QR.
- Với gói Free, kiểm tra thông báo hết lượt khi vượt 5 lượt chat/ngày hoặc 10 lượt quiz/ngày.

## 3. Luồng admin

- Vào `/admin/users`, sửa tên, CEFR, role và gói đăng ký của user.
- Xoá user test; không được xoá chính tài khoản admin đang đăng nhập.
- Vào `/admin/quizzes`, tạo quiz bằng AI, tự tạo, import file, tạo từ nguồn mở.
- Sửa quiz đã có, đổi tiêu đề/câu hỏi/đáp án/ảnh, lưu lại rồi mở lại để kiểm tra dữ liệu đúng.
- Xoá quiz test và kiểm tra học viên không còn thấy quiz đó.
- Vào `/admin/payments`, duyệt yêu cầu QR; user được nâng gói sau khi duyệt.

## 4. Luồng dữ liệu và lỗi cần quan sát

- Refresh trang sau đăng nhập vẫn giữ session.
- Logout rồi login lại đúng role.
- API lỗi phải hiện thông báo dễ hiểu, không trắng màn.
- Mobile: menu ngang không vỡ layout, text không tràn khỏi card.
- Desktop: sidebar, card, bảng user/payment không bị lệch hoặc đè chữ.

## 5. Tiêu chí đủ tốt cho bảo vệ MVP

- Demo được 3 trụ cột: luyện nói AI, quiz có AI review, admin quản lý dữ liệu/người dùng/gói.
- Có phân quyền rõ admin/user.
- Có giới hạn Free/Plus/Ultra và QR payment flow.
- Có dữ liệu test sẵn vài quiz để người xem không phải nhập tay trong lúc demo.
- Không còn lỗi nghiêm trọng: duplicate tin nhắn, agent chen ngang quá sớm, TTS chỉ phát một lần, đăng ký/login fail, user thấy màn admin.
