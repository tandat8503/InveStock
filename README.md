# InveStock

Ứng dụng desktop quản lý nhập kho và tồn kho thức ăn chăn nuôi. Hoạt động offline, không cần internet.

## Yêu cầu hệ thống

- **Windows**: Windows 10/11 (64-bit)
- **macOS**: macOS 10.15+ (Intel hoặc Apple Silicon)
- **RAM**: Tối thiểu 4GB
- **Disk**: Tối thiểu 500MB

## Cài đặt để phát triển (macOS)

### 1. Yêu cầu

- Node.js 20+ ([nodejs.org](https://nodejs.org))
- Git

### 2. Clone và cài đặt

```bash
git clone https://github.com/your-org/feed-inventory-manager.git
cd feed-inventory-manager
npm install
```

### 3. Chạy ở chế độ development

```bash
npm run dev
```

Ứng dụng sẽ tự động mở. Database được lưu tại:
- macOS: `~/Library/Application Support/feed-inventory-manager/feed-inventory.db`
- Windows: `%APPDATA%\feed-inventory-manager\feed-inventory.db`

### 4. Kiểm tra code

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript type check
npm run test:unit   # Unit tests (Vitest)
npm run test:e2e    # E2E tests (Playwright)
```

## Build

`npm run build` tạo production frontend bundle; `npm run build:tauri` tạo app/installer Tauri. Build thành công không đồng nghĩa artifact đã được ký: macOS cần Developer ID + notarization, Windows cần code-signing certificate. Source production được kiểm tra độc lập với các credential ký phát hành này.

## Trạng thái triển khai

- Phase 1 — Kiến trúc và nền tảng: hoàn thành.
- Phase 2 — Sản phẩm, nhà cung cấp và tồn kho nền tảng: hoàn thành.
- Phase 3 — Nhập kho, giá vốn, công nợ và file đính kèm: hoàn thành.
- Phase 4 — Xuất kho, kiểm soát tồn và thẻ kho: hoàn thành.
- Phase 5 — Tra cứu hóa đơn, báo cáo kinh doanh và xuất Excel: hoàn thành.
- Phase 6 — Import và backup/restore: đã triển khai; manual acceptance còn lại được chủ dự án miễn tiếp tục để chuyển Phase 7.
- Phase 7 — kiểm thử, packaging và production hardening: hoàn thành trên macOS x64; ký/notarize và Windows installed smoke cần môi trường phát hành tương ứng.

## Import dữ liệu

Import Wizard hỗ trợ:

- Danh mục sản phẩm.
- Tồn đầu kỳ.
- Hóa đơn nhập.
- Hóa đơn bán.

`legacy_summary` chưa thuộc public MVP và không xuất hiện trong IPC/UI. Hóa đơn nhập và bán mặc định được tạo ở trạng thái nháp. Chế độ confirmed gọi đúng `PurchaseService`/`SaleService`; toàn batch dùng all-or-nothing. Với hóa đơn bán lịch sử không có giá vốn, giá vốn được chốt theo average cost tại thời điểm execute.

Wizard giữ workbook và dữ liệu normalized trong session backend tối đa 30 phút. Renderer chỉ gửi session ID khi execute. Có preview nguồn/normalized, export lỗi Excel, cảnh báo hash trùng và lịch sử import.

## Backup và restore

Trong **Cài đặt → Backup & Dữ liệu**:

1. Chọn thư mục có quyền ghi.
2. Dùng **Backup ngay** để tạo ZIP snapshot SQLite cùng attachments.
3. Chọn một dòng backup hợp lệ hoặc file ZIP để restore.
4. Kiểm tra warnings và đường dẫn pre-restore backup, sau đó khởi động lại ứng dụng.

Backup chứa metadata, SHA-256 database và attachment manifest. Restore kiểm tra cấu trúc ZIP, traversal/symlink, giới hạn giải nén, hash, `integrity_check`, schema và attachment consistency trước khi thay dữ liệu. Nếu swap lỗi, database và attachments cũ được rollback.

Pre-restore backup ưu tiên thư mục backup đã cấu hình; nếu không ghi được, ứng dụng dùng `userData/recovery-backups`. Retention chỉ xóa backup automatic, không xóa manual hoặc pre-restore. Auto-backup chạy tối đa một lần mỗi ngày.

Vị trí `userData` mặc định:

- macOS: `~/Library/Application Support/feed-inventory-manager`
- Windows: `%APPDATA%\\feed-inventory-manager`

## Cấu trúc project

```
InveStock/
├── src-tauri/         # Backend Rust, SQLite, commands và packaging Tauri
├── src/               # React renderer
│   ├── pages/         # 9 trang chức năng
│   ├── components/    # UI components
│   ├── stores/        # Zustand (UI state only)
│   └── utils/         # Formatters, helpers
├── shared/            # Types và schemas dùng chung
│   ├── ipc-types.ts   # Typed IPC contracts
│   └── schemas/       # Zod validation schemas
└── tests/frontend/    # Vitest production UI/contract tests
```

## Phiên bản

- **v1.0.0** - Production: danh mục, nhập/xuất, tồn kho, công nợ, báo cáo và backup/restore

## License

MIT
