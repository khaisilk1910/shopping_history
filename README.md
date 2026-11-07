# Shopping History — Lịch Sử Mua Hàng

Tích hợp quản lý đơn hàng, chi tiêu, VAT và bảo hành **cục bộ** cho Home Assistant, kèm thẻ Lovelace có trình chỉnh sửa trực quan. Hỗ trợ Home Assistant **2026.11.0 trở lên** và **Marketplace** tích hợp trong Home Assistant 2026.11 (cùng cấu trúc kho lưu trữ với HACS).

> Đây là custom integration do cộng đồng phát triển, không phải tích hợp chính thức của Home Assistant. Không cần tài khoản đám mây, không gửi lịch sử mua hàng đến máy chủ bên ngoài.

![Ảnh minh họa dashboard](https://github.com/user-attachments/assets/4279fb23-a1b7-4e09-9272-c64999d0bb3d)

## Cài đặt qua Marketplace

1. Home Assistant 2026.11+: mở **Settings → Marketplace** và tìm `Shopping History` hoặc thêm custom repository `https://github.com/khaisilk1910/shopping_history` dưới loại **Integration**.
2. Có thể mở trực tiếp bằng nút dưới đây (cần Home Assistant đã cấu hình My Home Assistant).

   [![Mở repository trong Marketplace](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=khaisilk1910&repository=shopping_history&category=integration)

3. Cài đặt và (nếu được nhắc) khởi động lại Home Assistant. Vào **Settings → Devices & services → Add integration → Lịch Sử Mua Hàng** và tạo ít nhất một hồ sơ.
4. Thẻ **Shopping History** sẽ được đăng ký dưới dạng Lovelace **JavaScript module** khi giao diện sử dụng chế độ resource mặc định (Storage). Tải lại trang hoặc làm mới bộ nhớ đệm frontend nếu vừa nâng cấp.
5. Mở dashboard → **Edit dashboard → Add card → Lịch Sử Mua Sắm** để chọn thẻ và chỉnh giao diện trong graphical editor.

**Không cài riêng card thành loại Marketplace Dashboard/plugin.** JavaScript đã nằm trong custom integration và được đăng ký tự động để tránh hai bản resource cùng nạp.

### Nếu dùng `lovelace: resource_mode: yaml`

Home Assistant không cho tích hợp tự ghi vào resources do YAML quản lý. Thêm thủ công URL và tải lại resources:

```yaml
lovelace:
  resource_mode: yaml
  resources:
    - url: /shopping_history_ui/shopping-history-card.js?v=2026.11.7
      type: module
```

Sau khi thay đổi YAML, chạy hành động `lovelace.reload_resources` (hoặc khởi động lại khi cần) và refresh trình duyệt. Khi cập nhật bản mới, thay giá trị `v=` cho phù hợp với `manifest.json` để tránh cache JavaScript cũ. Nếu đã cấu hình resource thủ công, **không đăng ký cùng URL lần thứ hai**.

### Cấu hình card bằng YAML

```yaml
type: custom:shopping-history-card
title: Quản Lý Mua Sắm
icon: mdi:cart-outline
card_height: 600
default_profile_id: ""
auto_contrast: true
```

Có thể chọn hồ sơ mặc định, đổi màu nền/gradient, độ trong suốt, border, shadow, màu chữ, màu tiền và chiều cao trong editor. Thẻ hỗ trợ Sections view (`getGridOptions`), Masonry (`getCardSize`), UI tối/sáng, điện thoại, tra cứu, phân trang, tình trạng bảo hành, thêm/sửa/xóa đơn hàng.

## Cấu hình tích hợp

Trong **Devices & services → Shopping History → Configure**, có thể bật/tắt tạo sensor tổng chi tiêu theo năm. Khi tắt sensor, **card vẫn hoạt động**, kể cả hồ sơ chưa có giao dịch. Thay đổi chỉ tải lại entry của Shopping History, không yêu cầu khởi động Home Assistant.

- Mỗi hồ sơ tạo một SQLite database trong `/config/shopping_history/shopping_data_<entry_id>.db`. Dữ liệu **không nằm trong thư mục `custom_components`**, nên nâng cấp qua Marketplace không thay thế database.
- Mỗi năm có đơn hàng sẽ có sensor tổng chi tiêu; dữ liệu chi tiết **không** được đưa vào thuộc tính entity/Recorder nhằm hạn chế kích thước lịch sử.
- Sensor có đơn vị cũ `đ` để giữ khả năng tương thích với lịch sử ghi nhận. Dữ liệu này được tính theo VNĐ, không phải một loại tiền có quy đổi tự động.
- Thẻ đọc trực tiếp dữ liệu chi tiết bằng WebSocket từ backend. Mỗi lần thay đổi database, backend đẩy thông báo và card chỉ cập nhật hồ sơ cần thiết; nếu revision không đổi, API không gửi lại danh sách đơn hàng.

Lưu ý về quyền riêng tư: dữ liệu chi tiết có thể được truy xuất qua WebSocket bởi người dùng đã đăng nhập Home Assistant. Chỉ lưu dữ liệu phù hợp với các tài khoản được cấp quyền truy cập hệ thống.

## Hành động / Automations

Có ba hành động (trước đây gọi là services): `shopping_history.add_order`, `shopping_history.edit_order`, `shopping_history.delete_order`.

Ví dụ thêm đơn hàng:

```yaml
action: shopping_history.add_order
data:
  entry_id: "<ID_HỒ_SƠ_SHOPPING_HISTORY>"
  name: "Bình giữ nhiệt"
  place: "Cửa hàng A"
  category: "Gia dụng"
  price: 250000
  quantity: 1
  vat: 8
  status: "Mới"
  warranty_months: 12
  purchase_date: "2026-11-07"
  note: "Mua làm quà"
```

Bạn có thể lấy `entry_id` bằng selector hồ sơ khi chọn action trong giao diện (không cần tự gõ ID). Giá tiền/ số lượng/ VAT phải là số hữu hạn hợp lệ; giá trị âm hoặc VAT lớn hơn 100% bị từ chối. Sửa và xóa cần `order_id` có thật. Sửa **không** tạo bản ghi mới khi ID không tồn tại.

## Chẩn đoán và xử lý lỗi

1. Vào **Settings → Devices & services → Shopping History → menu → Download diagnostics**. Tệp diagnostics chỉ chứa số đơn hàng, revision, chế độ SQLite và thiết lập sensor; **không có** mặt hàng, nơi mua, ghi chú hay dữ liệu cá nhân.
2. Bật ghi log tạm thời trong `configuration.yaml` để điều tra:

   ```yaml
   logger:
     default: warning
     logs:
       custom_components.shopping_history: debug
   ```

3. Xem log khi đọc/ghi SQLite lỗi, hoặc khi resource frontend chưa đăng ký được. Khi thẻ báo lỗi, kiểm tra **Developer tools → Console** của trình duyệt và xem thẻ có tải đúng URL JavaScript không.
4. Nếu lỗi sau nâng cấp, kiểm tra trùng resource ở **Settings → Dashboards → Resources**, làm mới trình duyệt/ứng dụng Companion. Có thể tạo bản sao lưu thư mục `/config/shopping_history/` trước khi nâng cấp.

## Phát triển và kiểm thử

Kiểm thử SQLite độc lập và cú pháp thẻ:

```bash
python -m pip install pytest pyyaml
pytest -q tests
node --check custom_components/shopping_history/frontend/shopping-history-card.js
node tests/test_card.js
```

Các bài kiểm thử xác nhận database mới/legacy, thêm/sửa/xóa, thống kê nhiều năm, revision/cache, đồng thời, hồ sơ trống và logic API phía frontend. Kiểm tra thực tế trên Home Assistant vẫn cần thực hiện trước khi phát hành cho toàn bộ người dùng.

## Phiên bản và phát hành

Để Marketplace cập nhật ổn định: cập nhật `manifest.json` và version của thẻ trước khi tạo GitHub release, dùng tag khớp với `manifest.json` (ví dụ `v2026.11.7`). Không sửa/force-push tag sau khi đã xuất bản release. Quy trình CI chạy thêm công cụ xác thực chính thức `hassfest` và `hacs/action` để kiểm tra chuẩn Marketplace/HACS. Repository trên GitHub cần public, bật Issues, có topics phù hợp và phát hành release/tag trùng manifest để được Marketplace theo dõi cập nhật.

Giấy phép: MIT. Theo dõi lỗi: https://github.com/khaisilk1910/shopping_history/issues
