package handler

import (
	"net/http"

	"github.com/Mr9esx/RiSu/server/internal/model"
	"github.com/Mr9esx/RiSu/server/internal/service"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type ProductHandler struct {
	Service *service.ProductService
	DB      *gorm.DB
}

func (h *ProductHandler) List(c echo.Context) error {
	productType := c.QueryParam("type")
	products, err := h.Service.List(productType, false)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, products)
}

func (h *ProductHandler) PublicList(c echo.Context) error {
	productType := c.QueryParam("type")
	products, err := h.Service.List(productType, true)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	skuCategories := h.getProductCategories(products)

	defaultBlockSKU := ""
	if productType == "block" {
		for _, p := range products {
			if p.IsDefault {
				defaultBlockSKU = p.SKU
				break
			}
		}
		if defaultBlockSKU == "" && len(products) > 0 {
			// Fallback for legacy data without is_default set.
			defaultBlockSKU = products[0].SKU
		}
	}

	result := make([]map[string]interface{}, 0, len(products))
	for _, p := range products {
		item := productToPublicJSON(p)
		item["categories"] = skuCategories[p.SKU]
		if productType == "block" {
			item["isDefault"] = p.SKU == defaultBlockSKU
		}
		result = append(result, item)
	}
	return c.JSON(http.StatusOK, result)
}

func (h *ProductHandler) getProductCategories(products []model.Product) map[string][]string {
	skus := make([]string, 0, len(products))
	for _, p := range products {
		skus = append(skus, p.SKU)
	}

	type cpRow struct {
		ProductSKU   string
		CategoryName string
	}
	var rows []cpRow
	h.DB.Table("category_products").
		Select("category_products.product_sku, categories.name as category_name").
		Joins("JOIN categories ON categories.id = category_products.category_id").
		Where("category_products.product_sku IN ?", skus).
		Scan(&rows)

	result := make(map[string][]string)
	for _, p := range products {
		result[p.SKU] = []string{}
	}
	for _, row := range rows {
		result[row.ProductSKU] = append(result[row.ProductSKU], row.CategoryName)
	}
	return result
}

func (h *ProductHandler) Get(c echo.Context) error {
	sku := c.Param("sku")
	product, err := h.Service.GetBySKU(sku)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "product not found"})
	}
	return c.JSON(http.StatusOK, product)
}

func (h *ProductHandler) Create(c echo.Context) error {
	var product model.Product
	if err := c.Bind(&product); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := h.Service.Create(&product); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusCreated, product)
}

func (h *ProductHandler) Update(c echo.Context) error {
	sku := c.Param("sku")
	var updates map[string]interface{}
	if err := c.Bind(&updates); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	delete(updates, "sku")
	delete(updates, "id")

	product, err := h.Service.Update(sku, updates)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, product)
}

func (h *ProductHandler) Delete(c echo.Context) error {
	sku := c.Param("sku")
	if err := h.Service.Delete(sku); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusNoContent, nil)
}

func productToPublicJSON(p model.Product) map[string]interface{} {
	item := map[string]interface{}{
		"sku":           p.SKU,
		"type":          p.Type,
		"gridSize":      []int{p.GridCols, p.GridRows},
		"height":        p.Height,
		"imagePath":     p.ImagePath,
		"modelPath":     p.ModelPath,
		"modelRotation": []float64{p.ModelRotationX, p.ModelRotationY, p.ModelRotationZ},
	}

	if p.DisplayName != "" {
		item["display_name"] = p.DisplayName
	}
	if p.SKUName != "" {
		item["sku_name"] = p.SKUName
	}
	if p.Desc != "" {
		item["desc"] = p.Desc
	}
	if p.SortOrder > 0 {
		item["order"] = p.SortOrder
	}

	if p.Type == "block" {
		item["name"] = p.SKUName
		if p.InnerWidth != nil && p.InnerDepth != nil {
			item["innerSize"] = []int{*p.InnerWidth, *p.InnerDepth}
		}
		if p.CellCols != nil && p.CellRows != nil {
			item["cellGrid"] = []int{*p.CellCols, *p.CellRows}
		}
		if p.ModelBackHookDepth != nil {
			item["modelBackHookDepth"] = *p.ModelBackHookDepth
		}
	}

	return item
}
