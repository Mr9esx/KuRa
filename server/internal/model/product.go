package model

import "time"

type Product struct {
	ID                 uint      `gorm:"primaryKey" json:"id"`
	SKU                string    `gorm:"uniqueIndex;not null" json:"sku"`
	SKUName            string    `json:"sku_name"`
	DisplayName        string    `json:"display_name"`
	Desc               string    `json:"desc"`
	Type               string    `gorm:"not null;index" json:"type"` // "block" | "item" | "riser"
	GridCols           int       `json:"grid_cols"`
	GridRows           int       `json:"grid_rows"`
	Height             int       `json:"height"`
	InnerWidth         *int      `json:"inner_width,omitempty"`
	InnerDepth         *int      `json:"inner_depth,omitempty"`
	CellCols           *int      `json:"cell_cols,omitempty"`
	CellRows           *int      `json:"cell_rows,omitempty"`
	ModelBackHookDepth *int      `json:"model_back_hook_depth,omitempty"`
	ImagePath          string    `json:"image_path"`
	ModelPath          string    `json:"model_path"`
	ModelRotationX     float64   `json:"model_rotation_x"`
	ModelRotationY     float64   `json:"model_rotation_y"`
	ModelRotationZ     float64   `json:"model_rotation_z"`
	SortOrder          int       `gorm:"default:0" json:"sort_order"`
	IsPublished        bool      `gorm:"default:false" json:"is_published"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}
