use crate::domain::errors::{AppError, AppResult};
use crate::domain::models_seed::{DatabaseStats, SeedResult};
use crate::infrastructure::database::connection::DbPool;
use rusqlite::Transaction;

pub struct SeedService {
    pool: DbPool,
}

impl SeedService {
    pub fn new(pool: DbPool) -> Self {
        Self { pool }
    }

    pub fn get_db_stats(&self) -> AppResult<DatabaseStats> {
        let conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let product_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM products", [], |r| r.get(0))
            .unwrap_or(0);
        let supplier_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM suppliers", [], |r| r.get(0))
            .unwrap_or(0);
        let purchase_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM purchase_invoices", [], |r| r.get(0))
            .unwrap_or(0);
        let sales_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sales_invoices", [], |r| r.get(0))
            .unwrap_or(0);
        let transaction_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM inventory_transactions", [], |r| {
                r.get(0)
            })
            .unwrap_or(0);

        let is_empty =
            product_count == 0 && supplier_count == 0 && purchase_count == 0 && sales_count == 0;

        Ok(DatabaseStats {
            product_count,
            supplier_count,
            purchase_count,
            sales_count,
            transaction_count,
            is_empty,
        })
    }

    pub fn seed_demo_data(&self, clear_existing: bool) -> AppResult<SeedResult> {
        let mut conn = self
            .pool
            .get()
            .map_err(|e| AppError::Database(e.to_string()))?;

        let tx = conn
            .transaction()
            .map_err(|e| AppError::Database(e.to_string()))?;

        if clear_existing {
            Self::clean_database(&tx)?;
        }

        let (products_count, suppliers_count, purchases_count, sales_count) =
            Self::execute_seed(&tx)?;

        tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

        Ok(SeedResult {
            success: true,
            message: "Gieo dữ liệu nhập - xuất thử nghiệm thành công!".to_string(),
            products_seeded: products_count,
            suppliers_seeded: suppliers_count,
            purchases_seeded: purchases_count,
            sales_seeded: sales_count,
        })
    }

    fn clean_database(tx: &Transaction) -> AppResult<()> {
        tx.execute("DELETE FROM supplier_payments", [])
            .map_err(|e| AppError::Database(e.to_string()))?;
        tx.execute("DELETE FROM sales_invoice_items", [])
            .map_err(|e| AppError::Database(e.to_string()))?;
        tx.execute("DELETE FROM sales_invoices", [])
            .map_err(|e| AppError::Database(e.to_string()))?;
        tx.execute("DELETE FROM purchase_invoice_items", [])
            .map_err(|e| AppError::Database(e.to_string()))?;
        tx.execute("DELETE FROM purchase_invoices", [])
            .map_err(|e| AppError::Database(e.to_string()))?;
        tx.execute("DELETE FROM inventory_transactions", [])
            .map_err(|e| AppError::Database(e.to_string()))?;
        tx.execute("DELETE FROM product_price_history", [])
            .map_err(|e| AppError::Database(e.to_string()))?;
        tx.execute("DELETE FROM products", [])
            .map_err(|e| AppError::Database(e.to_string()))?;
        tx.execute("DELETE FROM suppliers", [])
            .map_err(|e| AppError::Database(e.to_string()))?;
        tx.execute("DELETE FROM sqlite_sequence", []).ok(); // Reset AUTOINCREMENT
        Ok(())
    }

    fn execute_seed(tx: &Transaction) -> AppResult<(usize, usize, usize, usize)> {
        // 1. Fetch existing or create fallback Suppliers & Products
        let mut supplier_ids: Vec<i64> = Vec::new();
        {
            let mut stmt = tx
                .prepare("SELECT id FROM suppliers WHERE active = 1")
                .map_err(|e| AppError::Database(e.to_string()))?;
            let rows = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| AppError::Database(e.to_string()))?;
            for r in rows.flatten() {
                supplier_ids.push(r);
            }
        }

        if supplier_ids.is_empty() {
            let suppliers = vec![
                (
                    "CÔNG TY CP CARGILL VIỆT NAM",
                    "0901234567",
                    "KCN Biên Hòa 2, Đồng Nai",
                    "3600234567",
                    "Nguyễn Văn A",
                ),
                (
                    "CÔNG TY TNHH CJ VINA FEED",
                    "0912345678",
                    "KCN Hố Nai, Đồng Nai",
                    "3600987654",
                    "Trần Thị B",
                ),
                (
                    "CÔNG TY CP NÔNG NGHIỆP CÁM CÒ",
                    "0923456789",
                    "KCN Tân Bình, TP.HCM",
                    "0300123456",
                    "Lê Văn C",
                ),
                (
                    "CÔNG TY TNHH DE HEUS",
                    "0934567890",
                    "KCN Bình Dương",
                    "3700567890",
                    "Phạm Thị D",
                ),
                (
                    "CÔNG TY CP GREENFEED VIỆT NAM",
                    "0945678901",
                    "Bến Lức, Long An",
                    "1100234567",
                    "Hoàng Văn E",
                ),
            ];
            for (name, phone, addr, tax, contact) in &suppliers {
                tx.execute(
                    "INSERT INTO suppliers (company_name, phone, address, tax_code, contact_person, active)
                     VALUES (?1, ?2, ?3, ?4, ?5, 1)",
                    [name, phone, addr, tax, contact],
                ).map_err(|e| AppError::Database(e.to_string()))?;
                supplier_ids.push(tx.last_insert_rowid());
            }
        }

        let mut product_ids: Vec<i64> = Vec::new();
        {
            let mut stmt = tx
                .prepare("SELECT id FROM products WHERE active = 1")
                .map_err(|e| AppError::Database(e.to_string()))?;
            let rows = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| AppError::Database(e.to_string()))?;
            for r in rows.flatten() {
                product_ids.push(r);
            }
        }

        if product_ids.is_empty() {
            let products = vec![
                (
                    "HH001",
                    "Cám Heo Con Tập Ăn C24",
                    "heo",
                    25000,
                    "kg",
                    "Bao",
                    "Cargill",
                    320000,
                    380000,
                ),
                (
                    "HH002",
                    "Cám Heo Thịt Siêu Nạc C26",
                    "heo",
                    25000,
                    "kg",
                    "Bao",
                    "Cargill",
                    280000,
                    340000,
                ),
                (
                    "HH003",
                    "Cám Heo Nái Mang Thai C28",
                    "heo",
                    25000,
                    "kg",
                    "Bao",
                    "Cargill",
                    290000,
                    350000,
                ),
                (
                    "HH004",
                    "Cám Gà Con Úm CJ101",
                    "ga",
                    25000,
                    "kg",
                    "Bao",
                    "CJ Vina",
                    310000,
                    370000,
                ),
                (
                    "HH005",
                    "Cám Gà Thịt Lớn CJ102",
                    "ga",
                    25000,
                    "kg",
                    "Bao",
                    "CJ Vina",
                    270000,
                    330000,
                ),
                (
                    "HH006",
                    "Cám Gà Đẻ Trứng CJ105",
                    "ga",
                    25000,
                    "kg",
                    "Bao",
                    "CJ Vina",
                    295000,
                    355000,
                ),
                (
                    "HH007",
                    "Cám Vịt Siêu Thịt CC81",
                    "vit",
                    25000,
                    "kg",
                    "Bao",
                    "Cám Cò",
                    260000,
                    320000,
                ),
                (
                    "HH008",
                    "Cám Vịt Đẻ Nhốt CC85",
                    "vit",
                    25000,
                    "kg",
                    "Bao",
                    "Cám Cò",
                    285000,
                    345000,
                ),
                (
                    "HH009",
                    "Cám Bò Vỗ Béo DH55",
                    "bo",
                    40000,
                    "kg",
                    "Bao",
                    "De Heus",
                    360000,
                    430000,
                ),
                (
                    "HH010",
                    "Cám Bò Sữa Dinh Dưỡng DH58",
                    "bo",
                    40000,
                    "kg",
                    "Bao",
                    "De Heus",
                    410000,
                    490000,
                ),
                (
                    "HH011",
                    "Thuốc Bổ Thủy Phân GF1",
                    "khac",
                    1000,
                    "g",
                    "Tui",
                    "GreenFeed",
                    120000,
                    160000,
                ),
                (
                    "HH012",
                    "Cám Heo Hết Hàng Demo",
                    "heo",
                    25000,
                    "kg",
                    "Bao",
                    "GreenFeed",
                    300000,
                    360000,
                ),
            ];
            for (code, name, cat, weight, unit, inv_unit, brand, purchase_price, sale_price) in
                &products
            {
                tx.execute(
                    "INSERT INTO products (product_code, product_name, animal_category, package_weight_grams,
                                           package_weight_unit, inventory_unit, brand, latest_purchase_price,
                                           average_cost, current_sale_price, current_stock, active)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?9, 0, 1)",
                    rusqlite::params![code, name, cat, weight, unit, inv_unit, brand, purchase_price, sale_price],
                ).map_err(|e| AppError::Database(e.to_string()))?;
                product_ids.push(tx.last_insert_rowid());
            }
        }

        let p0 = product_ids[0];
        let p1 = product_ids.get(1).copied().unwrap_or(p0);
        let p2 = product_ids.get(2).copied().unwrap_or(p0);
        let p3 = product_ids.get(3).copied().unwrap_or(p0);
        let p4 = product_ids.get(4).copied().unwrap_or(p0);
        let p5 = product_ids.get(5).copied().unwrap_or(p0);
        let p6 = product_ids.get(6).copied().unwrap_or(p0);
        let p7 = product_ids.get(7).copied().unwrap_or(p0);
        let p8 = product_ids.get(8).copied().unwrap_or(p0);
        let p9 = product_ids.get(9).copied().unwrap_or(p0);
        let p10 = product_ids.get(10).copied().unwrap_or(p0);

        let sup0 = supplier_ids[0];
        let sup1 = supplier_ids.get(1).copied().unwrap_or(sup0);
        let sup2 = supplier_ids.get(2).copied().unwrap_or(sup0);
        let sup3 = supplier_ids.get(3).copied().unwrap_or(sup0);
        let sup4 = supplier_ids.get(4).copied().unwrap_or(sup0);

        // 2. Extended Purchases Data (16 Invoices across 6 months)
        let purchases_data = vec![
            (
                "PN-20260305-001",
                "HD-CG-01",
                "2026-03-05",
                sup0,
                vec![(p0, 150, 310000), (p1, 200, 275000)],
            ),
            (
                "PN-20260320-002",
                "HD-CJ-02",
                "2026-03-20",
                sup1,
                vec![(p3, 100, 305000), (p4, 180, 260000)],
            ),
            (
                "PN-20260405-003",
                "HD-CC-03",
                "2026-04-05",
                sup2,
                vec![(p6, 140, 255000), (p7, 120, 280000)],
            ),
            (
                "PN-20260422-004",
                "HD-DH-04",
                "2026-04-22",
                sup3,
                vec![(p8, 90, 350000), (p9, 80, 400000)],
            ),
            (
                "PN-20260510-005",
                "HD-GF-05",
                "2026-05-10",
                sup4,
                vec![(p10, 60, 115000), (p0, 120, 315000)],
            ),
            (
                "PN-20260528-006",
                "HD-CG-06",
                "2026-05-28",
                sup0,
                vec![(p1, 130, 280000), (p2, 110, 290000)],
            ),
            (
                "PN-20260604-007",
                "HD-CJ-07",
                "2026-06-04",
                sup1,
                vec![(p3, 150, 310000), (p5, 100, 290000)],
            ),
            (
                "PN-20260618-008",
                "HD-CC-08",
                "2026-06-18",
                sup2,
                vec![(p6, 160, 260000), (p7, 130, 285000)],
            ),
            (
                "PN-20260702-009",
                "HD-DH-09",
                "2026-07-02",
                sup3,
                vec![(p8, 100, 355000), (p9, 95, 405000)],
            ),
            (
                "PN-20260715-010",
                "HD-GF-10",
                "2026-07-15",
                sup4,
                vec![(p0, 140, 320000), (p1, 150, 282000)],
            ),
            (
                "PN-20260729-011",
                "HD-CG-11",
                "2026-07-29",
                sup0,
                vec![(p2, 100, 295000), (p4, 160, 268000)],
            ),
            (
                "PN-20260801-012",
                "HD-CJ-12",
                "2026-08-01",
                sup1,
                vec![(p3, 120, 312000), (p5, 90, 295000)],
            ),
            (
                "PN-20260803-013",
                "HD-CC-13",
                "2026-08-03",
                sup2,
                vec![(p6, 110, 262000), (p7, 100, 288000)],
            ),
        ];

        let mut purchase_count = 0;
        for (receipt_code, inv_num, date, supplier_id, items) in &purchases_data {
            let mut subtotal: i64 = 0;
            for (_, qty, price) in items {
                subtotal += qty * price;
            }
            let shipping_cost: i64 = 0;
            let grand_total = subtotal;
            let paid_amount = grand_total;
            let remaining_amount = 0;

            tx.execute(
                "INSERT INTO purchase_invoices (receipt_code, invoice_number, invoice_date, received_date,
                                               supplier_id, subtotal, shipping_cost, grand_total, paid_amount,
                                               remaining_amount, payment_status, status, confirmed_at)
                 VALUES (?1, ?2, ?3, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'da_thanh_toan', 'xac_nhan', ?3)",
                rusqlite::params![receipt_code, inv_num, date, supplier_id, subtotal, shipping_cost, grand_total, paid_amount, remaining_amount],
            ).map_err(|e| AppError::Database(e.to_string()))?;
            let purchase_id = tx.last_insert_rowid();
            purchase_count += 1;

            for (prod_id, qty, unit_price) in items {
                let line_tot = qty * unit_price;
                let eff_cost = *unit_price;

                tx.execute(
                    "INSERT INTO purchase_invoice_items (purchase_invoice_id, product_id, quantity,
                                                          invoice_unit_price, discount_amount, shipping_allocation,
                                                          effective_unit_cost, line_total)
                     VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6)",
                    rusqlite::params![purchase_id, prod_id, qty, unit_price, eff_cost, line_tot],
                ).map_err(|e| AppError::Database(e.to_string()))?;

                let (old_stock, old_avg_cost): (i64, i64) = tx
                    .query_row(
                        "SELECT current_stock, average_cost FROM products WHERE id = ?1",
                        [prod_id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .map_err(|e| AppError::Database(e.to_string()))?;

                let new_stock = old_stock + qty;
                let new_avg_cost = if new_stock > 0 {
                    ((old_stock * old_avg_cost) + (qty * eff_cost)) / new_stock
                } else {
                    eff_cost
                };

                tx.execute(
                    "UPDATE products SET current_stock = ?1, average_cost = ?2, latest_purchase_price = ?3 WHERE id = ?4",
                    rusqlite::params![new_stock, new_avg_cost, eff_cost, prod_id],
                ).map_err(|e| AppError::Database(e.to_string()))?;

                tx.execute(
                    "INSERT INTO inventory_transactions (transaction_date, product_id, transaction_type,
                                                          source_type, source_id, quantity_in, unit_cost,
                                                          stock_before, stock_after, old_average_cost, new_average_cost)
                     VALUES (?1, ?2, 'nhap', 'PURCHASE', ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    rusqlite::params![date, prod_id, purchase_id, qty, eff_cost, old_stock, new_stock, old_avg_cost, new_avg_cost],
                ).map_err(|e| AppError::Database(e.to_string()))?;
            }
        }

        // 3. Extended Sales Data (18 Invoices across 6 months)
        let sales_data = vec![
            (
                "PX-20260312-001",
                "2026-03-12",
                "trang_trai",
                "Trang Trại Ba Vì",
                vec![(p0, 30, 380000), (p1, 40, 340000)],
            ),
            (
                "PX-20260325-002",
                "2026-03-25",
                "dai_ly",
                "Đại Lý Hùng Cường",
                vec![(p3, 25, 370000), (p4, 35, 330000)],
            ),
            (
                "PX-20260410-003",
                "2026-04-10",
                "khach_le",
                "Nguyễn Văn Hùng",
                vec![(p6, 30, 320000), (p7, 20, 345000)],
            ),
            (
                "PX-20260426-004",
                "2026-04-26",
                "trang_trai",
                "HTX Chăn Nuôi Bò Dê",
                vec![(p8, 25, 430000), (p9, 20, 490000)],
            ),
            (
                "PX-20260515-005",
                "2026-05-15",
                "dai_ly",
                "Nông Nghiệp Xanh",
                vec![(p0, 45, 385000), (p10, 15, 160000)],
            ),
            (
                "PX-20260530-006",
                "2026-05-30",
                "khach_le",
                "Trần Văn Nam",
                vec![(p1, 30, 340000), (p2, 25, 350000)],
            ),
            (
                "PX-20260608-007",
                "2026-06-08",
                "trang_trai",
                "Trang Trại Đồng Xanh",
                vec![(p3, 35, 375000), (p5, 20, 355000)],
            ),
            (
                "PX-20260622-008",
                "2026-06-22",
                "dai_ly",
                "Đại Lý Minh Phát",
                vec![(p6, 40, 325000), (p7, 30, 350000)],
            ),
            (
                "PX-20260708-009",
                "2026-07-08",
                "trang_trai",
                "HTX Bò Sữa Mộc Châu",
                vec![(p8, 30, 435000), (p9, 25, 495000)],
            ),
            (
                "PX-20260720-010",
                "2026-07-20",
                "khach_le",
                "Lê Thị Mai",
                vec![(p0, 50, 390000), (p1, 40, 345000)],
            ),
            (
                "PX-20260801-011",
                "2026-08-01",
                "dai_ly",
                "Đại Lý Tiến Thành",
                vec![(p2, 30, 355000), (p4, 45, 335000)],
            ),
            (
                "PX-20260803-012",
                "2026-08-03",
                "trang_trai",
                "Trang Trại Hoàn Hảo",
                vec![(p3, 30, 375000), (p5, 25, 355000)],
            ),
        ];

        let mut sales_count = 0;
        for (issue_code, date, buyer_type, buyer_name, items) in &sales_data {
            let mut grand_total: i64 = 0;
            let mut total_cost: i64 = 0;

            let mut item_details = Vec::new();
            for (prod_id, qty, sale_price) in items {
                let (avg_cost, current_stock): (i64, i64) = tx
                    .query_row(
                        "SELECT average_cost, current_stock FROM products WHERE id = ?1",
                        [prod_id],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .map_err(|e| AppError::Database(e.to_string()))?;

                let rev = qty * sale_price;
                let cost = qty * avg_cost;
                let profit = rev - cost;

                grand_total += rev;
                total_cost += cost;
                item_details.push((
                    *prod_id,
                    *qty,
                    *sale_price,
                    avg_cost,
                    rev,
                    cost,
                    profit,
                    current_stock,
                ));
            }

            let estimated_profit = grand_total - total_cost;

            tx.execute(
                "INSERT INTO sales_invoices (issue_code, invoice_date, buyer_type, buyer_name, subtotal,
                                            grand_total, total_cost, estimated_profit, status, confirmed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, 'xac_nhan', ?2)",
                rusqlite::params![issue_code, date, buyer_type, buyer_name, grand_total, total_cost, estimated_profit],
            ).map_err(|e| AppError::Database(e.to_string()))?;
            let sales_id = tx.last_insert_rowid();
            sales_count += 1;

            for (prod_id, qty, sale_price, avg_cost, rev, cost, profit, old_stock) in item_details {
                tx.execute(
                    "INSERT INTO sales_invoice_items (sales_invoice_id, product_id, quantity, unit_sale_price,
                                                       unit_cost_at_sale, line_revenue, line_cost, estimated_profit)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    rusqlite::params![sales_id, prod_id, qty, sale_price, avg_cost, rev, cost, profit],
                ).map_err(|e| AppError::Database(e.to_string()))?;

                let new_stock = old_stock - qty;

                tx.execute(
                    "UPDATE products SET current_stock = ?1 WHERE id = ?2",
                    rusqlite::params![new_stock, prod_id],
                )
                .map_err(|e| AppError::Database(e.to_string()))?;

                tx.execute(
                    "INSERT INTO inventory_transactions (transaction_date, product_id, transaction_type,
                                                          source_type, source_id, quantity_out, unit_cost,
                                                          stock_before, stock_after, old_average_cost, new_average_cost)
                     VALUES (?1, ?2, 'xuat', 'SALE', ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
                    rusqlite::params![date, prod_id, sales_id, qty, avg_cost, old_stock, new_stock, avg_cost],
                ).map_err(|e| AppError::Database(e.to_string()))?;
            }
        }

        Ok((
            product_ids.len(),
            supplier_ids.len(),
            purchase_count,
            sales_count,
        ))
    }
}
