use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use feed_inventory_manager_lib::domain::errors::AppError;
use feed_inventory_manager_lib::domain::models::{
    AppSettingsDTO, CreateInventoryAdjustmentInput, CreateProductInput, CreatePurchaseInvoiceInput,
    CreatePurchaseItemInput, CreateSalesInvoiceInput, CreateSalesItemInput, CreateSupplierInput,
    CreateSupplierPaymentInput, DashboardQueryParams, ProductListParams, UpdateProductInput,
};
use feed_inventory_manager_lib::infrastructure::database::connection::{init_db_pool, DbPool};
use feed_inventory_manager_lib::infrastructure::database::migrations::{
    run_migrations, LATEST_SCHEMA_VERSION,
};
use feed_inventory_manager_lib::services::backup_service::{BackupMetadata, BackupService};
use feed_inventory_manager_lib::services::inventory_service::InventoryService;
use feed_inventory_manager_lib::services::payment_service::PaymentService;
use feed_inventory_manager_lib::services::product_service::ProductService;
use feed_inventory_manager_lib::services::purchase_service::PurchaseService;
use feed_inventory_manager_lib::services::sale_service::SaleService;
use feed_inventory_manager_lib::services::settings_service::SettingsService;
use feed_inventory_manager_lib::services::supplier_service::SupplierService;
use feed_inventory_manager_lib::state::AppState;
use tempfile::TempDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

const DB_ENTRY: &str = "database/feed-inventory.db";
const META_ENTRY: &str = "metadata.json";

struct Fixture {
    _directory: TempDir,
    database: PathBuf,
    pool: DbPool,
}

impl Fixture {
    fn new() -> Self {
        let directory = tempfile::tempdir().expect("create test directory");
        let database = directory.path().join("feed-inventory.db");
        let pool = init_db_pool(database.clone()).expect("initialize database");
        Self {
            _directory: directory,
            database,
            pool,
        }
    }

    fn product(&self, code: &str) -> i64 {
        ProductService::new(self.pool.clone())
            .create(product_input(code))
            .expect("create product")
            .id
    }

    fn supplier(&self) -> i64 {
        SupplierService::new(self.pool.clone())
            .create(CreateSupplierInput {
                company_name: "Nhà cung cấp kiểm thử".to_string(),
                phone: None,
                address: None,
                tax_code: None,
                contact_person: None,
                bank_account: None,
                notes: None,
            })
            .expect("create supplier")
            .id
    }

    fn confirmed_purchase(&self, product_id: i64, quantity: i64, cost: i64) -> i64 {
        let supplier_id = self.supplier();
        let service = PurchaseService::new(self.pool.clone());
        let draft = service
            .create_draft(purchase_input(product_id, supplier_id, quantity, cost))
            .expect("create purchase draft");
        service.confirm(draft.id).expect("confirm purchase").id
    }
}

fn product_input(code: &str) -> CreateProductInput {
    CreateProductInput {
        product_code: code.to_string(),
        product_name: format!("Sản phẩm {code}"),
        animal_category: "heo".to_string(),
        package_weight_grams: 25_000,
        package_weight_unit: Some("kg".to_string()),
        inventory_unit: "Bao".to_string(),
        brand: None,
        active: true,
        notes: None,
    }
}

#[test]
fn inventory_report_classifies_reversals_and_adjustments_separately() {
    let fixture = Fixture::new();
    let product_id = fixture.product("REPORT-CLASS");
    let connection = fixture.pool.get().unwrap();
    let transactions = [
        ("2026-06-30", "purchase", 100, 0, 1_000, 0),
        ("2026-07-01", "purchase", 20, 0, 200, 0),
        ("2026-07-02", "sale", 0, 30, 0, 300),
        ("2026-07-03", "sale_cancel", 10, 0, 100, 0),
        ("2026-07-04", "inventory_adjustment_out", 0, 2, 0, 20),
    ];
    for (index, (date, kind, quantity_in, quantity_out, value_in, value_out)) in
        transactions.into_iter().enumerate()
    {
        connection
            .execute(
                "INSERT INTO inventory_transactions
                 (transaction_date,product_id,transaction_type,source_type,source_id,
                  quantity_in,quantity_out,unit_cost,stock_after,value_in,value_out)
                 VALUES (?1,?2,?3,'test',?4,?5,?6,10,0,?7,?8)",
                rusqlite::params![
                    date,
                    product_id,
                    kind,
                    index as i64 + 1,
                    quantity_in,
                    quantity_out,
                    value_in,
                    value_out
                ],
            )
            .unwrap();
    }
    drop(connection);

    let report = InventoryService::new(fixture.pool.clone())
        .get_import_export_report(
            feed_inventory_manager_lib::domain::models::ReportParamsInput {
                date_from: Some("2026-07-01".to_string()),
                date_to: Some("2026-07-31".to_string()),
                invoice_type: None,
                status: None,
                search: None,
                sort_by: None,
                page: None,
                page_size: None,
            },
        )
        .unwrap();
    let row = report
        .rows
        .iter()
        .find(|row| row.product_id == product_id)
        .unwrap();

    assert_eq!(row.opening_stock, 100);
    assert_eq!(row.total_purchase_qty, 20);
    assert_eq!(row.total_sale_qty, 30);
    assert_eq!(row.adjustment_quantity, 8);
    assert_eq!(row.closing_stock, 98);
    assert_eq!(row.opening_value, 1_000);
    assert_eq!(row.purchase_value, 200);
    assert_eq!(row.sale_cost_value, 300);
    assert_eq!(row.adjustment_value, 80);
    assert_eq!(row.closing_value, 980);
}

fn purchase_input(
    product_id: i64,
    supplier_id: i64,
    quantity: i64,
    cost: i64,
) -> CreatePurchaseInvoiceInput {
    CreatePurchaseInvoiceInput {
        invoice_number: format!("HD-{product_id}-{quantity}-{cost}"),
        invoice_date: "2026-08-01".to_string(),
        received_date: "2026-08-01".to_string(),
        supplier_id,
        notes: None,
        items: vec![CreatePurchaseItemInput {
            product_id,
            quantity,
            line_total: quantity * cost,
            notes: None,
        }],
    }
}

fn sale_input(product_id: i64, quantity: i64) -> CreateSalesInvoiceInput {
    CreateSalesInvoiceInput {
        electronic_invoice_number: None,
        invoice_date: "2026-08-02".to_string(),
        buyer_type: "khach_le".to_string(),
        buyer_name: Some("Khách kiểm thử".to_string()),
        notes: None,
        items: vec![CreateSalesItemInput {
            product_id,
            quantity,
            line_total_sale: quantity * 200_000,
        }],
    }
}

#[test]
fn product_create_and_update_valid() {
    let fixture = Fixture::new();
    let service = ProductService::new(fixture.pool.clone());
    let product = service.create(product_input("P001")).unwrap();
    let updated = service
        .update(UpdateProductInput {
            id: product.id,
            product_code: None,
            product_name: Some("Tên đã cập nhật".to_string()),
            animal_category: None,
            package_weight_grams: None,
            package_weight_unit: None,
            inventory_unit: None,
            brand: None,
            notes: None,
        })
        .unwrap();
    assert_eq!(updated.product_name, "Tên đã cập nhật");
    assert_eq!(updated.package_weight_grams, 25_000);
    assert_eq!(updated.package_weight_unit, "g");
}

#[test]
fn product_update_preserves_inventory_and_lifecycle_fields() {
    let fixture = Fixture::new();
    let service = ProductService::new(fixture.pool.clone());
    let id = fixture.product("UPDATE-SAFE");
    fixture.pool.get().unwrap().execute(
        "UPDATE products SET current_stock=15,current_inventory_value=1500000,average_cost=100000,active=0 WHERE id=?1",
        [id],
    ).unwrap();

    let updated = service
        .update(UpdateProductInput {
            id,
            product_code: None,
            product_name: Some("Tên mới".to_string()),
            animal_category: Some("ga".to_string()),
            package_weight_grams: Some(10_000),
            package_weight_unit: Some("g".to_string()),
            inventory_unit: Some("Tui".to_string()),
            brand: Some("Thương hiệu mới".to_string()),
            notes: None,
        })
        .unwrap();

    assert_eq!(
        (
            updated.current_stock,
            updated.current_inventory_value,
            updated.average_cost
        ),
        (15, 1_500_000, 100_000)
    );
    assert!(!updated.active);
}

#[test]
fn product_delete_blocks_orphan_inventory_and_missing_id() {
    let fixture = Fixture::new();
    let service = ProductService::new(fixture.pool.clone());
    let id = fixture.product("DELETE-ORPHAN");
    fixture
        .pool
        .get()
        .unwrap()
        .execute(
            "UPDATE products SET current_stock=65,current_inventory_value=650000 WHERE id=?1",
            [id],
        )
        .unwrap();

    assert!(matches!(service.delete(id), Err(AppError::Conflict(_))));
    assert!(service.get_by_id(id).unwrap().is_some());
    assert!(matches!(
        service.delete(9_999_999),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn product_deactivation_blocks_negative_legacy_stock() {
    let fixture = Fixture::new();
    let service = ProductService::new(fixture.pool.clone());
    let id = fixture.product("NEGATIVE-ACTIVE");
    fixture
        .pool
        .get()
        .unwrap()
        .execute("UPDATE products SET current_stock=-5 WHERE id=?1", [id])
        .unwrap();
    assert!(matches!(
        service.toggle_active(id),
        Err(AppError::Conflict(_))
    ));
    assert!(service.get_by_id(id).unwrap().unwrap().active);
}

#[test]
fn cancelling_latest_purchase_recomputes_cached_price() {
    let fixture = Fixture::new();
    let product_id = fixture.product("LATEST-CANCEL");
    let supplier_id = fixture.supplier();
    let purchase_service = PurchaseService::new(fixture.pool.clone());
    let mut first_input = purchase_input(product_id, supplier_id, 10, 100);
    first_input.invoice_date = "2026-08-01".to_string();
    first_input.received_date = "2026-08-01".to_string();
    let first = purchase_service
        .confirm(purchase_service.create_draft(first_input).unwrap().id)
        .unwrap();
    let mut second_input = purchase_input(product_id, supplier_id, 10, 120);
    second_input.invoice_number = "LATEST-B".to_string();
    second_input.invoice_date = "2026-08-05".to_string();
    second_input.received_date = "2026-08-05".to_string();
    let second = purchase_service
        .confirm(purchase_service.create_draft(second_input).unwrap().id)
        .unwrap();

    assert_eq!(
        ProductService::new(fixture.pool.clone())
            .get_by_id(product_id)
            .unwrap()
            .unwrap()
            .latest_purchase_price,
        120
    );
    purchase_service
        .cancel(second.id, "Hủy phiếu mới".to_string())
        .unwrap();
    let after_second = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert!(after_second.latest_purchase_price_known);
    assert_eq!(after_second.latest_purchase_price, 100);
    let history = InventoryService::new(fixture.pool.clone())
        .get_product_price_history(product_id)
        .unwrap();
    assert_eq!(history.last().unwrap().effective_unit_cost, 100);

    purchase_service
        .cancel(first.id, "Hủy phiếu cũ".to_string())
        .unwrap();
    let after_first = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert!(!after_first.latest_purchase_price_known);
    assert_eq!(after_first.latest_purchase_price, 0);
}

#[test]
fn product_price_history_selects_latest_twenty_four_then_charts_chronologically() {
    let fixture = Fixture::new();
    let product_id = fixture.product("PRICE-24");
    let supplier_id = fixture.supplier();
    let service = PurchaseService::new(fixture.pool.clone());
    for day in 1..=25 {
        let mut input = purchase_input(product_id, supplier_id, 1, 100 + day);
        input.invoice_date = format!("2026-08-{day:02}");
        input.received_date = input.invoice_date.clone();
        input.invoice_number = format!("PRICE-24-{day:02}");
        let draft = service.create_draft(input).unwrap();
        service.confirm(draft.id).unwrap();
    }

    let history = InventoryService::new(fixture.pool.clone())
        .get_product_price_history(product_id)
        .unwrap();
    assert_eq!(history.len(), 24);
    assert_eq!(history.first().unwrap().effective_unit_cost, 102);
    assert_eq!(history.last().unwrap().effective_unit_cost, 125);
}

#[test]
fn product_duplicate_code_is_rejected() {
    let fixture = Fixture::new();
    let service = ProductService::new(fixture.pool.clone());
    service.create(product_input("DUP")).unwrap();
    assert!(service.create(product_input("DUP")).is_err());
}

#[test]
fn product_toggle_active_round_trip() {
    let fixture = Fixture::new();
    let service = ProductService::new(fixture.pool.clone());
    let id = fixture.product("TOGGLE");
    assert!(!service.toggle_active(id).unwrap().active);
    assert!(service.toggle_active(id).unwrap().active);
}

#[test]
fn product_deactivation_rules() {
    let fixture = Fixture::new();
    let service = ProductService::new(fixture.pool.clone());
    let id = fixture.product("DEACTIVATE-RULE");

    // 1. Give it some stock via manual database edit for simplicity
    fixture
        .pool
        .get()
        .unwrap()
        .execute("UPDATE products SET current_stock = 10 WHERE id = ?1", [id])
        .unwrap();

    // 2. Try to toggle active - must fail
    let err_toggle = service.toggle_active(id).unwrap_err();
    assert!(
        matches!(
            err_toggle,
            feed_inventory_manager_lib::domain::errors::AppError::Conflict(_)
        ),
        "Expected Conflict error, got: {:?}",
        err_toggle
    );
    assert_eq!(
        err_toggle.to_string(),
        "Conflict error: Sản phẩm vẫn còn 10 Bao trong kho.\nHãy xử lý tồn kho trước khi ngừng sử dụng."
    );

    // 3. Set stock to 0 - deactivation must succeed
    fixture
        .pool
        .get()
        .unwrap()
        .execute("UPDATE products SET current_stock = 0 WHERE id = ?1", [id])
        .unwrap();

    let deactivated = service.toggle_active(id).unwrap();
    assert!(!deactivated.active);

    assert!(service.toggle_active(id).unwrap().active);
}

#[test]
fn product_create_and_status_filter_support_inactive_products() {
    let fixture = Fixture::new();
    let service = ProductService::new(fixture.pool);
    let mut input = product_input("INACTIVE-CREATE");
    input.active = false;
    assert!(!service.create(input).unwrap().active);
    let result = service
        .list(ProductListParams {
            search: None,
            animal_category: None,
            inventory_unit: None,
            active_only: Some(false),
            page: Some(1),
            page_size: Some(20),
        })
        .unwrap();
    assert_eq!(result.items.len(), 1);
    assert!(!result.items[0].active);
}

#[test]
fn product_delete_unused_succeeds() {
    let fixture = Fixture::new();
    let service = ProductService::new(fixture.pool.clone());
    let id = fixture.product("DELETE");
    assert!(service.delete(id).unwrap());
    assert!(service.get_by_id(id).unwrap().is_none());
}

#[test]
fn product_with_inventory_transaction_cannot_be_deleted() {
    let fixture = Fixture::new();
    let id = fixture.product("USED");
    fixture.confirmed_purchase(id, 3, 100_000);
    assert!(matches!(
        ProductService::new(fixture.pool).delete(id),
        Err(AppError::Conflict(_))
    ));
}

#[test]
fn purchase_create_draft_preserves_lines() {
    let fixture = Fixture::new();
    let product = fixture.product("PURCHASE-DRAFT");
    let supplier = fixture.supplier();
    let draft = PurchaseService::new(fixture.pool)
        .create_draft(purchase_input(product, supplier, 4, 90_000))
        .unwrap();
    assert_eq!(draft.status, "nhap");
    assert_eq!(draft.items.len(), 1);
    assert_eq!(draft.items[0].quantity, 4);
}

#[test]
fn purchase_rejects_empty_lines() {
    let fixture = Fixture::new();
    let mut input = purchase_input(fixture.product("EMPTY"), fixture.supplier(), 1, 1);
    input.items.clear();
    assert!(matches!(
        PurchaseService::new(fixture.pool).create_draft(input),
        Err(AppError::Validation(_))
    ));
}

#[test]
fn purchase_rejects_non_positive_quantity() {
    let fixture = Fixture::new();
    let input = purchase_input(fixture.product("NEG-P"), fixture.supplier(), 0, 100);
    assert!(matches!(
        PurchaseService::new(fixture.pool).create_draft(input),
        Err(AppError::Validation(_))
    ));
}

#[test]
fn invoices_reject_zero_prices_and_duplicate_products() {
    let fixture = Fixture::new();
    let product = fixture.product("PRICE-DUP");
    let supplier = fixture.supplier();
    let mut purchase = purchase_input(product, supplier, 1, 0);
    assert!(matches!(
        PurchaseService::new(fixture.pool.clone()).create_draft(purchase.clone()),
        Err(AppError::Validation(_))
    ));
    purchase.items[0].line_total = 100;
    purchase.items.push(purchase.items[0].clone());
    assert!(matches!(
        PurchaseService::new(fixture.pool.clone()).create_draft(purchase),
        Err(AppError::Validation(_))
    ));

    let mut sale = sale_input(product, 1);
    sale.items[0].line_total_sale = 0;
    assert!(matches!(
        SaleService::new(fixture.pool.clone()).create_draft(sale.clone()),
        Err(AppError::Validation(_))
    ));
    sale.items[0].line_total_sale = 100;
    sale.items.push(sale.items[0].clone());
    assert!(matches!(
        SaleService::new(fixture.pool).create_draft(sale),
        Err(AppError::Validation(_))
    ));
}

#[test]
fn invoices_reject_missing_or_inactive_references() {
    let fixture = Fixture::new();
    let product = fixture.product("INACTIVE-REF");
    let supplier = fixture.supplier();
    ProductService::new(fixture.pool.clone())
        .toggle_active(product)
        .unwrap();
    assert!(matches!(
        PurchaseService::new(fixture.pool.clone())
            .create_draft(purchase_input(product, supplier, 1, 100)),
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        SaleService::new(fixture.pool.clone()).create_draft(sale_input(product, 1)),
        Err(AppError::Validation(_))
    ));

    let active_product = fixture.product("MISSING-REF");
    SupplierService::new(fixture.pool.clone())
        .toggle_active(supplier)
        .unwrap();
    assert!(matches!(
        PurchaseService::new(fixture.pool.clone()).create_draft(purchase_input(
            active_product,
            supplier,
            1,
            100
        )),
        Err(AppError::Validation(_))
    ));
    SupplierService::new(fixture.pool.clone())
        .toggle_active(supplier)
        .unwrap();
    let mut missing_product = purchase_input(active_product, supplier, 1, 100);
    missing_product.items[0].product_id = i64::MAX;
    assert!(matches!(
        PurchaseService::new(fixture.pool.clone()).create_draft(missing_product),
        Err(AppError::NotFound(_))
    ));
    let mut missing_supplier = purchase_input(active_product, supplier, 1, 100);
    missing_supplier.supplier_id = i64::MAX;
    assert!(matches!(
        PurchaseService::new(fixture.pool).create_draft(missing_supplier),
        Err(AppError::NotFound(_))
    ));
}

// Note: InveStock 1.0.0 uses lineTotal model without discount fields.

#[test]
fn draft_update_and_delete_are_draft_only() {
    let fixture = Fixture::new();
    let product = fixture.product("DRAFT-MUTATE");
    let supplier = fixture.supplier();
    let purchases = PurchaseService::new(fixture.pool.clone());
    let draft = purchases
        .create_draft(purchase_input(product, supplier, 1, 100))
        .unwrap();
    let updated = purchases
        .update_draft(draft.id, purchase_input(product, supplier, 3, 200))
        .unwrap();
    assert_eq!(updated.items[0].quantity, 3);
    purchases.confirm(updated.id).unwrap();
    assert!(matches!(
        purchases.delete_draft(updated.id),
        Err(AppError::InvalidInvoiceState(_))
    ));

    let sales = SaleService::new(fixture.pool.clone());
    let sale = sales.create_draft(sale_input(product, 1)).unwrap();
    let mut edit = sale_input(product, 2);
    edit.items[0].line_total_sale = 500_000;
    assert_eq!(
        sales.update_draft(sale.id, edit).unwrap().items[0].quantity,
        2
    );
    assert!(sales.delete_draft(sale.id).unwrap());
    assert!(sales.get_by_id(sale.id).unwrap().is_none());
}

#[test]
fn supplier_payment_is_transactional_and_cannot_overpay() {
    let fixture = Fixture::new();
    let product = fixture.product("PAYMENT");
    let invoice_id = fixture.confirmed_purchase(product, 2, 100_000);
    let payments = PaymentService::new(fixture.pool.clone());
    let input = CreateSupplierPaymentInput {
        purchase_invoice_id: invoice_id,
        payment_date: "2026-08-03".to_string(),
        amount: 75_000,
        payment_method: "chuyen_khoan".to_string(),
        transaction_reference: Some("BANK-1".to_string()),
        notes: None,
    };
    payments.record(input).unwrap();
    let invoice = PurchaseService::new(fixture.pool.clone())
        .get_by_id(invoice_id)
        .unwrap()
        .unwrap();
    assert_eq!(
        (invoice.paid_amount, invoice.remaining_amount),
        (75_000, 125_000)
    );
    let overpay = CreateSupplierPaymentInput {
        purchase_invoice_id: invoice_id,
        payment_date: "2026-08-03".to_string(),
        amount: 125_001,
        payment_method: "tien_mat".to_string(),
        transaction_reference: None,
        notes: None,
    };
    assert!(matches!(
        payments.record(overpay),
        Err(AppError::Validation(_))
    ));
    assert_eq!(payments.list(invoice_id).unwrap().len(), 1);
}

#[test]
fn purchase_confirm_updates_stock_and_rejects_double_confirmation() {
    let fixture = Fixture::new();
    let product_id = fixture.product("CONFIRM-P");
    let supplier_id = fixture.supplier();
    let service = PurchaseService::new(fixture.pool.clone());
    let draft = service
        .create_draft(purchase_input(product_id, supplier_id, 5, 110_000))
        .unwrap();
    assert_eq!(service.confirm(draft.id).unwrap().status, "xac_nhan");
    assert!(matches!(
        service.confirm(draft.id),
        Err(AppError::InvalidInvoiceState(_))
    ));
    assert_eq!(
        ProductService::new(fixture.pool)
            .get_by_id(product_id)
            .unwrap()
            .unwrap()
            .current_stock,
        5
    );
}

#[test]
fn purchase_weighted_average_uses_existing_stock() {
    let fixture = Fixture::new();
    let product_id = fixture.product("WAC");
    fixture.confirmed_purchase(product_id, 10, 100_000);
    fixture.confirmed_purchase(product_id, 10, 200_000);
    let product = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product.current_stock, 20);
    assert_eq!(product.average_cost, 150_000);
    assert_eq!(product.current_inventory_value, 3_000_000);
    let state: (i64, i64, i64) = fixture.pool.get().unwrap().query_row(
        "SELECT value_in,inventory_value_before,inventory_value_after FROM inventory_transactions WHERE product_id=?1 ORDER BY id DESC LIMIT 1",
        [product_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).unwrap();
    assert_eq!(state, (2_000_000, 1_000_000, 3_000_000));
}

#[test]
fn purchase_uses_exact_net_line_value_not_rounded_unit_cost() {
    let fixture = Fixture::new();
    let product_id = fixture.product("EXACT-COST");
    let supplier_id = fixture.supplier();
    let input = purchase_input(product_id, supplier_id, 3, 100);
    let service = PurchaseService::new(fixture.pool.clone());
    let draft = service.create_draft(input).unwrap();
    assert_eq!(draft.items[0].effective_unit_cost, 100);
    assert_eq!(draft.items[0].inventory_cost_value, 300);
    service.confirm(draft.id).unwrap();
    let product = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product.current_inventory_value, 300);
    let value_in: i64 = fixture.pool.get().unwrap().query_row(
        "SELECT value_in FROM inventory_transactions WHERE source_type='purchase_invoice' AND source_id=?1",
        [draft.id], |row| row.get(0)).unwrap();
    assert_eq!(value_in, 300);
}

#[test]
fn selling_all_remaining_stock_clears_inventory_value() {
    let fixture = Fixture::new();
    let product_id = fixture.product("SELL-ALL");
    let supplier_id = fixture.supplier();
    let input = purchase_input(product_id, supplier_id, 3, 100);
    let purchase = PurchaseService::new(fixture.pool.clone());
    let draft = purchase.create_draft(input).unwrap();
    purchase.confirm(draft.id).unwrap();
    let sale = SaleService::new(fixture.pool.clone());
    let sale_draft = sale.create_draft(sale_input(product_id, 3)).unwrap();
    let confirmed = sale.confirm(sale_draft.id).unwrap();
    assert_eq!(confirmed.items[0].line_cost, 300);
    let product = ProductService::new(fixture.pool)
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product.current_stock, 0);
    assert_eq!(product.current_inventory_value, 0);
}

#[test]
fn sale_create_draft_preserves_line() {
    let fixture = Fixture::new();
    let product = fixture.product("SALE-DRAFT");
    let draft = SaleService::new(fixture.pool)
        .create_draft(sale_input(product, 2))
        .unwrap();
    assert_eq!(draft.status, "nhap");
    assert_eq!(draft.items[0].quantity, 2);
}

#[test]
fn sale_rejects_negative_quantity() {
    let fixture = Fixture::new();
    let input = sale_input(fixture.product("NEG-S"), -1);
    assert!(matches!(
        SaleService::new(fixture.pool).create_draft(input),
        Err(AppError::Validation(_))
    ));
}

#[test]
fn sale_insufficient_stock_rolls_back_confirmation() {
    let fixture = Fixture::new();
    let product = fixture.product("NO-STOCK");
    let service = SaleService::new(fixture.pool.clone());
    let draft = service.create_draft(sale_input(product, 1)).unwrap();
    assert!(matches!(
        service.confirm(draft.id),
        Err(AppError::InsufficientStock(_))
    ));
    assert_eq!(service.get_by_id(draft.id).unwrap().unwrap().status, "nhap");
}

#[test]
fn sale_confirm_rejects_double_confirmation_and_preserves_cost_snapshot() {
    let fixture = Fixture::new();
    let product_id = fixture.product("SALE-CONFIRM");
    fixture.confirmed_purchase(product_id, 10, 120_000);
    let service = SaleService::new(fixture.pool.clone());
    let draft = service.create_draft(sale_input(product_id, 2)).unwrap();
    let confirmed = service.confirm(draft.id).unwrap();
    assert_eq!(confirmed.items[0].unit_cost_at_sale, 120_000);
    let inventory_state: (i64, i64, i64) = fixture.pool.get().unwrap().query_row(
        "SELECT value_out,inventory_value_before,inventory_value_after FROM inventory_transactions WHERE product_id=?1 AND transaction_type='xuat'",
        [product_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).unwrap();
    assert_eq!(inventory_state, (240_000, 1_200_000, 960_000));
    fixture
        .pool
        .get()
        .unwrap()
        .execute(
            "UPDATE products SET average_cost=999999 WHERE id=?1",
            [product_id],
        )
        .unwrap();
    assert_eq!(
        service.get_by_id(draft.id).unwrap().unwrap().items[0].unit_cost_at_sale,
        120_000
    );
    assert!(matches!(
        service.confirm(draft.id),
        Err(AppError::InvalidInvoiceState(_))
    ));
}

#[test]
fn inventory_reconciles_and_history_is_newest_first() {
    let fixture = Fixture::new();
    let product_id = fixture.product("LEDGER");
    fixture.confirmed_purchase(product_id, 10, 100_000);
    let sale = SaleService::new(fixture.pool.clone());
    let draft = sale.create_draft(sale_input(product_id, 3)).unwrap();
    sale.confirm(draft.id).unwrap();
    let conn = fixture.pool.get().unwrap();
    let ledger_stock: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(quantity_in-quantity_out),0) FROM inventory_transactions WHERE product_id=?1",
            [product_id],
            |row| row.get(0),
        )
        .unwrap();
    let current_stock: i64 = conn
        .query_row(
            "SELECT current_stock FROM products WHERE id=?1",
            [product_id],
            |row| row.get(0),
        )
        .unwrap();
    drop(conn);
    assert_eq!(ledger_stock, current_stock);
    let history = InventoryService::new(fixture.pool)
        .get_product_inventory_history(product_id, None, None)
        .unwrap();
    assert_eq!(history.len(), 2);
    assert!(history[0].id > history[1].id);
    assert_eq!(history[0].transaction_type, "xuat");
}

fn read_backup(archive_path: &Path) -> (BackupMetadata, Vec<u8>) {
    let mut archive = ZipArchive::new(File::open(archive_path).unwrap()).unwrap();
    let metadata = {
        let entry = archive.by_name(META_ENTRY).unwrap();
        serde_json::from_reader(entry).unwrap()
    };
    let mut database = Vec::new();
    archive
        .by_name(DB_ENTRY)
        .unwrap()
        .read_to_end(&mut database)
        .unwrap();
    (metadata, database)
}

fn write_backup(
    destination: &Path,
    metadata: Option<&BackupMetadata>,
    database: &[u8],
    extra_entry: bool,
) {
    let mut archive = ZipWriter::new(File::create(destination).unwrap());
    let options = SimpleFileOptions::default();
    archive.start_file(DB_ENTRY, options).unwrap();
    archive.write_all(database).unwrap();
    if let Some(metadata) = metadata {
        archive.start_file(META_ENTRY, options).unwrap();
        archive
            .write_all(&serde_json::to_vec(metadata).unwrap())
            .unwrap();
    }
    if extra_entry {
        archive.start_file("unexpected.txt", options).unwrap();
        archive.write_all(b"not allowed").unwrap();
    }
    archive.finish().unwrap();
}

#[test]
fn backup_contains_exact_committed_wal_record_and_valid_checksum() {
    let fixture = Fixture::new();
    let id = fixture.product("WAL-EXACT");
    let archive_path = fixture._directory.path().join("wal.zip");
    BackupService::new(fixture.pool.clone(), fixture.database.clone())
        .create_backup(&archive_path)
        .unwrap();
    let (metadata, database) = read_backup(&archive_path);
    assert_eq!(metadata.sha256.len(), 64);
    let extracted = fixture._directory.path().join("extracted.db");
    std::fs::write(&extracted, database).unwrap();
    let connection = rusqlite::Connection::open(extracted).unwrap();
    let code: String = connection
        .query_row(
            "SELECT product_code FROM products WHERE id=?1",
            [id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(code, "WAL-EXACT");
}

#[test]
fn restore_rejects_corrupt_zip_and_keeps_database_usable() {
    let fixture = Fixture::new();
    let id = fixture.product("KEEP-CORRUPT");
    let corrupt = fixture._directory.path().join("corrupt.zip");
    std::fs::write(&corrupt, b"not a zip").unwrap();
    let state = AppState::new(fixture.pool, fixture.database);
    assert!(BackupService::restore_backup(&state, &corrupt).is_err());
    assert!(state
        .with_pool(|pool| ProductService::new(pool).get_by_id(id))
        .unwrap()
        .is_some());
}

#[test]
fn restore_rejects_missing_metadata_checksum_mismatch_and_unknown_entry() {
    let fixture = Fixture::new();
    fixture.product("RESTORE-VALIDATION");
    let valid = fixture._directory.path().join("valid.zip");
    BackupService::new(fixture.pool.clone(), fixture.database.clone())
        .create_backup(&valid)
        .unwrap();
    let (mut metadata, database) = read_backup(&valid);
    let missing = fixture._directory.path().join("missing.zip");
    write_backup(&missing, None, &database, false);
    let mismatch = fixture._directory.path().join("mismatch.zip");
    metadata.sha256 = "0".repeat(64);
    write_backup(&mismatch, Some(&metadata), &database, false);
    let unknown = fixture._directory.path().join("unknown.zip");
    write_backup(&unknown, Some(&metadata), &database, true);
    let state = AppState::new(fixture.pool, fixture.database);
    assert!(BackupService::restore_backup(&state, &missing).is_err());
    assert!(BackupService::restore_backup(&state, &mismatch).is_err());
    assert!(BackupService::restore_backup(&state, &unknown).is_err());
}

#[test]
fn health_validator_uses_restore_package_rules() {
    let fixture = Fixture::new();
    fixture.product("UNIFIED-VALIDATOR");
    let valid = fixture._directory.path().join("validator-valid.zip");
    BackupService::new(fixture.pool.clone(), fixture.database.clone())
        .create_backup(&valid)
        .unwrap();
    let (metadata, database) = read_backup(&valid);

    let extra = fixture._directory.path().join("validator-extra.zip");
    write_backup(&extra, Some(&metadata), &database, true);
    assert!(BackupService::validate_backup(&extra).is_err());

    let wrong_size = fixture._directory.path().join("validator-size.zip");
    let mut wrong_metadata = metadata;
    wrong_metadata.database_size += 1;
    write_backup(&wrong_size, Some(&wrong_metadata), &database, false);
    assert!(BackupService::validate_backup(&wrong_size).is_err());
}

#[test]
fn valid_restore_reopens_commands_and_removes_post_backup_data() {
    let fixture = Fixture::new();
    fixture.product("BEFORE-BACKUP");
    let valid = fixture._directory.path().join("valid-restore.zip");
    BackupService::new(fixture.pool.clone(), fixture.database.clone())
        .create_backup(&valid)
        .unwrap();
    let removed_id = fixture.product("AFTER-BACKUP");
    let state = AppState::new(fixture.pool, fixture.database);
    assert!(BackupService::restore_backup(&state, &valid).unwrap());
    assert!(state
        .with_pool(|pool| ProductService::new(pool).get_by_id(removed_id))
        .unwrap()
        .is_none());
    assert!(state
        .with_pool(|pool| ProductService::new(pool).create(product_input("AFTER-RESTORE")))
        .is_ok());
}

#[test]
fn migrations_preserve_data_and_are_idempotent() {
    let fixture = Fixture::new();
    let id = fixture.product("MIGRATION-DATA");
    let connection = fixture.pool.get().unwrap();
    run_migrations(&connection).unwrap();
    run_migrations(&connection).unwrap();
    let version: i64 = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .unwrap();
    let code: String = connection
        .query_row(
            "SELECT product_code FROM products WHERE id=?1",
            [id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(version, LATEST_SCHEMA_VERSION);
    assert_eq!(code, "MIGRATION-DATA");
    let index_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name IN (
                'idx_purchase_invoices_invoice_date',
                'idx_purchase_invoices_supplier_id',
                'idx_purchase_invoices_status',
                'idx_sales_invoices_invoice_date',
                'idx_sales_invoices_status',
                'idx_inventory_transactions_product_date',
                'idx_inventory_transactions_source',
                'idx_supplier_payments_invoice_date'
            )",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(index_count, 8);
}

#[test]
fn old_schema_version_is_upgraded_to_current() {
    let fixture = Fixture::new();
    let connection = fixture.pool.get().unwrap();
    connection
        .execute("DELETE FROM schema_migrations WHERE version>=7", [])
        .unwrap();
    connection
        .execute("DROP TABLE document_sequences", [])
        .unwrap();
    run_migrations(&connection).unwrap();
    let version: i64 = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(version, LATEST_SCHEMA_VERSION);
}

#[test]
fn document_sequence_does_not_reuse_code_after_draft_deletion() {
    let fixture = Fixture::new();
    let product = fixture.product("SEQ-DELETE");
    let supplier = fixture.supplier();
    let service = PurchaseService::new(fixture.pool.clone());
    let first = service
        .create_draft(purchase_input(product, supplier, 1, 10_000))
        .unwrap();
    fixture
        .pool
        .get()
        .unwrap()
        .execute("DELETE FROM purchase_invoices WHERE id=?1", [first.id])
        .unwrap();
    let second = service
        .create_draft(purchase_input(product, supplier, 1, 10_000))
        .unwrap();
    assert_ne!(first.receipt_code, second.receipt_code);
    assert_eq!(second.receipt_code, "PN000002");
}

#[test]
fn document_sequences_start_at_expected_codes_and_remain_unique_sequentially() {
    let fixture = Fixture::new();
    let product = fixture.product("SEQ-FIRST");
    let supplier = fixture.supplier();
    let purchases = PurchaseService::new(fixture.pool.clone());
    let first_purchase = purchases
        .create_draft(purchase_input(product, supplier, 1, 10_000))
        .unwrap();
    let second_purchase = purchases
        .create_draft(purchase_input(product, supplier, 2, 10_000))
        .unwrap();
    assert_eq!(first_purchase.receipt_code, "PN000001");
    assert_eq!(second_purchase.receipt_code, "PN000002");

    let sales = SaleService::new(fixture.pool);
    let first_sale = sales.create_draft(sale_input(product, 1)).unwrap();
    let second_sale = sales.create_draft(sale_input(product, 2)).unwrap();
    assert_eq!(first_sale.issue_code, "PX000001");
    assert_eq!(second_sale.issue_code, "PX000002");
}

#[test]
fn document_sequence_allocation_rolls_back_when_invoice_insert_fails() {
    let fixture = Fixture::new();
    let product = fixture.product("SEQ-ROLLBACK");
    let supplier = fixture.supplier();
    let service = PurchaseService::new(fixture.pool.clone());
    let mut invalid = purchase_input(product, supplier, 1, 10_000);
    invalid.supplier_id = i64::MAX;
    assert!(service.create_draft(invalid).is_err());

    let created = service
        .create_draft(purchase_input(product, supplier, 2, 10_000))
        .unwrap();
    assert_eq!(created.receipt_code, "PN000001");
}

#[test]
fn sequence_migration_initializes_after_existing_max_codes() {
    let fixture = Fixture::new();
    let connection = fixture.pool.get().unwrap();
    connection
        .execute("DELETE FROM schema_migrations WHERE version>=7", [])
        .unwrap();
    connection
        .execute("DROP TABLE document_sequences", [])
        .unwrap();
    let supplier = fixture.supplier();
    connection
        .execute(
            "INSERT INTO purchase_invoices(invoice_number,receipt_code,invoice_date,received_date,supplier_id,status) VALUES('LEGACY-P','PN000042','2026-08-01','2026-08-01',?1,'nhap')",
            [supplier],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO sales_invoices(issue_code,invoice_date,buyer_type,status) VALUES('PX000017','2026-08-01','khach_le','nhap')",
            [],
        )
        .unwrap();
    run_migrations(&connection).unwrap();
    let purchase_next: i64 = connection
        .query_row(
            "SELECT next_value FROM document_sequences WHERE document_type='purchase'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let sale_next: i64 = connection
        .query_row(
            "SELECT next_value FROM document_sequences WHERE document_type='sale'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(purchase_next, 43);
    assert_eq!(sale_next, 18);
}

#[test]
fn document_sequence_is_concurrency_safe() {
    use std::collections::HashSet;
    use std::sync::{Arc, Barrier};

    let fixture = Fixture::new();
    let product = fixture.product("SEQ-CONCURRENT");
    let supplier = fixture.supplier();
    let barrier = Arc::new(Barrier::new(6));
    let mut handles = Vec::new();
    for index in 0..6 {
        let pool = fixture.pool.clone();
        let barrier = barrier.clone();
        handles.push(std::thread::spawn(move || {
            barrier.wait();
            let mut input = purchase_input(product, supplier, 1, 10_000);
            input.invoice_number = format!("CONCURRENT-{index}");
            PurchaseService::new(pool)
                .create_draft(input)
                .map(|invoice| invoice.receipt_code)
        }));
    }
    let codes: Vec<String> = handles
        .into_iter()
        .map(|handle| handle.join().unwrap().unwrap())
        .collect();
    assert_eq!(codes.iter().collect::<HashSet<_>>().len(), 6);
}

#[test]
fn automatic_backup_updates_status_and_skips_second_run_same_day() {
    let fixture = Fixture::new();
    fixture.product("AUTO-BACKUP");
    let folder = fixture._directory.path().join("automatic");
    let settings_service = SettingsService::new(fixture.pool.clone());
    let mut settings = settings_service
        .get(folder.to_string_lossy().to_string())
        .unwrap();
    settings.backup_folder = folder.to_string_lossy().to_string();
    settings.automatic_backup_enabled = true;
    settings_service.update(settings).unwrap();

    let first = BackupService::run_daily_automatic_backup(
        fixture.pool.clone(),
        fixture.database.clone(),
        folder.to_string_lossy().to_string(),
    )
    .unwrap();
    assert!(first.healthy);
    let count_after_first = BackupService::list_backups(&folder).unwrap().len();
    let second = BackupService::run_daily_automatic_backup(
        fixture.pool,
        fixture.database,
        folder.to_string_lossy().to_string(),
    )
    .unwrap();
    assert!(second.healthy);
    assert_eq!(
        BackupService::list_backups(&folder).unwrap().len(),
        count_after_first
    );
}

#[test]
fn automatic_backup_falls_back_when_preferred_folder_is_unwritable() {
    let fixture = Fixture::new();
    fixture.product("AUTO-FALLBACK");
    let fallback = fixture._directory.path().join("internal-backups");
    let invalid_preferred = fixture._directory.path().join("not-a-folder");
    File::create(&invalid_preferred).unwrap();
    let settings_service = SettingsService::new(fixture.pool.clone());
    let mut settings = settings_service
        .get(fallback.to_string_lossy().to_string())
        .unwrap();
    settings.backup_folder = invalid_preferred.to_string_lossy().to_string();
    settings.automatic_backup_enabled = true;
    settings_service.update(settings).unwrap();

    let status = BackupService::run_daily_automatic_backup(
        fixture.pool,
        fixture.database,
        fallback.to_string_lossy().to_string(),
    )
    .unwrap();
    assert!(status.healthy);
    assert!(status.using_fallback);
    assert!(status.preferred_folder_error.is_some());
    assert_eq!(BackupService::list_backups(&fallback).unwrap().len(), 1);
}

#[test]
fn disabled_automatic_backup_creates_no_file() {
    let fixture = Fixture::new();
    let folder = fixture._directory.path().join("disabled-auto");
    let service = SettingsService::new(fixture.pool.clone());
    let mut settings = service.get(folder.to_string_lossy().to_string()).unwrap();
    settings.automatic_backup_enabled = false;
    service.update(settings).unwrap();
    BackupService::run_daily_automatic_backup(
        fixture.pool,
        fixture.database,
        folder.to_string_lossy().to_string(),
    )
    .unwrap();
    let backup_count = if folder.exists() {
        std::fs::read_dir(folder).unwrap().count()
    } else {
        0
    };
    assert_eq!(backup_count, 0);
}

#[test]
fn failed_automatic_backup_persists_error_status() {
    let fixture = Fixture::new();
    let invalid_folder = fixture._directory.path().join("not-a-directory");
    std::fs::write(&invalid_folder, b"file").unwrap();
    let service = SettingsService::new(fixture.pool.clone());
    let mut settings = service
        .get(invalid_folder.to_string_lossy().to_string())
        .unwrap();
    settings.backup_folder = invalid_folder.to_string_lossy().to_string();
    settings.automatic_backup_enabled = true;
    service.update(settings).unwrap();
    assert!(BackupService::run_daily_automatic_backup(
        fixture.pool.clone(),
        fixture.database,
        invalid_folder.to_string_lossy().to_string(),
    )
    .is_err());
    let persisted = SettingsService::new(fixture.pool)
        .get(String::new())
        .unwrap();
    assert!(!persisted.last_backup_error.is_empty());
    assert!(persisted.last_backup_file.is_empty());
    assert!(!BackupService::backup_status(&persisted).healthy);
}

#[test]
fn automatic_retention_only_deletes_matching_old_files() {
    let fixture = Fixture::new();
    let folder = fixture._directory.path().join("retention");
    std::fs::create_dir_all(&folder).unwrap();
    let service = BackupService::new(fixture.pool, fixture.database);
    for suffix in [
        "2026-08-01_010101",
        "2026-08-02_010101",
        "2026-08-03_010101",
    ] {
        service
            .create_backup_typed(
                &folder.join(format!("InveStock_Auto_{suffix}.zip")),
                "automatic",
            )
            .unwrap();
    }
    service
        .create_backup_typed(&folder.join("manual-user.zip"), "manual")
        .unwrap();
    service
        .create_backup_typed(&folder.join("pre_restore_keep.zip"), "pre_restore")
        .unwrap();
    BackupService::apply_automatic_retention(&folder, 2).unwrap();
    assert!(!folder.join("InveStock_Auto_2026-08-01_010101.zip").exists());
    assert!(folder.join("InveStock_Auto_2026-08-03_010101.zip").exists());
    assert!(folder.join("manual-user.zip").exists());
    assert!(folder.join("pre_restore_keep.zip").exists());
}

#[test]
fn backup_health_detects_valid_backup_and_unwritable_folder() {
    let fixture = Fixture::new();
    let folder = fixture._directory.path().join("health");
    let backup = folder.join("InveStock_Auto_health.zip");
    BackupService::new(fixture.pool.clone(), fixture.database)
        .create_backup_typed(&backup, "automatic")
        .unwrap();
    let mut settings = SettingsService::new(fixture.pool)
        .get(folder.to_string_lossy().to_string())
        .unwrap();
    settings.backup_folder = folder.to_string_lossy().to_string();
    settings.last_backup_file = backup.to_string_lossy().to_string();
    settings.last_successful_backup_date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let healthy = BackupService::backup_status(&settings);
    assert!(healthy.healthy);

    let not_a_folder = fixture._directory.path().join("not-a-folder");
    std::fs::write(&not_a_folder, b"file").unwrap();
    settings.backup_folder = not_a_folder.to_string_lossy().to_string();
    let unhealthy = BackupService::backup_status(&settings);
    assert!(!unhealthy.folder_writable);
    assert!(!unhealthy.healthy);
}

#[test]
fn backup_health_rejects_corrupted_last_backup() {
    let fixture = Fixture::new();
    let folder = fixture._directory.path().join("corrupt-health");
    std::fs::create_dir_all(&folder).unwrap();
    let corrupt = folder.join("InveStock_Auto_corrupt.zip");
    std::fs::write(&corrupt, b"not a zip archive").unwrap();
    let mut settings = SettingsService::new(fixture.pool)
        .get(folder.to_string_lossy().to_string())
        .unwrap();
    settings.backup_folder = folder.to_string_lossy().to_string();
    settings.last_backup_file = corrupt.to_string_lossy().to_string();
    settings.last_successful_backup_date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let status = BackupService::backup_status(&settings);
    assert!(status.folder_writable);
    assert!(!status.healthy);
}

#[test]
fn settings_persist_backup_path_and_automatic_backup_flag() {
    let fixture = Fixture::new();
    let supplier_id = fixture.supplier();
    let service = SettingsService::new(fixture.pool);
    let expected = AppSettingsDTO {
        store_name: "Cửa hàng kiểm thử".to_string(),
        tax_code: "0123456789".to_string(),
        address: "Huế".to_string(),
        phone: "0900000000".to_string(),
        currency: "VND".to_string(),
        backup_folder: "/tmp/investock-backups".to_string(),
        automatic_backup_enabled: false,
        backup_retention_count: 30,
        last_successful_backup_date: "2026-08-07".to_string(),
        last_backup_file: "backup.zip".to_string(),
        last_backup_error: String::new(),
        preferred_supplier_ids: vec![supplier_id],
        low_stock_threshold: 25,
    };
    service.update(expected).unwrap();
    let loaded = service.get("unused".to_string()).unwrap();
    assert_eq!(loaded.store_name, "Cửa hàng kiểm thử");
    assert_eq!(loaded.backup_folder, "/tmp/investock-backups");
    assert!(!loaded.automatic_backup_enabled);
    assert_eq!(loaded.preferred_supplier_ids, vec![supplier_id]);
    assert_eq!(loaded.low_stock_threshold, 25);
}

#[test]
fn settings_reject_invalid_backup_retention() {
    let fixture = Fixture::new();
    let service = SettingsService::new(fixture.pool);
    let mut settings = service.get("backups".to_string()).unwrap();
    settings.backup_retention_count = 0;
    assert!(matches!(
        service.update(settings),
        Err(AppError::Validation(_))
    ));

    let mut settings = service.get("backups".to_string()).unwrap();
    settings.low_stock_threshold = 0;
    assert!(matches!(
        service.update(settings),
        Err(AppError::Validation(_))
    ));
}

#[test]
fn settings_accept_more_than_two_preferred_suppliers() {
    let fixture = Fixture::new();
    let supplier_service = SupplierService::new(fixture.pool.clone());
    let supplier_ids = (1..=3)
        .map(|index| {
            supplier_service
                .create(CreateSupplierInput {
                    company_name: format!("Nhà cung cấp ưu tiên {index}"),
                    phone: None,
                    address: None,
                    tax_code: None,
                    contact_person: None,
                    bank_account: None,
                    notes: None,
                })
                .unwrap()
                .id
        })
        .collect::<Vec<_>>();
    let service = SettingsService::new(fixture.pool.clone());
    let mut settings = service.get("backups".to_string()).unwrap();
    settings.preferred_supplier_ids = supplier_ids.clone();

    let saved = service.update(settings).unwrap();

    assert_eq!(saved.preferred_supplier_ids, supplier_ids);
}

#[test]
fn supplier_debt_report_checks() {
    let fixture = Fixture::new();
    let product_id = fixture.product("DEBT_PRODUCT");
    let supplier_id = fixture.supplier();

    // 1. Confirm a purchase invoice
    let purchase_service = PurchaseService::new(fixture.pool.clone());
    let draft = purchase_service
        .create_draft(purchase_input(product_id, supplier_id, 10, 1000))
        .unwrap();
    let pi = purchase_service.confirm(draft.id).unwrap();
    assert!(pi.confirmed_at.is_some());

    // 2. Query report immediately - lastPaymentDate must be None
    let inventory_service = InventoryService::new(fixture.pool.clone());
    let rep_initial = inventory_service
        .get_supplier_debt_report(
            feed_inventory_manager_lib::domain::models::ReportParamsInput {
                date_from: None,
                date_to: None,
                invoice_type: None,
                status: None,
                search: None,
                sort_by: None,
                page: None,
                page_size: None,
            },
        )
        .unwrap();
    let row = rep_initial
        .iter()
        .find(|r| r.supplier_id == supplier_id)
        .unwrap();
    assert_eq!(row.last_payment_date, None);
    assert_eq!(row.total_debt, 10000);

    // 3. Record a payment on a specific date (e.g. 2026-07-10)
    let payment_service = PaymentService::new(fixture.pool.clone());
    payment_service
        .record(
            feed_inventory_manager_lib::domain::models::CreateSupplierPaymentInput {
                purchase_invoice_id: pi.id,
                payment_date: "2026-07-10".to_string(),
                amount: 5000,
                payment_method: "chuyen_khoan".to_string(),
                transaction_reference: None,
                notes: None,
            },
        )
        .unwrap();

    // 4. Query report - lastPaymentDate must be 2026-07-10
    let rep_after = inventory_service
        .get_supplier_debt_report(
            feed_inventory_manager_lib::domain::models::ReportParamsInput {
                date_from: None,
                date_to: None,
                invoice_type: None,
                status: None,
                search: None,
                sort_by: None,
                page: None,
                page_size: None,
            },
        )
        .unwrap();
    let row_after = rep_after
        .iter()
        .find(|r| r.supplier_id == supplier_id)
        .unwrap();
    assert_eq!(row_after.last_payment_date.as_deref(), Some("2026-07-10"));
    assert_eq!(row_after.total_debt, 5000);

    // 5. Deactivate the supplier
    let supplier_service = SupplierService::new(fixture.pool.clone());
    supplier_service.toggle_active(supplier_id).unwrap();
    let sup = supplier_service.get_by_id(supplier_id).unwrap().unwrap();
    assert!(!sup.active);

    // 6. Query report - inactive supplier with debt history must still appear
    let rep_deactivated = inventory_service
        .get_supplier_debt_report(
            feed_inventory_manager_lib::domain::models::ReportParamsInput {
                date_from: None,
                date_to: None,
                invoice_type: None,
                status: None,
                search: None,
                sort_by: None,
                page: None,
                page_size: None,
            },
        )
        .unwrap();
    let row_deactivated = rep_deactivated
        .iter()
        .find(|r| r.supplier_id == supplier_id);
    assert!(
        row_deactivated.is_some(),
        "Inactive supplier with debt/history should be visible!"
    );
}

#[test]
fn cancel_sale_restores_stock_and_value_exactly() {
    let fixture = Fixture::new();
    let product_id = fixture.product("CANCEL-S");
    // 1. Inward 10 items at cost 100
    fixture.confirmed_purchase(product_id, 10, 100);
    // 2. Outward 3 items
    let sale_service = SaleService::new(fixture.pool.clone());
    let draft = sale_service
        .create_draft(CreateSalesInvoiceInput {
            electronic_invoice_number: None,
            invoice_date: "2026-08-08".to_string(),
            buyer_type: "khach_le".to_string(),
            buyer_name: None,
            notes: None,
            items: vec![CreateSalesItemInput {
                product_id,
                quantity: 3,
                line_total_sale: 450,
            }],
        })
        .unwrap();
    let confirmed = sale_service.confirm(draft.id).unwrap();
    assert_eq!(confirmed.status, "xac_nhan");

    let product = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product.current_stock, 7);
    assert_eq!(product.current_inventory_value, 700);

    // 3. Cancel the sale
    let cancelled = sale_service
        .cancel(confirmed.id, "Khách trả hàng".to_string())
        .unwrap();
    assert_eq!(cancelled.status, "huy");
    assert_eq!(
        cancelled.cancellation_reason.as_deref(),
        Some("Khách trả hàng")
    );

    let product_after = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product_after.current_stock, 10);
    assert_eq!(product_after.current_inventory_value, 1000);
    assert_eq!(product_after.average_cost, 100);
}

#[test]
fn cancel_purchase_reverses_exact_stock_and_value() {
    let fixture = Fixture::new();
    let product_id = fixture.product("CANCEL-P");
    let supplier_id = fixture.supplier();

    // 1. Confirmed purchase of 10 items
    let purchase_service = PurchaseService::new(fixture.pool.clone());
    let draft = purchase_service
        .create_draft(purchase_input(product_id, supplier_id, 10, 150))
        .unwrap();
    let confirmed = purchase_service.confirm(draft.id).unwrap();

    let product = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product.current_stock, 10);
    assert_eq!(product.current_inventory_value, 1500);

    // 2. Cancel the purchase
    let cancelled = purchase_service
        .cancel(confirmed.id, "Nhập sai".to_string())
        .unwrap();
    assert_eq!(cancelled.status, "huy");
    assert_eq!(cancelled.cancellation_reason.as_deref(), Some("Nhập sai"));

    let product_after = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product_after.current_stock, 0);
    assert_eq!(product_after.current_inventory_value, 0);
    assert_eq!(product_after.average_cost, 0);
}

#[test]
fn purchase_cancel_with_payment_blocked() {
    let fixture = Fixture::new();
    let product_id = fixture.product("CANCEL-P-PAY");
    let supplier_id = fixture.supplier();

    let purchase_service = PurchaseService::new(fixture.pool.clone());
    let draft = purchase_service
        .create_draft(purchase_input(product_id, supplier_id, 10, 150))
        .unwrap();
    let confirmed = purchase_service.confirm(draft.id).unwrap();

    // Record payment
    let payment_service = PaymentService::new(fixture.pool.clone());
    payment_service
        .record(CreateSupplierPaymentInput {
            purchase_invoice_id: confirmed.id,
            payment_date: "2026-08-08".to_string(),
            amount: 500,
            payment_method: "tien_mat".to_string(),
            transaction_reference: None,
            notes: None,
        })
        .unwrap();

    // Cancel must be blocked
    let res = purchase_service.cancel(confirmed.id, "Hủy bừa".to_string());
    assert!(res.is_err());
}

#[test]
fn void_payment_recalculates_debt() {
    let fixture = Fixture::new();
    let product_id = fixture.product("VOID-PAY");
    let supplier_id = fixture.supplier();

    let purchase_service = PurchaseService::new(fixture.pool.clone());
    let draft = purchase_service
        .create_draft(purchase_input(product_id, supplier_id, 10, 150))
        .unwrap();
    let confirmed = purchase_service.confirm(draft.id).unwrap();

    let payment_service = PaymentService::new(fixture.pool.clone());
    let pay = payment_service
        .record(CreateSupplierPaymentInput {
            purchase_invoice_id: confirmed.id,
            payment_date: "2026-08-08".to_string(),
            amount: 500,
            payment_method: "tien_mat".to_string(),
            transaction_reference: None,
            notes: None,
        })
        .unwrap();

    let p_invoice = purchase_service.get_by_id(confirmed.id).unwrap().unwrap();
    assert_eq!(p_invoice.paid_amount, 500);
    assert_eq!(p_invoice.remaining_amount, 1000);

    // Void the payment
    let voided = payment_service
        .void(pay.id, "Ghi sai số tiền".to_string())
        .unwrap();
    assert_eq!(voided.status, "voided");
    assert_eq!(voided.void_reason.as_deref(), Some("Ghi sai số tiền"));

    let p_invoice_after = purchase_service.get_by_id(confirmed.id).unwrap().unwrap();
    assert_eq!(p_invoice_after.paid_amount, 0);
    assert_eq!(p_invoice_after.remaining_amount, 1500);
}

#[test]
fn inventory_adjustment_increase() {
    let fixture = Fixture::new();
    let product_id = fixture.product("ADJ-INC");
    fixture.confirmed_purchase(product_id, 10, 100);

    let inventory_service = InventoryService::new(fixture.pool.clone());
    let adj = inventory_service
        .create_adjustment(CreateInventoryAdjustmentInput {
            product_id,
            actual_stock: 15,
            reason: "kiem_ke".to_string(),
            notes: Some("Thừa bao".to_string()),
            adjustment_date: "2026-08-08".to_string(),
            adjustment_unit_cost: Some(120),
        })
        .unwrap();

    assert_eq!(adj.difference, 5);
    assert_eq!(adj.system_stock, 10);
    assert_eq!(adj.actual_stock, 15);

    let product = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product.current_stock, 15);
    // 1000 + 5 * 120 = 1600. Avg cost: 1600 / 15 = 107
    assert_eq!(product.current_inventory_value, 1600);
    assert_eq!(product.average_cost, 107);
    let connection = fixture.pool.get().unwrap();
    let ledger_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM inventory_transactions WHERE product_id=?1 AND transaction_type='inventory_adjustment_in'",
            [product_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(ledger_count, 1);
}

#[test]
fn inventory_adjustment_rejects_negative_actual_stock_without_writes() {
    let fixture = Fixture::new();
    let product_id = fixture.product("ADJ-NEGATIVE");
    let service = InventoryService::new(fixture.pool.clone());

    let result = service.create_adjustment(CreateInventoryAdjustmentInput {
        product_id,
        actual_stock: -1,
        reason: "kiem_ke".to_string(),
        notes: None,
        adjustment_date: "2026-08-08".to_string(),
        adjustment_unit_cost: None,
    });

    assert!(matches!(result, Err(AppError::Validation(_))));
    let connection = fixture.pool.get().unwrap();
    let adjustment_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM inventory_adjustments", [], |row| {
            row.get(0)
        })
        .unwrap();
    let transaction_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM inventory_transactions WHERE product_id=?1",
            [product_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(adjustment_count, 0);
    assert_eq!(transaction_count, 0);
}

#[test]
fn zero_stock_invalid_decrease_is_rejected_without_division() {
    let fixture = Fixture::new();
    let product_id = fixture.product("ADJ-ZERO-SAFE");
    let result = InventoryService::new(fixture.pool.clone()).create_adjustment(
        CreateInventoryAdjustmentInput {
            product_id,
            actual_stock: -5,
            reason: "kiem_ke".to_string(),
            notes: None,
            adjustment_date: "2026-08-08".to_string(),
            adjustment_unit_cost: None,
        },
    );
    assert!(matches!(result, Err(AppError::Validation(_))));
}

#[test]
fn purchase_cancel_rejects_insufficient_inventory_value_and_rolls_back() {
    let fixture = Fixture::new();
    let product_id = fixture.product("CANCEL-VALUE");
    let supplier_id = fixture.supplier();
    let service = PurchaseService::new(fixture.pool.clone());
    let confirmed = service
        .confirm(
            service
                .create_draft(purchase_input(product_id, supplier_id, 10, 150))
                .unwrap()
                .id,
        )
        .unwrap();
    fixture
        .pool
        .get()
        .unwrap()
        .execute(
            "UPDATE products SET current_stock=15,current_inventory_value=1200,average_cost=80 WHERE id=?1",
            [product_id],
        )
        .unwrap();

    let result = service.cancel(confirmed.id, "Hủy phiếu".to_string());

    assert!(matches!(result, Err(AppError::Conflict(_))));
    let product = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(
        (product.current_stock, product.current_inventory_value),
        (15, 1200)
    );
    assert_eq!(
        service.get_by_id(confirmed.id).unwrap().unwrap().status,
        "xac_nhan"
    );
    let cancel_rows: i64 = fixture
        .pool
        .get()
        .unwrap()
        .query_row(
            "SELECT COUNT(*) FROM inventory_transactions WHERE source_type='purchase_invoice' AND source_id=?1 AND transaction_type='purchase_cancel'",
            [confirmed.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(cancel_rows, 0);
}

#[test]
fn purchase_double_cancellation_is_rejected() {
    let fixture = Fixture::new();
    let product_id = fixture.product("CANCEL-TWICE");
    let supplier_id = fixture.supplier();
    let service = PurchaseService::new(fixture.pool.clone());
    let confirmed = service
        .confirm(
            service
                .create_draft(purchase_input(product_id, supplier_id, 2, 100))
                .unwrap()
                .id,
        )
        .unwrap();
    service.cancel(confirmed.id, "Lần một".to_string()).unwrap();
    assert!(matches!(
        service.cancel(confirmed.id, "Lần hai".to_string()),
        Err(AppError::Conflict(_))
    ));
}

#[test]
fn inventory_adjustment_decrease() {
    let fixture = Fixture::new();
    let product_id = fixture.product("ADJ-DEC");
    fixture.confirmed_purchase(product_id, 10, 100);

    let inventory_service = InventoryService::new(fixture.pool.clone());
    let adj = inventory_service
        .create_adjustment(CreateInventoryAdjustmentInput {
            product_id,
            actual_stock: 8,
            reason: "hong_mat".to_string(),
            notes: Some("Chuột cắn".to_string()),
            adjustment_date: "2026-08-08".to_string(),
            adjustment_unit_cost: None,
        })
        .unwrap();

    assert_eq!(adj.difference, -2);
    assert_eq!(adj.system_stock, 10);
    assert_eq!(adj.actual_stock, 8);

    let product = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product.current_stock, 8);
    // Value: 1000 - (1000 * 2)/10 = 800
    assert_eq!(product.current_inventory_value, 800);
    assert_eq!(product.average_cost, 100);
}

#[test]
fn adjustment_to_zero_clears_inventory_value() {
    let fixture = Fixture::new();
    let product_id = fixture.product("ADJ-ZERO");
    fixture.confirmed_purchase(product_id, 10, 100);

    let inventory_service = InventoryService::new(fixture.pool.clone());
    let adj = inventory_service
        .create_adjustment(CreateInventoryAdjustmentInput {
            product_id,
            actual_stock: 0,
            reason: "hong_mat".to_string(),
            notes: Some("Hao hụt hết".to_string()),
            adjustment_date: "2026-08-08".to_string(),
            adjustment_unit_cost: None,
        })
        .unwrap();

    assert_eq!(adj.difference, -10);

    let product = ProductService::new(fixture.pool.clone())
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product.current_stock, 0);
    assert_eq!(product.current_inventory_value, 0);
    assert_eq!(product.average_cost, 0);
}

#[test]
fn dashboard_supplier_debt_excludes_draft_and_cancelled() {
    let fixture = Fixture::new();
    let product_id = fixture.product("DASH-DEBT");
    let supplier_id = fixture.supplier();
    let purchase_service = PurchaseService::new(fixture.pool.clone());

    // Draft purchase (100,000,000)
    let draft = purchase_service
        .create_draft(purchase_input(product_id, supplier_id, 10, 10_000_000))
        .unwrap();

    // Confirmed purchase (50,000,000)
    let confirmed_draft = purchase_service
        .create_draft(purchase_input(product_id, supplier_id, 5, 10_000_000))
        .unwrap();
    let _confirmed = purchase_service.confirm(confirmed_draft.id).unwrap();

    let inventory_service = InventoryService::new(fixture.pool.clone());
    let analytics = inventory_service
        .get_dashboard_analytics(DashboardQueryParams {
            preset: Some("this_month".to_string()),
            date_from: None,
            date_to: None,
            group_by: None,
            compare_previous: Some(false),
        })
        .unwrap();

    // Must be 50,000,000 (confirmed only), NOT 150,000,000 (which would include draft)
    assert_eq!(analytics.total_supplier_debt, 50_000_000);
    assert_eq!(analytics.unpaid_invoices_count, 1);
    assert!(draft.id != 0);
}

#[test]
fn dashboard_stock_alerts_isolated_previews() {
    let fixture = Fixture::new();
    let product_neg = fixture.product("PROD-NEG");
    let product_out = fixture.product("PROD-OUT");
    let product_low = fixture.product("PROD-LOW");

    // Manually set stock to negative, zero, low
    let conn = fixture.pool.get().unwrap();
    conn.execute(
        "UPDATE products SET current_stock = -5 WHERE id = ?1",
        [product_neg],
    )
    .unwrap();
    conn.execute(
        "UPDATE products SET current_stock = 0 WHERE id = ?1",
        [product_out],
    )
    .unwrap();
    conn.execute(
        "UPDATE products SET current_stock = 3 WHERE id = ?1",
        [product_low],
    )
    .unwrap();

    let inventory_service = InventoryService::new(fixture.pool.clone());
    let analytics = inventory_service
        .get_dashboard_analytics(DashboardQueryParams {
            preset: Some("this_month".to_string()),
            date_from: None,
            date_to: None,
            group_by: None,
            compare_previous: Some(false),
        })
        .unwrap();

    assert_eq!(analytics.negative_stock_count, 1);
    assert_eq!(analytics.out_of_stock_count, 1);
    assert_eq!(analytics.low_stock_count, 1);

    assert_eq!(analytics.negative_stock_preview.len(), 1);
    assert_eq!(analytics.negative_stock_preview[0].id, product_neg);

    assert_eq!(analytics.out_of_stock_preview.len(), 1);
    assert_eq!(analytics.out_of_stock_preview[0].id, product_out);

    assert_eq!(analytics.low_stock_preview.len(), 1);
    assert_eq!(analytics.low_stock_preview[0].id, product_low);
}

#[test]
fn test_purchase_line_total_100_bao_1m_exact() {
    let fixture = Fixture::new();
    let product_id = fixture.product("P-100BAO");
    let supplier_id = fixture.supplier();
    let purchase_service = PurchaseService::new(fixture.pool.clone());
    let draft = purchase_service
        .create_draft(CreatePurchaseInvoiceInput {
            invoice_number: "PN-100BAO-1M".to_string(),
            invoice_date: "2026-08-15".to_string(),
            received_date: "2026-08-15".to_string(),
            supplier_id,
            notes: None,
            items: vec![CreatePurchaseItemInput {
                product_id,
                quantity: 100,
                line_total: 1_000_000,
                notes: None,
            }],
        })
        .unwrap();

    assert_eq!(draft.grand_total, 1_000_000);
    assert_eq!(draft.items[0].line_total, 1_000_000);
    assert_eq!(draft.items[0].effective_unit_cost, 10_000);

    let confirmed = purchase_service.confirm(draft.id).unwrap();
    let product = ProductService::new(fixture.pool)
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product.current_stock, 100);
    assert_eq!(product.current_inventory_value, 1_000_000);
    assert_eq!(confirmed.status, "xac_nhan");
}

#[test]
fn test_purchase_cancel_reverses_exact() {
    let fixture = Fixture::new();
    let product_id = fixture.product("P-CANCEL");
    let supplier_id = fixture.supplier();
    let purchase_service = PurchaseService::new(fixture.pool.clone());
    let draft = purchase_service
        .create_draft(CreatePurchaseInvoiceInput {
            invoice_number: "PN-CANCEL".to_string(),
            invoice_date: "2026-08-15".to_string(),
            received_date: "2026-08-15".to_string(),
            supplier_id,
            notes: None,
            items: vec![CreatePurchaseItemInput {
                product_id,
                quantity: 50,
                line_total: 500_000,
                notes: None,
            }],
        })
        .unwrap();
    let confirmed = purchase_service.confirm(draft.id).unwrap();

    let cancelled = purchase_service
        .cancel(confirmed.id, "Nhập sai sản phẩm".to_string())
        .unwrap();
    assert_eq!(cancelled.status, "huy");

    let product = ProductService::new(fixture.pool)
        .get_by_id(product_id)
        .unwrap()
        .unwrap();
    assert_eq!(product.current_stock, 0);
    assert_eq!(product.current_inventory_value, 0);
}

#[test]
fn test_document_sequence_self_heal() {
    let fixture = Fixture::new();
    let conn = fixture.pool.get().unwrap();
    conn.execute(
        "DELETE FROM document_sequences WHERE document_type = 'purchase'",
        [],
    )
    .unwrap();

    let product_id = fixture.product("P-HEAL");
    let supplier_id = fixture.supplier();
    let purchase_service = PurchaseService::new(fixture.pool);
    let draft = purchase_service
        .create_draft(CreatePurchaseInvoiceInput {
            invoice_number: "PN-SELF-HEAL".to_string(),
            invoice_date: "2026-08-15".to_string(),
            received_date: "2026-08-15".to_string(),
            supplier_id,
            notes: None,
            items: vec![CreatePurchaseItemInput {
                product_id,
                quantity: 1,
                line_total: 10_000,
                notes: None,
            }],
        })
        .unwrap();

    assert!(draft.receipt_code.starts_with("PN"));
}

#[test]
fn test_supplier_phone_validation() {
    let fixture = Fixture::new();
    let supplier_service = SupplierService::new(fixture.pool);

    // Valid 10 digits
    let ok_supplier = supplier_service.create(CreateSupplierInput {
        company_name: "NCC Chuẩn".to_string(),
        phone: Some("0912345678".to_string()),
        address: None,
        tax_code: None,
        contact_person: None,
        bank_account: None,
        notes: None,
    });
    assert!(ok_supplier.is_ok());

    // Invalid length (11 digits)
    let err_supplier_11 = supplier_service.create(CreateSupplierInput {
        company_name: "NCC Lỗi 11 số".to_string(),
        phone: Some("09123456789".to_string()),
        address: None,
        tax_code: None,
        contact_person: None,
        bank_account: None,
        notes: None,
    });
    assert!(matches!(err_supplier_11, Err(AppError::Validation(_))));

    // Invalid non-digits
    let err_supplier_char = supplier_service.create(CreateSupplierInput {
        company_name: "NCC Lỗi Chữ".to_string(),
        phone: Some("091234567a".to_string()),
        address: None,
        tax_code: None,
        contact_person: None,
        bank_account: None,
        notes: None,
    });
    assert!(matches!(err_supplier_char, Err(AppError::Validation(_))));
}

#[test]
fn test_health_check_detects_mismatch_and_anomalies() {
    let fixture = Fixture::new();
    let product_id = fixture.product("HEALTH-TEST");
    let conn = fixture.pool.get().unwrap();

    // 1. Stock mismatch
    conn.execute(
        "UPDATE products SET current_stock = 99 WHERE id = ?1",
        [product_id],
    )
    .unwrap();
    let inventory_service = InventoryService::new(fixture.pool.clone());
    let health1 = inventory_service.check_inventory_data_health().unwrap();
    assert!(!health1.is_healthy);

    // 2. Zero value with non-zero stock
    conn.execute(
        "UPDATE products SET current_stock = 10, current_inventory_value = 0 WHERE id = ?1",
        [product_id],
    )
    .unwrap();
    let health2 = inventory_service.check_inventory_data_health().unwrap();
    assert!(!health2.is_healthy);
}
