use chrono::NaiveDate;

use crate::domain::errors::{AppError, AppResult};

pub fn required(value: &str, field: &str) -> AppResult<()> {
    if value.trim().is_empty() {
        return Err(AppError::Validation(format!(
            "{field} không được để trống."
        )));
    }
    Ok(())
}

pub fn positive(value: i64, field: &str) -> AppResult<()> {
    if value <= 0 {
        return Err(AppError::Validation(format!("{field} phải lớn hơn 0.")));
    }
    Ok(())
}

pub fn non_negative(value: i64, field: &str) -> AppResult<()> {
    if value < 0 {
        return Err(AppError::Validation(format!(
            "{field} không được là số âm."
        )));
    }
    Ok(())
}

pub fn one_of(value: &str, allowed: &[&str], field: &str) -> AppResult<()> {
    if !allowed.contains(&value) {
        return Err(AppError::Validation(format!("{field} không hợp lệ.")));
    }
    Ok(())
}

pub fn iso_date(value: &str, field: &str) -> AppResult<()> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| AppError::Validation(format!("{field} phải có định dạng YYYY-MM-DD.")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_business_values() {
        assert!(required("  ", "Tên").is_err());
        assert!(positive(0, "Số lượng").is_err());
        assert!(non_negative(-1, "Giá").is_err());
        assert!(one_of("x", &["a", "b"], "Loại").is_err());
        assert!(iso_date("07/08/2026", "Ngày").is_err());
    }
}
