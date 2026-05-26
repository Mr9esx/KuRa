package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type StatsHandler struct {
	DB *gorm.DB
}

func (h *StatsHandler) Overview(c echo.Context) error {
	type countRow struct{ Count int64 }

	var totalProducts, blocks, items, risers, published, unpublished int64
	h.DB.Table("products").Count(&totalProducts)
	h.DB.Table("products").Where("type = ?", "block").Count(&blocks)
	h.DB.Table("products").Where("type = ?", "item").Count(&items)
	h.DB.Table("products").Where("type = ?", "riser").Count(&risers)
	h.DB.Table("products").Where("is_published = ?", true).Count(&published)
	unpublished = totalProducts - published

	var totalCategories, blockCats, itemCats int64
	h.DB.Table("categories").Count(&totalCategories)
	h.DB.Table("categories").Where("type = ?", "block").Count(&blockCats)
	h.DB.Table("categories").Where("type = ?", "item").Count(&itemCats)

	var totalPresets, pubPresets int64
	h.DB.Table("presets").Count(&totalPresets)
	h.DB.Table("presets").Where("is_published = ?", true).Count(&pubPresets)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"products": map[string]int64{
			"total":       totalProducts,
			"blocks":      blocks,
			"items":       items,
			"risers":      risers,
			"published":   published,
			"unpublished": unpublished,
		},
		"categories": map[string]int64{
			"total":            totalCategories,
			"block_categories": blockCats,
			"item_categories":  itemCats,
		},
		"presets": map[string]int64{
			"total":       totalPresets,
			"published":   pubPresets,
			"unpublished": totalPresets - pubPresets,
		},
	})
}
