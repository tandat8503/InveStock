# Kế hoạch Chuyển đổi Kiến trúc sang Tauri 2 & Rust (`docs/migration-plan.md`)

Tài liệu này định nghĩa chi tiết lộ trình chuyển đổi Ứng dụng InveStock từ Electron (Node.js) sang **Tauri 2 (Rust Backend)**.

---

## I. MỤC TIÊU VÀ NGUYÊN TẮC CỐT LÕI

1. **Không sử dụng Electron**: Thay thế toàn bộ Main/Preload process bằng Rust crate binaries và Tauri 2 commands.
2. **Nghiệp vụ tài chính & tồn kho nằm 100% tại Rust Backend**:
   - Mọi thao tác ghi/sửa dữ liệu phát sinh giao dịch kho (xác nhận/hủy nhập kho, xuất kho, điều chỉnh kho, thanh toán công nợ) bắt buộc thực thi trong **1 SQLite Transaction duy nhất** trong Rust.
   - Frontend React chỉ đóng vai trò hiển thị UI, thu thập input, validate sơ bộ (chẳng hạn kiểm tra trường rỗng) và gọi `invoke('command_name', payload)`.
3. **An toàn dữ liệu & Không âm tồn**:
   - Mặc định kiểm soát tồn kho không cho phép xuất vượt tồn kho khả dụng (`InsufficientStockError`).
   - Mọi phép tính tiền tệ VND lưu dạng số nguyên (`i64`).
4. **Moving Weighted Average Cost (Giá vốn bình quân gia quyền di động)**:
   - Được tính toán tự động tại Backend Rust khi xác nhận nhập kho.
   - Snapshot giá vốn được ghi nhận vào từng dòng xuất kho (`unit_cost_at_sale`) để bảo đảm tính chính xác của báo cáo lợi nhuận gộp theo thời gian.

---

## II. DATABASE SCHEMA MỚI TRÊN TAURI 2 (SQLITE)

Hệ thống database SQLite mới chạy trên Rust với `rusqlite` sẽ thực thi các bảng chính sau:

```sql
-- Enable foreign keys
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- 1. Bảng danh mục sản phẩm
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_code TEXT NOT NULL UNIQUE,
    product_name TEXT NOT NULL,
    animal_category TEXT NOT NULL, -- heo | ga | vit | bo | de | khac
    package_weight_grams INTEGER NOT NULL DEFAULT 25000,
    package_weight_unit TEXT NOT NULL DEFAULT 'kg',
    inventory_unit TEXT NOT NULL, -- Bao | Tui | Bich
    brand TEXT,
    latest_purchase_price INTEGER NOT NULL DEFAULT 0,
    average_cost INTEGER NOT NULL DEFAULT 0,
    current_sale_price INTEGER NOT NULL DEFAULT 0,
    current_stock INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 2. Bảng nhà cung cấp
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    tax_code TEXT,
    contact_person TEXT,
    bank_account TEXT,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 3. Phiếu nhập kho
CREATE TABLE IF NOT EXISTS purchase_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_code TEXT NOT NULL UNIQUE,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    received_date TEXT NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    subtotal INTEGER NOT NULL DEFAULT 0,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    tax_amount INTEGER NOT NULL DEFAULT 0,
    shipping_cost INTEGER NOT NULL DEFAULT 0,
    shipping_allocation_method TEXT NOT NULL DEFAULT 'quantity',
    grand_total INTEGER NOT NULL DEFAULT 0,
    paid_amount INTEGER NOT NULL DEFAULT 0,
    remaining_amount INTEGER NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'chua_thanh_toan',
    payment_method TEXT NOT NULL DEFAULT 'chuyen_khoan',
    status TEXT NOT NULL DEFAULT 'nhap', -- nhap | xac_nhan | huy
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    confirmed_at TEXT,
    cancelled_at TEXT
);

-- 4. Chi tiết phiếu nhập kho
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    invoice_unit_price INTEGER NOT NULL,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    shipping_allocation INTEGER NOT NULL DEFAULT 0,
    effective_unit_cost INTEGER NOT NULL,
    line_total INTEGER NOT NULL,
    notes TEXT
);

-- 5. Thanh toán công nợ NCC
CREATE TABLE IF NOT EXISTS supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id),
    payment_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'chuyen_khoan',
    transaction_reference TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 6. Phiếu xuất kho / bán hàng
CREATE TABLE IF NOT EXISTS sales_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_code TEXT NOT NULL UNIQUE,
    electronic_invoice_number TEXT,
    invoice_date TEXT NOT NULL,
    buyer_type TEXT NOT NULL DEFAULT 'khach_le',
    buyer_name TEXT,
    subtotal INTEGER NOT NULL DEFAULT 0,
    grand_total INTEGER NOT NULL DEFAULT 0,
    total_cost INTEGER NOT NULL DEFAULT 0,
    estimated_profit INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'nhap', -- nhap | xac_nhan | huy
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    confirmed_at TEXT,
    cancelled_at TEXT,
    cancellation_reason TEXT
);

-- 7. Chi tiết phiếu xuất kho
CREATE TABLE IF NOT EXISTS sales_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sales_invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_sale_price INTEGER NOT NULL,
    unit_cost_at_sale INTEGER NOT NULL,
    line_revenue INTEGER NOT NULL,
    line_cost INTEGER NOT NULL,
    estimated_profit INTEGER NOT NULL
);

-- 8. Nhật ký biến động tồn kho (Inventory Transactions Ledger)
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_date TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id),
    transaction_type TEXT NOT NULL, -- nhap | xuat | dieu_chinh | huy_nhap | huy_xuat | legacy_opening
    source_type TEXT NOT NULL, -- purchase_invoice | sales_invoice | adjustment | legacy_summary
    source_id INTEGER NOT NULL,
    quantity_in INTEGER NOT NULL DEFAULT 0,
    quantity_out INTEGER NOT NULL DEFAULT 0,
    unit_cost INTEGER NOT NULL DEFAULT 0,
    stock_before INTEGER,
    stock_after INTEGER NOT NULL,
    old_average_cost INTEGER,
    new_average_cost INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 9. Lịch sử giá
CREATE TABLE IF NOT EXISTS product_price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    price_type TEXT NOT NULL DEFAULT 'sale_price',
    old_price INTEGER NOT NULL,
    new_price INTEGER NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    reason TEXT
);

-- 10. File đính kèm
CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 11. Cài đặt ứng dụng
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 12. Schema Versioning
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

---

## III. QUY TRÌNH TRANSACTION TRONG RUST BACKEND

### 1. Phê duyệt Phiếu Nhập Kho (`confirm_purchase_invoice`)
```text
BEGIN TRANSACTION;
  1. Lock purchase_invoice row FOR UPDATE.
  2. Verify invoice status == 'nhap'.
  3. Load invoice items.
  4. For each item:
     a. Calculate effective_unit_cost = (invoice_unit_price - item_discount) + (shipping_allocation / quantity).
     b. Read current product stock & average_cost.
     c. Calculate new_stock = current_stock + quantity.
     d. Calculate new_average_cost = (current_stock * average_cost + quantity * effective_unit_cost) / new_stock.
     e. Update products SET current_stock = new_stock, average_cost = new_average_cost, latest_purchase_price = effective_unit_cost.
     f. Insert into inventory_transactions (nhap).
  5. Update purchase_invoices status = 'xac_nhan', confirmed_at = now().
COMMIT TRANSACTION;
```

### 2. Phê duyệt Phiếu Xuất Kho (`confirm_sales_invoice`)
```text
BEGIN TRANSACTION;
  1. Lock sales_invoice row FOR UPDATE.
  2. Verify invoice status == 'nhap'.
  3. Load invoice items.
  4. For each item:
     a. Read current product stock & average_cost.
     b. IF current_stock < quantity -> ROLLBACK & RETURN InsufficientStockError.
     c. Calculate unit_cost_at_sale = average_cost.
     d. Calculate line_revenue = quantity * unit_sale_price, line_cost = quantity * unit_cost_at_sale, profit = line_revenue - line_cost.
     e. Update sales_invoice_items SET unit_cost_at_sale, line_revenue, line_cost, estimated_profit.
     f. Update products SET current_stock = current_stock - quantity.
     g. Insert into inventory_transactions (xuat).
  5. Update sales_invoices status = 'xac_nhan', confirmed_at = now(), total_cost, estimated_profit.
COMMIT TRANSACTION;
```

---

## IV. ĐỊNH HƯỚNG MIGRATION DỮ LIỆU CŨ TỪ ELECTRON

1. **Phát hiện dữ liệu Electron cũ**: Kiểm tra sự tồn tại của file `feed-inventory.db` tại vị trí mặc định Electron.
2. **Kiểm tra Schema**: Xác nhận phiên bản `schema_migrations` (v6).
3. **Migration Runner trong Rust**:
   - Sử dụng connection phụ mở DB cũ.
   - Đọc dữ liệu từng bảng (`products`, `suppliers`, `purchase_invoices`, `sales_invoices`, `inventory_transactions`, `legacy_inventory_summaries`).
   - Ghi dữ liệu đã được xác minh sang DB Tauri mới trong SQLite Transaction.
   - Hiển thị tiến trình và báo cáo kết quả đối soát dữ liệu (số lượng bản ghi, tổng tiền tồn kho).
