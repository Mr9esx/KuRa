package model

import "time"

type Preset struct {
	ID          uint         `gorm:"primaryKey" json:"id"`
	PresetID    string       `gorm:"uniqueIndex;not null" json:"preset_id"`
	Name        string       `json:"name"`
	Description string       `json:"description"`
	Image       string       `json:"image"`
	BlockSKU    string       `json:"block_sku"`
	IsPublished bool         `gorm:"default:false" json:"is_published"`
	Items       []PresetItem `gorm:"foreignKey:PresetID;references:ID" json:"items,omitempty"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}

type PresetItem struct {
	ID         uint   `gorm:"primaryKey" json:"id"`
	PresetID   uint   `gorm:"index;not null" json:"preset_id"`
	ProductSKU string `json:"product_sku"`
	CellX      int    `json:"cell_x"`
	CellY      int    `json:"cell_y"`
}
