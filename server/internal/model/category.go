package model

import "time"

type Category struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"not null" json:"name"`
	Type      string    `gorm:"not null;index" json:"type"` // "block" | "item"
	SortOrder int       `gorm:"default:0" json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CategoryProduct struct {
	ID         uint   `gorm:"primaryKey" json:"id"`
	CategoryID uint   `gorm:"index;not null" json:"category_id"`
	ProductSKU string `gorm:"index;not null" json:"product_sku"`
	SortOrder  int    `gorm:"default:0" json:"sort_order"`
}
