#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InventoryTransactionClass {
    Purchase,
    Sale,
    Adjustment,
    Opening,
}

pub fn classify_transaction_type(transaction_type: &str) -> InventoryTransactionClass {
    match transaction_type {
        "nhap" | "purchase" => InventoryTransactionClass::Purchase,
        "xuat" | "sale" => InventoryTransactionClass::Sale,
        "opening_balance" | "legacy_opening" => InventoryTransactionClass::Opening,
        "sale_cancel"
        | "purchase_cancel"
        | "inventory_adjustment_in"
        | "inventory_adjustment_out" => InventoryTransactionClass::Adjustment,
        // Unknown operational types must never inflate purchase or sale business totals.
        _ => InventoryTransactionClass::Adjustment,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reversal_and_adjustment_types_are_not_purchase_or_sale() {
        for kind in [
            "sale_cancel",
            "purchase_cancel",
            "inventory_adjustment_in",
            "inventory_adjustment_out",
        ] {
            assert_eq!(
                classify_transaction_type(kind),
                InventoryTransactionClass::Adjustment
            );
        }
    }
}
