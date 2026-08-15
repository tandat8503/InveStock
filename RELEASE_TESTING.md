# Production Release Testing

Phiên bản: 1.0.0

## Trạng thái

- Automated verify: PASS — lint, typecheck, 33 frontend tests, 51/51 Tauri command contract và production build
- Rust: PASS — fmt, clippy `-D warnings`, unit/integration tests và release check
- Kiến trúc production: Tauri/Rust thuần; Electron không thuộc production graph
- macOS x64 package: PASS BUILD — `InveStock.app` và DMG được tạo
- macOS installer manual acceptance: PENDING
- macOS arm64 artifact: PASS BUILD — DMG được tạo và `hdiutil verify` hợp lệ; chưa chạy trên máy arm64
- Windows x64 artifact: PENDING CI
- Windows 10/11 manual acceptance: BLOCKED — cần tester Windows thật
- PUBLIC RELEASE: bắt buộc Apple codesign + notarization; chưa đạt khi không có certificate/secrets

## Artifacts đã xác minh

- `src-tauri/target/release/bundle/dmg/InveStock_1.0.0_x64.dmg`
- `src-tauri/target/release/bundle/macos/InveStock.app`

Windows installed-app smoke do chủ dự án thực hiện riêng. Không tuyên bố public production-ready trước khi ký/notarize và hoàn tất acceptance trên máy đích.

## Performance smoke

Chưa chạy. Cần ghi startup, product list, inventory report, revenue report, invoice search và backup với 1.000 products cùng tối thiểu 10.000 inventory transactions.

## macOS checklist

- [ ] DMG mount và drag vào Applications.
- [ ] Gatekeeper behavior được ghi nhận; unsigned dùng Right-click → Open.
- [ ] Launch, CRUD và restart giữ dữ liệu.
- [ ] Purchase/sale draft, supplier payment và backup/restore.
- [ ] Upgrade không xóa `userData`.
- [ ] Uninstall không xóa dữ liệu ngoài ý muốn.

## Windows checklist

- [ ] NSIS cho chọn thư mục, không yêu cầu admin thường ngày.
- [ ] Start Menu và Desktop shortcut.
- [ ] Launch, CRUD, supplier payment và backup/restore.
- [ ] Restart/upgrade giữ `userData`.
- [ ] Uninstall behavior.

## Data safety

Database nằm trong Tauri app-data theo identifier hiện hữu `com.feedstore.inventorymanager`, không nằm trong application bundle. Không đổi identifier nếu chưa có migration app identity rõ ràng.
