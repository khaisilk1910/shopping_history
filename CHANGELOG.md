# Changelog

## 2026.11.7 — Home Assistant Marketplace / HACS

- Chuẩn hóa metadata cho Home Assistant 2026.11, bổ sung phân loại Marketplace `productivity_information.shopping_groceries` và `finance`; giữ nguyên domain `shopping_history`, `config_entry_id`, service names và vị trí SQLite cũ.
- Tích hợp Lovelace card dưới dạng static resource URL có version; tự đăng ký vào resource storage ở background, không dùng `add_extra_js_url`; hỗ trợ khai báo thủ công khi `resource_mode: yaml`.
- Thêm WebSocket `shopping_history/list_profiles` (bao gồm hồ sơ trống) và `shopping_history/subscribe_updates`; `get_data` hỗ trợ `if_revision` để giảm payload. Không phụ thuộc quyền quản lý config entries/entity registry trong frontend.
- Tách SQLite khỏi event loop, gộp thống kê sensor theo năm vào một query, dùng revision trong transaction, WAL và index. Không nạp hàng loạt đơn mua sắm khi khởi động tích hợp.
- Giữ nguyên cấu trúc bảng dữ liệu và thực hiện migration an toàn cho cơ sở dữ liệu cũ; thêm theo dõi schema version và ẩn thông tin giao dịch khỏi diagnostics.
- Bổ sung OptionsFlowWithReload cho phép bật/tắt sensor theo năm, xử lý đúng unload khi trạng thái options đã thay đổi; card hoạt động ngay cả khi không có sensor.
- Kiểm tra dữ liệu nhập, VAT, giá trị hữu hạn, khoảng ngày bảo hành và ID không tồn tại; log lỗi backend với traceback nhưng không đưa chi tiết SQL vào lỗi hiển thị trên card.
- Cải thiện kết nối lại và làm mới frontend, tránh quét toàn bộ trạng thái HA khi tải dữ liệu, không thực hiện nhiều scan chồng nhau, giảm tải cho HA khi dashboard đang mở.
- Bổ sung bản dịch vi/en, tài liệu cài đặt Marketplace và resource YAML, ví dụ automation, backup, logger, diagnostics và kiểm thử.
- Thêm CI kiểm tra syntax/schema/database/frontend, đồng thời chạy các validator `hassfest` và `hacs/action` chính thức trên GitHub.

**Giới hạn xác minh:** các bài test được chạy cục bộ mà không có instance Home Assistant 2026.11 thật. Cần chạy thử cấu hình và hiển thị card trên máy HA trước khi phát hành rộng rãi. Hãy sao lưu `/config/shopping_history` trước khi cập nhật.
