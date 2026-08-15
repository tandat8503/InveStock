use crate::domain::errors::{AppError, AppResult};

pub fn validate_inventory_state(
    stock: i64,
    inventory_value: i64,
    average_cost: i64,
    allow_legacy_negative_stock: bool,
) -> AppResult<()> {
    if stock < 0 && !allow_legacy_negative_stock {
        return Err(AppError::Conflict(
            "Thao tác sẽ làm tồn kho bị âm. Vui lòng kiểm tra lại số lượng.".to_string(),
        ));
    }
    if inventory_value < 0 || average_cost < 0 || (stock == 0 && inventory_value != 0) {
        return Err(AppError::Conflict(
            "Thao tác sẽ tạo trạng thái tồn kho hoặc giá vốn không hợp lệ. Vui lòng kiểm tra lại dữ liệu."
                .to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_negative_value_and_nonzero_value_at_zero_stock() {
        assert!(validate_inventory_state(5, -1, 0, false).is_err());
        assert!(validate_inventory_state(0, 1, 0, false).is_err());
        assert!(validate_inventory_state(0, 0, 0, false).is_ok());
    }
}
