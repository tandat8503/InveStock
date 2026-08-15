# Changelog

## 1.0.0 — 2026-08-08

Phiên bản production đầu tiên của InveStock:

- Quản lý sản phẩm và nhà cung cấp.
- Phiếu nhập, giá vốn bình quân và thanh toán nhà cung cấp.
- Phiếu xuất và kiểm soát tồn kho.
- Tồn kho, thẻ kho, tra cứu hóa đơn và báo cáo.
- Backup, restore, pre-restore recovery và auto-backup.
- Báo cáo Nhập – Xuất – Tồn tách riêng điều chỉnh và cancellation.
- Migration tự động có verified pre-migration backup theo schema version hiện hành.
- Giao diện Tauri thuần với phản hồi và xác nhận cho thao tác quan trọng.

### Known limitations

- Chỉ một thiết bị/người dùng tại một thời điểm.
- Không đồng bộ cloud.
- Không phát hành hóa đơn điện tử.
- Không quản lý lô hoặc hạn sử dụng.
- Không quản lý công nợ khách hàng.
- Bản phát hành công khai cần Apple codesign/notarization và chứng thư ký Windows.
- Cập nhật bằng installer thủ công; chưa có auto-update.
