# Shopping History (Lịch Sử Mua Sắm)

Integration dành cho Home Assistant giúp bạn theo dõi chi tiêu mua sắm cá nhân, quản lý bảo hành và thống kê tài chính.

## Tính năng
* Lưu trữ dữ liệu mua sắm cục bộ (SQLite).
* Thống kê chi tiêu theo **Tháng**, **Năm**, **Ngành hàng** (Category) và **Tổng tích lũy**.
* Quản lý bảo hành: Tự động tính ngày hết hạn bảo hành dựa trên số tháng nhập vào.
* Hỗ trợ nhập liệu dễ dàng qua Developer Tools hoặc Automation.
* Hiển thị chi tiết từng đơn hàng trong Attributes của Sensor để dùng với Flex Table Card.

## Cài đặt

### Qua HACS (Khuyên dùng)
1.  Vào HACS > Integrations > Dấu 3 chấm góc phải > Custom repositories.
2.  Dán đường dẫn Github của repo này vào. Chọn Category là **Integration**.
3.  Tìm kiếm "Shopping History" và cài đặt.
4.  Khởi động lại Home Assistant.

### Thủ công
1.  Tải code về.
2.  Copy thư mục `shopping_history` vào đường dẫn `/config/custom_components/`.
3.  Khởi động lại Home Assistant.

## Cấu hình
1.  Vào **Settings** > **Devices & Services**.
2.  Bấm **Add Integration** > Tìm **Shopping History**.
3.  Đặt tên hiển thị (ví dụ: Lịch sử mua sắm).

## Cách sử dụng (Nhập dữ liệu)
Để thêm một đơn hàng mới, bạn sử dụng Service: `shopping_history.add_order`.

**Ví dụ nhập liệu:**
1.  Vào **Developer Tools** > **Services**.
2.  Chọn service: `Shopping History: Thêm đơn hàng mới`.
3.  Điền các thông tin:
    * **Entry ID**: Lấy ID của integration (Bắt buộc).
    * **Tên hàng hóa**: iPhone 15
    * **Nơi mua**: Shopee
    * **Ngành hàng**: Công nghệ
    * **Giá**: 20000000
    * **Bảo hành**: 12 (tháng)
4.  Bấm **Call Service**.

Dữ liệu sẽ được cập nhật ngay lập tức lên các Sensor.
