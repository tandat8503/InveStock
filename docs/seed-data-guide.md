# Hướng Dẫn & Kế Hoạch Seed Dữ Liệu Test (InveStock)

Tài liệu này ghi lại kết quả **Audit Database** và **Kế hoạch triển khai Seed Data** an toàn cho ứng dụng InveStock.

---

## 1. PHÂN TÍCH DATABASE (DATABASE AUDIT)

### Khởi tạo & Vị trí lưu trữ
- **Database Initialization**: Khởi tạo tại `src-tauri/src/lib.rs` qua `init_db_pool()`.
- **File SQLite Path**: Đặt trong `App Local Data Dir` / `feed-inventory.db` (ví dụ trên macOS: `~/Library/Application Support/com.feedstore.inventorymanager/feed-inventory.db` hoặc `./data/feed-inventory.db`).

### Danh sách Migration & Các bảng (Migrations 1–6)
1. `schema_migrations` (`version INTEGER PRIMARY KEY`, `applied_at TEXT`)
2. `products`:
   - PK: `id INTEGER` (Autoincrement)
   - Unique: `product_code TEXT`
   - Numeric & Monetary types: `package_weight_grams INTEGER` (tính bằng Gram), `latest_purchase_price INTEGER`, `average_cost INTEGER`, `current_sale_price INTEGER`, `current_stock INTEGER` (tất cả Tiền mặt VND và Số lượng là **INTEGER**).
3. `suppliers`:
   - PK: `id INTEGER` (Autoincrement)
   - Fields: `company_name TEXT`, `phone`, `address`, `tax_code`, `contact_person`, `bank_account`, `notes`, `active INTEGER`.
4. `purchase_invoices`:
   - PK: `id INTEGER` (Autoincrement)
   - Unique: `receipt_code TEXT` (ví dụ: `PN-YYYYMMDD-XXX`)
   - FK: `supplier_id -> suppliers(id)`
   - Statuses: `status` (`'nhap'`, `'xac_nhan'`, `'huy'`), `payment_status` (`'chua_thanh_toan'`, `'thanh_toan_mot_phan'`, `'da_thanh_toan'`)
   - Monies: `subtotal`, `discount_amount`, `tax_amount`, `shipping_cost`, `grand_total`, `paid_amount`, `remaining_amount` (Tất cả INTEGER VND).
5. `purchase_invoice_items`:
   - PK: `id INTEGER`
   - FK: `purchase_invoice_id -> purchase_invoices(id)`, `product_id -> products(id)`
   - Fields: `quantity INTEGER`, `invoice_unit_price INTEGER`, `discount_amount INTEGER`, `shipping_allocation INTEGER`, `effective_unit_cost INTEGER`, `line_total INTEGER`.
6. `supplier_payments`:
   - PK: `id INTEGER`
   - FK: `purchase_invoice_id -> purchase_invoices(id)`
   - Fields: `payment_date TEXT`, `amount INTEGER`, `payment_method TEXT`, `transaction_reference TEXT`.
7. `sales_invoices`:
   - PK: `id INTEGER`
   - Unique: `issue_code TEXT` (ví dụ: `PX-YYYYMMDD-XXX`)
   - Statuses: `status` (`'nhap'`, `'xac_nhan'`, `'huy'`)
   - Fields: `buyer_type TEXT`, `buyer_name TEXT`, `subtotal`, `grand_total`, `total_cost`, `estimated_profit` (Snapshot giá vốn & lợi nhuận).
8. `sales_invoice_items`:
   - PK: `id INTEGER`
   - FK: `sales_invoice_id -> sales_invoices(id)`, `product_id -> products(id)`
   - Fields: `quantity INTEGER`, `unit_sale_price INTEGER`, `unit_cost_at_sale INTEGER` (Snapshot giá vốn tại thời điểm xuất), `line_revenue INTEGER`, `line_cost INTEGER`, `estimated_profit INTEGER`.
9. `inventory_transactions`:
   - PK: `id INTEGER`
   - FK: `product_id -> products(id)`
   - Fields: `transaction_date TEXT`, `transaction_type TEXT` (`'nhap'`, `'xuat'`, `'huy_nhap'`, `'huy_xuat'`), `source_type TEXT`, `source_id INTEGER`, `quantity_in INTEGER`, `quantity_out INTEGER`, `unit_cost INTEGER`, `stock_before INTEGER`, `stock_after INTEGER`, `old_average_cost INTEGER`, `new_average_cost INTEGER`.

---

## 2. NGUYÊN TẮC AN TOÀN KHI SEED DỮ LIỆU

1. **Không cho phép tự động run trong production**.
2. **Có thể gọi chủ động từ Developer Tools / Settings (Chỉ hiển thị nút Seed khi ở Dev Mode)**.
3. **Thao tác Atomic trong 1 SQLite Transaction (`BEGIN` ... `COMMIT` / `ROLLBACK`)**.
4. **Kiểm tra trạng thái DB trước khi Seed**: Thông báo số lượng dữ liệu hiện tại, yêu cầu người dùng xác nhận nếu DB không rỗng.
5. **Không dùng `DROP TABLE`**, chỉ xóa dữ liệu thông qua DELETE/CLEAN theo đúng thứ tự ràng buộc FK:
   - `supplier_payments` -> `sales_invoice_items` -> `sales_invoices` -> `purchase_invoice_items` -> `purchase_invoices` -> `inventory_transactions` -> `products` -> `suppliers`.

---

## 3. KỊCH BẢN SEED (MÔ PHỎNG DỮ LIỆU THỰC TẾ TRONG 6 THÁNG)

- **Nhà cung cấp**: 5 NCC tiêu biểu (CÔNG TY CP CARGILL VIỆT NAM, CÔNG TY TNHH CJ VINA FEED, CÔNG TY CP CÁM CÒ, CÔNG TY DE HEUS, CÔNG TY GREENFEED).
- **Danh mục sản phẩm**: 12+ sản phẩm phủ đủ các nhóm vật nuôi (Heo, Gà, Vịt, Bò), bao gồm sản phẩm đủ tồn kho và **2-3 sản phẩm hết hàng/sắp hết hàng** (current_stock = 0).
- **Chứng từ Nhập kho (Purchase Invoices)**:
  - 15+ Phiếu nhập xuyên suốt 6 tháng gần đây (đã xác nhận).
  - Có chi phí vận chuyển phân bổ làm thay đổi `effective_unit_cost`.
  - Cập nhật đúng Moving Weighted Average Cost (`average_cost`) và `current_stock` cho `products`.
  - Tạo các bản ghi `inventory_transactions` tương ứng.
- **Chứng từ Xuất kho (Sales Invoices)**:
  - 25+ Hóa đơn bán hàng xuyên suốt 6 tháng gần đây.
  - Tính đúng `unit_cost_at_sale` lấy từ `average_cost` hiện tại của sản phẩm.
  - Trừ `current_stock` chính xác, ghi log `inventory_transactions`.
  - Tính toán `total_cost`, `grand_total`, và `estimated_profit` đồng bộ giữa hóa đơn và chi tiết.
- **Thanh toán & Công nợ**:
  - Tạo một số bản ghi trong `supplier_payments` cho các phiếu nhập.
  - Cập nhật `paid_amount`, `remaining_amount` và `payment_status` (`'da_thanh_toan'`, `'thanh_toan_mot_phan'`, `'chua_thanh_toan'`) trên `purchase_invoices`.

---

## 4. CÁC THÀNH PHẦN TRIỂN KHAI

1. **Rust Backend (`src-tauri/src/services/seed_service.rs`)**:
   - Hàm `get_database_stats(&self) -> AppResult<DatabaseStats>`
   - Hàm `seed_test_data(&self, overwrite: bool) -> AppResult<SeedResult>`
2. **Rust Commands (`src-tauri/src/commands/seed_commands.rs`)**:
   - Command `get_db_stats` & `seed_demo_data`
3. **Bridge & Client (`src/lib/tauriClient.ts` & `electronCompatBridge.ts`)**:
   - Expose IPC command đến React UI.
4. **UI Dev Tools / Developer Settings Component (`src/pages/Settings/DevSeedPanel.tsx`)**:
   - Panel an toàn trong Cài Đặt hiển thị số lượng bản ghi DB hiện tại và nút bấm kích hoạt Seed kèm Modal xác nhận cảnh báo.
