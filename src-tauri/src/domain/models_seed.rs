use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseStats {
    pub product_count: i64,
    pub supplier_count: i64,
    pub purchase_count: i64,
    pub sales_count: i64,
    pub transaction_count: i64,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedResult {
    pub success: bool,
    pub message: String,
    pub products_seeded: usize,
    pub suppliers_seeded: usize,
    pub purchases_seeded: usize,
    pub sales_seeded: usize,
}
