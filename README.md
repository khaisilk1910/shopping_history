# Lịch Sử Mua Hàng (Shopping History)

Integration dành cho Home Assistant giúp theo dõi chi tiêu, quản lý bảo hành và thống kê tài chính cá nhân.

<img width="1839" height="796" alt="image" src="https://github.com/user-attachments/assets/b26d7e05-c775-4de8-930e-2ee1d6083d48" />

## Cài đặt

1. Nhấn nút bên dưới để thêm vào HACS trên Home Assistant.

  [![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=khaisilk1910&repository=shopping_history&category=integration)

  - Sau khi thêm trong HACS và khởi động lại Home Assistant
     
  - Vào Settings -> Integrations -> Add integration
  
     
## Tính năng
* **Lưu trữ an toàn:** Dữ liệu lưu ngoài thư mục component, không mất khi update.
* **Tự động hóa:** Sensor tự động tạo mới khi có tháng/năm/ngành hàng mới mà không cần restart.
* **Thống kê:** Tổng hợp chi tiêu theo Thời gian và Ngành hàng.
* **Chi tiết:** Hiển thị danh sách hàng hóa, nơi mua, hạn bảo hành trong Attributes.

## Cài đặt
1. Cài đặt qua HACS bằng cách add Custom Repository (Link GitHub của bạn).
2. Vào Settings > Devices & Services > Add Integration > Tìm "Lịch Sử Mua Hàng".

## Sử dụng
Dùng Service `shopping_history.add_order` trong Developer Tools hoặc Automation để nhập liệu.
